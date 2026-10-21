import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPaymentStore } from "../dist/packages/payments/postgres-payment-store.js";

function makePool({ duplicateEvent = false } = {}) {
  const calls = [];
  let released = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      if (sql.includes("INSERT INTO eper_payment_orders")) {
        return { rows: [{ id: 41, provider_order_id: "order_test_41" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO eper_payment_webhook_events")) {
        return { rows: duplicateEvent ? [] : [{ provider_event_id: values[0] }], rowCount: duplicateEvent ? 0 : 1 };
      }
      if (sql.includes("SELECT id, tenant_id, amount_minor")) {
        return { rows: [{ id: 41, tenant_id: "tenant-a", amount_minor: 12500, currency: "INR", status: "created" }], rowCount: 1 };
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
  });
  assert.equal(result.ok, true);
  assert.match(result.value.receiptNumber, /^EPER-\d{4}-[A-F0-9]{8}$/);
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
  });
  assert.deepEqual(result, { ok: false, reason: "duplicate_event" });
  assert.ok(fake.calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(fake.calls.some(({ sql }) => sql.includes("INSERT INTO eper_payment_receipts")), false);
  assert.equal(fake.released, 1);
});
