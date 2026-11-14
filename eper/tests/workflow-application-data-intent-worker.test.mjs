import test from "node:test";
import assert from "node:assert/strict";
import { ApplicationDataActivityIntentWorker, applicationDataIntentFingerprint } from "../dist/packages/workflows/application-data-activity-intent-worker.js";

test("intent worker executes the registered binding with trusted context and commits completion", async () => {
  const statements = [];
  const row = {
    intent_id: "8d8d3f6a-6a8c-4e4d-aea2-9fdd5f1c2c11",
    tenant_id: "tenant-a", application_id: "app-a",
    instance_id: "4c0a4c31-5b83-4eab-9f11-0e4a3e8e0b1a",
    activity_execution_id: "b93c16cc-1a8e-4b75-8a5a-2b6d3f5e7c11",
    actor_id: "actor-a", correlation_id: "corr-a", requirement_id: "req-a",
    idempotency_key: "workflow-intent-key-0001",
    entity_type: "Order", operation: "create",
    binding: { entityType: "Order", operation: "create", recordIdField: "id", dataField: "data" },
    input: { id: "order-1", data: { total: 125 } },
    claim_generation: 1, attempts: 1,
  };
  row.request_fingerprint = applicationDataIntentFingerprint({
    tenantId: row.tenant_id, applicationId: row.application_id, instanceId: row.instance_id,
    activityExecutionId: row.activity_execution_id, actorId: row.actor_id,
    correlationId: row.correlation_id, requirementId: row.requirement_id,
    idempotencyKey: row.idempotency_key, entityType: row.entity_type,
    operation: row.operation, binding: row.binding, input: row.input,
  });
  const client = {
    async query(sql, values = []) {
      statements.push({ sql, values });
      if (sql.includes("WITH candidate AS")) return { rows: [row], rowCount: 1 };
      if (sql.includes("UPDATE eper_workflow_application_data_intents")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  let execution;
  const activity = { async execute(context, binding, input) {
    execution = { context, binding, input };
    return { result: { id: "order-1", version: 1 } };
  } };
  const worker = new ApplicationDataActivityIntentWorker(pool, activity, { workerId: "test-worker-01" });
  const result = await worker.runOnce("tenant-a", "app-a");
  assert.equal(result.status, "succeeded");
  assert.equal(execution.context.idempotencyKey, row.idempotency_key);
  assert.equal(execution.context.actorId, "actor-a");
  assert.equal(execution.binding.entityType, "Order");
  assert.equal(execution.input.id, "order-1");
  assert.ok(statements.some(item => item.sql.includes("FOR UPDATE SKIP LOCKED")));
  assert.ok(statements.some(item => item.sql.includes("claim_generation = $8")));
});

test("intent worker returns idle when no pending or expired lease is available", async () => {
  const client = {
    async query(sql) {
      if (sql.includes("WITH candidate AS")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const worker = new ApplicationDataActivityIntentWorker({ async connect() { return client; } },
    { async execute() { throw new Error("must not execute"); } }, { workerId: "test-worker-02" });
  assert.deepEqual(await worker.runOnce("tenant-a", "app-a"), { status: "idle" });
});

test("intent worker rejects tampered persisted input before invoking application data", async () => {
  const row = {
    intent_id: "8d8d3f6a-6a8c-4e4d-aea2-9fdd5f1c2c12",
    tenant_id: "tenant-a", application_id: "app-a",
    instance_id: "4c0a4c31-5b83-4eab-9f11-0e4a3e8e0b1a",
    activity_execution_id: "b93c16cc-1a8e-4b75-8a5a-2b6d3f5e7c12",
    actor_id: "actor-a", correlation_id: "corr-a", requirement_id: "req-a",
    idempotency_key: "workflow-intent-key-0002", entity_type: "Order", operation: "create",
    binding: { entityType: "Order", operation: "create", recordIdField: "id", dataField: "data" },
    input: { id: "order-tampered", data: { total: 125 } },
    claim_generation: 1, attempts: 1, request_fingerprint: "0".repeat(64),
  };
  let invoked = false;
  const client = {
    async query(sql) {
      if (sql.includes("WITH candidate AS")) return { rows: [row], rowCount: 1 };
      if (sql.includes("UPDATE eper_workflow_application_data_intents")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }, release() {},
  };
  const worker = new ApplicationDataActivityIntentWorker({ async connect() { return client; } }, {
    async execute() { invoked = true; throw new Error("must not execute"); },
  }, { workerId: "test-worker-03", maxAttempts: 1 });
  const result = await worker.runOnce("tenant-a", "app-a");
  assert.equal(result.status, "dead_letter");
  assert.equal(invoked, false);
  assert.match(result.errorCode, /FINGERPRINT_MISMATCH/);
});

test("intent worker does not report dead-letter when its failure lease has been fenced out", async () => {
  const row = {
    intent_id: "8d8d3f6a-6a8c-4e4d-aea2-9fdd5f1c2c13",
    tenant_id: "tenant-a", application_id: "app-a",
    instance_id: "4c0a4c31-5b83-4eab-9f11-0e4a3e8e0b1a",
    activity_execution_id: "b93c16cc-1a8e-4b75-8a5a-2b6d3f5e7c13",
    actor_id: "actor-a", correlation_id: "corr-a", requirement_id: "req-a",
    idempotency_key: "workflow-intent-key-0003", entity_type: "Order", operation: "create",
    binding: { entityType: "Order", operation: "create", recordIdField: "id", dataField: "data" },
    input: { id: "order-tampered", data: { total: 125 } },
    claim_generation: 1, attempts: 1, request_fingerprint: "0".repeat(64),
  };
  const client = {
    async query(sql) {
      if (sql.includes("WITH candidate AS")) return { rows: [row], rowCount: 1 };
      if (sql.includes("UPDATE eper_workflow_application_data_intents")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }, release() {},
  };
  const worker = new ApplicationDataActivityIntentWorker({ async connect() { return client; } }, {
    async execute() { throw new Error("must not execute"); },
  }, { workerId: "test-worker-04", maxAttempts: 1 });
  const result = await worker.runOnce("tenant-a", "app-a");
  assert.deepEqual(result, {
    status: "retrying", intentId: row.intent_id,
    errorCode: "WORKFLOW_APPLICATION_DATA_INTENT_LEASE_LOST",
  });
});

test("intent fingerprint is stable across JSON key ordering but binds tenant and activity scope", () => {
  const base = {
    tenantId: "tenant-a", applicationId: "app-a", instanceId: "instance-a",
    activityExecutionId: "execution-a", actorId: "actor-a", correlationId: "corr-a",
    requirementId: "req-a", idempotencyKey: "workflow-intent-key-0004",
    entityType: "Order", operation: "create",
    binding: { entityType: "Order", operation: "create", recordIdField: "id", dataField: "data" },
    input: { id: "order-1", data: { total: 125, currency: "INR" } },
  };
  const reordered = {
    ...base,
    input: { data: { currency: "INR", total: 125 }, id: "order-1" },
    binding: { dataField: "data", recordIdField: "id", operation: "create", entityType: "Order" },
  };
  assert.equal(applicationDataIntentFingerprint(base), applicationDataIntentFingerprint(reordered));
  assert.notEqual(applicationDataIntentFingerprint(base), applicationDataIntentFingerprint({
    ...base, tenantId: "tenant-b",
  }));
  assert.notEqual(applicationDataIntentFingerprint(base), applicationDataIntentFingerprint({
    ...base, activityExecutionId: "execution-b",
  }));
});
