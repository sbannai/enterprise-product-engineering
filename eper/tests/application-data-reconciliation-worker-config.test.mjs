import test from "node:test";
import assert from "node:assert/strict";
import { readApplicationDataReconciliationWorkerConfig } from "../dist/packages/workflows/application-data-reconciliation-worker-config.js";

const validEnv = () => ({
  EPER_APPLICATION_DATA_RECONCILIATION_WORKER_ENABLED: "true",
  EPER_AUDIT_PERSISTENCE: "postgres",
  EPER_APPLICATION_DATA_RECONCILIATION_DATABASE_URL: "postgresql://eper_data_reconcile_worker:local-only@127.0.0.1:5432/eper",
  EPER_APPLICATION_DATA_RECONCILIATION_EXPECTED_DATABASE_ROLE: "eper_data_reconcile_worker",
  EPER_APPLICATION_DATA_RECONCILIATION_WORKER_ID: "data-reconcile-local-01",
  EPER_ENVIRONMENT: "sandbox",
});

test("application data reconciliation worker requires explicit enablement and PostgreSQL audit", () => {
  const disabled = validEnv();
  delete disabled.EPER_APPLICATION_DATA_RECONCILIATION_WORKER_ENABLED;
  assert.throws(() => readApplicationDataReconciliationWorkerConfig(disabled),
    /EPER_APPLICATION_DATA_RECONCILIATION_WORKER_DISABLED/);
  const noAudit = validEnv();
  noAudit.EPER_AUDIT_PERSISTENCE = "json-file";
  assert.throws(() => readApplicationDataReconciliationWorkerConfig(noAudit),
    /WORKFLOW_APPLICATION_DATA_RECONCILIATION_REQUIRES_POSTGRES_AUDIT/);
});

test("application data reconciliation worker requires a dedicated role matching its connection URL", () => {
  const shared = validEnv();
  shared.EPER_APPLICATION_DATA_RECONCILIATION_EXPECTED_DATABASE_ROLE = "eper";
  assert.throws(() => readApplicationDataReconciliationWorkerConfig(shared),
    /WORKFLOW_APPLICATION_DATA_RECONCILIATION_DATABASE_ROLE_MISMATCH/);
  const mismatch = validEnv();
  mismatch.EPER_APPLICATION_DATA_RECONCILIATION_DATABASE_URL =
    "postgresql://eper_api:local-only@127.0.0.1:5432/eper";
  assert.throws(() => readApplicationDataReconciliationWorkerConfig(mismatch),
    /WORKFLOW_APPLICATION_DATA_RECONCILIATION_DATABASE_ROLE_MISMATCH/);
});

test("application data reconciliation worker applies bounded defaults and overrides", () => {
  const config = readApplicationDataReconciliationWorkerConfig(validEnv());
  assert.equal(config.workerId, "data-reconcile-local-01");
  assert.equal(config.expectedDatabaseRole, "eper_data_reconcile_worker");
  assert.equal(config.environment, "sandbox");
  assert.equal(config.idlePollMs, 1000);
  assert.equal(config.maxContexts, 1000);
  assert.equal(config.leaseMilliseconds, 60000);
  assert.equal(config.maxAttempts, 8);
  const custom = validEnv();
  custom.EPER_APPLICATION_DATA_RECONCILIATION_IDLE_POLL_MS = "250";
  custom.EPER_APPLICATION_DATA_RECONCILIATION_MAX_CONTEXTS = "25";
  custom.EPER_APPLICATION_DATA_RECONCILIATION_LEASE_MS = "120000";
  custom.EPER_APPLICATION_DATA_RECONCILIATION_MAX_ATTEMPTS = "12";
  const changed = readApplicationDataReconciliationWorkerConfig(custom);
  assert.equal(changed.idlePollMs, 250);
  assert.equal(changed.maxContexts, 25);
  assert.equal(changed.leaseMilliseconds, 120000);
  assert.equal(changed.maxAttempts, 12);
});

test("application data reconciliation worker rejects unsafe polling bounds", () => {
  const env = validEnv();
  env.EPER_APPLICATION_DATA_RECONCILIATION_MAX_CONTEXTS = "0";
  assert.throws(() => readApplicationDataReconciliationWorkerConfig(env),
    /EPER_APPLICATION_DATA_RECONCILIATION_MAX_CONTEXTS_OUT_OF_RANGE/);
});
