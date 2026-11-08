import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { SqlPool } from "../../packages/payments/postgres-payment-store.js";

interface ExpiryWorkerPool extends SqlPool {
  end(): Promise<void>;
}
function createExpiryWorkerPool(env: NodeJS.ProcessEnv = process.env): ExpiryWorkerPool {
  const connectionString = env.EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED");
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID");
  }
  const bounded = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    if (!/^[0-9]+$/.test(raw.trim())) throw new Error(name + "_INVALID");
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(name + "_OUT_OF_RANGE");
    return value;
  };
  const require = createRequire(import.meta.url);
  const pg = require("pg") as {
    Pool: new (options: {
      connectionString: string; max: number; idleTimeoutMillis: number;
      connectionTimeoutMillis: number; statement_timeout: number;
      query_timeout: number; lock_timeout: number;
      idle_in_transaction_session_timeout: number; application_name: string;
    }) => ExpiryWorkerPool;
  };
  return new pg.Pool({
    connectionString,
    max: bounded("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX", 2, 1, 5),
    connectionTimeoutMillis: bounded("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_CONNECTION_TIMEOUT_MS", 5_000, 500, 30_000),
    idleTimeoutMillis: bounded("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TIMEOUT_MS", 10_000, 1_000, 60_000),
    statement_timeout: bounded("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_STATEMENT_TIMEOUT_MS", 15_000, 500, 120_000),
    query_timeout: bounded("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_QUERY_TIMEOUT_MS", 20_000, 500, 120_000),
    lock_timeout: bounded("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_LOCK_TIMEOUT_MS", 5_000, 100, 60_000),
    idle_in_transaction_session_timeout: bounded("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_IDLE_TRANSACTION_TIMEOUT_MS", 10_000, 500, 120_000),
    application_name: "eper-customer-asset-upload-expiry-worker",
  });
}
import { assertAuditStoreReady, type AuditEnvironment } from "../../packages/audit/audit-event-store.js";
import { PostgresCustomerAssetRepository } from "../../packages/assets/postgres-customer-asset-repository.js";
import { runCustomerAssetUploadExpiryWorker } from "../../packages/assets/customer-asset-upload-expiry-worker.js";

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

if (process.env.EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED !== "true") {
  throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_DISABLED");
}
if (process.env.EPER_CUSTOMER_ASSET_PERSISTENCE !== "postgres" ||
    process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
  throw new Error("CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_REQUIRES_POSTGRES");
}
const tenantId = required("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_TENANT_ID");
const applicationId = required("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_APPLICATION_ID");
const environment = (process.env.EPER_AUDIT_ENVIRONMENT ?? "sandbox") as AuditEnvironment;
if (!["production", "uat", "sandbox"].includes(environment)) throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");

const controller = new AbortController();
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("EPER customer asset upload expiry worker shutting down");
  controller.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, shutdown);

const pool = createExpiryWorkerPool();
try {
  const repository = new PostgresCustomerAssetRepository(pool);
  await repository.assertReady();
  await assertAuditStoreReady(pool);
  console.log("EPER customer asset upload expiry worker started");
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId, applicationId, environment, correlationId: randomUUID(),
    signal: controller.signal,
    pollIntervalMs: boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS", 5_000, 100, 60_000),
    batchSize: boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_BATCH_SIZE", 100, 1, 500),
    // Do not emit tenant identifiers, session identifiers or database/provider details.
    onError() { console.error("EPER customer asset upload expiry worker operation failed"); },
    onBatch(count) { if (count > 0) console.log("EPER customer asset upload expiry batch", count); },
  });
} finally {
  await pool.end();
}
