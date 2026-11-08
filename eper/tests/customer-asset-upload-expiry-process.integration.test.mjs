import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

const entrypoint = fileURLToPath(new URL("../dist/apps/worker/customer-asset-upload-expiry-main.js", import.meta.url));

function runWith(envOverrides) {
  const env = { ...process.env, ...envOverrides };
  return spawnSync(process.execPath, [entrypoint], { env, encoding: "utf8", timeout: 10_000 });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const databaseUrl = process.env.EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL;
const adminDatabaseUrl = process.env.DATABASE_URL;
test("restricted expiry worker login processes an expired reservation, appends audit and shuts down on SIGTERM",
  { skip: !databaseUrl || !adminDatabaseUrl },
  async () => {
    const adminPool = new pg.Pool({ connectionString: adminDatabaseUrl, max: 2, connectionTimeoutMillis: 5_000 });
    const workerPool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
    const tenantId = "worker-it-" + randomUUID();
    const applicationId = "app-" + randomUUID();
    const actorId = "actor-" + randomUUID();
    const assetId = randomUUID();
    const correlationId = "expiry-process-" + randomUUID();
    const port = 40_000 + (process.pid % 20_000);
    let child;
    let stdout = "";
    let stderr = "";
    let uploadSessionId;
    try {
      const identity = await workerPool.query("SELECT current_user AS role_name");
      const expectedRole = process.env.EPER_EXPECTED_EXPIRY_WORKER_DATABASE_ROLE;
      if (expectedRole) assert.equal(identity.rows[0]?.role_name, expectedRole);

      const repository = new PostgresCustomerAssetRepository(adminPool);
      await repository.assertReady();
      await repository.create({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Expiry worker process fixture", originalFileName: "expiry.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 1024, storageAdapterKey: "ci-storage",
        storageObjectReference: "opaque-expiry-process-object-" + randomUUID(),
      });
      const reservation = await repository.reserveUpload({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, expectedSizeBytes: 1024,
        idempotencyKey: "expiry-process-" + randomUUID(),
        requestFingerprint: "a".repeat(64),
      });
      uploadSessionId = reservation.uploadSessionId;
      await adminPool.query(
        "UPDATE eper_customer_asset_upload_sessions SET expires_at = now() - interval '2 minutes' WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3",
        [tenantId, applicationId, uploadSessionId],
      );

      child = spawn(process.execPath, [entrypoint], {
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
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });

      const readyDeadline = Date.now() + 15_000;
      let ready = false;
      while (Date.now() < readyDeadline && child.exitCode === null) {
        try {
          const response = await fetch("http://127.0.0.1:" + port + "/health/ready");
          if (response.status === 200) { ready = true; break; }
        } catch { /* process is still starting */ }
        await sleep(100);
      }
      assert.equal(ready, true, "restricted worker becomes ready only after function and audit privileges pass: " + stderr);

      const live = await fetch("http://127.0.0.1:" + port + "/health/live");
      assert.equal(live.status, 200);

      const expiryDeadline = Date.now() + 15_000;
      let expiredAndAudited = false;
      while (Date.now() < expiryDeadline && child.exitCode === null) {
        const status = await adminPool.query(
          "SELECT upload_status FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3",
          [tenantId, applicationId, uploadSessionId],
        );
        const audit = await adminPool.query(
          "SELECT count(*)::int AS count FROM eper_audit_events WHERE tenant_id = $1 AND application_id = $2 AND action = 'customer.asset.upload.expire' AND resource_id = $3 AND outcome = 'success'",
          [tenantId, applicationId, uploadSessionId],
        );
        if (status.rows[0]?.upload_status === "expired" && audit.rows[0]?.count === 1) {
          expiredAndAudited = true;
          break;
        }
        await sleep(100);
      }
      assert.equal(expiredAndAudited, true, "restricted login must expire one session and append exactly one audit event: " + stderr);
      assert.match(stdout, /customer_asset_upload_expiry_batch/);
      assert.doesNotMatch(stdout + stderr, new RegExp(tenantId));
      assert.doesNotMatch(stdout + stderr, new RegExp(applicationId));

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
      assert.match(stdout, /customer_asset_upload_expiry_shutdown/);
    } finally {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), sleep(5_000)]);
      }
      if (uploadSessionId) {
        await adminPool.query(
          "DELETE FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3",
          [tenantId, applicationId, uploadSessionId],
        ).catch(() => {});
      }
      await adminPool.query(
        "DELETE FROM eper_customer_asset_metadata_operations WHERE tenant_id = $1 AND application_id = $2",
        [tenantId, applicationId],
      ).catch(() => {});
      await adminPool.query(
        "DELETE FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2",
        [tenantId, assetId],
      ).catch(() => {});
      await workerPool.end();
      await adminPool.end();
    }
  });
