import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerEntrypoint = resolve(packageRoot, "dist/apps/worker/campaign-scheduler-main.js");

function runWorker(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.EPER_PAYMENT_DATABASE_URL;
  delete env.DATABASE_URL;
  return spawnSync(process.execPath, [workerEntrypoint], {
    cwd: packageRoot,
    env,
    encoding: "utf8",
    timeout: 5000,
  });
}

test("campaign worker is disabled unless explicitly enabled", () => {
  const env = { ...process.env, EPER_AUDIT_PERSISTENCE: "postgres" };
  delete env.EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED;
  delete env.EPER_PAYMENT_DATABASE_URL;
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, [workerEntrypoint], {
    cwd: packageRoot, env, encoding: "utf8", timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_CAMPAIGN_SCHEDULER_WORKER_DISABLED/);
});

test("campaign worker refuses non-PostgreSQL audit persistence before opening a pool", () => {
  const result = runWorker({
    EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED: "true",
    EPER_AUDIT_PERSISTENCE: "memory",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /CAMPAIGN_WORKER_REQUIRES_DURABLE_AUDIT/);
});

test("campaign worker requires an explicit worker identity before opening a pool", () => {
  const result = runWorker({
    EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED: "true",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CAMPAIGN_WORKER_ADAPTER_MODULE: "./dist/packages/campaign-scheduler/adapters/provider.js",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_CAMPAIGN_SCHEDULER_WORKER_ID_REQUIRED/);
});

test("campaign worker rejects adapter paths outside the deployment-owned adapter directory", () => {
  const result = runWorker({
    EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED: "true",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CAMPAIGN_SCHEDULER_WORKER_ID: "worker-test",
    EPER_CAMPAIGN_WORKER_ADAPTER_MODULE: "./dist/apps/api/main.js",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /CAMPAIGN_WORKER_ADAPTER_PATH_INVALID/);
});

test("campaign worker rejects unsupported audit environments before opening a pool", () => {
  const result = runWorker({
    EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED: "true",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CAMPAIGN_SCHEDULER_WORKER_ID: "worker-test",
    EPER_CAMPAIGN_WORKER_ADAPTER_MODULE: "./dist/packages/campaign-scheduler/adapters/provider.js",
    EPER_AUDIT_ENVIRONMENT: "development",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_AUDIT_ENVIRONMENT_INVALID/);
});
