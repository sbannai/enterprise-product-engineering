import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../dist/apps/worker/customer-asset-upload-expiry-main.js", import.meta.url));

function runWith(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  return spawnSync(process.execPath, [entrypoint], { env, encoding: "utf8", timeout: 10_000 });
}

test("upload expiry worker is disabled by default", () => {
  const result = runWith({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "false",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_DISABLED/);
});

test("upload expiry worker rejects an absent tenant scope registry before opening a pool", () => {
  const result = runWith({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON: "",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_REQUIRED/);
});

test("upload expiry worker rejects non-PostgreSQL persistence before opening a pool", () => {
  const result = runWith({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "mysql",
    EPER_AUDIT_PERSISTENCE: "postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_REQUIRES_POSTGRES/);
});

test("upload expiry worker rejects a backoff cap below its poll interval before opening a pool", () => {
  const result = runWith({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON: JSON.stringify([
      { tenantId: "tenant-test", applicationId: "app-test", environment: "sandbox" },
    ]),
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS: "5000",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_MAX_BACKOFF_MS: "1000",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_MAX_BACKOFF_MS_OUT_OF_RANGE/);
});

const databaseUrl = process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL;
test("upload expiry worker exposes liveness/readiness and shuts down cleanly on SIGTERM",
  { skip: !databaseUrl },
  async () => {
    const tenantId = "worker-it-" + randomUUID();
    const applicationId = "app-" + randomUUID();
    const port = 40_000 + (process.pid % 20_000);
    const child = spawn(process.execPath, [entrypoint], {
      env: {
        ...process.env,
        EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
        EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
        EPER_AUDIT_PERSISTENCE: "postgres",
        EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: databaseUrl,
        EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON: JSON.stringify([
          { tenantId, applicationId, environment: "sandbox" },
        ]),
        EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX: "1",
        EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS: "100",
        EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_BATCH_SIZE: "5",
        EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_HEALTH_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch("http://127.0.0.1:" + port + "/health/ready");
        if (response.status === 200) { ready = true; break; }
      } catch { /* process is still starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "worker becomes ready only after PostgreSQL and audit readiness pass");
    const live = await fetch("http://127.0.0.1:" + port + "/health/live");
    assert.equal(live.status, 200);
    child.kill("SIGTERM");
    let shutdownTimer;
    const exitPromise = once(child, "exit");
    const timeoutPromise = new Promise((_, reject) => {
      shutdownTimer = setTimeout(() => reject(new Error("worker SIGTERM shutdown timed out")), 10_000);
    });
    const [code, signal] = await Promise.race([exitPromise, timeoutPromise]);
    clearTimeout(shutdownTimer);
    assert.equal(signal, null);
    assert.equal(code, 0, stderr);
    assert.doesNotMatch(stdout + stderr, new RegExp(tenantId));
  });
