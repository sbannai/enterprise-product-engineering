import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

function waitForOutput(child, marker, timeoutMs = 15_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    let output = "";
    let errors = "";
    const timer = setTimeout(() => {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      rejectPromise(new Error("PROCESS_OUTPUT_TIMEOUT:" + marker + "\n" + output + "\n" + errors));
    }, timeoutMs);
    const onStdout = chunk => {
      output += chunk.toString();
      if (output.includes(marker)) {
        clearTimeout(timer);
        child.stdout.off("data", onStdout);
        child.stderr.off("data", onStderr);
        resolvePromise(output);
      }
    };
    const onStderr = chunk => { errors += chunk.toString(); };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      rejectPromise(new Error("PROCESS_EXITED_BEFORE_OUTPUT:" + marker + ":" + code + ":" + signal + "\n" + output + "\n" + errors));
    });
  });
}
async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await once(child, "exit");
}
async function createPendingScanFixture(pool, repository, prefix) {
  const suffix = randomUUID().replaceAll("-", "");
  const tenantId = prefix + "-tenant-" + suffix.slice(0, 12);
  const applicationId = prefix + "-app-" + suffix.slice(0, 12);
  const actorId = prefix + "-actor-" + suffix.slice(0, 12);
  const assetId = randomUUID();
  const correlationId = prefix + "-correlation-" + suffix.slice(0, 12);
  const idempotencyKey = prefix + "-key-" + suffix.slice(0, 20);
  const fingerprint = createHash("sha256").update(prefix + suffix).digest("hex");
  await repository.create({
    tenantId, applicationId, actorId, environment: "sandbox", correlationId,
    assetId, scope: "application_restricted", ownerApplicationId: applicationId,
    displayName: prefix + " scan process fixture", originalFileName: "process-fixture.pdf",
    mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
    sizeBytes: 512, storageAdapterKey: "ci-storage",
    storageObjectReference: "opaque-process-object-" + suffix,
  });
  const reservation = await repository.reserveUpload({
    tenantId, applicationId, actorId, environment: "sandbox", correlationId,
    assetId, expectedSizeBytes: 512, idempotencyKey, requestFingerprint: fingerprint,
  });
  await repository.recordUploadGrant({
    tenantId, applicationId, actorId, environment: "sandbox", correlationId,
    assetId, uploadSessionId: reservation.uploadSessionId, requestFingerprint: fingerprint,
    providerUploadReference: "opaque-process-provider-ref-" + suffix,
    grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await repository.completeUpload({
    tenantId, applicationId, actorId, environment: "sandbox", correlationId,
    uploadSessionId: reservation.uploadSessionId, receivedSizeBytes: 512,
    observedMimeType: "application/pdf",
    checksumSha256: createHash("sha256").update("process-file-" + suffix).digest("hex"),
    scanStatus: "pending",
  });
  return { tenantId, applicationId, actorId, assetId, correlationId, uploadSessionId: reservation.uploadSessionId };
}
function baseWorkerEnv(fixture) {
  return {
    ...process.env,
    DATABASE_URL: connectionString,
    EPER_PAYMENT_DATABASE_URL: connectionString,
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_AUDIT_ENVIRONMENT: "sandbox",
    EPER_PG_POOL_MAX: "2",
    EPER_CUSTOMER_ASSET_SCAN_TENANT_ID: fixture.tenantId,
    EPER_CUSTOMER_ASSET_SCAN_APPLICATION_ID: fixture.applicationId,
  };
}

test("process-level PostgreSQL 16 scan worker claims, invokes configured test scanner, persists result and shuts down on SIGTERM",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-process");
    const scannerPath = resolve("dist/packages/assets/scanners/ci-postgres-test-scanner.js");
    let child;
    try {
      await mkdir(dirname(scannerPath), { recursive: true });
      await writeFile(scannerPath, `export async function createCustomerAssetScanner({ env }) {
  return { async scan() {
    return { scanStatus: "clean", scannerServiceId: env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID };
  } };
}
`);
      child = spawn(process.execPath, ["dist/apps/worker/customer-asset-scan-main.js"], {
        env: {
          ...baseWorkerEnv(fixture),
          EPER_CUSTOMER_ASSET_SCAN_WORKER_ENABLED: "true",
          EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID: "ci-asset-scanner",
          EPER_CUSTOMER_ASSET_SCAN_WORKER_ID: "ci-asset-scanner:process-test",
          EPER_CUSTOMER_ASSET_SCANNER_MODULE: "./dist/packages/assets/scanners/ci-postgres-test-scanner.js",
          EPER_CUSTOMER_ASSET_SCAN_POLL_INTERVAL_MS: "100",
          EPER_CUSTOMER_ASSET_SCAN_LEASE_MS: "5000",
          EPER_CUSTOMER_ASSET_SCAN_BATCH_SIZE: "2",
          EPER_CUSTOMER_ASSET_SCAN_CONCURRENCY: "1",
          EPER_CUSTOMER_ASSET_SCAN_TIMEOUT_MS: "5000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      await waitForOutput(child, "EPER customer asset scan job outcome completed");
      child.kill("SIGTERM");
      const [code, signal] = await once(child, "exit");
      assert.equal(code, 0, "scan worker should shut down cleanly on SIGTERM");
      assert.equal(signal, null);
      const state = await pool.query(
        `SELECT a.upload_status, a.scan_status, a.lifecycle_status, j.state
           FROM eper_customer_assets a
           JOIN eper_customer_asset_upload_sessions s
             ON s.tenant_id = a.tenant_id AND s.asset_id = a.asset_id
           JOIN eper_customer_asset_scan_jobs j
             ON j.tenant_id = s.tenant_id AND j.upload_session_id = s.upload_session_id
          WHERE a.tenant_id = $1 AND a.asset_id = $2`,
        [fixture.tenantId, fixture.assetId],
      );
      assert.deepEqual(state.rows[0], {
        upload_status: "available", scan_status: "clean", lifecycle_status: "active", state: "completed",
      });
    } finally {
      if (child) await stopChild(child).catch(() => {});
      await rm(scannerPath, { force: true });
      await pool.end();
    }
  });

test("process-level PostgreSQL 16 recovery worker quarantines an exhausted lease and exits on SIGTERM",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "recovery-process");
    const workerId = "ci-recovery-expired-worker";
    let child;
    try {
      const [job] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        workerId, scannerServiceId: "ci-asset-scanner", environment: "sandbox",
        limit: 1, leaseMs: 5_000,
      });
      assert.ok(job, "fixture must create a claimable scan job");
      await pool.query(
        `UPDATE eper_customer_asset_scan_jobs
            SET attempt_count = max_attempts,
                lease_expires_at = clock_timestamp() - INTERVAL '1 second'
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3`,
        [fixture.tenantId, fixture.applicationId, fixture.uploadSessionId],
      );
      child = spawn(process.execPath, ["dist/apps/worker/customer-asset-scan-recovery-main.js"], {
        env: {
          ...process.env,
          DATABASE_URL: connectionString,
          EPER_PAYMENT_DATABASE_URL: connectionString,
          EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
          EPER_AUDIT_PERSISTENCE: "postgres",
          EPER_AUDIT_ENVIRONMENT: "sandbox",
          EPER_PG_POOL_MAX: "2",
          EPER_CUSTOMER_ASSET_SCAN_RECOVERY_ENABLED: "true",
          EPER_CUSTOMER_ASSET_SCAN_RECOVERY_TENANT_ID: fixture.tenantId,
          EPER_CUSTOMER_ASSET_SCAN_RECOVERY_APPLICATION_ID: fixture.applicationId,
          EPER_CUSTOMER_ASSET_SCAN_RECOVERY_SERVICE_ID: "ci-asset-scan-recovery",
          EPER_CUSTOMER_ASSET_SCAN_RECOVERY_INTERVAL_MS: "30000",
          EPER_CUSTOMER_ASSET_SCAN_RECOVERY_BATCH_SIZE: "5",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      await waitForOutput(child, "EPER customer asset scan recovery finalized jobs 1");
      child.kill("SIGTERM");
      const [code, signal] = await once(child, "exit");
      assert.equal(code, 0, "recovery worker should shut down cleanly on SIGTERM");
      assert.equal(signal, null);
      const state = await pool.query(
        `SELECT a.upload_status, a.scan_status, a.lifecycle_status, j.state
           FROM eper_customer_assets a
           JOIN eper_customer_asset_upload_sessions s
             ON s.tenant_id = a.tenant_id AND s.asset_id = a.asset_id
           JOIN eper_customer_asset_scan_jobs j
             ON j.tenant_id = s.tenant_id AND j.upload_session_id = s.upload_session_id
          WHERE a.tenant_id = $1 AND a.asset_id = $2`,
        [fixture.tenantId, fixture.assetId],
      );
      assert.deepEqual(state.rows[0], {
        upload_status: "failed", scan_status: "error", lifecycle_status: "quarantined", state: "dead_letter",
      });
      const audit = await pool.query(
        `SELECT action FROM eper_audit_events
          WHERE tenant_id = $1 AND correlation_id = $2 AND action = 'customer.asset.scan.exhausted'`,
        [fixture.tenantId, fixture.correlationId],
      );
      assert.equal(audit.rowCount, 1, "recovery transition and audit must commit together");
    } finally {
      if (child) await stopChild(child).catch(() => {});
      await pool.end();
    }
  });
