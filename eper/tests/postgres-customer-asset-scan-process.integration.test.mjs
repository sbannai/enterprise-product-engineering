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
  // The scanner process receives the exact same synthetic bytes whose digest
  // and size are persisted as the completed upload's server-observed metadata.
  await pool.query(
    "INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id, enabled) VALUES (session_user, $1, true) ON CONFLICT (login_role, tenant_id) DO UPDATE SET enabled = true, updated_at = now()",
    [tenantId],
  );
  const testObjectBytes = Buffer.alloc(512, suffix.charCodeAt(0));
  const checksumSha256 = createHash("sha256").update(testObjectBytes).digest("hex");
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
    assetId, expectedSizeBytes: 512, expectedChecksumSha256: checksumSha256, idempotencyKey, requestFingerprint: fingerprint,
  });
  await repository.recordUploadGrant({
    tenantId, applicationId, actorId, environment: "sandbox", correlationId,
    assetId, uploadSessionId: reservation.uploadSessionId, requestFingerprint: fingerprint,
    providerUploadReference: "opaque-process-provider-ref-" + suffix,
    grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await repository.completeUpload({
    tenantId, applicationId, actorId, environment: "sandbox", correlationId,
    uploadSessionId: reservation.uploadSessionId, receivedSizeBytes: testObjectBytes.length,
    observedMimeType: "application/pdf", checksumSha256, scanStatus: "pending",
  });
  return { tenantId, applicationId, actorId, assetId, correlationId,
    uploadSessionId: reservation.uploadSessionId, testObjectBytes,
    providerObjectReference: "opaque-process-object-" + suffix };
}
async function createWorkerLogin(pool, prefix, fixture, workerId, scannerServiceId) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
  const role = "eper_scan_" + prefix + "_" + suffix;
  const password = randomUUID().replaceAll("-", "");
  await pool.query(
    `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
  );
  await pool.query(`GRANT eper_customer_asset_access TO "${role}"`);
  await pool.query(`GRANT eper_customer_asset_scan_supervisor_access TO "${role}"`);
  await pool.query(
    `INSERT INTO public.eper_customer_asset_scan_supervisor_identities
      (login_role, tenant_id, application_id, worker_id, scanner_service_id, enabled)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [role, fixture.tenantId, fixture.applicationId, workerId, scannerServiceId],
  );
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
  return { role, workerId, connectionString: url.toString() };
}

async function createChildLogin(pool, fixture, workerId, scannerServiceId) {
  const role = "eper_scan_child_ci";
  const spiffeId = "spiffe://eper.example/asset-scanner/ci-child";
  await pool.query(`CREATE ROLE "${role}" WITH LOGIN INHERIT
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await pool.query(`GRANT eper_customer_asset_scan_child_access TO "${role}"`);
  await pool.query(
    `INSERT INTO public.eper_customer_asset_scan_child_identities
      (login_role, tenant_id, application_id, worker_id, scanner_service_id,
       spiffe_id, provider_connection_id, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
    [role, fixture.tenantId, fixture.applicationId, workerId, scannerServiceId,
      spiffeId, "ci-storage-connection"],
  );
  return { role, spiffeId };
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
    const workerId = "ci-asset-scanner:process-test";
    const scannerServiceId = "ci-asset-scanner";
    const workerLogin = await createWorkerLogin(pool, "scan", fixture, workerId, scannerServiceId);
    const childLogin = await createChildLogin(pool, fixture, workerId, scannerServiceId);
    const certDirectory = process.env.EPER_SCAN_CHILD_CERT_DIR;
    assert.ok(certDirectory, "CI client-certificate directory must be configured");
    const compositionPath = resolve("dist/packages/assets/scanners/ci-postgres-test-composition.js");
    const objectPath = resolve("dist/packages/assets/scanners/ci-postgres-test-object-" + randomUUID() + ".bin");
    let child;
    try {
      await mkdir(dirname(scannerPath), { recursive: true });
      await writeFile(objectPath, fixture.testObjectBytes);
      const compositionSource = `import { createReadStream } from "node:fs";
import { CustomerAssetScanChildSpiffeIdentityVerifier } from "../customer-asset-scan-child-spiffe-identity.js";
import { createCustomerAssetScanChildSpiffeSdkRuntime } from "../customer-asset-scan-child-spiffe-sdk-adapter.js";
import { PostgresCustomerAssetScanChildInputResolver } from "../customer-asset-scan-child-input-resolver.js";
import { ProviderStorageDriverDispatchService } from "../../integrations/provider-storage-driver-dispatch-service.js";
const objectPath = ${JSON.stringify(objectPath)};
const expectedObjectReference = ${JSON.stringify(fixture.providerObjectReference)};
export function createCustomerAssetScanChildRuntimeDependencies({ pool, env }) {
  // Explicit test-only SDK stand-in. Production composition must use the real
  // SPIFFE SDK/Workload API endpoint and is not supplied by this fixture.
  class TestSpiffeClient {
    constructor(options) {
      if (options.connection !== env.EPER_SCANNER_CHILD_SPIFFE_WORKLOAD_API_SOCKET ||
          options.retry.enabled !== false) throw new Error("test SPIFFE SDK configuration invalid");
    }
    async getJwtSvid(audience, filter) {
      if (audience !== "eper:customer-asset-scan-child") return null;
      return { spiffeId: filter.spiffeId, token: "test-only-svid", expiresAtMs: Date.now() + 120000 };
    }
    close() {}
  }
  const spiffe = createCustomerAssetScanChildSpiffeSdkRuntime({
    endpoint: env.EPER_SCANNER_CHILD_SPIFFE_WORKLOAD_API_SOCKET,
    SpiffeClient: TestSpiffeClient,
  });
  const identity = new CustomerAssetScanChildSpiffeIdentityVerifier(
    spiffe.adapter, env.EPER_SCANNER_CHILD_EXPECTED_SPIFFE_ID,
  );
  const input = new PostgresCustomerAssetScanChildInputResolver(pool);
  const driver = {
    dependencyIds: [],
    capabilities: {
      idempotentCreateByUploadSessionId: true,
      lookupByUploadSessionId: false, renewByProviderReference: false,
      verifyObject: false, downloadGrant: false, malwareScan: false,
      internalObjectRead: true,
    },
    async createUploadGrant() { return { kind: "unknown", reason: "test-only" }; },
    async readObjectInternal(context, request) {
      if (context.connectionId !== "ci-storage-connection" ||
          request.providerObjectReference !== expectedObjectReference) {
        throw new Error("test provider scope mismatch");
      }
      return createReadStream(objectPath);
    },
  };
  const runtime = {
    async resolve({ tenantId, applicationId, capability, expectedConnectionId }) {
      if (expectedConnectionId !== "ci-storage-connection") throw new Error("test connection pin mismatch");
      return {
        runtime: {
          capability,
          selection: {
            tenantId, applicationId, capabilityKey: capability,
            connectionId: "ci-storage-connection", providerKey: "ci-storage",
          },
          adapter: driver,
        },
        credentials: Object.freeze({ testOnly: true }),
      };
    },
  };
  const provider = new ProviderStorageDriverDispatchService(runtime);
  const scanner = {
    async scan(scanInput) {
      const chunks = [];
      for await (const chunk of scanInput.source) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      const digest = await import("node:crypto").then(({ createHash }) =>
        createHash("sha256").update(bytes).digest("hex"));
      return bytes.length === scanInput.sizeBytes && digest === scanInput.checksumSha256 &&
        scanInput.mimeType === "application/pdf" ? { scanStatus: "clean" } : { scanStatus: "infected" };
    },
  };
  return { identity, input, provider, scanner };
}
`;
      await writeFile(compositionPath, compositionSource);
      child = spawn(process.execPath, ["dist/apps/worker/customer-asset-scan-main.js"], {
        env: {
          ...baseWorkerEnv(fixture),
          EPER_CUSTOMER_ASSET_SCAN_DATABASE_URL: workerLogin.connectionString,
          EPER_CUSTOMER_ASSET_SCAN_WORKER_ENABLED: "true",
          EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID: "ci-asset-scanner",
          EPER_CUSTOMER_ASSET_SCAN_WORKER_ID: workerId,
          EPER_SCANNER_CHILD_SPIFFE_WORKLOAD_API_SOCKET: "unix:///tmp/eper-test-workload-api.sock",
          EPER_SCANNER_CHILD_EXPECTED_SPIFFE_ID: childLogin.spiffeId,
          EPER_SCANNER_CHILD_SPIFFE_AUDIENCE: "eper:customer-asset-scan-child",
          EPER_CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_MODULE: "./dist/packages/assets/scanners/ci-postgres-test-composition.js",
          EPER_SCANNER_CHILD_PGHOST: "localhost",
          EPER_SCANNER_CHILD_PGPORT: new URL(connectionString).port || "5432",
          EPER_SCANNER_CHILD_PGDATABASE: new URL(connectionString).pathname.slice(1),
          EPER_SCANNER_CHILD_PGUSER: childLogin.role,
          EPER_SCANNER_CHILD_PGSSLROOTCERT: resolve(certDirectory, "ca.crt"),
          EPER_SCANNER_CHILD_PGSSLCERT: resolve(certDirectory, "child.crt"),
          EPER_SCANNER_CHILD_PGSSLKEY: resolve(certDirectory, "child.key"),
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
      await rm(compositionPath, { force: true });
      await rm(objectPath, { force: true });
      await pool.query("DELETE FROM public.eper_customer_asset_scan_child_identities WHERE login_role = $1", [childLogin.role]).catch(() => {});
      await pool.query(`REVOKE eper_customer_asset_scan_child_access FROM "${childLogin.role}"`).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS "${childLogin.role}"`).catch(() => {});
      await pool.query("DELETE FROM public.eper_customer_asset_scan_supervisor_identities WHERE login_role = $1", [workerLogin.role]).catch(() => {});
      await pool.query(`REVOKE eper_customer_asset_scan_supervisor_access FROM "${workerLogin.role}"`).catch(() => {});
      await pool.query("DELETE FROM public.eper_customer_asset_scan_supervisor_identities WHERE login_role = $1", [workerLogin.role]).catch(() => {});
      await pool.query(`REVOKE eper_customer_asset_scan_supervisor_access FROM "${workerLogin.role}"`).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS "${workerLogin.role}"`).catch(() => {});
      await pool.end();
    }
  });

test("process-level PostgreSQL 16 recovery worker quarantines an exhausted lease and exits on SIGTERM",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "recovery-process");
    const workerId = "ci-asset-scan-recovery:expired-worker";
    const scannerServiceId = "ci-asset-scan-recovery";
    const workerLogin = await createWorkerLogin(pool, "recovery", fixture, workerId, scannerServiceId);
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
          EPER_CUSTOMER_ASSET_SCAN_RECOVERY_SERVICE_ID: scannerServiceId,
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
          scanStatus: "clean", claimGeneration: job.claimGeneration,
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


test("PostgreSQL scan claim generation fences stale same-worker renew, lookup, retry and completion",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 5 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-generation-fence");
    const workerId = "ci-scan-generation-reused-worker";
    try {
      const [first] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId, workerId,
        scannerServiceId: "ci-asset-scanner", environment: "sandbox", limit: 1, leaseMs: 5_000,
      });
      assert.ok(first);
      assert.equal(first.claimGeneration, 1);
      await pool.query(
        `UPDATE eper_customer_asset_scan_jobs SET lease_expires_at = clock_timestamp() - INTERVAL '1 second'
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3`,
        [fixture.tenantId, fixture.applicationId, fixture.uploadSessionId],
      );
      const [second] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId, workerId,
        scannerServiceId: "ci-asset-scanner", environment: "sandbox", limit: 1, leaseMs: 5_000,
      });
      assert.ok(second);
      assert.equal(second.claimGeneration, 2);
      assert.equal(second.claimGeneration > first.claimGeneration, true);
      assert.equal(await repository.renewScanJobLease({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        uploadSessionId: fixture.uploadSessionId, workerId, leaseMs: 5_000,
        claimGeneration: first.claimGeneration,
      }), false, "stale generation must not renew a takeover owned by the same worker id");
      assert.equal(await repository.completeScanJob({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        uploadSessionId: fixture.uploadSessionId, workerId, claimGeneration: first.claimGeneration,
      }), false, "stale generation must not complete a takeover owned by the same worker id");
      assert.equal(await repository.getUploadSessionForScanning(
        fixture.tenantId, fixture.applicationId, fixture.uploadSessionId, workerId, first.claimGeneration,
      ), null, "stale generation must not retrieve scan input");
      assert.equal(await repository.retryScanJob({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        uploadSessionId: fixture.uploadSessionId, workerId, claimGeneration: first.claimGeneration,
        errorCode: "SCANNER_PROVIDER_ERROR", retryAfterMs: 15_000,
      }), "lease_lost");
      await assert.rejects(repository.recordScanResult({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        scannerServiceId: "ci-asset-scanner", workerId, environment: "sandbox",
        correlationId: fixture.correlationId, uploadSessionId: fixture.uploadSessionId,
        scanStatus: "clean", claimGeneration: first.claimGeneration,
      }), /EPER_CUSTOMER_ASSET_SCAN_LEASE_LOST/);
      const completed = await repository.recordScanResult({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        scannerServiceId: "ci-asset-scanner", workerId, environment: "sandbox",
        correlationId: fixture.correlationId, uploadSessionId: fixture.uploadSessionId,
        scanStatus: "clean", claimGeneration: second.claimGeneration,
      });
      assert.equal(completed.scanStatus, "clean");
    } finally {
      await pool.end();
    }
  });


test("PostgreSQL timeout expiry permits generation-2 takeover and rejects every late generation-1 mutation",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 5 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-timeout-takeover");
    const workerId = "ci-scan-timeout-reused-worker";
    const shutdown = new AbortController();
    let scannerSignal;
    let jobOutcome;
    try {
      await import("../dist/packages/assets/customer-asset-scan-worker.js").then(async ({ runCustomerAssetScanWorker }) => {
        await runCustomerAssetScanWorker({
          repository,
          scanner: {
            async scan(_input, _requestId, signal) {
              scannerSignal = signal;
              return new Promise(() => {}); // deliberately ignores cancellation forever
            },
          },
          tenantId: fixture.tenantId, applicationId: fixture.applicationId, workerId,
          scannerServiceId: "ci-asset-scanner", environment: "sandbox",
          signal: shutdown.signal, leaseMs: 5_000, scanTimeoutMs: 1_000,
          pollIntervalMs: 100, onJob(result) {
            jobOutcome = result.outcome;
            if (result.outcome === "lease_lost") shutdown.abort();
          },
        });
      });
      assert.equal(scannerSignal?.aborted, true, "timeout must request cancellation");
      assert.equal(jobOutcome, "lease_lost", "timed-out generation must relinquish its claim");

      // The old lease is deliberately allowed to expire; no database state is
      // changed by the late provider promise because it never settles.
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5_100));
      const [replacement] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId, workerId,
        scannerServiceId: "ci-asset-scanner", environment: "sandbox", limit: 1, leaseMs: 5_000,
      });
      assert.ok(replacement, "expired generation must be claimable");
      assert.equal(replacement.claimGeneration, 2, "takeover must increment the generation");

      assert.equal(await repository.renewScanJobLease({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        uploadSessionId: fixture.uploadSessionId, workerId, leaseMs: 5_000,
        claimGeneration: 1,
      }), false, "late generation 1 must not renew generation 2");
      assert.equal(await repository.getUploadSessionForScanning(
        fixture.tenantId, fixture.applicationId, fixture.uploadSessionId, workerId, 1,
      ), null, "late generation 1 must not read scan input");
      assert.equal(await repository.retryScanJob({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        uploadSessionId: fixture.uploadSessionId, workerId, claimGeneration: 1,
        errorCode: "SCANNER_PROVIDER_ERROR", retryAfterMs: 15_000,
      }), "lease_lost", "late generation 1 must not schedule retry");
      await assert.rejects(repository.recordScanResult({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        scannerServiceId: "ci-asset-scanner", workerId, environment: "sandbox",
        correlationId: fixture.correlationId, uploadSessionId: fixture.uploadSessionId,
        scanStatus: "clean", claimGeneration: 1,
      }), /EPER_CUSTOMER_ASSET_SCAN_LEASE_LOST/,
      "late generation 1 must not finalize or append audit");

      const completed = await repository.recordScanResult({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        scannerServiceId: "ci-asset-scanner", workerId, environment: "sandbox",
        correlationId: fixture.correlationId, uploadSessionId: fixture.uploadSessionId,
        scanStatus: "clean", claimGeneration: replacement.claimGeneration,
      });
      assert.equal(completed.scanStatus, "clean", "generation 2 must remain able to finalize");
    } finally {
      if (!shutdown.signal.aborted) shutdown.abort();
      await pool.end();
    }
  });


test("PostgreSQL 16 scanner-child LOGIN can resolve only its mapped live scan input and cannot access or mutate tables",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 5 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-child-readonly");
    const workerId = "ci-asset-scanner:child-readonly-test";
    const scannerServiceId = "ci-asset-scanner";
    const spiffeId = "spiffe://eper.example/asset-scanner/ci-child";
    const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
    const role = "eper_scan_child_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    const childUrl = new URL(connectionString);
    childUrl.username = role;
    childUrl.password = password;
    const childPool = new Pool({ connectionString: childUrl.toString(), max: 1 });
    try {
      const [job] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        workerId, scannerServiceId, environment: "sandbox", limit: 1, leaseMs: 30_000,
      });
      assert.ok(job, "fixture must create a live leased scan job");

      await pool.query(
        `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await pool.query(`GRANT eper_customer_asset_scan_child_access TO "${role}"`);
      await pool.query(
        `INSERT INTO public.eper_customer_asset_scan_child_identities
           (login_role, tenant_id, application_id, worker_id, scanner_service_id,
            spiffe_id, provider_connection_id, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [role, fixture.tenantId, fixture.applicationId, workerId, scannerServiceId, spiffeId, "ci-storage-connection"],
      );

      const privileges = await childPool.query(`
        SELECT
          has_table_privilege(current_user, 'public.eper_customer_assets', 'SELECT') AS can_select_assets,
          has_table_privilege(current_user, 'public.eper_customer_assets', 'UPDATE') AS can_update_assets,
          has_table_privilege(current_user, 'public.eper_customer_asset_upload_sessions', 'SELECT') AS can_select_sessions,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'SELECT') AS can_select_jobs,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'UPDATE') AS can_update_jobs,
          has_table_privilege(current_user, 'public.eper_audit_events', 'INSERT') AS can_insert_audit,
          has_function_privilege(current_user,
            'public.eper_resolve_customer_asset_scan_child_context(uuid,bigint)',
            'EXECUTE') AS can_resolve_scan_input
      `);
      assert.deepEqual(privileges.rows[0], {
        can_select_assets: false,
        can_update_assets: false,
        can_select_sessions: false,
        can_select_jobs: false,
        can_update_jobs: false,
        can_insert_audit: false,
        can_resolve_scan_input: true,
      });

      await assert.rejects(
        childPool.query("SELECT asset_id FROM public.eper_customer_assets WHERE asset_id = $1", [fixture.assetId]),
        error => error.code === "42501",
      );
      await assert.rejects(
        childPool.query("UPDATE public.eper_customer_asset_scan_jobs SET attempt_count = 99 WHERE asset_id = $1", [fixture.assetId]),
        error => error.code === "42501",
      );

      const resolved = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_context($1, $2)`,
        [fixture.assetId, job.claimGeneration],
      );
      assert.equal(resolved.rowCount, 1, "mapped child should resolve the exact active generation");
      assert.equal(resolved.rows[0].asset_id, fixture.assetId);
      assert.equal(Number(resolved.rows[0].size_bytes), 512);
      assert.equal(resolved.rows[0].mime_type, "application/pdf");
      assert.match(resolved.rows[0].provider_upload_reference, /^opaque-process-provider-ref-/);

      const staleGeneration = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_context($1, $2)`,
        [fixture.assetId, job.claimGeneration + 1],
      );
      assert.equal(staleGeneration.rowCount, 0, "stale claim generation must resolve no scan input");
    } finally {
      await childPool.end();
      await pool.query(
        "DELETE FROM public.eper_customer_asset_scan_child_identities WHERE login_role = $1",
        [role],
      ).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
      await pool.end();
    }
  });


test("PostgreSQL 16 scanner-supervisor LOGIN is isolated behind the operator-managed identity registry",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 3 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
    const role = "eper_scan_supervisor_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    const supervisorUrl = new URL(connectionString);
    supervisorUrl.username = role;
    supervisorUrl.password = password;
    const supervisorPool = new Pool({ connectionString: supervisorUrl.toString(), max: 1 });
    try {
      await pool.query(
        `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await pool.query(`GRANT eper_customer_asset_scan_supervisor_access TO "${role}"`);
      await pool.query(
        `INSERT INTO public.eper_customer_asset_scan_supervisor_identities
           (login_role, tenant_id, application_id, worker_id, scanner_service_id, enabled)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [role, "tenant-" + suffix, "application-" + suffix,
          "ci-asset-scanner:" + suffix, "ci-asset-scanner"],
      );

      const boundary = await supervisorPool.query(`
        SELECT current_user,
          pg_catalog.pg_has_role(current_user, 'eper_customer_asset_scan_supervisor_access', 'MEMBER') AS is_supervisor,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_supervisor_identities', 'SELECT') AS can_read_identity_registry,
          has_table_privilege(current_user, 'public.eper_customer_assets', 'SELECT') AS can_read_assets,
          has_table_privilege(current_user, 'public.eper_customer_assets', 'UPDATE') AS can_update_assets,
          has_table_privilege(current_user, 'public.eper_customer_asset_upload_sessions', 'UPDATE') AS can_update_sessions,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'UPDATE') AS can_update_jobs,
          has_table_privilege(current_user, 'public.eper_audit_events', 'INSERT') AS can_insert_audit,
          (SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user) AS bypasses_security
      `);
      assert.deepEqual(boundary.rows[0], {
        current_user: role,
        is_supervisor: true,
        can_read_identity_registry: false,
        can_read_assets: false,
        can_update_assets: false,
        can_update_sessions: false,
        can_update_jobs: false,
        can_insert_audit: false,
        bypasses_security: false,
      });
      await assert.rejects(
        supervisorPool.query("SELECT login_role FROM public.eper_customer_asset_scan_supervisor_identities"),
        error => error.code === "42501",
      );
      await assert.rejects(
        supervisorPool.query("UPDATE public.eper_customer_asset_scan_jobs SET attempt_count = 99"),
        error => error.code === "42501",
      );
    } finally {
      await supervisorPool.end();
      await pool.query(
        "DELETE FROM public.eper_customer_asset_scan_supervisor_identities WHERE login_role = $1",
        [role],
      ).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
      await pool.end();
    }
  });


test("PostgreSQL 16 scanner-supervisor LOGIN can renew only its mapped active claim generation",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 5 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-supervisor-renew");
    const workerId = "ci-asset-scanner:supervisor-renew-test";
    const scannerServiceId = "ci-asset-scanner";
    const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
    const role = "eper_scan_supervisor_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    const supervisorUrl = new URL(connectionString);
    supervisorUrl.username = role;
    supervisorUrl.password = password;
    const supervisorPool = new Pool({ connectionString: supervisorUrl.toString(), max: 1 });
    try {
      const [job] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        workerId, scannerServiceId, environment: "sandbox", limit: 1, leaseMs: 30_000,
      });
      assert.ok(job, "fixture must create a live leased scan job");

      await pool.query(
        `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await pool.query(`GRANT eper_customer_asset_scan_supervisor_access TO "${role}"`);
      await pool.query(
        `INSERT INTO public.eper_customer_asset_scan_supervisor_identities
           (login_role, tenant_id, application_id, worker_id, scanner_service_id, enabled)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [role, fixture.tenantId, fixture.applicationId, workerId, scannerServiceId],
      );

      const boundary = await supervisorPool.query(`
        SELECT
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'SELECT') AS can_select_jobs,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'UPDATE') AS can_update_jobs,
          has_function_privilege(current_user,
            'public.eper_renew_customer_asset_scan_lease(varchar,varchar,uuid,varchar,integer,bigint)',
            'EXECUTE') AS can_renew
      `);
      assert.deepEqual(boundary.rows[0], {
        can_select_jobs: false,
        can_update_jobs: false,
        can_renew: true,
      });

      const renew = (tenantId, applicationId, generation) => supervisorPool.query(
        `SELECT public.eper_renew_customer_asset_scan_lease($1, $2, $3, $4, $5, $6) AS renewed`,
        [tenantId, applicationId, fixture.uploadSessionId, workerId, 15_000, generation],
      );
      assert.equal((await renew(fixture.tenantId, fixture.applicationId, job.claimGeneration)).rows[0].renewed,
        true, "mapped supervisor must renew the active claim");
      assert.equal((await renew(fixture.tenantId, fixture.applicationId, job.claimGeneration + 1)).rows[0].renewed,
        false, "stale generation must not renew");
      await assert.rejects(
        renew(fixture.tenantId, fixture.applicationId + "-other", job.claimGeneration),
        /EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_IDENTITY_DENIED/,
      );
      await pool.query(
        "UPDATE public.eper_customer_asset_scan_supervisor_identities SET enabled = false WHERE login_role = $1",
        [role],
      );
      await assert.rejects(
        renew(fixture.tenantId, fixture.applicationId, job.claimGeneration),
        /EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_IDENTITY_DENIED/,
      );
      await assert.rejects(
        supervisorPool.query("UPDATE public.eper_customer_asset_scan_jobs SET attempt_count = 99"),
        error => error.code === "42501",
      );
    } finally {
      await supervisorPool.end();
      await pool.query(
        "DELETE FROM public.eper_customer_asset_scan_supervisor_identities WHERE login_role = $1",
        [role],
      ).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
      await pool.end();
    }
  });


test("PostgreSQL 16 supervisor recovery appends canonical audit atomically", { skip: !connectionString }, async () => {
  const pool = new Pool({ connectionString, max: 6 });
  const fixtureRepository = new PostgresCustomerAssetRepository(pool);
  const fixture = await createPendingScanFixture(pool, fixtureRepository, "scan-supervisor-recovery");
  const workerId = "ci-asset-scanner:supervisor-recovery";
  const scannerServiceId = "ci-asset-scanner";
  const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
  const role = "eper_scan_recovery_" + suffix;
  const password = randomUUID().replaceAll("-", "");
  const supervisorUrl = new URL(connectionString);
  supervisorUrl.username = role;
  supervisorUrl.password = password;
  const supervisorPool = new Pool({ connectionString: supervisorUrl.toString(), max: 1 });
  try {
    await fixtureRepository.claimScanJobs({
      tenantId: fixture.tenantId, applicationId: fixture.applicationId,
      workerId, scannerServiceId, environment: "sandbox", limit: 1, leaseMs: 5_000,
    });
    await pool.query(
      `UPDATE public.eper_customer_asset_scan_jobs
          SET attempt_count = max_attempts,
              lease_expires_at = clock_timestamp() - INTERVAL '1 second'
        WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3`,
      [fixture.tenantId, fixture.applicationId, fixture.uploadSessionId],
    );
    await pool.query(
      `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
         NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await pool.query(`GRANT eper_customer_asset_scan_supervisor_access TO "${role}"`);
    await pool.query(
      `INSERT INTO public.eper_customer_asset_scan_supervisor_identities
         (login_role, tenant_id, application_id, worker_id, scanner_service_id, enabled)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [role, fixture.tenantId, fixture.applicationId, workerId, scannerServiceId],
    );
    const privilegeProbe = await pool.query(
      `SELECT current_user AS probe_user,
              session_user AS probe_session_user,
              pg_catalog.pg_get_userbyid(p.proowner) AS recovery_function_owner,
              p.prosecdef AS recovery_is_security_definer,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_asset_upload_sessions', 'tenant_id', 'SELECT') AS session_tenant_select,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_asset_upload_sessions', 'asset_id', 'SELECT') AS session_asset_select,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_asset_upload_sessions', 'upload_status', 'SELECT') AS session_status_select,
              pg_catalog.has_table_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_asset_upload_sessions', 'UPDATE') AS session_update,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_assets', 'tenant_id', 'SELECT') AS asset_tenant_select,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_assets', 'asset_id', 'SELECT') AS asset_id_select,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_assets', 'upload_status', 'SELECT') AS asset_status_select,
              pg_catalog.has_table_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_assets', 'UPDATE') AS asset_update,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_asset_application_links', 'tenant_id', 'SELECT') AS link_tenant_select,
              pg_catalog.has_column_privilege('eper_customer_asset_scan_supervisor_definer',
                'public.eper_customer_asset_application_links', 'application_id', 'SELECT') AS link_application_select,
              pg_catalog.pg_has_role('eper_customer_asset_scan_supervisor_definer',
                'eper_customer_asset_access', 'USAGE') AS inherits_asset_runtime_role
         FROM pg_catalog.pg_proc p
        WHERE p.oid = 'public.eper_recover_exhausted_customer_asset_scan_jobs(varchar,varchar,varchar,integer)'::regprocedure`,
    );
    console.log("[scan-supervisor-recovery privilege probe]", privilegeProbe.rows[0]);
    assert.equal(privilegeProbe.rows[0].recovery_function_owner,
      "eper_customer_asset_scan_supervisor_definer");
    assert.equal(privilegeProbe.rows[0].recovery_is_security_definer, true);
    assert.equal(privilegeProbe.rows[0].session_update, false,
      "supervisor definer must not have table-wide upload-session UPDATE");
    assert.equal(privilegeProbe.rows[0].asset_update, false,
      "supervisor definer must not have table-wide asset UPDATE");
    assert.equal(privilegeProbe.rows[0].inherits_asset_runtime_role, false,
      "supervisor definer must not inherit the customer asset runtime role");

    // Execute isolated probes as the real SECURITY DEFINER owner. This distinguishes
    // base SELECT, row-lock and asset-policy failures without widening any grants.
    await pool.query(`
      CREATE OR REPLACE FUNCTION public.eper_test_probe_scan_recovery_privilege(
        p_tenant_id varchar, p_application_id varchar, p_upload_session_id uuid, p_asset_id uuid
      ) RETURNS jsonb
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = pg_catalog
      SET row_security = on
      AS $probe$
      DECLARE v_result jsonb := '{}'::jsonb; v_code text; v_message text;
      BEGIN
        PERFORM pg_catalog.set_config('eper.tenant_id', p_tenant_id, true);
        PERFORM pg_catalog.set_config('eper.application_id', p_application_id, true);
        BEGIN
          PERFORM s.asset_id FROM public.eper_customer_asset_upload_sessions s
           WHERE s.tenant_id = p_tenant_id AND s.application_id = p_application_id
             AND s.upload_session_id = p_upload_session_id;
          v_result := v_result || jsonb_build_object('session_select', 'ok');
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
          v_result := v_result || jsonb_build_object('session_select', v_code || ': ' || v_message);
        END;
        BEGIN
          PERFORM s.asset_id FROM public.eper_customer_asset_upload_sessions s
           WHERE s.tenant_id = p_tenant_id AND s.application_id = p_application_id
             AND s.upload_session_id = p_upload_session_id
           FOR UPDATE SKIP LOCKED;
          v_result := v_result || jsonb_build_object('session_for_update', 'ok');
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
          v_result := v_result || jsonb_build_object('session_for_update', v_code || ': ' || v_message);
        END;
        BEGIN
          PERFORM a.asset_id FROM public.eper_customer_assets a
           WHERE a.tenant_id = p_tenant_id AND a.asset_id = p_asset_id;
          v_result := v_result || jsonb_build_object('asset_select', 'ok');
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
          v_result := v_result || jsonb_build_object('asset_select', v_code || ': ' || v_message);
        END;
        v_result := v_result || jsonb_build_object(
          'session_policies', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'name', policyname, 'command', cmd, 'roles', roles,
              'qual', qual, 'with_check', with_check
            )), '[]'::jsonb)
              FROM pg_catalog.pg_policies
             WHERE schemaname = 'public'
               AND tablename = 'eper_customer_asset_upload_sessions'
          ),
          'session_triggers', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'name', t.tgname, 'definition', pg_catalog.pg_get_triggerdef(t.oid)
            )), '[]'::jsonb)
              FROM pg_catalog.pg_trigger t
              JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
              JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relname = 'eper_customer_asset_upload_sessions'
               AND NOT t.tgisinternal
          ),
          'session_constraints', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'name', con.conname, 'definition', pg_catalog.pg_get_constraintdef(con.oid)
            )), '[]'::jsonb)
              FROM pg_catalog.pg_constraint con
             WHERE con.conrelid = 'public.eper_customer_asset_upload_sessions'::regclass
          )
        );
        RETURN v_result;
      END
      $probe$;
      ALTER FUNCTION public.eper_test_probe_scan_recovery_privilege(varchar,varchar,uuid,uuid)
        OWNER TO eper_customer_asset_scan_supervisor_definer;
      REVOKE ALL ON FUNCTION public.eper_test_probe_scan_recovery_privilege(varchar,varchar,uuid,uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.eper_test_probe_scan_recovery_privilege(varchar,varchar,uuid,uuid)
        TO eper_customer_asset_scan_supervisor_access;
    `);
    const isolatedProbe = await supervisorPool.query(
      'SELECT public.eper_test_probe_scan_recovery_privilege($1,$2,$3,$4) AS result',
      [fixture.tenantId, fixture.applicationId, fixture.uploadSessionId, fixture.assetId],
    );
    console.log("[scan-supervisor-recovery isolated privilege probes]", isolatedProbe.rows[0]?.result);
    assert.equal(isolatedProbe.rows[0]?.result?.session_select, "ok");
    assert.equal(isolatedProbe.rows[0]?.result?.session_for_update, "ok",
      "supervisor definer must have the narrow row-lock capability needed by recovery");
    assert.equal(isolatedProbe.rows[0]?.result?.asset_select, "ok");
    await pool.query('DROP FUNCTION public.eper_test_probe_scan_recovery_privilege(varchar,varchar,uuid,uuid)');

    const supervisorRepository = new PostgresCustomerAssetRepository(pool, supervisorPool);

    // A row locked by another transaction must be skipped, not waited on or
    // partially transitioned. The recovery operation should return zero.
    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query(
        "SELECT upload_session_id FROM public.eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = $2 FOR UPDATE",
        [fixture.tenantId, fixture.uploadSessionId],
      );
      assert.equal(await supervisorRepository.recoverExhaustedScanJobsAsSupervisor({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        scannerServiceId, environment: "sandbox", limit: 5,
      }), 0, "locked upload session must be skipped");
      const skippedState = await pool.query(
        `SELECT a.upload_status, a.scan_status, a.lifecycle_status, j.state
           FROM public.eper_customer_assets a
           JOIN public.eper_customer_asset_scan_jobs j
             ON j.tenant_id = a.tenant_id AND j.asset_id = a.asset_id
          WHERE a.tenant_id = $1 AND a.asset_id = $2`,
        [fixture.tenantId, fixture.assetId],
      );
      assert.equal(skippedState.rows[0].upload_status, "scanning");
      assert.equal(skippedState.rows[0].state, "leased");
    } finally {
      await lockClient.query("ROLLBACK");
      lockClient.release();
    }

    // Force the canonical audit append to fail. The recovery transition and
    // quarantine must roll back with it, leaving the expired job recoverable.
    await pool.query("REVOKE INSERT ON public.eper_audit_events FROM eper_customer_asset_scan_audit_writer");
    try {
      await assert.rejects(
        supervisorRepository.recoverExhaustedScanJobsAsSupervisor({
          tenantId: fixture.tenantId, applicationId: fixture.applicationId,
          scannerServiceId, environment: "sandbox", limit: 5,
        }),
        error => error.code === "42501",
        "audit append failure must abort the recovery transaction",
      );
    } finally {
      await pool.query("GRANT INSERT ON public.eper_audit_events TO eper_customer_asset_scan_audit_writer");
    }
    const rolledBackState = await pool.query(
      `SELECT a.upload_status, a.scan_status, a.lifecycle_status, j.state
         FROM public.eper_customer_assets a
         JOIN public.eper_customer_asset_scan_jobs j
           ON j.tenant_id = a.tenant_id AND j.asset_id = a.asset_id
        WHERE a.tenant_id = $1 AND a.asset_id = $2`,
      [fixture.tenantId, fixture.assetId],
    );
    assert.deepEqual(rolledBackState.rows[0], {
      upload_status: "scanning", scan_status: "pending",
      lifecycle_status: "active", state: "leased",
    }, "failed audit append must roll back asset and job transitions");

    assert.equal(await supervisorRepository.recoverExhaustedScanJobsAsSupervisor({
      tenantId: fixture.tenantId, applicationId: fixture.applicationId,
      scannerServiceId, environment: "sandbox", limit: 5,
    }), 1);
    await assert.rejects(
      supervisorPool.query("SELECT * FROM public.eper_customer_asset_scan_jobs"),
      error => error.code === "42501",
    );
    const state = await pool.query(
      `SELECT a.upload_status, a.scan_status, a.lifecycle_status, j.state
         FROM public.eper_customer_assets a
         JOIN public.eper_customer_asset_scan_jobs j
           ON j.tenant_id = a.tenant_id AND j.asset_id = a.asset_id
        WHERE a.tenant_id = $1 AND a.asset_id = $2`,
      [fixture.tenantId, fixture.assetId],
    );
    assert.deepEqual(state.rows[0], {
      upload_status: "failed", scan_status: "error",
      lifecycle_status: "quarantined", state: "dead_letter",
    });
    const audit = await pool.query(
      `SELECT action FROM public.eper_audit_events
        WHERE tenant_id = $1 AND correlation_id = $2
          AND action = 'customer.asset.scan.exhausted'`,
      [fixture.tenantId, fixture.correlationId],
    );
    assert.equal(audit.rowCount, 1, "state transition must have its canonical audit event");
  } finally {
    await supervisorPool.end();
    await pool.query(
      "DELETE FROM public.eper_customer_asset_scan_supervisor_identities WHERE login_role = $1",
      [role],
    ).catch(() => {});
    await pool.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
    await pool.end();
  }
});


test("PostgreSQL 16 scanner-supervisor LOGIN claims only jobs in its exact mapped scope",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 5 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-supervisor-claim");
    const workerId = "ci-asset-scanner:supervisor-claim-test";
    const scannerServiceId = "ci-asset-scanner";
    const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
    const role = "eper_scan_supervisor_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    const supervisorUrl = new URL(connectionString);
    supervisorUrl.username = role;
    supervisorUrl.password = password;
    const supervisorPool = new Pool({ connectionString: supervisorUrl.toString(), max: 1 });
    try {
      await pool.query(
        `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await pool.query(`GRANT eper_customer_asset_scan_supervisor_access TO "${role}"`);
      await pool.query(
        `INSERT INTO public.eper_customer_asset_scan_supervisor_identities
           (login_role, tenant_id, application_id, worker_id, scanner_service_id, enabled)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [role, fixture.tenantId, fixture.applicationId, workerId, scannerServiceId],
      );

      const boundary = await supervisorPool.query(`
        SELECT
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'SELECT') AS can_select_jobs,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'UPDATE') AS can_update_jobs,
          has_function_privilege(current_user,
            'public.eper_claim_customer_asset_scan_jobs(varchar,varchar,varchar,varchar,integer,integer)',
            'EXECUTE') AS can_claim
      `);
      assert.deepEqual(boundary.rows[0], {
        can_select_jobs: false,
        can_update_jobs: false,
        can_claim: true,
      });

      const claim = (tenantId = fixture.tenantId, applicationId = fixture.applicationId) =>
        supervisorPool.query(
          `SELECT * FROM public.eper_claim_customer_asset_scan_jobs($1, $2, $3, $4, $5, $6)`,
          [tenantId, applicationId, workerId, scannerServiceId, 5, 30_000],
        );
      const claimed = await claim();
      assert.equal(claimed.rowCount, 1, "the mapped supervisor should claim the due job");
      assert.equal(claimed.rows[0].asset_id, fixture.assetId);
      assert.equal(claimed.rows[0].upload_session_id, fixture.uploadSessionId);
      assert.equal(Number(claimed.rows[0].attempt_count), 1);
      assert.equal(Number(claimed.rows[0].claim_generation), 1);
      assert.equal((await claim()).rowCount, 0, "a live lease must not be claimed twice");
      await assert.rejects(
        claim(fixture.tenantId, fixture.applicationId + "-other"),
        /EPER_CUSTOMER_ASSET_SCAN_SUPERVISOR_IDENTITY_DENIED/,
      );
      await assert.rejects(
        supervisorPool.query("SELECT * FROM public.eper_customer_asset_scan_jobs"),
        error => error.code === "42501",
      );
      await assert.rejects(
        supervisorPool.query("UPDATE public.eper_customer_asset_scan_jobs SET attempt_count = 99"),
        error => error.code === "42501",
      );
    } finally {
      await supervisorPool.end();
      await pool.query(
        "DELETE FROM public.eper_customer_asset_scan_supervisor_identities WHERE login_role = $1",
        [role],
      ).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
      await pool.end();
    }
  });


test("PostgreSQL 16 scanner child LOGIN is bound to its exact SPIFFE identity and read-only scan-input function",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 5 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const fixture = await createPendingScanFixture(pool, repository, "scan-child-spiffe");
    const workerId = "ci-asset-scanner:spiffe-child-test";
    const scannerServiceId = "ci-asset-scanner";
    const spiffeId = "spiffe://eper.example/asset-scanner/ci-child";
    const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
    const role = "eper_scan_child_" + suffix;
    const password = randomUUID().replaceAll("-", "");
    const childUrl = new URL(connectionString);
    childUrl.username = role;
    childUrl.password = password;
    const childPool = new Pool({ connectionString: childUrl.toString(), max: 1 });
    try {
      const [job] = await repository.claimScanJobs({
        tenantId: fixture.tenantId, applicationId: fixture.applicationId,
        workerId, scannerServiceId, environment: "sandbox", limit: 1, leaseMs: 30_000,
      });
      assert.ok(job);
      await pool.query(
        `CREATE ROLE "${role}" WITH LOGIN INHERIT PASSWORD '${password}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await pool.query(`GRANT eper_customer_asset_scan_child_access TO "${role}"`);
      await pool.query(
        `INSERT INTO public.eper_customer_asset_scan_child_identities
           (login_role, tenant_id, application_id, worker_id, scanner_service_id,
            spiffe_id, provider_connection_id, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [role, fixture.tenantId, fixture.applicationId, workerId, scannerServiceId, spiffeId, "ci-storage-connection"],
      );

      const boundary = await childPool.query(`
        SELECT
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'SELECT') AS can_select_jobs,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'UPDATE') AS can_update_jobs,
          has_table_privilege(current_user, 'public.eper_customer_assets', 'SELECT') AS can_select_assets,
          has_table_privilege(current_user, 'public.eper_customer_assets', 'UPDATE') AS can_update_assets,
          has_function_privilege(current_user,
            'public.eper_resolve_customer_asset_scan_child_context(uuid,bigint)',
            'EXECUTE') AS can_resolve_input
      `);
      assert.deepEqual(boundary.rows[0], {
        can_select_jobs: false,
        can_update_jobs: false,
        can_select_assets: false,
        can_update_assets: false,
        can_resolve_input: true,
      });

      const resolveInput = (claimGeneration = job.claimGeneration) =>
        childPool.query(
          `SELECT * FROM public.eper_resolve_customer_asset_scan_child_context($1, $2)`,
          [fixture.assetId, claimGeneration],
        );
      const resolved = await resolveInput();
      assert.equal(resolved.rowCount, 1);
      assert.equal(resolved.rows[0].asset_id, fixture.assetId);
      assert.equal(resolved.rows[0].storage_adapter_key, "ci-storage");
      assert.equal(resolved.rows[0].checksum_sha256, createHash("sha256").update(fixture.testObjectBytes).digest("hex"));
      const staleGeneration = await resolveInput(job.claimGeneration + 1);
      assert.equal(staleGeneration.rowCount, 0, "stale claim generation must resolve no scan input");
      const staleGenerationAgain = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_context($1, $2)`,
        [fixture.assetId, job.claimGeneration + 1],
      );
      assert.equal(staleGenerationAgain.rowCount, 0, "stale claim generation must resolve no scan input");
      await assert.rejects(
        childPool.query("SELECT * FROM public.eper_customer_asset_scan_jobs"),
        error => error.code === "42501",
      );
    } finally {
      await childPool.end();
      await pool.query(
        "DELETE FROM public.eper_customer_asset_scan_child_identities WHERE login_role = $1",
        [role],
      ).catch(() => {});
      await pool.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
      await pool.end();
    }
  });
