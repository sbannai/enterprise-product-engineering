import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerEntrypoint = resolve(packageRoot, "dist/apps/worker/agent-worker-main.js");

function runWorker(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.EPER_PAYMENT_DATABASE_URL;
  delete env.DATABASE_URL;
  return spawnSync(process.execPath, [workerEntrypoint], {
    cwd: packageRoot, env, encoding: "utf8", timeout: 5000,
  });
}

test("agent worker is disabled unless explicitly enabled", () => {
  const env = { ...process.env, EPER_AUDIT_PERSISTENCE: "postgres" };
  delete env.EPER_AGENT_WORKER_ENABLED;
  delete env.EPER_PAYMENT_DATABASE_URL;
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, [workerEntrypoint], {
    cwd: packageRoot, env, encoding: "utf8", timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_AGENT_WORKER_DISABLED/);
});

test("agent worker requires durable PostgreSQL audit persistence", () => {
  const result = runWorker({ EPER_AGENT_WORKER_ENABLED: "true", EPER_AUDIT_PERSISTENCE: "memory" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /AGENT_WORKER_REQUIRES_DURABLE_AUDIT/);
});

test("agent worker requires explicit worker identity and tenant/application scope before opening a pool", () => {
  const result = runWorker({ EPER_AGENT_WORKER_ENABLED: "true", EPER_AUDIT_PERSISTENCE: "postgres" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_AGENT_WORKER_ID_REQUIRED/);
});

test("agent worker refuses to start without explicit tenant/application scope", () => {
  const result = runWorker({
    EPER_AGENT_WORKER_ENABLED: "true", EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_AGENT_WORKER_ID: "worker-test",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_AGENT_WORKER_TENANT_ID_REQUIRED/);
});

test("agent worker rejects unsupported audit environments before opening a pool", () => {
  const result = runWorker({
    EPER_AGENT_WORKER_ENABLED: "true", EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_AGENT_WORKER_ID: "worker-test", EPER_AGENT_WORKER_TENANT_ID: "tenant-test",
    EPER_AGENT_WORKER_APPLICATION_ID: "application-test", EPER_AUDIT_ENVIRONMENT: "development",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_AUDIT_ENVIRONMENT_INVALID/);
});

test("agent worker rejects lease bounds outside the PostgreSQL store contract", () => {
  const result = runWorker({
    EPER_AGENT_WORKER_ENABLED: "true", EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_AGENT_WORKER_ID: "worker-test", EPER_AGENT_WORKER_TENANT_ID: "tenant-test",
    EPER_AGENT_WORKER_APPLICATION_ID: "application-test", EPER_AGENT_WORKER_LEASE_SECONDS: "901",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /EPER_AGENT_WORKER_LEASE_SECONDS_OUT_OF_RANGE/);
});
