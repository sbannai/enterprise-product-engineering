import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWorkflowRoleDelegationStore } from "../dist/packages/workflows/postgres-workflow-role-delegation-store.js";

const input = {
  tenantId: "tenant-01", applicationId: "app-01",
  grantorActorId: "admin-01", grantorRoleId: "customer-admin",
  targetActorId: "user-02", targetRoleId: "workflow-reader",
  expectedVersion: 0, environment: "sandbox", correlationId: "corr-delegate-01",
};

function fixture({ tenantStatus = "active", grantorPermissions = ["access:manage", "workflow:view"],
  targetPermissions = ["workflow:view"], targetActorStatus = "active", priorVersion = null } = {}) {
  const calls = [];
  const now = "2026-11-02T05:00:00.000Z";
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("eper_tenant_application_assignment")) return { rows: [{ assignment_status: tenantStatus }] };
      if (sql.includes("FROM eper_workflow_actor_role_assignment ra")) return { rows: [{ permissions: grantorPermissions }] };
      if (sql.includes("FROM eper_workflow_role_definition")) return { rows: [{ permissions: targetPermissions }] };
      if (sql.includes("eper_actor_application_assignment")) return { rows: [{ assignment_status: targetActorStatus }] };
      if (sql.includes("SELECT version FROM eper_workflow_actor_role_assignment")) {
        return { rows: priorVersion === null ? [] : [{ version: priorVersion }] };
      }
      if (sql.includes("INSERT INTO eper_workflow_actor_role_assignment")) {
        return { rows: [{
          tenant_id: input.tenantId, application_id: input.applicationId,
          actor_id: input.targetActorId, role_id: input.targetRoleId,
          grantor_actor_id: input.grantorActorId, assignment_status: "active",
          version: priorVersion === null ? 1 : priorVersion + 1,
          assigned_at: now, assigned_by: input.grantorActorId,
        }] };
      }
      if (sql.includes("SELECT last_event_hash FROM eper_audit_chain_head")) return { rows: [{ last_event_hash: null }] };
      if (sql.includes("INSERT INTO eper_audit_events")) return { rows: [], rowCount: 1 };
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("delegates a lower-privilege role within one tenant/application and audits atomically", async () => {
  const { calls, pool } = fixture();
  const result = await new PostgresWorkflowRoleDelegationStore(pool).grant(input);
  assert.equal(result.actorId, input.targetActorId);
  assert.equal(result.grantorActorId, input.grantorActorId);
  assert.equal(result.status, "active");
  assert.equal(result.version, 1);
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'") && call.sql.includes(", true)")));
  assert.ok(calls.some(call => call.sql.includes("FOR SHARE OF ra, rd")));
  assert.ok(calls.some(call => call.sql.includes("grantor_actor_id")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("rejects self-delegation before database access", async () => {
  const { calls, pool } = fixture();
  await assert.rejects(
    new PostgresWorkflowRoleDelegationStore(pool).grant({ ...input, targetActorId: input.grantorActorId }),
    /WORKFLOW_ROLE_DELEGATION_SELF_GRANT_FORBIDDEN/,
  );
  assert.equal(calls.length, 0);
});

test("requires the grantor to hold access:manage", async () => {
  const { calls, pool } = fixture({ grantorPermissions: ["workflow:view"] });
  await assert.rejects(
    new PostgresWorkflowRoleDelegationStore(pool).grant(input),
    /WORKFLOW_ROLE_DELEGATION_GRANTOR_NOT_AUTHORIZED/,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_actor_role_assignment")), false);
});

test("rejects privilege escalation and elevated permission delegation", async () => {
  const { pool: escalationPool } = fixture({ targetPermissions: ["workflow:view", "workflow:approve"] });
  await assert.rejects(
    new PostgresWorkflowRoleDelegationStore(escalationPool).grant(input),
    /WORKFLOW_ROLE_DELEGATION_PRIVILEGE_ESCALATION_FORBIDDEN/,
  );
  const { pool: elevatedPool } = fixture({ grantorPermissions: ["access:manage", "workflow:admin"] ,
    targetPermissions: ["workflow:admin"] });
  await assert.rejects(
    new PostgresWorkflowRoleDelegationStore(elevatedPool).grant(input),
    /WORKFLOW_ROLE_DELEGATION_PRIVILEGE_ESCALATION_FORBIDDEN/,
  );
});

test("fails closed for inactive tenant/application or target actor and stale versions", async () => {
  const inactiveTenant = fixture({ tenantStatus: "revoked" });
  await assert.rejects(new PostgresWorkflowRoleDelegationStore(inactiveTenant.pool).grant(input),
    /WORKFLOW_ROLE_DELEGATION_TENANT_APPLICATION_NOT_ACTIVE/);
  const inactiveActor = fixture({ targetActorStatus: "revoked" });
  await assert.rejects(new PostgresWorkflowRoleDelegationStore(inactiveActor.pool).grant(input),
    /WORKFLOW_ROLE_DELEGATION_TARGET_ACTOR_NOT_ACTIVE/);
  const stale = fixture({ priorVersion: 2 });
  await assert.rejects(new PostgresWorkflowRoleDelegationStore(stale.pool).grant(input),
    /WORKFLOW_ROLE_DELEGATION_VERSION_CONFLICT:2/);
});


test("revokes an active role with optimistic concurrency and an atomic audit event", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT rd.permissions FROM eper_workflow_actor_role_assignment")) {
        return { rows: [{ permissions: ["access:manage", "workflow:view"] }] };
      }
      if (sql.includes("SELECT version FROM eper_workflow_actor_role_assignment")) return { rows: [{ version: 3 }] };
      if (sql.includes("UPDATE eper_workflow_actor_role_assignment")) return { rows: [{ version: 4 }] };
      if (sql.includes("INSERT INTO eper_audit_events")) return { rows: [{ last_event_hash: null }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  const store = new PostgresWorkflowRoleDelegationStore({ async connect() { return client; } });
  const result = await store.revoke({ ...input, expectedVersion: 3 });
  assert.equal(result.status, "revoked");
  assert.equal(result.version, 4);
  assert.equal(result.revokedBy, input.grantorActorId);
  assert.ok(calls.some(call => call.sql.includes("SET assignment_status='revoked'")));
  assert.ok(calls.some(call => call.sql.includes("workflow.role_assignment.revoke")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("revocation rejects stale versions and rolls back", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("SELECT rd.permissions FROM eper_workflow_actor_role_assignment")) return { rows: [{ permissions: ["access:manage"] }] };
      if (sql.includes("SELECT version FROM eper_workflow_actor_role_assignment")) return { rows: [{ version: 9 }] };
      return { rows: [] };
    },
    release() {},
  };
  const store = new PostgresWorkflowRoleDelegationStore({ async connect() { return client; } });
  await assert.rejects(store.revoke({ ...input, expectedVersion: 3 }), /VERSION_CONFLICT:9/);
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(calls.some(sql => sql.includes("SET assignment_status='revoked'")), false);
});


test("cannot revoke the final active Customer Admin assignment", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("SELECT rd.permissions FROM eper_workflow_actor_role_assignment")) {
        return { rows: [{ permissions: ["access:manage", "workflow:view"] }] };
      }
      if (sql.includes("SELECT version FROM eper_workflow_actor_role_assignment")) return { rows: [{ version: 3 }] };
      if (sql.includes("SELECT permissions FROM eper_workflow_role_definition")) return { rows: [{ permissions: ["access:manage"] }] };
      if (sql.includes("COUNT(DISTINCT ra.actor_id)")) return { rows: [{ admin_count: 1 }] };
      return { rows: [] };
    },
    release() {},
  };
  const store = new PostgresWorkflowRoleDelegationStore({ async connect() { return client; } });
  await assert.rejects(store.revoke({ ...input, targetRoleId: "customer-admin", expectedVersion: 3 }),
    /LAST_CUSTOMER_ADMIN_PROTECTED/);
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(calls.some(sql => sql.includes("SET assignment_status='revoked'")), false);
});
