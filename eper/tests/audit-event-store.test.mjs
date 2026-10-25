import test from "node:test";
import assert from "node:assert/strict";
import { appendAuditEvent, hashAuditEnvelope } from "../dist/packages/audit/audit-event-store.js";

function mockPool({ failInsert = false, headHash = null } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: headHash }], rowCount: 1 };
      if (failInsert && sql.includes("INSERT INTO eper_audit_events")) throw new Error("audit storage unavailable");
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

const valid = {
  tenantId: "tenant-a", applicationId: "school-erp", environment: "uat",
  actorType: "human", actorId: "reviewer-7", effectiveRoles: ["fee-accountant"],
  action: "receipt.issue", outcome: "success", source: "api",
  operationName: "POST /v1/receipts", correlationId: "corr-123",
  payload: { receiptId: "receipt-1", authorizationToken: "do-not-store", amountMinor: 120000 },
};

test("audit event appends transactionally with hash and redacted payload", async () => {
  const { pool, calls } = mockPool({ headHash: "a".repeat(64) });
  const result = await appendAuditEvent(pool, valid);
  assert.match(result.eventId, /^[0-9a-f-]{36}$/);
  assert.match(result.eventHash, /^[0-9a-f]{64}$/);
  assert.ok(calls.some((c) => c.sql === "BEGIN"));
  assert.ok(calls.some((c) => c.sql.includes("pg_advisory_xact_lock")));
  const insert = calls.find((c) => c.sql.includes("INSERT INTO eper_audit_events"));
  assert.ok(insert);
  assert.equal(insert.values[26], "a".repeat(64));
  assert.ok(String(insert.values[25]).includes("[REDACTED]"));
  assert.ok(calls.some((c) => c.sql.includes("UPDATE eper_audit_chain_head")));
  assert.ok(calls.some((c) => c.sql === "COMMIT"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("audit persistence failure rolls back and propagates", async () => {
  const { pool, calls } = mockPool({ failInsert: true });
  await assert.rejects(() => appendAuditEvent(pool, valid), /audit storage unavailable/);
  assert.ok(calls.some((c) => c.sql === "ROLLBACK"));
  assert.ok(!calls.some((c) => c.sql === "COMMIT"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("required actor and tenant context cannot be empty", async () => {
  const { pool, calls } = mockPool();
  await assert.rejects(() => appendAuditEvent(pool, { ...valid, actorId: " " }), /audit_required_field_missing:actorId/);
  assert.equal(calls.length, 0);
});

test("canonical event hash is stable for object key order", () => {
  assert.equal(hashAuditEnvelope({ b: 2, a: 1 }), hashAuditEnvelope({ a: 1, b: 2 }));
});
