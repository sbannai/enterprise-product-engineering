import test from "node:test";
import assert from "node:assert/strict";
import {
  withTenantTransaction,
  enqueueOutboxEvent,
  claimPendingOutboxEvents,
  markOutboxDelivered,
} from "../dist/packages/capabilities/postgres-transaction.js";
import {
  PostgresAuthoritativeRecordStore,
  PostgresAuthorizationPolicyStore,
  PostgresAuditEvidenceStore,
  PostgresExceptionStore,
  PostgresGovernedReportingStore,
} from "../dist/packages/capabilities/postgres-stores.js";

function fakePool({ onQuery } = {}) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (onQuery) return onQuery(normalized, params, calls);
      if (/UPDATE transactional_outbox/.test(normalized)) return { rowCount: 1, rows: [] };
      if (/SELECT event_id/.test(normalized)) return { rowCount: 0, rows: [] };
      if (/SELECT 1 FROM authoritative_records/.test(normalized)) return { rowCount: 1, rows: [{}] };
      return { rowCount: null, rows: [] };
    },
    release() { calls.push({ sql: "RELEASE", params: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("tenant transaction establishes tenant context and commits successful unit of work", async () => {
  const { calls, pool } = fakePool();
  const value = await withTenantTransaction(pool, "tenant-a", async tx => {
    assert.equal(tx.tenantId, "tenant-a");
    return "committed";
  });
  assert.equal(value, "committed");
  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[1].sql, /set_config\('eper\.tenant_id'/);
  assert.deepEqual(calls[1].params, ["tenant-a"]);
  assert.equal(calls[2].sql, "COMMIT");
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("failed unit of work rolls back and preserves original error", async () => {
  const { calls, pool } = fakePool();
  await assert.rejects(
    withTenantTransaction(pool, "tenant-a", async () => { throw new Error("INJECTED_WORK_FAILURE"); }),
    /INJECTED_WORK_FAILURE/,
  );
  assert.equal(calls.at(-2).sql, "ROLLBACK");
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("outbox rejects cross-tenant event before issuing SQL", async () => {
  const { calls, pool } = fakePool();
  await withTenantTransaction(pool, "tenant-a", async tx => {
    await assert.rejects(enqueueOutboxEvent(tx, {
      eventId: "evt-1", tenantId: "tenant-b", aggregateType: "record",
      aggregateId: "rec-1", eventType: "RECORD_CREATED", correlationId: "corr-1", payload: {},
    }), /TENANT_CONTEXT_MISMATCH/);
  });
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO transactional_outbox")), false);
});

test("outbox enqueue uses parameterized insert and tenant transaction", async () => {
  const { calls, pool } = fakePool();
  await withTenantTransaction(pool, "tenant-a", async tx => {
    await enqueueOutboxEvent(tx, {
      eventId: "evt-1", tenantId: "tenant-a", aggregateType: "record",
      aggregateId: "rec-1", eventType: "RECORD_CREATED", correlationId: "corr-1",
      payload: { recordId: "rec-1" },
    });
    await claimPendingOutboxEvents(tx, 25);
    await markOutboxDelivered(tx, "evt-1");
  });
  const insert = calls.find(call => call.sql.includes("INSERT INTO transactional_outbox"));
  assert.ok(insert);
  assert.equal(insert.params[0], "evt-1");
  assert.equal(insert.params[1], "tenant-a");
  assert.ok(calls.some(call => call.sql.includes("FOR UPDATE SKIP LOCKED")));
  assert.ok(calls.some(call => call.sql.includes("WHERE tenant_id = $1 AND event_id = $2")));
});

test("outbox claim limit is bounded", async () => {
  const { pool } = fakePool();
  await withTenantTransaction(pool, "tenant-a", async tx => {
    await assert.rejects(claimPendingOutboxEvents(tx, 1001), /OUTBOX_LIMIT_INVALID/);
  });
});

test("PostgreSQL record store scopes all access by tenant and uses compare-and-swap version", async () => {
  const { calls, pool } = fakePool({ onQuery: async (sql, params) => {
    if (sql.includes("INSERT INTO authoritative_records")) return { rowCount: 1, rows: [{ tenant_id: params[0], record_id: params[1], version: params[2], state: params[3], data: JSON.parse(params[4]) }] };
    if (sql.includes("UPDATE authoritative_records")) return { rowCount: 1, rows: [{ tenant_id: params[0], record_id: params[1], version: params[2] + 1, state: params[3] ?? "OPEN", data: params[4] ? JSON.parse(params[4]) : { ok: true } }] };
    return { rowCount: null, rows: [] };
  }});
  const store = new PostgresAuthoritativeRecordStore(pool);
  const created = await store.create({ id: "r1", tenantId: "tenant-a", version: 1, state: "OPEN", data: { ok: true } });
  assert.equal(created.tenantId, "tenant-a");
  const updated = await store.update("tenant-a", "r1", 1, { state: "CLOSED" });
  assert.equal(updated.version, 2);
  assert.ok(calls.some(call => call.sql.includes("WHERE tenant_id=$1 AND record_id=$2 AND version=$3")));
});

test("PostgreSQL policy decision defaults to deny and reads only tenant policies", async () => {
  const { calls, pool } = fakePool({ onQuery: async () => ({ rowCount: 0, rows: [] }) });
  const store = new PostgresAuthorizationPolicyStore(pool);
  const decision = await store.decide({ tenantId: "tenant-a", principalId: "user-1", action: "read", resource: "record" });
  assert.equal(decision.effect, "DENY");
  assert.equal(decision.reason, "NO_ALLOW_POLICY");
  assert.ok(calls.some(call => call.sql.includes("WHERE tenant_id=$1") && call.params[0] === "tenant-a"));
});

test("PostgreSQL audit store writes tenant-scoped append-only evidence with integrity hash", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresAuditEvidenceStore(pool);
  const entry = await store.append({
    id: "a1", tenantId: "tenant-a", requirementId: "REQ-1", action: "RECORD_CREATED",
    principalId: "user-1", correlationId: "corr-1", occurredAt: "2026-10-26T08:00:00.000Z", payload: { id: "r1" },
  });
  assert.equal(entry.integrityHash.length, 64);
  assert.equal(store.verify(entry), true);
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO audit_evidence") && call.params[0] === "tenant-a"));
});


test("exception state, lifecycle audit and outbox share one transaction", async () => {
  const { calls, pool } = fakePool({ onQuery: async (sql, params) => {
    if (sql.includes("SELECT * FROM workflow_exceptions")) return { rowCount: 0, rows: [] };
    if (sql.includes("INSERT INTO workflow_exceptions")) return { rowCount: 1, rows: [{
      tenant_id: params[0], exception_id: params[1], requirement_id: params[2], code: params[3],
      message: params[4], state: "OPEN", retry_count: 0, idempotency_key: params[5],
      request_fingerprint: params[6], owner: params[7], version: 1, created_at: params[8], updated_at: params[8],
    }] };
    return { rowCount: 1, rows: [] };
  }});
  const store = new PostgresExceptionStore(pool);
  const created = await store.create({
    id: "ex-1", tenantId: "tenant-a", requirementId: "REQ-1", code: "E-1",
    message: "needs review", idempotencyKey: "idem-1", createdAt: "2026-10-26T08:00:00.000Z",
  }, "corr-1", "user-1");
  assert.equal(created.state, "OPEN");
  assert.ok(calls.findIndex(call => call.sql.includes("INSERT INTO workflow_exceptions")) <
    calls.findIndex(call => call.sql.includes("INSERT INTO audit_evidence")));
  assert.ok(calls.findIndex(call => call.sql.includes("INSERT INTO audit_evidence")) <
    calls.findIndex(call => call.sql.includes("INSERT INTO transactional_outbox")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("outbox failure rolls back exception and audit writes", async () => {
  const { calls, pool } = fakePool({ onQuery: async (sql, params) => {
    if (sql.includes("INSERT INTO transactional_outbox")) throw new Error("INJECTED_OUTBOX_FAILURE");
    if (sql.includes("SELECT * FROM workflow_exceptions")) return { rowCount: 0, rows: [] };
    if (sql.includes("INSERT INTO workflow_exceptions")) return { rowCount: 1, rows: [{
      tenant_id: params[0], exception_id: params[1], requirement_id: params[2], code: params[3],
      message: params[4], state: "OPEN", retry_count: 0, idempotency_key: params[5],
      request_fingerprint: params[6], owner: params[7], version: 1, created_at: params[8], updated_at: params[8],
    }] };
    return { rowCount: 1, rows: [] };
  }});
  const store = new PostgresExceptionStore(pool);
  await assert.rejects(store.create({
    id: "ex-2", tenantId: "tenant-a", requirementId: "REQ-1", code: "E-2",
    message: "failure injection", idempotencyKey: "idem-2", createdAt: "2026-10-26T08:00:00.000Z",
  }, "corr-2", "user-1"), /INJECTED_OUTBOX_FAILURE/);
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO workflow_exceptions")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO audit_evidence")));
  assert.equal(calls.at(-2).sql, "ROLLBACK");
});


test("governed report publication writes snapshot, audit and outbox before commit", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresGovernedReportingStore(pool);
  await store.publish({
    tenantId: "tenant-a", reportId: "rpt-1", values: { count: 4 },
    sourceRequirementIds: ["REQ-1"], generatedAt: "2026-10-26T08:00:00.000Z",
  }, "pub-1", "user-1", "corr-1");
  const snapshot = calls.findIndex(call => call.sql.includes("INSERT INTO governed_reports"));
  const audit = calls.findIndex(call => call.sql.includes("INSERT INTO audit_evidence"));
  const outbox = calls.findIndex(call => call.sql.includes("INSERT INTO transactional_outbox"));
  assert.ok(snapshot >= 0 && snapshot < audit && audit < outbox);
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("governed report publication rejects missing provenance before opening a transaction", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresGovernedReportingStore(pool);
  await assert.rejects(store.publish({
    tenantId: "tenant-a", reportId: "rpt-1", values: {},
    sourceRequirementIds: [], generatedAt: "2026-10-26T08:00:00.000Z",
  }, "pub-1", "user-1", "corr-1"), /REPORT_PROVENANCE_REQUIRED/);
  assert.equal(calls.length, 0);
});


test("governed record creation commits record, audit, and outbox together", async () => {
  const { calls, pool } = fakePool({ onQuery: async (sql, params) => {
    if (sql.includes("INSERT INTO authoritative_records")) return { rowCount: 1, rows: [{ tenant_id: params[0], record_id: params[1], version: params[2], state: params[3], data: JSON.parse(params[4]) }] };
    return { rowCount: 1, rows: [] };
  }});
  const store = new PostgresAuthoritativeRecordStore(pool);
  await store.createGoverned({ id: "r2", tenantId: "tenant-a", version: 1, state: "OPEN", data: {} }, {
    principalId: "user-1", correlationId: "corr-2", requirementId: "REQ-2",
  });
  const record = calls.findIndex(call => call.sql.includes("INSERT INTO authoritative_records"));
  const audit = calls.findIndex(call => call.sql.includes("INSERT INTO audit_evidence"));
  const outbox = calls.findIndex(call => call.sql.includes("INSERT INTO transactional_outbox"));
  assert.ok(record >= 0 && record < audit && audit < outbox);
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("governed policy write commits policy, audit, and outbox together", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresAuthorizationPolicyStore(pool);
  await store.addPolicyGoverned({
    tenantId: "tenant-a", principalId: "user-1", actions: ["read"], resources: ["record"], effect: "ALLOW",
  }, { principalId: "admin-1", correlationId: "corr-3", requirementId: "REQ-3" });
  const policy = calls.findIndex(call => call.sql.includes("INSERT INTO authorization_policies"));
  const audit = calls.findIndex(call => call.sql.includes("INSERT INTO audit_evidence"));
  const outbox = calls.findIndex(call => call.sql.includes("INSERT INTO transactional_outbox"));
  assert.ok(policy >= 0 && policy < audit && audit < outbox);
  assert.equal(calls.at(-2).sql, "COMMIT");
});
