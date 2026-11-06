import { createPostgresPaymentPool } from "../../packages/payments/postgres-payment-runtime.js";
import { assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { PostgresAgentStore } from "../../packages/agents/postgres-agent-store.js";
import { processAgentJobOnce } from "../../packages/agents/agent-worker.js";
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

if (process.env.EPER_AGENT_WORKER_ENABLED !== "true") {
  throw new Error("EPER_AGENT_WORKER_DISABLED");
}
if (process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
  throw new Error("AGENT_WORKER_REQUIRES_DURABLE_AUDIT");
}
const workerId = required("EPER_AGENT_WORKER_ID");
const tenantId = required("EPER_AGENT_WORKER_TENANT_ID");
const applicationId = required("EPER_AGENT_WORKER_APPLICATION_ID");
const environment = (process.env.EPER_AUDIT_ENVIRONMENT ?? "sandbox") as AuditEnvironment;
if (!["production", "uat", "sandbox"].includes(environment)) throw new Error("EPER_AUDIT_ENVIRONMENT_INVALID");
const pollIntervalMs = boundedInteger("EPER_AGENT_WORKER_POLL_INTERVAL_MS", 1000, 100, 60000);
const leaseSeconds = boundedInteger("EPER_AGENT_WORKER_LEASE_SECONDS", 300, 5, 900);
const maxAttempts = boundedInteger("EPER_AGENT_WORKER_MAX_ATTEMPTS", 5, 1, 20);
const controller = new AbortController();
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("EPER agent worker shutting down", signal);
  controller.abort();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void shutdown(signal); });
}
const sleep = (ms: number) => new Promise<void>((resolve) => {
  if (controller.signal.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", done);
    resolve();
  }
  controller.signal.addEventListener("abort", done, { once: true });
});

const pool = createPostgresPaymentPool();
try {
  await assertAuditStoreReady(pool);
  const schemaClient = await pool.connect();
  try {
    const schema = await schemaClient.query<{ jobs: string | null; drafts: string | null; approvals: string | null; configs: string | null }>(`
      SELECT to_regclass('public.eper_agent_jobs')::text AS jobs,
             to_regclass('public.eper_agent_job_drafts')::text AS drafts,
             to_regclass('public.eper_agent_approvals')::text AS approvals,
             to_regclass('public.eper_agent_configurations')::text AS configs
    `);
    const tables = schema.rows[0];
    if (!tables || Object.values(tables).some((value) => !value)) {
      throw new Error("AGENT_WORKER_SCHEMA_NOT_READY");
    }
  } finally {
    schemaClient.release();
  }
  const store = new PostgresAgentStore(pool);
  console.log("EPER agent worker started", { workerId, tenantId, applicationId, pollIntervalMs });
  while (!controller.signal.aborted) {
    try {
      const result = await processAgentJobOnce({
        store, tenantId, applicationId, workerId, environment, leaseSeconds, maxAttempts,
      });
      if (result.outcome !== "idle") console.log("EPER agent job processed", result);
    } catch (error) {
      console.error("EPER agent worker iteration failed", error);
    }
    if (!controller.signal.aborted) await sleep(pollIntervalMs);
  }
} finally {
  await pool.end();
}
