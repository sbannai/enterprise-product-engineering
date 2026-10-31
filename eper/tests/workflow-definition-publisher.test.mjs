import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowDefinitionPublisher } from "../dist/packages/workflows/workflow-definition-publisher.js";

const definition = {
  id: "expense-approval",
  name: "Expense approval",
  status: "ACTIVE",
  activities: [{
    id: "review",
    title: "Review expense",
    type: "APPROVAL",
    roleId: "finance-approver",
    permission: "workflow:approve",
    nextActivityIds: [],
    fields: [],
  }],
};

function fixture({ tenantStatus = "active", actorStatus = "active", roleStatus = "active", rolePermissions = ["workflow:approve"], failTenantLookup = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("eper_tenant_application_assignment")) {
        if (failTenantLookup) throw new Error("database unavailable");
        return { rows: tenantStatus ? [{ assignment_status: tenantStatus }] : [], rowCount: 1 };
      }
      if (sql.includes("eper_actor_application_assignment")) {
        return { rows: actorStatus ? [{ assignment_status: actorStatus }] : [], rowCount: 1 };
      }
      if (sql.includes("eper_workflow_role_definition")) {
        return { rows: roleStatus ? [{ role_status: roleStatus, permissions: rolePermissions }] : [], rowCount: roleStatus ? 1 : 0 };
      }
      if (sql.includes("ORDER BY definition_version DESC")) return { rows: [{ definition_version: 3 }], rowCount: 1 };
      if (sql.includes("INSERT INTO eper_workflow_definition_versions")) {
        return { rows: [{
          definition_version: 4,
          definition_digest: values[5],
          definition,
          published_by: "actor-01",
          published_at: "2026-10-31T11:50:00.000Z",
        }], rowCount: 1 };
      }
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

const context = {
  tenantId: "tenant-01",
  applicationId: "app-01",
  principalId: "actor-01",
  correlationId: "corr-01",
  environment: "sandbox",
};

test("publisher checks both assignments under lock and commits immutable version with audit", async () => {
  const { calls, pool } = fixture();
  const result = await new WorkflowDefinitionPublisher(pool).publish(context, definition);
  assert.equal(result.definitionVersion, 4);
  assert.equal(result.workflowId, "expense-approval");
  assert.match(result.definitionDigest, /^[a-f0-9]{64}$/);
  assert.ok(calls.some(call => call.sql.includes("FOR SHARE") && call.sql.includes("eper_tenant_application_assignment")));
  assert.ok(calls.some(call => call.sql.includes("FOR SHARE") && call.sql.includes("eper_actor_application_assignment")));
  assert.ok(calls.some(call => call.sql.includes("pg_advisory_xact_lock(hashtextextended")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_definition_versions")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_publication_events")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("publisher rejects a tenant/application mismatch and rolls back", async () => {
  const { calls, pool } = fixture({ tenantStatus: "revoked" });
  await assert.rejects(
    new WorkflowDefinitionPublisher(pool).publish(context, definition),
    error => error.code === "WORKFLOW_PUBLISH_TENANT_APPLICATION_NOT_ASSIGNED" && error.statusCode === 403,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_definition_versions")), false);
});

test("publisher rejects an unassigned actor and rolls back", async () => {
  const { calls, pool } = fixture({ actorStatus: null });
  await assert.rejects(
    new WorkflowDefinitionPublisher(pool).publish(context, definition),
    error => error.code === "WORKFLOW_PUBLISH_ACTOR_APPLICATION_NOT_ASSIGNED" && error.statusCode === 403,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
});

test("assignment lookup failures fail closed", async () => {
  const { calls, pool } = fixture({ failTenantLookup: true });
  await assert.rejects(new WorkflowDefinitionPublisher(pool).publish(context, definition), /database unavailable/);
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_definition_versions")), false);
});

test("publisher rejects draft definitions and malformed activity graphs before database access", async () => {
  const { calls, pool } = fixture();
  await assert.rejects(
    new WorkflowDefinitionPublisher(pool).publish(context, { ...definition, status: "DRAFT" }),
    error => error.code === "WORKFLOW_PUBLISH_ACTIVE_DEFINITION_REQUIRED",
  );
  await assert.rejects(
    new WorkflowDefinitionPublisher(pool).publish(context, {
      ...definition,
      activities: [{ ...definition.activities[0], nextActivityIds: ["missing"] }],
    }),
    error => error.code === "WORKFLOW_PUBLISH_UNKNOWN_NEXT_ACTIVITY",
  );
  assert.equal(calls.length, 0);
});


test("publisher rejects missing, disabled or insufficient application role grants", async () => {
  for (const options of [
    { roleStatus: null },
    { roleStatus: "disabled", rolePermissions: ["workflow:approve"] },
    { roleStatus: "active", rolePermissions: ["workflow:view"] },
  ]) {
    const { calls, pool } = fixture(options);
    await assert.rejects(
      new WorkflowDefinitionPublisher(pool).publish(context, definition),
      error => error.code === "WORKFLOW_PUBLISH_ROLE_PERMISSION_NOT_GRANTED" && error.statusCode === 403,
    );
    assert.ok(calls.some(call => call.sql === "ROLLBACK"));
    assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_definition_versions")), false);
  }
});


test("publisher rejects activity types whose permissions do not match their action", async () => {
  const { calls, pool } = fixture();
  await assert.rejects(
    new WorkflowDefinitionPublisher(pool).publish(context, {
      ...definition,
      activities: [{ ...definition.activities[0], type: "TASK", permission: "workflow:approve" }],
    }),
    error => error.code === "WORKFLOW_PUBLISH_INVALID_ACTIVITY",
  );
  assert.equal(calls.length, 0);
});


test("publisher rejects malformed form fields before persistence", async () => {
  const { calls, pool } = fixture();
  await assert.rejects(
    new WorkflowDefinitionPublisher(pool).publish(context, {
      ...definition,
      activities: [{
        ...definition.activities[0],
        fields: [{ id: "bad-field", type: "unsupported", required: true }],
      }],
    }),
    error => error.code === "WORKFLOW_PUBLISH_INVALID_FIELD",
  );
  assert.equal(calls.length, 0);
});
