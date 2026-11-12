import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { PostgresCustomerAssetRepository } from "../../packages/assets/postgres-customer-asset-repository.js";
import { runCustomerAssetScanWorker, type CustomerAssetScanner } from "../../packages/assets/customer-asset-scan-worker.js";
import type { AuditEnvironment } from "../../packages/audit/audit-event-store.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}
function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(raw.trim())) throw new Error(name + "_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(name + "_OUT_OF_RANGE");
  return value;
}
function resolveScannerPath(value: string): string {
  const root = resolve(process.cwd(), "dist/packages/assets/scanners");
  const candidate = resolve(process.cwd(), value);
  const rel = relative(root, candidate);
  if (!value.startsWith("./dist/packages/assets/scanners/") ||
      !rel || rel === ".." || rel.startsWith(".." + sep) || !candidate.endsWith(".js")) {
    throw new Error("CUSTOMER_ASSET_SCANNER_MODULE_PATH_INVALID");
  }
  return candidate;
}

if (process.env.EPER_CUSTOMER_ASSET_SCAN_WORKER_ENABLED !== "true") {
  throw new Error("EPER_CUSTOMER_ASSET_SCAN_WORKER_DISABLED");
}
if (process.env.EPER_CUSTOMER_ASSET_PERSISTENCE !== "postgres" ||
    process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
  throw new Error("CUSTOMER_ASSET_SCAN_WORKER_REQUIRES_POSTGRES");
}
const scannerServiceId = required("EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID");
if (!/^[a-zA-Z0-9._:-]{2,128}$/.test(scannerServiceId)) throw new Error("CUSTOMER_ASSET_SCANNER_SERVICE_ID_INVALID");
const workerId = required("EPER_CUSTOMER_ASSET_SCAN_WORKER_ID");
if (!workerId.startsWith(scannerServiceId + ":") || workerId.length > 128) {
  throw new Error("CUSTOMER_ASSET_SCAN_WORKER_ID_INVALID");
}
const tenantId = required("EPER_CUSTOMER_ASSET_SCAN_TENANT_ID");
const applicationId = required("EPER_CUSTOMER_ASSET_SCAN_APPLICATION_ID");
const scannerModulePath = resolveScannerPath(required("EPER_CUSTOMER_ASSET_SCANNER_MODULE"));
const environment = (process.env.EPER_AUDIT_ENVIRONMENT ?? "sandbox") as AuditEnvironment;
if (!["production", "uat", "sandbox"].includes(environment)) throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");
if (environment === "production" || process.env.EPER_ENVIRONMENT === "production") {
  throw new Error("CUSTOMER_ASSET_SCAN_CHILD_PROCESS_ISOLATION_REQUIRED");
}

const controller = new AbortController();
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("EPER customer asset scan worker shutting down");
  controller.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => shutdown(signal));

const workerDatabaseUrl = required("EPER_CUSTOMER_ASSET_SCAN_DATABASE_URL");
const pool = createPostgresPaymentPool({
  ...process.env,
  EPER_PAYMENT_DATABASE_URL: workerDatabaseUrl,
});
try {
  const repository = new PostgresCustomerAssetRepository(pool);
  await repository.assertReady();
  await assertAuditStoreReady(pool);
  const module = await import(pathToFileURL(scannerModulePath).href) as {
    createCustomerAssetScanner?: (context: { pool: typeof pool; env: NodeJS.ProcessEnv }) =>
      Promise<CustomerAssetScanner> | CustomerAssetScanner;
  };
  if (typeof module.createCustomerAssetScanner !== "function") {
    throw new Error("CUSTOMER_ASSET_SCANNER_FACTORY_REQUIRED");
  }
  const scanner = await module.createCustomerAssetScanner({ pool, env: process.env });
  if (!scanner || typeof scanner.scan !== "function") throw new Error("CUSTOMER_ASSET_SCANNER_CONTRACT_INVALID");
  console.log("EPER customer asset scan worker started");
  await runCustomerAssetScanWorker({
    repository, scanner, tenantId, applicationId, workerId, scannerServiceId, environment,
    signal: controller.signal,
    pollIntervalMs: boundedInteger("EPER_CUSTOMER_ASSET_SCAN_POLL_INTERVAL_MS", 1_000, 100, 60_000),
    leaseMs: boundedInteger("EPER_CUSTOMER_ASSET_SCAN_LEASE_MS", 60_000, 5_000, 900_000),
    batchSize: boundedInteger("EPER_CUSTOMER_ASSET_SCAN_BATCH_SIZE", 10, 1, 50),
    concurrency: boundedInteger("EPER_CUSTOMER_ASSET_SCAN_CONCURRENCY", 2, 1, 10),
    scanTimeoutMs: boundedInteger("EPER_CUSTOMER_ASSET_SCAN_TIMEOUT_MS", 120_000, 1_000, 900_000),
    // Never emit provider exceptions, opaque upload references, tenant IDs or session IDs to logs.
    onError() { console.error("EPER customer asset scan worker operation failed"); },
    onJob(result) { console.log("EPER customer asset scan job outcome", result.outcome); },
  });
} finally {
  await pool.end();
}
