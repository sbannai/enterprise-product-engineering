import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PostgresPaymentStore } from "../dist/packages/payments/postgres-payment-store.js";

function makePool({ duplicateEvent = false, duplicateEventPayloadSha256 = "b".repeat(64), duplicateEventType = "payment.captured", orderTenantId = "tenant-a", orderAmountMinor = 12500, orderStatus = "created", orderInsertConflict = false, existingOrderProviderId = "order_test_41", existingOrderInvoiceReference = "invoice-41", activeInvoiceOrder = null, existingKeyBinding = null } = {}) {
  const calls = [];
  let released = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      if (sql.includes("SELECT invoice_reference, amount_minor, currency, invoice_source_id, invoice_source_version, invoice_approved_at") &&
          sql.includes("WHERE tenant_id = $1 AND idempotency_key = $2")) {
        return { rows: existingKeyBinding ? [existingKeyBinding] : [], rowCount: existingKeyBinding ? 1 : 0 };
      }
      if (sql.includes("WHERE tenant_id = $1 AND invoice_reference = $2") && sql.includes("status IN ('creating', 'created', 'authorized', 'captured')")) {
        return { rows: activeInvoiceOrder ? [activeInvoiceOrder] : [], rowCount: activeInvoiceOrder ? 1 : 0 };
      }
      if (sql.includes("SELECT id, transaction_public_id, provider_order_id, invoice_reference, amount_minor, currency") &&
          sql.includes("WHERE tenant_id = $1 AND idempotency_key = $2")) {
        return { rows: orderInsertConflict ? [{
          id: 41, transaction_public_id: "txn-public-41", provider_order_id: null,
          invoice_reference: "invoice-41", amount_minor: 12500, currency: "INR",
          invoice_source_id: "approved-invoice-service", invoice_source_version: "v3",
          invoice_approved_at: "2026-10-20T12:00:00.000Z", status: "failed",
          creation_lease_until: null, last_creation_error: "gateway_rejected",
        }] : [], rowCount: orderInsertConflict ? 1 : 0 };
      }
      if (sql.includes("UPDATE eper_payment_orders") && sql.includes("status = 'failed'")) {
        return { rows: [{ id: 41 }], rowCount: 1 };
      }
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
      if (sql.includes("SELECT id, tenant_id, amount_minor")) {
        return { rows: [{ id: 41, tenant_id: orderTenantId, amount_minor: orderAmountMinor, currency: "INR", status: orderStatus }], rowCount: 1 };
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


test("reserveOrder rejects a fresh idempotency key instead of adopting another key's active order", async () => {
  const activeInvoiceOrder = {
    id: 41, transaction_public_id: "txn-public-41", provider_order_id: "order_existing_41",
    idempotency_key: "original-key",
    invoice_reference: "invoice-41", amount_minor: 12500, currency: "INR",
    invoice_source_id: "approved-invoice-service", invoice_source_version: "v3",
    invoice_approved_at: "2026-10-20T12:00:00.000Z", status: "created",
    creation_lease_until: null,
  };
  const fake = makePool({ activeInvoiceOrder });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.reserveOrder({
    tenantId: "tenant-a", invoiceReference: "invoice-41",
    idempotencyKey: "different-retry-key", amountMinor: 12500, currency: "INR",
    invoiceSourceId: "approved-invoice-service", invoiceSourceVersion: "v3",
    invoiceApprovedAt: "2026-10-20T12:00:00.000Z",
  });
  assert.deepEqual(result, { ok: false, reason: "invoice_payment_conflict" });
  const lockIndex = fake.calls.findIndex(({ sql }) => sql.includes("pg_advisory_xact_lock"));
  const lookupIndex = fake.calls.findIndex(({ sql }) => sql.includes("status IN ('creating', 'created', 'authorized', 'captured')"));
  assert.ok(lockIndex >= 0 && lookupIndex > lockIndex, "invoice lock must be acquired before checking active orders");
  assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_orders")), false);
  assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
});

test("reserveOrder refuses a second order when the invoice already has a captured payment", async () => {
  const fake = makePool({ activeInvoiceOrder: {
    id: 41, transaction_public_id: "txn-public-41", provider_order_id: "order_existing_41",
    invoice_reference: "invoice-41", amount_minor: 12500, currency: "INR",
    invoice_source_id: "approved-invoice-service", invoice_source_version: "v3",
    invoice_approved_at: "2026-10-20T12:00:00.000Z", status: "captured",
    creation_lease_until: null,
  } });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.reserveOrder({
    tenantId: "tenant-a", invoiceReference: "invoice-41",
    idempotencyKey: "fresh-key", amountMinor: 12500, currency: "INR",
    invoiceSourceId: "approved-invoice-service", invoiceSourceVersion: "v3",
    invoiceApprovedAt: "2026-10-20T12:00:00.000Z",
  });
  assert.deepEqual(result, { ok: false, reason: "invoice_already_paid" });
  assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_orders")), false);
  assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
});


test("releaseOrderCreationAfterRejection releases only an uncompleted reservation", async () => {
  const fake = makePool();
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.releaseOrderCreationAfterRejection("tenant-a", "idem-rejected-41");
  assert.deepEqual(result, { ok: true, value: { id: "41" } });
  const update = fake.calls.find(({ sql }) => sql.includes("UPDATE eper_payment_orders") && sql.includes("status = 'failed'"));
  assert.ok(update, "definitive rejection should mark the reservation failed");
  assert.match(update.sql, /status = 'creating'/);
  assert.match(update.sql, /provider_order_id IS NULL/);
  assert.deepEqual(update.values, ["tenant-a", "idem-rejected-41"]);
  assert.equal(fake.calls.at(-1).sql, "COMMIT");
});


test("reserveOrder safely re-arms the same idempotency key after a definitive gateway rejection", async () => {
  const fake = makePool({ orderInsertConflict: true });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.reserveOrder({
    tenantId: "tenant-a", invoiceReference: "invoice-41",
    idempotencyKey: "idem-rejected-41", amountMinor: 12500, currency: "INR",
    invoiceSourceId: "approved-invoice-service", invoiceSourceVersion: "v3",
    invoiceApprovedAt: "2026-10-20T12:00:00.000Z",
  });
  assert.deepEqual(result, { ok: true, value: { id: "41", transactionPublicId: "txn-public-41", providerOrderId: null } });
  const restart = fake.calls.find(({ sql }) => sql.includes("SET status = 'creating'") && sql.includes("last_creation_error = 'gateway_rejected'"));
  assert.ok(restart, "only a recorded definitive rejection may re-arm the reservation");
  assert.equal(fake.calls.at(-1).sql, "COMMIT");
});


test("reserveOrder rejects an idempotency key bound to another invoice before reusing an active order", async () => {
  const fake = makePool({
    existingKeyBinding: {
      invoice_reference: "invoice-other",
      amount_minor: 12500,
      currency: "INR",
      invoice_source_id: "approved-invoice-service",
      invoice_source_version: "v3",
      invoice_approved_at: "2026-10-20T12:00:00.000Z",
    },
    activeInvoiceOrder: {
      id: 42, transaction_public_id: "txn-public-42", provider_order_id: "order_invoice_41",
      idempotency_key: "other-key", invoice_reference: "invoice-41", amount_minor: 12500,
      currency: "INR", invoice_source_id: "approved-invoice-service", invoice_source_version: "v3",
      invoice_approved_at: "2026-10-20T12:00:00.000Z", status: "created", creation_lease_until: null,
    },
  });
  const store = new PostgresPaymentStore(fake.pool);
  const result = await store.reserveOrder({
    tenantId: "tenant-a", invoiceReference: "invoice-41", idempotencyKey: "key-bound-elsewhere",
    amountMinor: 12500, currency: "INR", invoiceSourceId: "approved-invoice-service",
    invoiceSourceVersion: "v3", invoiceApprovedAt: "2026-10-20T12:00:00.000Z",
  });
  assert.deepEqual(result, { ok: false, reason: "idempotency_conflict" });
  assert.equal(fake.calls.some(({ sql }) => sql.includes("status IN ('creating', 'created', 'authorized', 'captured')")), false,
    "key binding must be validated before active-order lookup");
  assert.equal(fake.calls.at(-1).sql, "ROLLBACK");
});
