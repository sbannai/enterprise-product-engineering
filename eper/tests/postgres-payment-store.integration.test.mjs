import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgresPaymentStore } from "../dist/packages/payments/postgres-payment-store.js";
import { runMigrations } from "../scripts/migrate-payments.mjs";

const databaseUrl = process.env.DATABASE_URL;

test("payment migrations are checksummed and safely re-runnable", { skip: !databaseUrl }, async () => {
  // CI already invokes the runner once before this test. A second invocation
  // must be a no-op for the same files and database.
  await runMigrations(databaseUrl);
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const result = await pool.query(
      "SELECT migration_name, sha256 FROM eper_payment_schema_migrations ORDER BY migration_name",
    );
    assert.deepEqual(
      result.rows.map((row) => row.migration_name),
      [
        "001_payment_transactions.sql",
        "002_payment_order_reservation.sql",
        "003_receipt_document_bytes.sql",
        "004_unique_public_payment_identifiers.sql",
        "005_immutable_receipt_records.sql",
        "006_immutable_receipt_transaction_snapshot.sql",
      ],
    );
    for (const row of result.rows) assert.match(row.sha256.trim(), /^[a-f0-9]{64}$/);
  } finally {
    await pool.end();
  }
});
test("migration runner rejects checksum drift and does not record failed migrations", { skip: !databaseUrl }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "eper-payment-migrations-"));
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const changedExisting = join(temporaryRoot, "changed-existing");
    await mkdir(changedExisting);
    const original = await readFile(new URL("../packages/payments/migrations/001_payment_transactions.sql", import.meta.url), "utf8");
    await writeFile(join(changedExisting, "001_payment_transactions.sql"), original + "\n-- intentional checksum drift test\n");
    await assert.rejects(
      runMigrations(databaseUrl, { directory: changedExisting }),
      /EPER_PAYMENT_MIGRATION_CHECKSUM_MISMATCH:001_payment_transactions\.sql/,
    );

    const failingMigration = join(temporaryRoot, "failing-migration");
    await mkdir(failingMigration);
    const rollbackProbe = "eper_migration_rollback_probe_" + randomUUID().replaceAll("-", "");
    await writeFile(join(failingMigration, "006_intentional_failure.sql"), `CREATE TABLE ${rollbackProbe} (id INTEGER);\nSELECT * FROM eper_intentionally_missing_migration_test_table;\n`);
    await assert.rejects(
      runMigrations(databaseUrl, { directory: failingMigration }),
      /eper_intentionally_missing_migration_test_table/,
    );
    const ledger = await pool.query(
      "SELECT migration_name FROM eper_payment_schema_migrations WHERE migration_name = $1",
      ["006_intentional_failure.sql"],
    );
    assert.equal(ledger.rowCount, 0, "a failed schema change must not be marked applied");
    const probe = await pool.query("SELECT to_regclass($1) AS relation", [rollbackProbe]);
    assert.equal(probe.rows[0].relation, null, "DDL preceding a failed statement must roll back atomically");
  } finally {
    await pool.end();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

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
      transactionSnapshot: {
        tenantId,
        reference: invoiceReference,
        kind: "ECOMMERCE",
        description: "Integration test checkout",
        amountDueMinor: 12500,
        currency: "INR",
        status: "DUE",
        lineItems: [
          { sourceLineId: "line-a", description: "Item A", quantity: 2, unitPriceMinor: 5000, lineTotalMinor: 10000 },
          { sourceLineId: "line-b", description: "Item B", quantity: 1, unitPriceMinor: 3000, lineTotalMinor: 3000 },
        ],
        adjustments: [
          { kind: "DISCOUNT", description: "Checkout discount", amountMinor: -1000 },
          { kind: "TAX", description: "Tax", amountMinor: 500 },
        ],
        sourceId: "integration-test-authority",
        sourceVersion: "fixture-v1",
        approvedAt: new Date().toISOString(),
      },
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

    // A provider event ID is immutable: replaying that ID with a different
    // payload digest must be treated as a conflict, not silently deduplicated.
    const conflictingEventReplay = await store.capturePayment({
      ...capture,
      payloadSha256: createHash("sha256").update("tampered payload for " + providerEventId).digest("hex"),
    });
    assert.deepEqual(conflictingEventReplay, { ok: false, reason: "event_conflict" });

    // A distinct provider event for the same already-captured payment must reuse
    // the existing receipt rather than issue a second receipt.
    const repeatedCapture = await store.capturePayment({
      ...capture,
      providerEventId: "evt_repeat_" + randomUUID().replaceAll("-", ""),
      payloadSha256: createHash("sha256").update("repeat" + providerOrderId).digest("hex"),
    });
    assert.equal(repeatedCapture.ok, true);
    if (repeatedCapture.ok) {
      assert.equal(repeatedCapture.value.receiptPublicId, concurrent.find((result) => result.ok).value.receiptPublicId);
      assert.equal(repeatedCapture.value.receiptNumber, capture.receiptNumber);
    }

    const persisted = await pool.query(
      `SELECT o.status, o.provider_payment_id, r.receipt_number, r.transaction_snapshot,
              COUNT(r.id) OVER () AS receipt_count
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
    assert.deepEqual(persisted.rows[0].transaction_snapshot, capture.transactionSnapshot,
      "the validated source snapshot must be persisted atomically with the issued receipt");

    await assert.rejects(
      pool.query(
        `UPDATE eper_payment_receipts
            SET transaction_snapshot = '{}'::jsonb
          WHERE payment_order_id = (
            SELECT id FROM eper_payment_orders WHERE tenant_id = $1 AND idempotency_key = $2
          )`,
        [tenantId, idempotencyKey],
      ),
      /EPER_PAYMENT_RECEIPT_SNAPSHOT_IMMUTABLE/,
      "the database trigger must reject edits to an issued receipt snapshot",
    );

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
    const verifiedRetry = await store.captureVerifiedPayment({
      tenantId, providerOrderId, providerPaymentId: capture.providerPaymentId,
      amountMinor: 12500, currency: "INR", receiptNumber: capture.receiptNumber,
    });
    assert.equal(verifiedRetry.ok, true);
    if (verifiedRetry.ok) {
      assert.equal(verifiedRetry.value.transactionPublicId, storedOrder.transactionPublicId);
      assert.equal(verifiedRetry.value.receiptPublicId, storedReceipt.receiptPublicId);
    }
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

    // Database-level guard must reject changing an issued receipt number or its exact PDF bytes.
    await assert.rejects(
      pool.query(
        "UPDATE eper_payment_receipts SET receipt_number = $1 WHERE tenant_id = $2 AND payment_order_id = $3",
        ["EPER-MUTATED-RECEIPT", tenantId, storedOrder.id],
      ),
      /EPER_PAYMENT_RECEIPT_IDENTITY_IMMUTABLE/,
    );
    await assert.rejects(
      pool.query(
        "UPDATE eper_payment_receipts SET document_pdf = $1 WHERE tenant_id = $2 AND payment_order_id = $3",
        [Buffer.from("%PDF-1.4\\nmutated persisted bytes\\n%%EOF", "ascii"), tenantId, storedOrder.id],
      ),
      /EPER_PAYMENT_RECEIPT_DOCUMENT_IMMUTABLE/,
    );
    const stillImmutable = await store.findReceipt(tenantId, storedOrder.id);
    assert.equal(stillImmutable.receiptNumber, capture.receiptNumber);
    assert.equal(stillImmutable.documentSha256, receiptPdfHash);
    assert.deepEqual(stillImmutable.documentPdf, receiptPdf);

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


test("PostgresPaymentStore requires reconciliation for an expired order-creation lease", { skip: !databaseUrl }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const store = new PostgresPaymentStore(pool);
    const input = {
      tenantId: "lease-" + randomUUID(),
      invoiceReference: "invoice-" + randomUUID(),
      idempotencyKey: "lease-idem-" + randomUUID(),
      amountMinor: 12500,
      currency: "INR",
      invoiceSourceId: "integration-test-authority",
      invoiceSourceVersion: "fixture-v1",
      invoiceApprovedAt: new Date().toISOString(),
    };

    const first = await store.reserveOrder(input);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.value.providerOrderId, null);

    const expired = await pool.query(
      `UPDATE eper_payment_orders
          SET creation_lease_until = NOW() - INTERVAL '1 second'
        WHERE tenant_id = $1 AND idempotency_key = $2 AND status = 'creating'`,
      [input.tenantId, input.idempotencyKey],
    );
    assert.equal(expired.rowCount, 1);

    const retry = await store.reserveOrder(input);
    assert.deepEqual(retry, { ok: false, reason: "order_creation_reconciliation_required" });

    const persisted = await pool.query(
      `SELECT status, provider_order_id, creation_attempts
         FROM eper_payment_orders
        WHERE tenant_id = $1 AND idempotency_key = $2`,
      [input.tenantId, input.idempotencyKey],
    );
    assert.equal(persisted.rows.length, 1);
    assert.equal(persisted.rows[0].status, "creating");
    assert.equal(persisted.rows[0].provider_order_id, null);
    assert.equal(persisted.rows[0].creation_attempts, 1, "retry must not reserve another provider creation attempt");
  } finally {
    await pool.end();
  }
});


test("PostgresPaymentStore serializes concurrent reservations for the same idempotency key", { skip: !databaseUrl }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    const store = new PostgresPaymentStore(pool);
    const input = {
      tenantId: "concurrent-lease-" + randomUUID(),
      invoiceReference: "invoice-" + randomUUID(),
      idempotencyKey: "idem-" + randomUUID(),
      amountMinor: 12500,
      currency: "INR",
      invoiceSourceId: "integration-test-authority",
      invoiceSourceVersion: "fixture-v1",
      invoiceApprovedAt: new Date().toISOString(),
    };

    const results = await Promise.all([
      store.reserveOrder(input),
      store.reserveOrder(input),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(
      results.filter((result) => !result.ok && result.reason === "order_creation_in_progress").length,
      1,
      "concurrent duplicate reservation must observe the existing creation lease",
    );

    const persisted = await pool.query(
      `SELECT status, provider_order_id, creation_attempts
         FROM eper_payment_orders
        WHERE tenant_id = $1 AND idempotency_key = $2`,
      [input.tenantId, input.idempotencyKey],
    );
    assert.equal(persisted.rows.length, 1, "only one durable reservation may exist");
    assert.equal(persisted.rows[0].status, "creating");
    assert.equal(persisted.rows[0].provider_order_id, null);
    assert.equal(persisted.rows[0].creation_attempts, 1);
  } finally {
    await pool.end();
  }
});
