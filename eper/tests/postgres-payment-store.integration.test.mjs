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
        "007_immutable_order_transaction_snapshot.sql",
      ],
    );
    for (const row of result.rows) assert.match(row.sha256.trim(), /^[a-f0-9]{64}$/);
  } finally {
    await pool.end();
  }
});
test("order-time transaction snapshot is persisted and immutable", { skip: !databaseUrl }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  try {
    const store = new PostgresPaymentStore(pool);
    const tenantId = "snapshot-" + randomUUID();
    const invoiceReference = "invoice-" + randomUUID();
    const idempotencyKey = "snapshot-idem-" + randomUUID();
    const providerOrderId = "order_" + randomUUID().replaceAll("-", "");
    const transactionSnapshot = {
      tenantId, reference: invoiceReference, applicationId: "application-" + tenantId, kind: "ECOMMERCE",
      description: "Immutable snapshot integration checkout", amountDueMinor: 12500,
      currency: "INR", status: "DUE",
      lineItems: [
        { sourceLineId: "line-1", description: "Item one", quantity: 2, unitPriceMinor: 5000, lineTotalMinor: 10000 },
        { sourceLineId: "line-2", description: "Item two", quantity: 1, unitPriceMinor: 3000, lineTotalMinor: 3000 },
      ],
      adjustments: [
        { kind: "DISCOUNT", description: "Discount", amountMinor: -1000 },
        { kind: "TAX", description: "Tax", amountMinor: 500 },
      ],
      sourceId: "integration-test-authority", sourceVersion: "snapshot-v1",
      approvedAt: new Date().toISOString(),
    };
    const reserved = await store.reserveOrder({
      tenantId, invoiceReference, idempotencyKey, amountMinor: 12500, currency: "INR",
      invoiceSourceId: "integration-test-authority", invoiceSourceVersion: "snapshot-v1",
      invoiceApprovedAt: transactionSnapshot.approvedAt, transactionSnapshot,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) return;
    const completed = await store.completeOrderCreation(tenantId, idempotencyKey, providerOrderId);
    assert.equal(completed.ok, true);
    const captureInput = {
      providerEventId: "evt_snapshot_" + randomUUID().replaceAll("-", ""),
      eventType: "payment.captured",
      payloadSha256: createHash("sha256").update("snapshot-capture-" + randomUUID()).digest("hex"),
      providerOrderId, providerPaymentId: "pay_snapshot_" + randomUUID().replaceAll("-", ""),
      amountMinor: 12500, currency: "INR", tenantId,
      receiptNumber: "EPER-SNAPSHOT-" + randomUUID().replaceAll("-", "").slice(0, 16),
      transactionSnapshot,
    };
    const tamperedCapture = await store.capturePayment({
      ...captureInput,
      transactionSnapshot: { ...transactionSnapshot, sourceVersion: "tampered-version" },
    });
    assert.deepEqual(tamperedCapture, { ok: false, reason: "payment_mismatch" },
      "capture must reject a snapshot that differs from the immutable order-time record");
    const captured = await store.capturePayment(captureInput);
    assert.equal(captured.ok, true);
    const order = await store.findOrderByProviderOrderId(providerOrderId);
    assert.ok(order);
    assert.deepEqual(order.transactionSnapshot, transactionSnapshot);
    const changedSnapshotRetry = await store.reserveOrder({
      tenantId, invoiceReference, idempotencyKey, amountMinor: 12500, currency: "INR",
      invoiceSourceId: "integration-test-authority", invoiceSourceVersion: "snapshot-v1",
      invoiceApprovedAt: transactionSnapshot.approvedAt,
      transactionSnapshot: { ...transactionSnapshot, sourceVersion: "snapshot-v2" },
    });
    assert.deepEqual(changedSnapshotRetry, { ok: false, reason: "idempotency_conflict" },
      "reusing an idempotency key with a changed snapshot version must be rejected");
    await assert.rejects(
      pool.query(
        "UPDATE eper_payment_orders SET transaction_snapshot = '{}'::jsonb WHERE tenant_id = $1 AND idempotency_key = $2",
        [tenantId, idempotencyKey],
      ),
      /EPER_PAYMENT_ORDER_SNAPSHOT_IMMUTABLE/,
      "the database trigger must reject edits to the order-time snapshot",
    );
  } finally {
    await pool.end();
  }
});

test("commercially gated checkout rejects inactive customers, missing app grants and tariff-limit overruns", { skip: !databaseUrl }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    const store = new PostgresPaymentStore(pool, true);
    async function seed(label, options = {}) {
      const tenantId = "commercial-" + label + "-" + randomUUID();
      const applicationId = "app-" + randomUUID();
      const tariffKey = "tariff-" + randomUUID();
      await pool.query(
        `INSERT INTO eper_customer_account (tenant_id, customer_status, status_reason, effective_at, updated_by)
         VALUES ($1, $2, 'integration fixture', NOW() - INTERVAL '1 minute', 'integration-test')`,
        [tenantId, options.status ?? "active"],
      );
      await pool.query(
        `INSERT INTO eper_commercial_tariff_plan
          (tariff_key, tariff_version, billing_basis, max_applications, amount, currency,
           billing_interval, effective_from, tariff_status, created_by)
         VALUES ($1, 1, 'single_application', 1, 100, 'INR', 'monthly',
                 NOW() - INTERVAL '1 day', $2, 'integration-test')`,
        [tariffKey, options.tariffStatus ?? 'active'],
      );
      await pool.query(
        `INSERT INTO eper_customer_tariff_assignment
          (tenant_id, tariff_key, tariff_version, billing_basis, max_applications, accepted_amount,
           accepted_currency, billing_interval, assignment_status, starts_at, version, updated_by,
           accepted_by, accepted_at, acceptance_reference)
         VALUES ($1, $2, 1, 'single_application', 1, $3, 'INR', 'monthly',
                 'active', NOW() - INTERVAL '1 day', 1, 'integration-test',
                 'customer-admin', NOW() - INTERVAL '1 day', 'accepted-' || $1)`,
        [tenantId, tariffKey, options.acceptedAmount ?? 100],
      );
      for (let i = 0; i < (options.appCount ?? 1); i++) {
        await pool.query(
          `INSERT INTO eper_tenant_application_assignment
            (tenant_id, application_id, assignment_status, assigned_by, updated_by, revoked_at, revoked_by)
           VALUES ($1, $2, $3, 'integration-test', 'integration-test',
                   CASE WHEN $3 = 'revoked' THEN NOW() ELSE NULL END,
                   CASE WHEN $3 = 'revoked' THEN 'integration-test' ELSE NULL END)`,
          [tenantId, i === 0 ? applicationId : "extra-" + randomUUID(), options.grantStatus ?? 'active'],
        );
      }
      return { tenantId, applicationId };
    }
    async function reserve(label, fixture) {
      const invoiceReference = "invoice-" + randomUUID();
      const approvedAt = new Date().toISOString();
      return store.reserveOrder({
        tenantId: fixture.tenantId, invoiceReference, idempotencyKey: label + "-" + randomUUID(),
        amountMinor: 10000, currency: "INR", invoiceSourceId: "commercial-test",
        invoiceSourceVersion: "v1", invoiceApprovedAt: approvedAt,
        transactionSnapshot: {
          tenantId: fixture.tenantId, reference: invoiceReference, applicationId: fixture.applicationId,
          kind: "GENERAL", description: "Commercial eligibility integration test",
          amountDueMinor: 10000, currency: "INR", status: "DUE", lineItems: [], adjustments: [],
          sourceId: "commercial-test", sourceVersion: "v1", approvedAt,
        },
      });
    }

    const inactive = await seed("inactive", { status: "inactive" });
    assert.deepEqual(await reserve("inactive", inactive), { ok: false, reason: "commercial_ineligible" });

    const missingGrant = await seed("missing-grant", { appCount: 0 });
    assert.deepEqual(await reserve("missing-grant", missingGrant), { ok: false, reason: "commercial_ineligible" });

    const revokedGrant = await seed("revoked-grant", { grantStatus: "revoked" });
    assert.deepEqual(await reserve("revoked-grant", revokedGrant), { ok: false, reason: "commercial_ineligible" });

    const retiredTariff = await seed("retired-tariff", { tariffStatus: "retired" });
    assert.deepEqual(await reserve("retired-tariff", retiredTariff), { ok: false, reason: "commercial_ineligible" });

    const priceDrift = await seed("price-drift", { acceptedAmount: 90 });
    assert.deepEqual(await reserve("price-drift", priceDrift), { ok: false, reason: "commercial_ineligible" });

    const overLimit = await seed("over-limit", { appCount: 2 });
    assert.deepEqual(await reserve("over-limit", overLimit), { ok: false, reason: "commercial_ineligible" });

    const eligible = await seed("eligible");
    const allowed = await reserve("eligible", eligible);
    assert.equal(allowed.ok, true, "an active customer with an accepted effective tariff and one granted app may reserve checkout");
    const persistedAcceptance = await pool.query(
      `SELECT commercial_acceptance_snapshot FROM eper_payment_orders
        WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1`,
      [eligible.tenantId],
    );
    const acceptance = persistedAcceptance.rows[0]?.commercial_acceptance_snapshot;
    assert.equal(acceptance?.tenantId, eligible.tenantId);
    assert.equal(acceptance?.applicationId, eligible.applicationId);
    assert.equal(acceptance?.billingBasis, "single_application");
    assert.equal(acceptance?.maxApplications, 1);
    assert.equal(acceptance?.acceptedAmount, 100);
    assert.equal(acceptance?.acceptedCurrency, "INR");
    assert.equal(acceptance?.acceptedBy, "customer-admin");
    assert.equal(acceptance?.acceptanceReference, "accepted-" + eligible.tenantId);
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
        applicationId: "application-" + tenantId,
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
      transactionSnapshot: capture.transactionSnapshot,
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
    reservationInput.transactionSnapshot = {
      tenantId, reference: reservationInput.invoiceReference, applicationId: "application-" + tenantId, kind: "GENERAL",
      description: "Order reservation integration fixture", amountDueMinor: reservationInput.amountMinor,
      currency: "INR", status: "DUE", lineItems: [], adjustments: [],
      sourceId: reservationInput.invoiceSourceId, sourceVersion: reservationInput.invoiceSourceVersion,
      approvedAt: reservationInput.invoiceApprovedAt,
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
    input.transactionSnapshot = {
      tenantId: input.tenantId, reference: input.invoiceReference, applicationId: "application-" + input.tenantId, kind: "GENERAL",
      description: "Lease reconciliation integration fixture", amountDueMinor: input.amountMinor,
      currency: "INR", status: "DUE", lineItems: [], adjustments: [],
      sourceId: input.invoiceSourceId, sourceVersion: input.invoiceSourceVersion,
      approvedAt: input.invoiceApprovedAt,
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
    input.transactionSnapshot = {
      tenantId: input.tenantId, reference: input.invoiceReference, applicationId: "application-" + input.tenantId, kind: "GENERAL",
      description: "Concurrent reservation integration fixture", amountDueMinor: input.amountMinor,
      currency: "INR", status: "DUE", lineItems: [], adjustments: [],
      sourceId: input.invoiceSourceId, sourceVersion: input.invoiceSourceVersion,
      approvedAt: input.invoiceApprovedAt,
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

test("PostgresPaymentStore prevents concurrent active orders for one invoice across different idempotency keys", { skip: !databaseUrl }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    const store = new PostgresPaymentStore(pool);
    const tenantId = "invoice-race-" + randomUUID();
    const invoiceReference = "invoice-" + randomUUID();
    const invoiceApprovedAt = new Date().toISOString();
    const common = {
      tenantId, invoiceReference, amountMinor: 12500, currency: "INR",
      invoiceSourceId: "integration-test-authority", invoiceSourceVersion: "invoice-race-v1",
      invoiceApprovedAt,
    };
    const snapshot = {
      tenantId, reference: invoiceReference, applicationId: "application-" + tenantId, kind: "GENERAL",
      description: "Concurrent different-key reservation fixture", amountDueMinor: 12500,
      currency: "INR", status: "DUE", lineItems: [], adjustments: [],
      sourceId: common.invoiceSourceId, sourceVersion: common.invoiceSourceVersion,
      approvedAt: invoiceApprovedAt,
    };
    const results = await Promise.all([
      store.reserveOrder({ ...common, idempotencyKey: "key-a-" + randomUUID(), transactionSnapshot: snapshot }),
      store.reserveOrder({ ...common, idempotencyKey: "key-b-" + randomUUID(), transactionSnapshot: snapshot }),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1, "only one key may reserve a provider order for this invoice");
    assert.equal(results.filter((result) => !result.ok && result.reason === "invoice_payment_conflict").length, 1,
      "the competing key must be rejected, not given the active order");
    const persisted = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM eper_payment_orders
        WHERE tenant_id = $1 AND invoice_reference = $2
          AND status IN ('creating', 'created', 'authorized', 'captured')`,
      [tenantId, invoiceReference],
    );
    assert.equal(persisted.rows[0].count, 1, "one active durable order must exist for the invoice");
  } finally {
    await pool.end();
  }
});

test("definitive gateway rejection permits retry with the same idempotency key", { skip: !databaseUrl }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  try {
    const store = new PostgresPaymentStore(pool);
    const input = {
      tenantId: "rejected-retry-" + randomUUID(),
      invoiceReference: "invoice-" + randomUUID(),
      idempotencyKey: "idem-" + randomUUID(),
      amountMinor: 12500,
      currency: "INR",
      invoiceSourceId: "integration-test-authority",
      invoiceSourceVersion: "retry-v1",
      invoiceApprovedAt: new Date().toISOString(),
    };
    input.transactionSnapshot = {
      tenantId: input.tenantId, reference: input.invoiceReference, applicationId: "application-" + input.tenantId, kind: "GENERAL",
      description: "Definitive gateway rejection retry fixture", amountDueMinor: input.amountMinor,
      currency: "INR", status: "DUE", lineItems: [], adjustments: [],
      sourceId: input.invoiceSourceId, sourceVersion: input.invoiceSourceVersion,
      approvedAt: input.invoiceApprovedAt,
    };

    const first = await store.reserveOrder(input);
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const released = await store.releaseOrderCreationAfterRejection(input.tenantId, input.idempotencyKey);
    assert.equal(released.ok, true);

    const retried = await store.reserveOrder(input);
    assert.equal(retried.ok, true, "the same key and immutable snapshot should be retryable after a definitive rejection");
    if (!retried.ok) return;
    assert.equal(retried.value.id, first.value.id, "retry must reuse the original reservation row");
    assert.equal(retried.value.transactionPublicId, first.value.transactionPublicId);
    assert.equal(retried.value.providerOrderId, null);

    const persisted = await pool.query(
      `SELECT status, provider_order_id, creation_attempts, last_creation_error
         FROM eper_payment_orders WHERE tenant_id = $1 AND idempotency_key = $2`,
      [input.tenantId, input.idempotencyKey],
    );
    assert.equal(persisted.rows.length, 1);
    assert.equal(persisted.rows[0].status, "creating");
    assert.equal(persisted.rows[0].provider_order_id, null);
    assert.equal(persisted.rows[0].creation_attempts, 2);
    assert.equal(persisted.rows[0].last_creation_error, null);

    const providerOrderId = "order_" + randomUUID().replaceAll("-", "");
    const completed = await store.completeOrderCreation(input.tenantId, input.idempotencyKey, providerOrderId);
    assert.equal(completed.ok, true);
    if (completed.ok) assert.equal(completed.value.providerOrderId, providerOrderId);
  } finally {
    await pool.end();
  }
});
