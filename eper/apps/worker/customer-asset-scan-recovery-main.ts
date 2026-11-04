import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { PostgresCustomerAssetRepository } from "../../packages/assets/postgres-customer-asset-repository.js";
import type { AuditEnvironment } from "../../packages/audit/audit-event-store.js";

function waitForNextPass(signal: AbortSignal, intervalMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = (): void => finish();
    timer = setTimeout(finish, intervalMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) finish();
  });
}

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

if (process.env.EPER_CUSTOMER_ASSET_SCAN_RECOVERY_ENABLED !== "true") {
  throw new Error("EPER_CUSTOMER_ASSET_SCAN_RECOVERY_DISABLED");
}
if (process.env.EPER_CUSTOMER_ASSET_PERSISTENCE !== "postgres" ||
    process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
  throw new Error("CUSTOMER_ASSET_SCAN_RECOVERY_REQUIRES_POSTGRES");
}
const tenantId = required("EPER_CUSTOMER_ASSET_SCAN_RECOVERY_TENANT_ID");
const applicationId = required("EPER_CUSTOMER_ASSET_SCAN_RECOVERY_APPLICATION_ID");
const serviceId = required("EPER_CUSTOMER_ASSET_SCAN_RECOVERY_SERVICE_ID");
if (!/^[a-zA-Z0-9._:-]{2,128}$/.test(serviceId)) throw new Error("CUSTOMER_ASSET_SCAN_RECOVERY_SERVICE_ID_INVALID");
const environment = (process.env.EPER_AUDIT_ENVIRONMENT ?? "sandbox") as AuditEnvironment;
if (!["production", "uat", "sandbox"].includes(environment)) throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");
const intervalMs = boundedInteger("EPER_CUSTOMER_ASSET_SCAN_RECOVERY_INTERVAL_MS", 30_000, 1_000, 300_000);
const batchSize = boundedInteger("EPER_CUSTOMER_ASSET_SCAN_RECOVERY_BATCH_SIZE", 25, 1, 50);

const controller = new AbortController();
let stopping = false;
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  controller.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, shutdown);

const pool = createPostgresPaymentPool();
try {
  const repository = new PostgresCustomerAssetRepository(pool);
  await repository.assertReady();
  await assertAuditStoreReady(pool);
  console.log("EPER customer asset scan recovery started");
  while (!controller.signal.aborted) {
    try {
      const recovered = await repository.recoverExhaustedScanJobs({
        tenantId, applicationId, scannerServiceId: serviceId, environment, limit: batchSize,
      });
      if (recovered > 0) console.log("EPER customer asset scan recovery finalized jobs", recovered);
    } catch {
      // Avoid logging tenant identifiers, SQL details, provider references or credentials.
      console.error("EPER customer asset scan recovery operation failed");
    }
    if (controller.signal.aborted) break;
    await waitForNextPass(controller.signal, intervalMs);
  }
} finally {
  await pool.end();
}
