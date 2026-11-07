import test from "node:test";
import assert from "node:assert/strict";
import {
  readWorkflowOutboxWorkerConfig,
  resolveWorkflowOutboxDispatcherModulePath,
} from "../dist/packages/workflows/workflow-outbox-worker-config.js";

const validEnv = () => ({
  EPER_WORKFLOW_OUTBOX_WORKER_ENABLED: "true",
  EPER_AUDIT_PERSISTENCE: "postgres",
  EPER_WORKFLOW_OUTBOX_DATABASE_URL: "postgresql://eper_workflow_outbox_worker:local-only@127.0.0.1:5432/eper",
  EPER_WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE: "eper_workflow_outbox_worker",
  EPER_WORKFLOW_OUTBOX_WORKER_ID: "worker-local-01",
  EPER_WORKFLOW_OUTBOX_DISPATCHER_MODULE: "./dist/apps/worker/dispatchers/approved-workflow-outbox.js",
});

test("workflow outbox worker requires explicit opt-in", () => {
  const env = validEnv();
  delete env.EPER_WORKFLOW_OUTBOX_WORKER_ENABLED;
  assert.throws(() => readWorkflowOutboxWorkerConfig(env), /EPER_WORKFLOW_OUTBOX_WORKER_DISABLED/);
});

test("workflow outbox worker requires PostgreSQL audit and a dedicated database login", () => {
  const noAudit = validEnv();
  noAudit.EPER_AUDIT_PERSISTENCE = "json-file";
  assert.throws(() => readWorkflowOutboxWorkerConfig(noAudit), /WORKFLOW_OUTBOX_WORKER_REQUIRES_POSTGRES_AUDIT/);

  const sharedRole = validEnv();
  sharedRole.DATABASE_URL = "postgresql://eper_workflow_outbox_worker:api-secret@127.0.0.1:5432/eper";
  assert.throws(() => readWorkflowOutboxWorkerConfig(sharedRole), /WORKFLOW_OUTBOX_DATABASE_ROLE_MUST_BE_SEPARATE/);

  const mismatchedRole = validEnv();
  mismatchedRole.EPER_WORKFLOW_OUTBOX_DATABASE_URL = "postgresql://eper_api:local-only@127.0.0.1:5432/eper";
  assert.throws(() => readWorkflowOutboxWorkerConfig(mismatchedRole), /WORKFLOW_OUTBOX_DATABASE_ROLE_MISMATCH/);
});

test("workflow outbox dispatcher module cannot escape the deployment dispatchers directory", () => {
  assert.throws(
    () => resolveWorkflowOutboxDispatcherModulePath("./dist/apps/worker/dispatchers/../../api/main.js"),
    /WORKFLOW_OUTBOX_DISPATCHER_MODULE_PATH_INVALID/,
  );
  assert.throws(
    () => resolveWorkflowOutboxDispatcherModulePath("./dist/apps/worker/dispatchers/not-javascript.json"),
    /WORKFLOW_OUTBOX_DISPATCHER_MODULE_PATH_INVALID/,
  );
});

test("workflow outbox worker parses bounded runtime controls and safe defaults", () => {
  const config = readWorkflowOutboxWorkerConfig(validEnv());
  assert.equal(config.workerId, "worker-local-01");
  assert.equal(config.expectedDatabaseRole, "eper_workflow_outbox_worker");
  assert.equal(config.batchSize, 20);
  assert.equal(config.idlePollMs, 1000);
  assert.equal(config.maxContexts, 1000);
  assert.equal(config.maxAttempts, 8);
  assert.equal(config.leaseSeconds, 60);
  assert.equal(config.baseRetryDelaySeconds, 5);
  assert.equal(config.maxRetryDelaySeconds, 3600);
  assert.match(config.dispatcherModulePath, /dist[\\/]apps[\\/]worker[\\/]dispatchers[\\/]approved-workflow-outbox\.js$/);
});
