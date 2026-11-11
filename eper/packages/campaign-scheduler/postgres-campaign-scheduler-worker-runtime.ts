import { createPostgresPaymentPool, type PostgresPoolHandle } from "../payments/postgres-payment-runtime.js";

/**
 * Create the worker's dedicated least-privilege PostgreSQL pool.
 * Unlike API/adapter pools, this connection must never fall back to DATABASE_URL.
 */
export function createPostgresCampaignSchedulerWorkerPool(
  env: NodeJS.ProcessEnv = process.env,
): PostgresPoolHandle {
  const connectionString = env.EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL_REQUIRED");
  }
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL_INVALID");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("EPER_CAMPAIGN_SCHEDULER_WORKER_DATABASE_URL_INVALID");
  }
  return createPostgresPaymentPool({
    ...env,
    EPER_PAYMENT_DATABASE_URL: connectionString,
    DATABASE_URL: "",
  }, "eper-campaign-scheduler-worker");
}
