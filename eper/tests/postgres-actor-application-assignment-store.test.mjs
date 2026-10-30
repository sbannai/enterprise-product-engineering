import test from "node:test";
import assert from "node:assert/strict";
import { PostgresActorApplicationAssignmentStore } from "../dist/packages/identity/postgres-actor-application-assignment-store.js";

function fakePool({ prior = [], failAudit = false } = {}) {
  const calls = [];
  const now = "2026-10-30T00:00:00.000Z";
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/SELECT \* FROM eper_actor_application_assignment/.test(sql)) return { rows: prior, rowCount: prior.length };
      if (/INSERT INTO eper_actor_application_assignment/.test(sql)) return { rows: [{
        tenant_id: values[0], actor_id: values[1], application_id: values[2], assignment_status: values[3],
        version: prior.length ? Number(prior[0].version) + 1 : 1, assigned_at: now, assigned_by: values[4],
        revoked_at: values[3] === "revoked" ? now : null, revoked_by: values[3] === "revoked" ? values[4] : null,
        updated_at: now, updated_by: values[4],
      }], rowCount: 1 };
      if (/SELECT last_event_hash FROM eper_audit_chain_head/.test(sql)) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      if (failAudit && /INSERT INTO eper_audit_events/.test(sql)) throw new Error("audit write failed");
      if (/SELECT EXISTS/.test(sql)) return { rows: [{ allowed: true }], rowCount: 1 };
      if (/SELECT application_id FROM eper_actor_application_assignment/.test(sql)) return { rows: [{ application_id: "app-a" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { calls, client, pool: { async connect() { return client; } } };
}
const input = { tenantId: "tenant-a", actorId: "actor-a", applicationId: "app-a", changedBy: "admin-a", expectedVersion: 0, environment: "uat", correlationId: "assignment-test-001" };

test("actor application grant persists membership and audit in one transaction", async () => {
  const { calls, client, pool } = fakePool();
  const store = new PostgresActorApplicationAssignmentStore(pool);
  const saved = await store.assign(input);
  assert.equal(saved.status, "active");
  assert.equal(saved.version, 1);
  assert.ok(calls.some(call => /INSERT INTO eper_actor_application_assignment/.test(call.sql)));
  assert.ok(calls.some(call => /INSERT INTO eper_audit_events/.test(call.sql)));
  assert.ok(calls.some(call => call.sql === "COMMIT"));
  assert.equal(calls[0].sql, "BEGIN");
  assert.ok(client);
});

test("actor application revoke records revoked membership and audit", async () => {
  const { calls, pool } = fakePool({ prior: [{ version: 1 }] });
  const store = new PostgresActorApplicationAssignmentStore(pool);
  const saved = await store.revoke({ ...input, expectedVersion: 1 });
  assert.equal(saved.status, "revoked");
  assert.equal(saved.revokedBy, "admin-a");
  assert.ok(calls.some(call => /identity.application_assignment.revoke/.test(JSON.stringify(call.values))));
});

test("actor application assignment rejects stale versions before mutation", async () => {
  const { calls, pool } = fakePool({ prior: [{ version: 2 }] });
  const store = new PostgresActorApplicationAssignmentStore(pool);
  await assert.rejects(() => store.assign(input), { message: "ACTOR_APPLICATION_ASSIGNMENT_VERSION_CONFLICT" });
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => /INSERT INTO eper_actor_application_assignment/.test(call.sql)));
});

test("actor application assignment rolls back when its audit write fails", async () => {
  const { calls, pool } = fakePool({ failAudit: true });
  const store = new PostgresActorApplicationAssignmentStore(pool);
  await assert.rejects(() => store.assign(input), /audit write failed/);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => call.sql === "COMMIT"));
});

test("actor application assignment can be re-granted after revocation with a higher version", async () => {
  const { calls, pool } = fakePool({ prior: [{ version: 2 }] });
  const store = new PostgresActorApplicationAssignmentStore(pool);
  const saved = await store.assign({ ...input, expectedVersion: 2 });
  assert.equal(saved.status, "active");
  assert.equal(saved.version, 3);
  assert.ok(calls.some(call => /ON CONFLICT \(tenant_id, actor_id, application_id\) DO UPDATE/.test(call.sql)));
  assert.ok(calls.some(call => /identity.application_assignment.grant/.test(JSON.stringify(call.values))));
});

test("actor application revoke rejects a missing assignment", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresActorApplicationAssignmentStore(pool);
  await assert.rejects(() => store.revoke(input), { message: "ACTOR_APPLICATION_ASSIGNMENT_NOT_FOUND" });
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.ok(!calls.some(call => /INSERT INTO eper_actor_application_assignment/.test(call.sql)));
});

test("actor application assignment history includes revoked records and versions", async () => {
  const row = {
    tenant_id: "tenant-a", actor_id: "actor-a", application_id: "app-a", assignment_status: "revoked",
    version: 2, assigned_at: "2026-10-29T00:00:00.000Z", assigned_by: "admin-a",
    revoked_at: "2026-10-30T00:00:00.000Z", revoked_by: "admin-a",
    updated_at: "2026-10-30T00:00:00.000Z", updated_by: "admin-a",
  };
  const { pool, calls } = fakePool({ prior: [row] });
  const store = new PostgresActorApplicationAssignmentStore(pool);
  const history = await store.listAssignments("tenant-a", "actor-a");
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "revoked");
  assert.equal(history[0].version, 2);
  assert.deepEqual(calls[0].values, ["tenant-a", "actor-a"]);
});

test("actor application read operations use explicit tenant and actor scope", async () => {
  const { calls, pool } = fakePool();
  const store = new PostgresActorApplicationAssignmentStore(pool);
  assert.deepEqual(await store.listActive("tenant-a", "actor-a"), ["app-a"]);
  assert.equal(await store.isAssigned("tenant-a", "actor-a", "app-a"), true);
  assert.deepEqual(calls[0].values, ["tenant-a", "actor-a"]);
  assert.deepEqual(calls[1].values, ["tenant-a", "actor-a", "app-a"]);
});