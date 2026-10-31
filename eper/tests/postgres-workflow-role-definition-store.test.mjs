import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWorkflowRoleDefinitionStore } from "../dist/packages/workflows/postgres-workflow-role-definition-store.js";

const input = {
  tenantId: "tenant-01", applicationId: "app-01", roleId: "finance-approver",
  name: "Finance approver", description: "Approves expense requests",
  permissions: ["workflow:view", "workflow:approve"], status: "active",
  expectedVersion: 0, changedBy: "admin-01", environment: "sandbox", correlationId: "corr-01",
};

function fixture({ tenantStatus = "active", priorVersion = null } = {}) {
  const calls = [];
  const now = "2026-10-31T11:56:00.000Z";
  const row = {
    tenant_id: input.tenantId, application_id: input.applicationId, role_id: input.roleId,
    name: input.name, description: input.description, permissions: input.permissions,
    role_status: input.status, version: priorVersion ? priorVersion + 1 : 1,
    updated_at: now, updated_by: input.changedBy,
  };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("eper_tenant_application_assignment")) {
        return { rows: [{ assignment_status: tenantStatus }], rowCount: 1 };
      }
      if (sql.includes("SELECT version FROM eper_workflow_role_definition")) {
        return { rows: priorVersion ? [{ version: priorVersion }] : [], rowCount: priorVersion ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO eper_workflow_role_definition")) return { rows: [row], rowCount: 1 };
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("role definition is application-scoped and audited in the same transaction", async () => {
  const { calls, pool } = fixture();
  const result = await new PostgresWorkflowRoleDefinitionStore(pool).replace(input);
  assert.equal(result.roleId, "finance-approver");
  assert.deepEqual(result.permissions, ["workflow:view", "workflow:approve"]);
  assert.equal(result.version, 1);
  assert.ok(calls.some(call => call.sql.includes("set_config('eper.tenant_id'") && call.sql.includes(", true)")));
  assert.ok(calls.some(call => call.sql.includes("pg_advisory_xact_lock")));
  assert.ok(calls.some(call => call.sql.includes("FOR SHARE") && call.sql.includes("eper_tenant_application_assignment")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("role definition fails closed when tenant application is inactive", async () => {
  const { calls, pool } = fixture({ tenantStatus: "revoked" });
  await assert.rejects(
    new PostgresWorkflowRoleDefinitionStore(pool).replace(input),
    /WORKFLOW_ROLE_DEFINITION_TENANT_APPLICATION_NOT_ACTIVE/,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_role_definition")), false);
});

test("role definition rejects unknown or duplicate permissions before database access", async () => {
  const { calls, pool } = fixture();
  await assert.rejects(
    new PostgresWorkflowRoleDefinitionStore(pool).replace({ ...input, permissions: ["workflow:approve", "not-a-permission"] }),
    /WORKFLOW_ROLE_DEFINITION_PERMISSIONS_INVALID/,
  );
  await assert.rejects(
    new PostgresWorkflowRoleDefinitionStore(pool).replace({ ...input, permissions: ["workflow:approve", "workflow:approve"] }),
    /WORKFLOW_ROLE_DEFINITION_PERMISSIONS_INVALID/,
  );
  assert.equal(calls.length, 0);
});
