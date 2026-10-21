import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PostgresPaymentStore } from "../dist/packages/payments/postgres-payment-store.js";

const databaseUrl = process.env.DATABASE_URL;
test("PostgresPaymentStore persists idempotent orders and captures exactly once", { skip: !databaseUrl }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    const store = new PostgresPaymentStore(pool);
    const tenantId = "integration-" + randomUUID();
    const invoiceReference = "invoice-" + randomUUID();
    const idempotencyKey = "idem-" + randomUUID();
    const providerOrderId = "order_" + randomUUID().replaceAll("-", "");
    const common = {
      tenantId, invoiceReference, idempotencyKey, providerOrderId,
      amountMinor: 12500, currency: "INR",
      invoiceSourceId: "integration-test-authority",
      invoiceSourceVersion: "fixture-v1",
      invoiceApprovedAt: new Date().toISOString(),
    };

    const created = await store.insertOrder(common);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.providerOrderId, providerOrderId);

    const retry = await store.insertOrder(common);
    assert.deepEqual(retry, created);

    const conflictingRetry = await store.insertOrder({
      ...common,
      providerOrderId: "order_" + randomUUID().replaceAll("-", ""),
    });
    assert.deepEqual(conflictingRetry, { ok: false, reason: "idempotency_conflict" });

    const providerEventId = "evt_" + randomUUID().replaceAll("-", "");
    const payloadSha256 = createHash("sha256").update(providerEventId + providerOrderId).digest("hex");
    const capture = {
      providerEventId, eventType: "payment.captured", payloadSha256,
      providerOrderId, providerPaymentId: "pay_" + randomUUID().replaceAll("-", ""),
      amountMinor: 12500, currency: "INR", tenantId,
      receiptNumber: "EPER-INT-" + randomUUID().replaceAll("-", "").slice(0, 20),
    };
    // Exercise concurrent delivery, not just a sequential replay: the database
    // uniqueness constraint must allow exactly one transaction to issue a receipt.
    const concurrent = await Promise.all([
      store.capturePayment(capture),
      store.capturePayment(capture),
    ]);
    assert.equal(concurrent.filter((result) => result.ok).length, 1);
    assert.equal(concurrent.filter((result) => !result.ok && result.reason === "duplicate_event").length, 1);
    assert.ok(concurrent.every((result) =>
      result.ok || (!result.ok && result.reason === "duplicate_event")));

    const duplicate = await store.capturePayment(capture);
    assert.deepEqual(duplicate, { ok: false, reason: "duplicate_event" });

    const persisted = await pool.query(
      `SELECT o.status, o.provider_payment_id, r.receipt_number, COUNT(r.id) OVER () AS receipt_count
         FROM eper_payment_orders o
         JOIN eper_payment_receipts r ON r.payment_order_id = o.id
        WHERE o.tenant_id = $1 AND o.idempotency_key = $2`,
      [tenantId, idempotencyKey],
    );
    assert.equal(persisted.rows.length, 1);
    assert.equal(persisted.rows[0].status, "captured");
    assert.equal(persisted.rows[0].provider_payment_id, capture.providerPaymentId);
    assert.equal(persisted.rows[0].receipt_number, capture.receiptNumber);
    assert.equal(Number(persisted.rows[0].receipt_count), 1);

    const storedOrder = await store.findOrder(tenantId, providerOrderId);
    assert.ok(storedOrder);
    assert.match(storedOrder.transactionPublicId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(storedOrder.status, "captured");
    assert.equal(storedOrder.providerPaymentId, capture.providerPaymentId);
    assert.equal(storedOrder.amountMinor, 12500);

    const storedReceipt = await store.findReceipt(tenantId, storedOrder.id);
    assert.ok(storedReceipt);
    assert.match(storedReceipt.receiptPublicId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(storedReceipt.receiptPublicId, storedOrder.transactionPublicId);
    assert.equal(storedReceipt.receiptNumber, capture.receiptNumber);
    assert.equal(storedReceipt.documentSha256, null);
    assert.equal(storedReceipt.documentPdf, null);

    // Persist exact issued PDF bytes with their digest; retries must be byte-identical.
    const receiptPdf = Buffer.from("%PDF-1.4\\nEPER integration receipt\\n%%EOF", "ascii");
    const receiptPdfHash = createHash("sha256").update(receiptPdf).digest("hex");
    assert.deepEqual(
      await store.persistReceiptDocument(tenantId, storedOrder.id, receiptPdf),
      { ok: true, value: { documentSha256: receiptPdfHash } },
    );
    assert.deepEqual(
      await store.persistReceiptDocument(tenantId, storedOrder.id, receiptPdf),
      { ok: true, value: { documentSha256: receiptPdfHash } },
    );
    assert.deepEqual(
      await store.persistReceiptDocument(tenantId, storedOrder.id, Buffer.from("%PDF-1.4\\nchanged receipt\\n%%EOF", "ascii")),
      { ok: false, reason: "receipt_document_conflict" },
    );
    const hashedReceipt = await store.findReceipt(tenantId, storedOrder.id);
    assert.equal(hashedReceipt.documentSha256, receiptPdfHash);
    assert.deepEqual(hashedReceipt.documentPdf, receiptPdf);
    assert.deepEqual(
      await store.persistReceiptDocument("another-tenant", storedOrder.id, receiptPdf),
      { ok: false, reason: "not_found" },
    );

    assert.equal(await store.findOrder(tenantId, "order_does_not_exist"), null);
    assert.equal(await store.findReceipt("another-tenant", storedOrder.id), null);

    // Reserve-first order creation prevents a retry from issuing a second
    // Razorpay order while the first remote creation is in progress.
    const reservationKey = "reserve-" + randomUUID();
    const reservationInput = {
      tenantId, invoiceReference: "invoice-reserve-" + randomUUID(),
      idempotencyKey: reservationKey, amountMinor: 7400, currency: "INR",
      invoiceSourceId: "integration-test-authority", invoiceSourceVersion: "fixture-v1",
      invoiceApprovedAt: new Date().toISOString(),
    };
    const reservation = await store.reserveOrder(reservationInput);
    assert.equal(reservation.ok, true);
    if (!reservation.ok) return;
    assert.equal(reservation.value.providerOrderId, null);
    assert.deepEqual(await store.reserveOrder(reservationInput), {
      ok: false, reason: "order_creation_in_progress",
    });
    assert.deepEqual(await store.reserveOrder({
      ...reservationInput, invoiceApprovedAt: new Date(Date.parse(reservationInput.invoiceApprovedAt) + 1000).toISOString(),
    }), { ok: false, reason: "idempotency_conflict" });
    // An expired lease must not trigger a blind second Razorpay request: the
    // previous process may have created the remote order before it crashed.
    await pool.query(
      "UPDATE eper_payment_orders SET creation_lease_until = NOW() - INTERVAL '1 second' WHERE tenant_id = $1 AND idempotency_key = $2",
      [tenantId, reservationKey],
    );
    assert.deepEqual(await store.reserveOrder(reservationInput), {
      ok: false, reason: "order_creation_reconciliation_required",
    });
    const reservedProviderOrder = "order_" + randomUUID().replaceAll("-", "");
    const completedReservation = await store.completeOrderCreation(tenantId, reservationKey, reservedProviderOrder);
    assert.deepEqual(completedReservation, {
      ok: true, value: { id: reservation.value.id, transactionPublicId: reservation.value.transactionPublicId, providerOrderId: reservedProviderOrder },
    });
    assert.deepEqual(await store.reserveOrder(reservationInput), {
      ok: true, value: { id: reservation.value.id, transactionPublicId: reservation.value.transactionPublicId, providerOrderId: reservedProviderOrder },
    });
    assert.deepEqual(await store.completeOrderCreation(tenantId, reservationKey, reservedProviderOrder), {
      ok: true, value: { id: reservation.value.id, transactionPublicId: reservation.value.transactionPublicId, providerOrderId: reservedProviderOrder },
    });

    // Race two different provider orders using the same tenant-scoped key.
    // Exactly one may win; the losing request must not be reported as a retry.
    const raceKey = "race-" + randomUUID();
    const raceBase = {
      ...common,
      invoiceReference: "invoice-race-" + randomUUID(),
      idempotencyKey: raceKey,
    };
    const raced = await Promise.all([
      store.insertOrder({ ...raceBase, providerOrderId: "order_" + randomUUID().replaceAll("-", "") }),
      store.insertOrder({ ...raceBase, providerOrderId: "order_" + randomUUID().replaceAll("-", "") }),
    ]);
    assert.equal(raced.filter((result) => result.ok).length, 1);
    assert.deepEqual(raced.filter((result) => !result.ok), [
      { ok: false, reason: "idempotency_conflict" },
    ]);

    const raceRows = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM eper_payment_orders
        WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantId, raceKey],
    );
    assert.equal(raceRows.rows[0].count, 1);
  } finally {
    await pool.end();
  }
});
