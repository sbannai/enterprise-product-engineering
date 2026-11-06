import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createPostgresCustomerAssetUploadExpiryPool } from "../../packages/assets/postgres-customer-asset-upload-expiry-runtime.js";
import { parseCustomerAssetUploadExpiryScopes } from "../../packages/assets/customer-asset-upload-expiry-config.js";
import { assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { PostgresCustomerAssetRepository } from "../../packages/assets/postgres-customer-asset-repository.js";
import { runCustomerAssetUploadExpiryWorker } from "../../packages/assets/customer-asset-upload-expiry-worker.js";

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

const scopes = parseCustomerAssetUploadExpiryScopes(
  process.env.EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_JSON,
);
const pollIntervalMs = boundedInteger(
  "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS", 5_000, 100, 60_000,
);
const batchSize = boundedInteger(
  "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_BATCH_SIZE", 100, 1, 500,
);
const healthPort = boundedInteger("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_HEALTH_PORT", 8081, 1, 65_535);

const controller = new AbortController();
let ready = false;
let shuttingDown = false;
let failures = 0;
const healthServer = createServer((request, response) => {
  if (request.url !== "/health/live" && request.url !== "/health/ready") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "not_found" }));
    return;
  }
  const live = !shuttingDown;
  const healthy = request.url === "/health/live" ? live : live && ready;
  response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
  response.end(JSON.stringify({
    status: request.url === "/health/live" ? (live ? "live" : "shutting_down")
      : (healthy ? "ready" : "not_ready"),
  }));
});

function listen(): Promise<void> {
  return new Promise((resolve, reject) => {
    healthServer.once("error", reject);
    healthServer.listen(healthPort, "0.0.0.0", () => {
      healthServer.removeListener("error", reject);
      resolve();
    });
  });
}
function closeHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!healthServer.listening) return resolve();
    healthServer.close(() => resolve());
  });
}
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  console.log(JSON.stringify({ event: "customer_asset_upload_expiry_shutdown" }));
  controller.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, shutdown);

const pool = createPostgresCustomerAssetUploadExpiryPool();
try {
  const repository = new PostgresCustomerAssetRepository(pool);
  await repository.assertReady();
  await assertAuditStoreReady(pool);
  await listen();
  ready = true;
  console.log(JSON.stringify({
    event: "customer_asset_upload_expiry_ready",
    scope_count: scopes.length,
    batch_size: batchSize,
    poll_interval_ms: pollIntervalMs,
  }));
  await Promise.all(scopes.map((scope, scopeIndex) =>
    runCustomerAssetUploadExpiryWorker({
      repository,
      ...scope,
      correlationId: randomUUID(),
      signal: controller.signal,
      pollIntervalMs,
      batchSize,
      onError() {
        failures += 1;
        console.error(JSON.stringify({
          event: "customer_asset_upload_expiry_failure",
          failures,
          scope_index: scopeIndex,
        }));
      },
      onBatch(expiredCount, durationMs) {
        console.log(JSON.stringify({
          event: "customer_asset_upload_expiry_batch",
          scope_index: scopeIndex,
          expired_count: expiredCount,
          batch_duration_ms: durationMs,
          failures,
        }));
      },
    }),
  ));
} finally {
  ready = false;
  shuttingDown = true;
  await closeHealthServer();
  await pool.end();
}
