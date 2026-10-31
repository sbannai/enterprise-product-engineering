import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWorkflowActorRoleAssignmentStore } from "../dist/packages/workflows/postgres-workflow-actor-role-assignment-store.js";

const input = {
  tenantId: "tenant-01",
  applicationId: "app-01",
  actorId: "actor-01",
  roleId: "finance-approver",
  changedBy: "admin-01",
  expectedVersion: 0,
  environment: "sandbox",
  correlationId: "corr-01",
};

function fixture({ tenantStatus = "active", actorStatus = "active", roleStatus = "active", permissionAllowed = true, priorVersion = null } = {}) {
  const calls = [];
  const now = "2026-10-31T11:55:00.000Z";
  const row = {
    tenant_id: input.tenantId, application_id: input.applicationId, actor_id: input.actorId,
    role_id: input.roleId, assignment_status: "active", version: priorVersion ? priorVersion + 1 : 1,
    assigned_at: now, assigned_by: input.changedBy, revoked_at: null, revoked_by: null,
    updated_at: now, updated_by: input.changedBy,
  };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT EXISTS")) return { rows: [{ allowed: permissionAllowed }], rowCount: 1 };
      if (sql.includes("FROM eper_workflow_actor_role_assignment r")) {
        return { rows: [{ role_id: "finance-approver" }, { role_id: "expense-reviewer" }], rowCount: 2 };
      }
      if (sql.includes("eper_tenant_application_assignment")) {
        return { rows: [{ assignment_status: tenantStatus }], rowCount: 1 };
      }
      if (sql.includes("eper_workflow_role_definition")) {
        return { rows: [{ role_status: roleStatus }], rowCount: 1 };
      }
      if (sql.includes("eper_actor_application_assignment")) {
        return { rows: [{ assignment_status: actorStatus }], rowCount: 1 };
      }
      if (sql.includes("SELECT * FROM eper_workflow_actor_role_assignment")) {
        return { rows: priorVersion ? [{ ...row, version: priorVersion }] : [], rowCount: priorVersion ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO eper_workflow_actor_role_assignment")) {
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("role grant checks both application assignments and appends audit atomically", async () => {
  const { calls, pool } = fixture();
  const result = await new PostgresWorkflowActorRoleAssignmentStore(pool).assign(input);
  assert.equal(result.status, "active");
  assert.equal(result.version, 1);
  assert.ok(calls.some(call => call.sql.includes("FOR SHARE") && call.sql.includes("eper_tenant_application_assignment")));
  assert.ok(calls.some(call => call.sql.includes("FOR SHARE") && call.sql.includes("eper_actor_application_assignment")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_actor_role_assignment")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("role grant fails closed when actor is not assigned to the application", async () => {
  const { calls, pool } = fixture({ actorStatus: "revoked" });
  await assert.rejects(
    new PostgresWorkflowActorRoleAssignmentStore(pool).assign(input),
    /WORKFLOW_ROLE_ASSIGNMENT_ACTOR_APPLICATION_NOT_ACTIVE/,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_actor_role_assignment")), false);
});

test("role assignment reads set tenant/application RLS context transaction-locally", async () => {
  const { calls, pool } = fixture();
  const roles = await new PostgresWorkflowActorRoleAssignmentStore(pool)
    .listActiveRoleIds(input.tenantId, input.applicationId, input.actorId);
  assert.deepEqual(roles, ["finance-approver", "expense-reviewer"]);
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'") && call.sql.includes(', true)')));
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.application_id'") && call.sql.includes(', true)')));
  assert.ok(calls.some(call => call.sql.includes("JOIN eper_actor_application_assignment") && call.sql.includes("assignment_status = 'active'")));
  assert.ok(calls.some(call => call.sql.includes("JOIN eper_tenant_application_assignment") && call.sql.includes("assignment_status = 'active'")));
  assert.ok(calls.some(call => call.sql.includes("JOIN eper_workflow_role_definition") && call.sql.includes("role_status = 'active'")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});


test("role grant rejects disabled application roles", async () => {
  const { calls, pool } = fixture({ roleStatus: "disabled" });
  await assert.rejects(
    new PostgresWorkflowActorRoleAssignmentStore(pool).assign(input),
    /WORKFLOW_ROLE_ASSIGNMENT_ROLE_NOT_ACTIVE/,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_actor_role_assignment")), false);
});


test("permission check requires active actor, tenant, role and explicit permission", async () => {
  const { calls, pool } = fixture();
  const allowed = await new PostgresWorkflowActorRoleAssignmentStore(pool)
    .hasPermission(input.tenantId, input.applicationId, input.actorId, input.roleId, "workflow:approve");
  assert.equal(allowed, true);
  const sql = calls.find(call => call.sql.includes("SELECT EXISTS"))?.sql ?? "";
  assert.ok(sql.includes("JOIN eper_actor_application_assignment"));
  assert.ok(sql.includes("JOIN eper_tenant_application_assignment"));
  assert.ok(sql.includes("JOIN eper_workflow_role_definition"));
  assert.ok(sql.includes("rd.permissions ? $5"));
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'") && call.sql.includes(", true)")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("permission check denies absent permission and rejects unknown permission keys", async () => {
  const denied = fixture({ permissionAllowed: false });
  assert.equal(
    await new PostgresWorkflowActorRoleAssignmentStore(denied.pool)
      .hasPermission(input.tenantId, input.applicationId, input.actorId, input.roleId, "workflow:approve"),
    false,
  );
  const invalid = fixture();
  await assert.rejects(
    new PostgresWorkflowActorRoleAssignmentStore(invalid.pool)
      .hasPermission(input.tenantId, input.applicationId, input.actorId, input.roleId, "workflow:root"),
    /WORKFLOW_ROLE_ASSIGNMENT_PERMISSION_INVALID/,
  );
  assert.equal(invalid.calls.length, 0);
});
