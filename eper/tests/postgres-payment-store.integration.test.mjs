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
    assert.equal(storedOrder.status, "captured");
    assert.equal(storedOrder.providerPaymentId, capture.providerPaymentId);
    assert.equal(storedOrder.amountMinor, 12500);

    const storedReceipt = await store.findReceipt(tenantId, storedOrder.id);
    assert.ok(storedReceipt);
    assert.equal(storedReceipt.receiptNumber, capture.receiptNumber);
    assert.equal(storedReceipt.documentSha256, null); // PDF generation/hash is a separate, still-required layer.

    assert.equal(await store.findOrder(tenantId, "order_does_not_exist"), null);
    assert.equal(await store.findReceipt("another-tenant", storedOrder.id), null);

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
