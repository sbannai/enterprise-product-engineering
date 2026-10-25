import test from "node:test";
import assert from "node:assert/strict";
import { appendAuditEvent, assertAuditStoreReady, hashAuditEnvelope, verifyAuditChain } from "../dist/packages/audit/audit-event-store.js";

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


function readinessPool(state = {}) {
  const client = {
    async query(sql) {
      if (sql.includes("to_regclass")) return { rows: [{
        events_table: state.events_table === undefined ? "eper_audit_events" : state.events_table,
        chain_head_table: state.chain_head_table === undefined ? "eper_audit_chain_head" : state.chain_head_table,
        has_no_update_trigger: state.has_no_update_trigger === undefined ? true : state.has_no_update_trigger,
        has_no_delete_trigger: state.has_no_delete_trigger === undefined ? true : state.has_no_delete_trigger,
        chain_head_count: state.chain_head_count === undefined ? "1" : state.chain_head_count,
      }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { async connect() { return client; } };
}

test("audit readiness passes only when schema, append-only triggers and chain head exist", async () => {
  await assert.doesNotReject(() => assertAuditStoreReady(readinessPool()));
  await assert.rejects(() => assertAuditStoreReady(readinessPool({ events_table: null })), /EPER_AUDIT_SCHEMA_NOT_APPLIED/);
  await assert.rejects(() => assertAuditStoreReady(readinessPool({ has_no_update_trigger: false })), /EPER_AUDIT_APPEND_ONLY_CONTROLS_MISSING/);
  await assert.rejects(() => assertAuditStoreReady(readinessPool({ has_no_delete_trigger: false })), /EPER_AUDIT_APPEND_ONLY_CONTROLS_MISSING/);
  await assert.rejects(() => assertAuditStoreReady(readinessPool({ chain_head_count: "0" })), /EPER_AUDIT_CHAIN_HEAD_NOT_INITIALIZED/);
});


test("audit chain verifier detects a stored-head mismatch", async () => {
  const client = {
    async query(sql) {
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: "f".repeat(64) }], rowCount: 1 };
      if (sql.includes("FROM eper_audit_events")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const result = await verifyAuditChain({ async connect() { return client; } });
  assert.equal(result.eventsChecked, 0);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("stored_chain_head_mismatch"));
});

test("audit chain verifier accepts an empty chain only with an empty head", async () => {
  const client = {
    async query(sql) {
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      if (sql.includes("FROM eper_audit_events")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const result = await verifyAuditChain({ async connect() { return client; } });
  assert.equal(result.eventsChecked, 0);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

function verifierEvent({ id, previous = null, payload = { value: 1 }, eventHash } = {}) {
  const row = {
    event_id: id,
    occurred_at: "2026-10-25T08:00:00.000Z",
    tenant_id: "tenant-a",
    application_id: "school-erp",
    environment: "uat",
    actor_type: "human",
    actor_id: "reviewer-7",
    effective_roles: ["fee-accountant"],
    action: "receipt.issue",
    outcome: "success",
    reason_code: null,
    resource_type: "receipt",
    resource_id: id,
    operation_id: null,
    correlation_id: "corr-123",
    request_id: null,
    source: "api",
    operation_name: "POST /v1/receipts",
    service_version: null,
    approval_id: null,
    parent_event_id: null,
    idempotency_key: null,
    schema_version: 1,
    before_hash: null,
    after_hash: null,
    payload,
    previous_event_hash: previous,
  };
  const envelope = {
    eventId: row.event_id, occurredAt: new Date(row.occurred_at).toISOString(),
    tenantId: row.tenant_id, applicationId: row.application_id,
    environment: row.environment, actorType: row.actor_type, actorId: row.actor_id,
    effectiveRoles: row.effective_roles, action: row.action, outcome: row.outcome,
    reasonCode: row.reason_code, resourceType: row.resource_type, resourceId: row.resource_id,
    operationId: row.operation_id, correlationId: row.correlation_id, requestId: row.request_id,
    source: row.source, operationName: row.operation_name, serviceVersion: row.service_version,
    approvalId: row.approval_id, parentEventId: row.parent_event_id,
    idempotencyKey: row.idempotency_key, schemaVersion: row.schema_version,
    beforeHash: row.before_hash, afterHash: row.after_hash, payload,
    previousEventHash: previous,
  };
  row.event_hash = eventHash ?? hashAuditEnvelope(envelope);
  return row;
}

function verifierPool(rows, headHash) {
  const client = {
    async query(sql) {
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: headHash }], rowCount: 1 };
      if (sql.includes("FROM eper_audit_events")) return { rows, rowCount: rows.length };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { async connect() { return client; } };
}

test("audit chain verifier detects a broken predecessor link", async () => {
  const first = verifierEvent({ id: "event-1" });
  const second = verifierEvent({ id: "event-2", previous: "e".repeat(64) });
  const result = await verifyAuditChain(verifierPool([first, second], second.event_hash));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("orphan_or_unreachable_events"));
});

test("audit chain verifier detects a modified payload", async () => {
  const row = verifierEvent({ id: "event-payload", payload: { amountMinor: 100 } });
  row.payload = { amountMinor: 999 };
  const result = await verifyAuditChain(verifierPool([row], row.event_hash));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("event_hash_mismatch:event-payload"));
});

test("audit chain verifier detects a fork from the same predecessor", async () => {
  const first = verifierEvent({ id: "event-fork-a" });
  const second = verifierEvent({ id: "event-fork-b" });
  const result = await verifyAuditChain(verifierPool([first, second], first.event_hash));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("chain_fork_after:GENESIS"));
  assert.ok(result.errors.includes("orphan_or_unreachable_events"));
});

