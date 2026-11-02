import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PostgresPaymentStore } from "../dist/packages/payments/postgres-payment-store.js";

function makePool({ duplicateEvent = false, duplicateEventPayloadSha256 = "b".repeat(64), duplicateEventType = "payment.captured", orderTenantId = "tenant-a", orderAmountMinor = 12500, orderStatus = "created", orderInsertConflict = false, existingOrderProviderId = "order_test_41", existingOrderInvoiceReference = "invoice-41" } = {}) {
  const calls = [];
  let released = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      if (sql.includes("INSERT INTO eper_payment_orders")) {
        return { rows: orderInsertConflict ? [] : [{ id: 41, provider_order_id: "order_test_41" }], rowCount: orderInsertConflict ? 0 : 1 };
      }
      if (sql.includes("SELECT id, provider_order_id, invoice_reference, amount_minor, currency")) {
        return {
          rows: orderInsertConflict ? [{
            id: 41,
            provider_order_id: existingOrderProviderId,
            invoice_reference: existingOrderInvoiceReference,
            amount_minor: 12500,
            currency: "INR",
          }] : [],
          rowCount: orderInsertConflict ? 1 : 0,
        };
      }
      if (sql.includes("INSERT INTO eper_payment_webhook_events")) {
        return { rows: duplicateEvent ? [] : [{ provider_event_id: values[0] }], rowCount: duplicateEvent ? 0 : 1 };
      }
      if (sql.includes("SELECT receipt_public_id FROM eper_payment_receipts")) {
        return { rows: [{ receipt_public_id: "9e3b1a60-2f44-4b4e-8a18-7f8e61a5d932" }], rowCount: 1 };
      }
      if (sql.includes("SELECT event_type, payload_sha256")) {
        return {
          rows: duplicateEvent ? [{ event_type: duplicateEventType, payload_sha256: duplicateEventPayloadSha256 }] : [],
          rowCount: duplicateEvent ? 1 : 0,
        };
      }
      if (sql.includes("SELECT id, tenant_id, invoice_reference, amount_minor")) {
        return { rows: [{ id: 41, tenant_id: orderTenantId, invoice_reference: "invoice-41", amount_minor: orderAmountMinor, currency: "INR", status: orderStatus, provider_payment_id: null, transaction_snapshot: null }], rowCount: 1 };
      }
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() { released += 1; },
  };
  return { pool: { async connect() { return client; } }, calls, get released() { return released; } };
}

test("PostgresPaymentStore inserts orders inside a transaction and releases its client", async () => {
  const fake = makePool();
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.insertOrder({
    tenantId: "tenant-a",
    invoiceReference: "invoice-41",
    idempotencyKey: "tenant-a:invoice-41",
    providerOrderId: "order_test_41",
    amountMinor: 12500,
    currency: "INR",
    invoiceSourceId: "approved-invoice-service",
    invoiceSourceVersion: "v3",
    invoiceApprovedAt: "2026-10-20T12:00:00.000Z",
  });
  assert.deepEqual(result, { ok: true, value: { id: "41", providerOrderId: "order_test_41" } });
  assert.equal(fake.calls[0].sql, "BEGIN");
  assert.ok(fake.calls.some(({ sql }) => sql.includes("ON CONFLICT (tenant_id, idempotency_key) DO NOTHING")));
  assert.equal(fake.calls.at(-1).sql, "COMMIT");
  assert.equal(fake.released, 1);
});

test("PostgresPaymentStore atomically records a capture and receipt", async () => {
  const fake = makePool();
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.capturePayment({
    providerEventId: "evt_41",
    eventType: "payment.captured",
    payloadSha256: "a".repeat(64),
    providerOrderId: "order_test_41",
    providerPaymentId: "pay_test_41",
    amountMinor: 12500,
    currency: "INR",
    tenantId: "tenant-a",
    receiptNumber: "APPROVED-RECEIPT-00041",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.receiptNumber, "APPROVED-RECEIPT-00041");
  assert.ok(fake.calls.some(({ sql }) => sql.includes("SET status = 'captured', provider_payment_id = $2")));
  assert.ok(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_receipts")));
  assert.equal(fake.calls.at(-1).sql, "COMMIT");
  assert.equal(fake.released, 1);
});

test("PostgresPaymentStore rolls back duplicate provider events without issuing a receipt", async () => {
  const fake = makePool({ duplicateEvent: true });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.capturePayment({
    providerEventId: "evt_duplicate",
    eventType: "payment.captured",
    payloadSha256: "b".repeat(64),
    providerOrderId: "order_test_41",
    providerPaymentId: "pay_test_41",
    amountMinor: 12500,
    currency: "INR",
    tenantId: "tenant-a",
    receiptNumber: "APPROVED-RECEIPT-00042",
  });
  assert.deepEqual(result, { ok: false, reason: "duplicate_event" });
  assert.ok(fake.calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_receipts")), false);
  assert.equal(fake.released, 1);
});

test("PostgresPaymentStore rejects invalid capture input before opening a transaction", async () => {
  let connectCalls = 0;
  const store = new PostgresPaymentStore({
    async connect() {
      connectCalls += 1;
      throw new Error("database should not be touched for invalid input");
    },
  });
  const validInput = {
    providerEventId: "evt_invalid",
    eventType: "payment.captured",
    payloadSha256: "c".repeat(64),
    providerOrderId: "order_test_41",
    providerPaymentId: "pay_test_41",
    amountMinor: 12500,
    currency: "INR",
    tenantId: "tenant-a",
    receiptNumber: "BUSINESS-APPROVED-RECEIPT-001",
  };

  await assert.rejects(
    store.capturePayment({ ...validInput, eventType: "payment.authorized" }),
    /INVALID_CAPTURE_INPUT/,
  );
  await assert.rejects(
    store.capturePayment({ ...validInput, payloadSha256: "not-a-sha256" }),
    /INVALID_CAPTURE_INPUT/,
  );
  await assert.rejects(
    store.capturePayment({ ...validInput, amountMinor: 0 }),
    /INVALID_CAPTURE_INPUT/,
  );
  assert.equal(connectCalls, 0);
});

test("PostgresPaymentStore rejects invalid order input before opening a transaction", async () => {
  let connectCalls = 0;
  const store = new PostgresPaymentStore({
    async connect() {
      connectCalls += 1;
      throw new Error("database should not be touched for invalid input");
    },
  });
  const validInput = {
    tenantId: "tenant-a",
    invoiceReference: "invoice-41",
    idempotencyKey: "tenant-a:invoice-41",
    providerOrderId: "order_test_41",
    amountMinor: 12500,
    currency: "INR",
    invoiceSourceId: "approved-invoice-service",
    invoiceSourceVersion: "v3",
    invoiceApprovedAt: "2026-10-20T12:00:00.000Z",
  };

  await assert.rejects(
    store.insertOrder({ ...validInput, amountMinor: -1 }),
    /INVALID_PAYMENT_ORDER_INPUT/,
  );
  await assert.rejects(
    store.insertOrder({ ...validInput, invoiceApprovedAt: "not-a-date" }),
    /INVALID_PAYMENT_ORDER_INPUT/,
  );
  assert.equal(connectCalls, 0);
});

test("PostgresPaymentStore validates receipt PDF bytes before database access", async () => {
  let connectCalls = 0;
  const store = new PostgresPaymentStore({
    async connect() {
      connectCalls += 1;
      throw new Error("database should not be touched for invalid input");
    },
  });
  await assert.rejects(
    store.persistReceiptDocument("tenant-a", "41", Buffer.from("not a PDF")),
    /INVALID_RECEIPT_DOCUMENT_INPUT/,
  );
  await assert.rejects(
    store.persistReceiptDocument("tenant-a", "../41", Buffer.from("%PDF-1.4\\nvalid-looking PDF")),
    /INVALID_RECEIPT_DOCUMENT_INPUT/,
  );
  assert.equal(connectCalls, 0);
});
test("PostgresPaymentStore rejects non-numeric receipt order IDs before database access", async () => {
  let connectCalls = 0;
  const store = new PostgresPaymentStore({
    async connect() {
      connectCalls += 1;
      throw new Error("database should not be touched for invalid input");
    },
  });
  await assert.rejects(store.findReceipt("tenant-a", "not-a-numeric-id"), /INVALID_RECEIPT_LOOKUP/);
  await assert.rejects(store.findReceipt("tenant-a", "../41"), /INVALID_RECEIPT_LOOKUP/);
  assert.equal(connectCalls, 0);
});

test("PostgresPaymentStore rejects receipt identifiers unsafe for headers or filenames", async () => {
  let connectCalls = 0;
  const store = new PostgresPaymentStore({
    async connect() {
      connectCalls += 1;
      throw new Error("database should not be touched for invalid input");
    },
  });
  const validInput = {
    providerEventId: "evt_receipt",
    eventType: "payment.captured",
    payloadSha256: "d".repeat(64),
    providerOrderId: "order_test_41",
    providerPaymentId: "pay_test_41",
    amountMinor: 12500,
    currency: "INR",
    tenantId: "tenant-a",
    receiptNumber: "APPROVED-RECEIPT-00043",
  };
  await assert.rejects(
    store.capturePayment({ ...validInput, receiptNumber: 'RECEIPT-43"\\r\\nX-Injected: yes' }),
    /INVALID_CAPTURE_INPUT/,
  );
  await assert.rejects(
    store.capturePayment({ ...validInput, receiptNumber: "x".repeat(81) }),
    /INVALID_CAPTURE_INPUT/,
  );
  assert.equal(connectCalls, 0);
});

test("PostgresPaymentStore flags provider event ID reuse with a different payload", async () => {
  const fake = makePool({ duplicateEvent: true, duplicateEventPayloadSha256: "e".repeat(64) });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.capturePayment({
    providerEventId: "evt_duplicate",
    eventType: "payment.captured",
    payloadSha256: "f".repeat(64),
    providerOrderId: "order_test_41",
    providerPaymentId: "pay_test_41",
    amountMinor: 12500,
    currency: "INR",
    tenantId: "tenant-a",
    receiptNumber: "APPROVED-RECEIPT-00044",
  });
  assert.deepEqual(result, { ok: false, reason: "event_conflict" });
  assert.ok(fake.calls.some(({ sql }) => sql.includes("SELECT event_type, payload_sha256")));
  assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
  assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_receipts")), false);
  assert.equal(fake.released, 1);
});

test("PostgresPaymentStore rejects a repeated event ID whose event type differs", async () => {
  const fake = makePool({
    duplicateEvent: true,
    duplicateEventPayloadSha256: "a".repeat(64),
    duplicateEventType: "payment.authorized",
  });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.capturePayment({
    providerEventId: "evt_type_conflict",
    eventType: "payment.captured",
    payloadSha256: "a".repeat(64),
    providerOrderId: "order_test_41",
    providerPaymentId: "pay_test_41",
    amountMinor: 12500,
    currency: "INR",
    tenantId: "tenant-a",
    receiptNumber: "APPROVED-RECEIPT-00045",
  });
  assert.deepEqual(result, { ok: false, reason: "event_conflict" });
  assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_receipts")), false);
  assert.equal(fake.released, 1);
});

test("PostgresPaymentStore rolls back a capture when the order tenant or amount mismatches", async () => {
  for (const options of [
    { orderTenantId: "tenant-b" },
    { orderAmountMinor: 12501 },
  ]) {
    const fake = makePool(options);
    const store = new PostgresPaymentStore(fake.pool);
    const result = await store.capturePayment({
      providerEventId: "evt_mismatch",
      eventType: "payment.captured",
      payloadSha256: "9".repeat(64),
      providerOrderId: "order_test_41",
      providerPaymentId: "pay_test_41",
      amountMinor: 12500,
      currency: "INR",
      tenantId: "tenant-a",
      receiptNumber: "APPROVED-RECEIPT-00046",
    });
    assert.deepEqual(result, { ok: false, reason: "payment_mismatch" });
    assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
    assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_receipts")), false);
    assert.equal(fake.released, 1);
  }
});

test("PostgresPaymentStore rejects capture for an already captured order", async () => {
  const fake = makePool({ orderStatus: "captured" });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.capturePayment({
    providerEventId: "evt_already_captured",
    eventType: "payment.captured",
    payloadSha256: "8".repeat(64),
    providerOrderId: "order_test_41",
    providerPaymentId: "pay_test_41",
    amountMinor: 12500,
    currency: "INR",
    tenantId: "tenant-a",
    receiptNumber: "APPROVED-RECEIPT-00047",
  });
  assert.deepEqual(result, { ok: false, reason: "payment_mismatch" });
  assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
  assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_receipts")), false);
});

test("PostgresPaymentStore rejects reuse of an idempotency key for a different provider order", async () => {
  const fake = makePool({ orderInsertConflict: true, existingOrderProviderId: "order_original_41" });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.insertOrder({
    tenantId: "tenant-a",
    invoiceReference: "invoice-41",
    idempotencyKey: "tenant-a:invoice-41",
    providerOrderId: "order_retried_41",
    amountMinor: 12500,
    currency: "INR",
    invoiceSourceId: "approved-invoice-service",
    invoiceSourceVersion: "v3",
    invoiceApprovedAt: "2026-10-20T12:00:00.000Z",
  });
  assert.deepEqual(result, { ok: false, reason: "idempotency_conflict" });
  assert.equal(fake.calls.at(-1).sql, "COMMIT");
  assert.equal(fake.released, 1);
});

test("PostgresPaymentStore persists immutable PDF bytes and digest for a valid numeric order ID", async () => {
  const calls = [];
  let storedHash = null;
  let storedPdf = null;
  const store = new PostgresPaymentStore({
    async connect() {
      return {
        async query(sql, values = []) {
          const normalized = sql.replace(/\\s+/g, " ").trim();
          calls.push({ sql: normalized, values });
          if (normalized.startsWith("SELECT document_sha256, document_pdf")) {
            return { rows: [{ document_sha256: storedHash, document_pdf: storedPdf }], rowCount: 1 };
          }
          if (normalized.startsWith("UPDATE eper_payment_receipts")) {
            storedHash = values[2];
            storedPdf = values[3];
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: null };
        },
        release() {},
      };
    },
  });
  const pdf = Buffer.from("%PDF-1.4\\nreceipt\\n%%EOF", "ascii");
  const hash = createHash("sha256").update(pdf).digest("hex");
  assert.deepEqual(
    await store.persistReceiptDocument("tenant-a", "41", pdf),
    { ok: true, value: { documentSha256: hash } },
  );
  assert.deepEqual(
    await store.persistReceiptDocument("tenant-a", "41", pdf),
    { ok: true, value: { documentSha256: hash } },
  );
  assert.deepEqual(
    await store.persistReceiptDocument("tenant-a", "41", Buffer.from("%PDF-1.4\\nchanged\\n%%EOF", "ascii")),
    { ok: false, reason: "receipt_document_conflict" },
  );
  assert.equal(storedHash, hash);
  assert.deepEqual(storedPdf, pdf);
  assert.equal(calls.filter(({ sql }) => sql.startsWith("UPDATE eper_payment_receipts")).length, 1);
  assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
  assert.ok(calls.some(({ sql }) => sql === "ROLLBACK"));
});

function schemaPool({ missingTrigger = null, missingConstraint = null, disabledTrigger = null, missingColumn = null } = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("to_regclass('public.eper_payment_orders')")) {
        return { rows: [{ orders: "eper_payment_orders", events: "eper_payment_webhook_events", receipts: "eper_payment_receipts" }], rowCount: 1 };
      }
      if (sql.includes("information_schema.columns")) {
        const columns = [
          { table_name: "eper_payment_orders", column_name: "transaction_snapshot" },
          { table_name: "eper_payment_orders", column_name: "transaction_public_id" },
          { table_name: "eper_payment_orders", column_name: "commercial_acceptance_snapshot" },
          { table_name: "eper_payment_receipts", column_name: "transaction_snapshot" },
          { table_name: "eper_payment_receipts", column_name: "commercial_acceptance_snapshot" },
          { table_name: "eper_payment_receipts", column_name: "document_pdf" },
        ];
        const rows = columns.filter((row) => row.table_name + "." + row.column_name !== missingColumn);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM pg_trigger")) {
        return { rows: [
          ...(missingTrigger === "eper_payment_order_snapshot_immutable" ? [] : [{ table_name: "eper_payment_orders", trigger_name: "eper_payment_order_snapshot_immutable", trigger_enabled: disabledTrigger === "eper_payment_order_snapshot_immutable" ? "D" : "O" }]),
          ...(missingTrigger === "eper_payment_receipt_immutability_guard" ? [] : [{ table_name: "eper_payment_receipts", trigger_name: "eper_payment_receipt_immutability_guard", trigger_enabled: disabledTrigger === "eper_payment_receipt_immutability_guard" ? "D" : "O" }]),
        ], rowCount: missingTrigger ? 1 : 2 };
      }
      if (sql.includes("FROM pg_constraint")) {
        const constraints = [
          { table_name: "eper_payment_orders", constraint_name: "eper_payment_orders_transaction_snapshot_object_check" },
          { table_name: "eper_payment_receipts", constraint_name: "eper_payment_receipts_transaction_snapshot_object_check" },
          { table_name: "eper_payment_orders", constraint_name: "eper_payment_orders_commercial_acceptance_object_check" },
          { table_name: "eper_payment_receipts", constraint_name: "eper_payment_receipts_commercial_acceptance_object_check" },
        ];
        const rows = constraints.filter((row) => row.constraint_name !== missingConstraint);
        return { rows, rowCount: rows.length };
      }
      throw new Error("Unexpected schema readiness query");
    },
    release() {},
  };
  return { pool: { async connect() { return client; } }, calls };
}

test("checkSchema fails closed when a commercial acceptance snapshot column is missing", async () => {
  for (const missingColumn of [
    "eper_payment_orders.commercial_acceptance_snapshot",
    "eper_payment_receipts.commercial_acceptance_snapshot",
  ]) {
    const fake = schemaPool({ missingColumn });
    assert.equal(await new PostgresPaymentStore(fake.pool).checkSchema(), false);
    assert.equal(fake.calls.some((sql) => sql.includes("FROM pg_trigger")), false);
  }
});

test("checkSchema accepts the complete schema and database immutability protections", async () => {
  const fake = schemaPool();
  assert.equal(await new PostgresPaymentStore(fake.pool).checkSchema(), true);
  assert.ok(fake.calls.some((sql) => sql.includes("FROM pg_trigger")));
  assert.ok(fake.calls.some((sql) => sql.includes("FROM pg_constraint")));
});

test("checkSchema fails closed when an order snapshot immutability trigger is missing", async () => {
  const fake = schemaPool({ missingTrigger: "eper_payment_order_snapshot_immutable" });
  assert.equal(await new PostgresPaymentStore(fake.pool).checkSchema(), false);
  assert.equal(fake.calls.some((sql) => sql.includes("FROM pg_constraint")), false);
});

test("checkSchema fails closed when a receipt snapshot immutability trigger is missing", async () => {
  const fake = schemaPool({ missingTrigger: "eper_payment_receipt_immutability_guard" });
  assert.equal(await new PostgresPaymentStore(fake.pool).checkSchema(), false);
});

test("checkSchema fails closed when a snapshot immutability trigger is disabled", async () => {
  for (const disabledTrigger of [
    "eper_payment_order_snapshot_immutable",
    "eper_payment_receipt_immutability_guard",
  ]) {
    const fake = schemaPool({ disabledTrigger });
    assert.equal(await new PostgresPaymentStore(fake.pool).checkSchema(), false);
  }
});

test("checkSchema fails closed when any transaction or commercial snapshot object constraint is missing", async () => {
  for (const missingConstraint of [
    "eper_payment_orders_transaction_snapshot_object_check",
    "eper_payment_receipts_transaction_snapshot_object_check",
    "eper_payment_orders_commercial_acceptance_object_check",
    "eper_payment_receipts_commercial_acceptance_object_check",
  ]) {
    const fake = schemaPool({ missingConstraint });
    assert.equal(await new PostgresPaymentStore(fake.pool).checkSchema(), false);
  }
});
