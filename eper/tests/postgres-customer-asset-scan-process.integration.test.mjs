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
async function createWorkerLogin(pool, prefix) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
  const role = "eper_scan_" + prefix + "_" + suffix;
  const password = randomUUID().replaceAll("-", "");
  await pool.query(
    `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  await pool.query(`GRANT eper_customer_asset_access TO "${role}"`);
  const url = new URL(connectionString);
  url.username = role;
  url.password = password;
  const workerPool = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    const check = await workerPool.query(`
      SELECT current_user,
        has_table_privilege(current_user, 'eper_customer_asset_scan_jobs', 'UPDATE') AS can_update_scan_jobs,
        has_table_privilege(current_user, 'eper_customer_assets', 'UPDATE') AS can_update_assets,
        has_table_privilege(current_user, 'eper_customer_assets', 'DELETE') AS can_delete_assets,
        (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses_security
    `);
    assert.equal(check.rows[0].can_update_scan_jobs, true);
    assert.equal(check.rows[0].can_update_assets, true);
    assert.equal(check.rows[0].can_delete_assets, false);
    assert.equal(check.rows[0].bypasses_security, false);
  } finally {
    await workerPool.end();
  }
  return { role, connectionString: url.toString() };
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
    const workerLogin = await createWorkerLogin(pool, "scan");
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
          EPER_CUSTOMER_ASSET_SCAN_DATABASE_URL: workerLogin.connectionString,
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
      await pool.query(`DROP ROLE IF EXISTS "${workerLogin.role}"`).catch(() => {});
      await pool.end();
    }
  });

test("process-level PostgreSQL 16 recovery worker quarantines an exhausted lease and exits on SIGTERM",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "recovery-process");
    const workerLogin = await createWorkerLogin(pool, "recovery");
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
          EPER_CUSTOMER_ASSET_SCAN_DATABASE_URL: workerLogin.connectionString,
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
      await pool.query(`DROP ROLE IF EXISTS "${workerLogin.role}"`).catch(() => {});
      await pool.end();
    }
  });


test("PostgreSQL 16 recovery sweeps and stale scanner finalization serialize in session-asset-job lock order",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 6 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-lock-order");
    const workerId = "ci-asset-scanner:expired-worker";
    try {
      const [job] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        workerId, scannerServiceId: "ci-asset-scanner", environment: "sandbox",
        limit: 1, leaseMs: 5_000,
      });
      assert.ok(job);
      await pool.query(
        `UPDATE eper_customer_asset_scan_jobs
            SET attempt_count = max_attempts,
                lease_expires_at = clock_timestamp() - INTERVAL '1 second'
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3`,
        [fixture.tenantId, fixture.applicationId, fixture.uploadSessionId],
      );
      const outcomes = await Promise.allSettled([
        repository.recoverExhaustedScanJobs({
          tenantId: fixture.tenantId, applicationId: fixture.applicationId,
          scannerServiceId: "ci-asset-scan-recovery", environment: "sandbox", limit: 5,
        }),
        repository.recoverExhaustedScanJobs({
          tenantId: fixture.tenantId, applicationId: fixture.applicationId,
          scannerServiceId: "ci-asset-scan-recovery", environment: "sandbox", limit: 5,
        }),
        repository.recordScanResult({
          tenantId: fixture.tenantId, applicationId: fixture.applicationId,
          scannerServiceId: "ci-asset-scanner", workerId, environment: "sandbox",
          correlationId: fixture.correlationId, uploadSessionId: fixture.uploadSessionId,
          scanStatus: "clean",
        }),
      ]);
      const recovered = outcomes.slice(0, 2)
        .filter(result => result.status === "fulfilled")
        .reduce((sum, result) => sum + result.value, 0);
      assert.equal(recovered, 1, "exactly one recovery sweep must finalize the exhausted lease");
      assert.equal(outcomes[2].status, "rejected", "expired scanner callback must not publish a clean result");
      if (outcomes[2].status === "rejected") {
        assert.match(String(outcomes[2].reason?.message),
          /SCAN_LEASE_LOST|SCAN_RESULT_CONFLICT|NOT_AWAITING_SCAN/);
      }
      const finalState = await pool.query(
        `SELECT a.upload_status, a.scan_status, a.lifecycle_status, j.state
           FROM eper_customer_assets a
           JOIN eper_customer_asset_upload_sessions s
             ON s.tenant_id = a.tenant_id AND s.asset_id = a.asset_id
           JOIN eper_customer_asset_scan_jobs j
             ON j.tenant_id = s.tenant_id AND j.upload_session_id = s.upload_session_id
          WHERE a.tenant_id = $1 AND a.asset_id = $2`,
        [fixture.tenantId, fixture.assetId],
      );
      assert.deepEqual(finalState.rows[0], {
        upload_status: "failed", scan_status: "error", lifecycle_status: "quarantined", state: "dead_letter",
      });
    } finally {
      await pool.end();
    }
  });
