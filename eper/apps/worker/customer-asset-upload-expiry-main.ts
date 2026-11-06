import { randomUUID } from "node:crypto";
import { createCustomerAssetUploadExpiryPool } from "../../packages/assets/customer-asset-upload-expiry-runtime.js";
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

const queueAgeAlertMs = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_QUEUE_AGE_ALERT_MS", 900_000, 1_000, 86_400_000);
const failureAlertThreshold = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_FAILURE_ALERT_THRESHOLD", 3, 1, 100);
const poolMax = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX", 2, 1, 5);
const pollIntervalMs = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS", 5_000, 100, 60_000);
const batchSize = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_BATCH_SIZE", 100, 1, 500);
const maxBackoffMs = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_MAX_BACKOFF_MS", 60_000, 100, 300_000);
if (maxBackoffMs < pollIntervalMs) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_MAX_BACKOFF_MS_OUT_OF_RANGE");

const controller = new AbortController();
let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ event: "customer_asset_upload_expiry_worker_stopping" }));
  controller.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, shutdown);

const pool = createCustomerAssetUploadExpiryPool();
try {
  const repository = new PostgresCustomerAssetRepository(pool);
  await repository.assertReady();
  await repository.assertUploadExpiryWorkerReady();
  await assertAuditStoreReady(pool);
  console.log(JSON.stringify({ event: "customer_asset_upload_expiry_worker_ready", poolMax }));
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId, applicationId, environment, correlationId: randomUUID(),
    signal: controller.signal, pollIntervalMs, batchSize, maxBackoffMs,
    // Never emit tenant identifiers, session identifiers or raw database errors.
    onError(_error, consecutiveFailures) {
      console.error(JSON.stringify({
        event: "customer_asset_upload_expiry_batch_failed",
        consecutiveFailures,
        alert: consecutiveFailures >= failureAlertThreshold,
      }));
    },
    onBatch(metrics) {
      console.log(JSON.stringify({
        event: "customer_asset_upload_expiry_batch_completed",
        ...metrics,
        queueAgeAlert: metrics.queueAgeMs >= queueAgeAlertMs,
      }));
    },
  });
} finally {
  await pool.end();
  console.log(JSON.stringify({ event: "customer_asset_upload_expiry_worker_stopped" }));
}
