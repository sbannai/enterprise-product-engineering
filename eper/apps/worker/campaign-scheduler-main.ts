import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { PostgresCampaignSchedulerStore } from "../../packages/campaign-scheduler/postgres-campaign-scheduler-store.js";
import { runCampaignExecutionWorker } from "../../packages/campaign-scheduler/campaign-execution-worker.js";
import type { CampaignWorkerAdapterFactory } from "../../packages/campaign-scheduler/campaign-worker-adapter.js";
import { assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}

function resolveAdapterPath(value: string): string {
  const adapterRoot = resolve(process.cwd(), "dist/packages/campaign-scheduler/adapters");
  const candidate = resolve(process.cwd(), value);
  const rel = relative(adapterRoot, candidate);
  if (!value.startsWith("./dist/packages/campaign-scheduler/adapters/") ||
      !rel || rel === ".." || rel.startsWith(".." + sep) || !candidate.endsWith(".js")) {
    throw new Error("CAMPAIGN_WORKER_ADAPTER_PATH_INVALID");
  }
  return candidate;
}

if (process.env.EPER_CAMPAIGN_SCHEDULER_WORKER_ENABLED !== "true") {
  throw new Error("EPER_CAMPAIGN_SCHEDULER_WORKER_DISABLED");
}
if (process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
  throw new Error("CAMPAIGN_WORKER_REQUIRES_DURABLE_AUDIT");
}

const workerId = required("EPER_CAMPAIGN_SCHEDULER_WORKER_ID");
const adapterPath = resolveAdapterPath(required("EPER_CAMPAIGN_WORKER_ADAPTER_MODULE"));
const auditEnvironment = process.env.EPER_AUDIT_ENVIRONMENT ?? "sandbox";
if (!["production", "uat", "sandbox"].includes(auditEnvironment)) {
  throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");
}
const pool = createPostgresPaymentPool();
const store = new PostgresCampaignSchedulerStore(
  pool,
  auditEnvironment as "production" | "uat" | "sandbox",
  process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID,
);

const controller = new AbortController();
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("EPER campaign worker shutting down", signal);
  controller.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void shutdown(signal); });
}

try {
  await store.assertReady();
  await assertAuditStoreReady(pool);
  const adapterModule = await import(pathToFileURL(adapterPath).href) as {
    createCampaignWorkerAdapter?: CampaignWorkerAdapterFactory;
  };
  if (typeof adapterModule.createCampaignWorkerAdapter !== "function") {
    throw new Error("CAMPAIGN_WORKER_ADAPTER_FACTORY_REQUIRED");
  }
  const adapter = await adapterModule.createCampaignWorkerAdapter({ pool, env: process.env });
  if (!adapter || typeof adapter.authorizeDispatch !== "function" ||
      typeof adapter.dispatch !== "function") {
    throw new Error("CAMPAIGN_WORKER_ADAPTER_CONTRACT_INVALID");
  }
  console.log("EPER campaign worker started", { workerId });
  await runCampaignExecutionWorker(store, adapter.dispatch, {
    workerId,
    signal: controller.signal,
    authorizeDispatch: adapter.authorizeDispatch,
    onError(error) { console.error("EPER campaign worker error", error); },
  });
} finally {
  await pool.end();
}
