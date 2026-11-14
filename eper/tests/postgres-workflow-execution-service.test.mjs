import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PostgresWorkflowExecutionService } from "../dist/packages/workflows/postgres-workflow-execution-service.js";

const definition = {
  id: "expense-approval",
  name: "Expense approval",
  status: "ACTIVE",
  activities: [{
    id: "submit-expense", title: "Submit expense", type: "FORM",
    roleId: "employee", permission: "workflow:act",
    nextActivityIds: ["approve-expense"], fields: [],
  }, {
    id: "approve-expense", title: "Approve expense", type: "APPROVAL",
    roleId: "finance-approver", permission: "workflow:approve",
    nextActivityIds: [], fields: [],
  }],
};
const context = {
  tenantId: "tenant-01", applicationId: "app-01", actorId: "actor-01",
  correlationId: "corr-01", environment: "sandbox",
};
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
const digest = createHash("sha256").update(canonical(definition)).digest("hex");
const now = "2026-10-31T12:05:00.000Z";

function fixture({ tenantStatus = "active", actorStatus = "active", roleAllowed = true, outstandingIntent = false, outstandingIntentStatus = "pending" } = {}) {
  const calls = [];
  const row = {
    tenant_id: context.tenantId, application_id: context.applicationId,
    instance_id: "11111111-1111-4111-8111-111111111111", workflow_id: definition.id,
    definition_version: 1, definition_digest: digest, status: "running",
    current_activity_id: "submit-expense", business_reference: "EXP-1001", data: {},
    version: 1, created_by: context.actorId, created_at: now, updated_at: now, completed_at: null,
  };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("FROM eper_workflow_application_data_intents")) {
        return { rows: outstandingIntent ? [{ intent_id: "22222222-2222-4222-8222-222222222222", intent_status: outstandingIntentStatus }] : [], rowCount: outstandingIntent ? 1 : 0 };
      }
      if (sql.includes("FROM eper_workflow_instances") && sql.includes("start_idempotency_key")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT * FROM eper_workflow_instances")) return { rows: [row], rowCount: 1 };
      if (sql.includes("FROM eper_workflow_definition_versions")) return { rows: [{ definition }], rowCount: 1 };
      if (sql.includes("FROM eper_workflow_actor_role_assignment r")) {
        return { rows: roleAllowed ? [{ role_id: "employee" }] : [], rowCount: roleAllowed ? 1 : 0 };
      }
      if (sql.includes("FROM eper_tenant_application_assignment")) {
        return { rows: [{ assignment_status: tenantStatus }], rowCount: 1 };
      }
      if (sql.includes("FROM eper_actor_application_assignment")) {
        return { rows: [{ assignment_status: actorStatus }], rowCount: 1 };
      }
      if (sql.includes("FROM eper_workflow_publication_events")) {
        return { rows: [{
          event_type: "published", definition_version: 1,
          definition_digest: digest, definition,
        }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO eper_workflow_instances")) return { rows: [row], rowCount: 1 };
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("workflow start persists pinned definition, first activity, idempotency and audit atomically", async () => {
  const { calls, pool } = fixture();
  const result = await new PostgresWorkflowExecutionService(pool).start({
    ...context, workflowId: definition.id, idempotencyKey: "start-key-00000001",
    businessReference: "EXP-1001", data: {},
  });
  assert.equal(result.status, "running");
  assert.equal(result.currentActivityId, "submit-expense");
  assert.equal(result.definitionVersion, 1);
  assert.ok(calls.some(call => call.sql.includes("pg_advisory_xact_lock")));
  assert.ok(calls.some(call => call.sql.includes("FROM eper_workflow_publication_events")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_instances")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_transitions")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_idempotency")));
  assert.ok(calls.some(call => call.sql.includes("INSERT INTO eper_audit_events")));
  assert.equal(calls.at(-2).sql, "COMMIT");
});

test("workflow start fails closed for revoked actor application membership", async () => {
  const { calls, pool } = fixture({ actorStatus: "revoked" });
  await assert.rejects(
    new PostgresWorkflowExecutionService(pool).start({
      ...context, workflowId: definition.id, idempotencyKey: "start-key-00000002",
    }),
    /WORKFLOW_EXECUTION_ACTOR_APPLICATION_NOT_ACTIVE/,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_instances")), false);
});

test("workflow start fails closed when the first activity role permission is not assigned", async () => {
  const { calls, pool } = fixture({ roleAllowed: false });
  await assert.rejects(
    new PostgresWorkflowExecutionService(pool).start({
      ...context, workflowId: definition.id, idempotencyKey: "start-key-00000003",
    }),
    /WORKFLOW_EXECUTION_PERMISSION_DENIED/,
  );
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO eper_workflow_instances")), false);
});

test("workflow execution rejects malformed idempotency keys before database access", async () => {
  const { calls, pool } = fixture();
  await assert.rejects(
    new PostgresWorkflowExecutionService(pool).start({
      ...context, workflowId: definition.id, idempotencyKey: "short",
    }),
    /WORKFLOW_EXECUTION_IDEMPOTENCY_KEY_INVALID/,
  );
  assert.equal(calls.length, 0);
});


test("workflow transition fails closed while an application-data intent is unreconciled", async () => {
  const { calls, pool } = fixture({ outstandingIntent: true });
  await assert.rejects(
    new PostgresWorkflowExecutionService(pool).transition({
      ...context,
      instanceId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 1,
      idempotencyKey: "transition-key-0001",
      action: "submit",
      payload: {},
    }),
    /WORKFLOW_EXECUTION_APPLICATION_DATA_PENDING/,
  );
  const instanceLockIndex = calls.findIndex(call => call.sql.includes("FROM eper_workflow_instances") && call.sql.includes("FOR UPDATE"));
  const intentLockIndex = calls.findIndex(call => call.sql.includes("FROM eper_workflow_application_data_intents") && call.sql.includes("FOR SHARE"));
  assert.ok(instanceLockIndex >= 0, "workflow instance must be locked before checking intents");
  assert.ok(intentLockIndex > instanceLockIndex, "intent status must be checked under the instance lock");
  assert.ok(calls.some(call => call.sql === "ROLLBACK"));
  assert.equal(calls.some(call => call.sql.includes("UPDATE eper_workflow_instances")), false);
});


for (const status of ["pending", "processing", "succeeded", "failed", "dead_letter"]) {
  test(`workflow transition blocks an application-data intent in ${status} state`, async () => {
    const { calls, pool } = fixture({ outstandingIntent: true, outstandingIntentStatus: status });
    await assert.rejects(
      new PostgresWorkflowExecutionService(pool).transition({
        ...context,
        instanceId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 1,
        idempotencyKey: "transition-key-" + status.padEnd(16, "0"),
        action: "submit",
        payload: {},
      }),
      /WORKFLOW_EXECUTION_APPLICATION_DATA_PENDING/,
    );
    assert.ok(calls.some(call => call.sql === "ROLLBACK"));
    assert.equal(calls.some(call => call.sql.includes("UPDATE eper_workflow_instances")), false);
  });
}
