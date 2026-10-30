import test from "node:test";
import assert from "node:assert/strict";
import { PostgresTenantApplicationAssignmentStore } from "../dist/packages/identity/postgres-tenant-application-assignment-store.js";

test("tenant application assignment reads are explicitly tenant-scoped", async () => {
  const calls = [];
  const rows = [
    { tenant_id: "tenant-a", application_id: "app-a", assignment_status: "active", version: 2,
      assigned_at: "2026-10-29T00:00:00.000Z", assigned_by: "admin-a", revoked_at: null,
      revoked_by: null, updated_at: "2026-10-29T00:00:00.000Z", updated_by: "admin-a" },
    { tenant_id: "tenant-a", application_id: "app-b", assignment_status: "revoked", version: 3,
      assigned_at: "2026-10-28T00:00:00.000Z", assigned_by: "admin-a", revoked_at: "2026-10-29T00:00:00.000Z",
      revoked_by: "admin-a", updated_at: "2026-10-29T00:00:00.000Z", updated_by: "admin-a" },
  ];
  const pool = { async connect() { return {
    async query(sql, values=[]) {
      calls.push({ sql, values });
      if (sql.includes("SELECT application_id FROM eper_tenant_application_assignment")) {
        return { rows: rows.filter(row => row.tenant_id === values[0] && row.assignment_status === "active").map(row => ({ application_id: row.application_id })) };
      }
      if (sql.includes("SELECT * FROM eper_tenant_application_assignment")) {
        return { rows: rows.filter(row => row.tenant_id === values[0]) };
      }
      throw new Error("unexpected SQL: " + sql);
    },
    release() {},
  }; } };
  const store = new PostgresTenantApplicationAssignmentStore(pool);
  assert.deepEqual(await store.listActive("tenant-a"), ["app-a"]);
  const history = await store.listAssignments("tenant-a");
  assert.deepEqual(history.map(row => [row.applicationId, row.status, row.version]), [["app-a", "active", 2], ["app-b", "revoked", 3]]);
  assert.ok(calls.every(call => call.values[0] === "tenant-a"));
  assert.ok(calls.every(call => call.sql.includes("tenant_id = $1")));
});


function fakeWritePool({ prior = [], failAudit = false } = {}) {
  const calls = [];
  const now = "2026-10-30T00:00:00.000Z";
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT version FROM eper_tenant_application_assignment/.test(sql)) return { rows: prior, rowCount: prior.length };
      if (/INSERT INTO eper_tenant_application_assignment/.test(sql)) return { rows: [{
        tenant_id: values[0], application_id: values[1], assignment_status: values[2],
        version: prior.length ? Number(prior[0].version) + 1 : 1, assigned_at: now, assigned_by: values[3],
        revoked_at: values[2] === "revoked" ? now : null, revoked_by: values[2] === "revoked" ? values[3] : null,
        updated_at: now, updated_by: values[3],
      }], rowCount: 1 };
      if (/SELECT last_event_hash FROM eper_audit_chain_head/.test(sql)) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      if (failAudit && /INSERT INTO eper_audit_events/.test(sql)) throw new Error("audit write failed");
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { calls, pool: { async connect() { return client; } } };
}
const changeInput = { tenantId: "tenant-a", applicationId: "app-a", changedBy: "admin-a",
  expectedVersion: 0, environment: "uat", correlationId: "tenant-assignment-test-001" };

test("tenant application grant persists assignment and audit atomically", async () => {
  const { calls, pool } = fakeWritePool();
  const saved = await new PostgresTenantApplicationAssignmentStore(pool).assign(changeInput);
  assert.equal(saved.status, "active");
  assert.equal(saved.version, 1);
  assert.ok(calls.some(call => /INSERT INTO eper_tenant_application_assignment/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO eper_audit_events/.test(call.sql)));
  assert.equal(calls[0].sql, "BEGIN");
  assert.ok(calls.some(call => call.sql === "COMMIT"));
});

test("tenant application revoke records revoked state", async () => {
  const { calls, pool } = fakeWritePool({ prior: [{ version: 1 }] });
  const saved = await new PostgresTenantApplicationAssignmentStore(pool).revoke({ ...changeInput, expectedVersion: 1 });
  assert.equal(saved.status, "revoked");
  assert.equal(saved.revokedBy, "admin-a");
  assert.ok(calls.some(call => /tenant.application_assignment.revoke/.test(JSON.stringify(call.values))));
});

test("tenant application assignment rejects stale versions without mutation", async () => {
  const { calls, pool } = fakeWritePool({ prior: [{ version: 2 }] });
  await assert.rejects(() => new PostgresTenantApplicationAssignmentStore(pool).assign(changeInput),
    { message: "TENANT_APPLICATION_ASSIGNMENT_VERSION_CONFLICT" });
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => /INSERT INTO eper_tenant_application_assignment/.test(call.sql)));
});

test("tenant application assignment rolls back when audit persistence fails", async () => {
  const { calls, pool } = fakeWritePool({ failAudit: true });
  await assert.rejects(() => new PostgresTenantApplicationAssignmentStore(pool).assign(changeInput), /audit write failed/);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => call.sql === "COMMIT"));
});

test("tenant application assignment can be re-granted after revocation with a higher version", async () => {
  const { calls, pool } = fakeWritePool({ prior: [{ version: 2 }] });
  const saved = await new PostgresTenantApplicationAssignmentStore(pool).assign({ ...changeInput, expectedVersion: 2 });
  assert.equal(saved.status, "active");
  assert.equal(saved.version, 3);
  assert.equal(saved.revokedAt, null);
  assert.ok(calls.some(call => /ON CONFLICT \(tenant_id, application_id\) DO UPDATE/.test(call.sql)));
  assert.ok(calls.some(call => /tenant.application_assignment.grant/.test(JSON.stringify(call.values))));
});

test("tenant application revoke rejects a missing assignment", async () => {
  const { calls, pool } = fakeWritePool();
  await assert.rejects(() => new PostgresTenantApplicationAssignmentStore(pool).revoke(changeInput),
    { message: "TENANT_APPLICATION_ASSIGNMENT_NOT_FOUND" });
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => /INSERT INTO eper_tenant_application_assignment/.test(call.sql)));
});
