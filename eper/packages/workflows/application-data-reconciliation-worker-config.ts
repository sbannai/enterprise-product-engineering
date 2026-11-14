import { randomUUID } from "node:crypto";

export interface ApplicationDataReconciliationWorkerConfig {
  databaseUrl: string;
  expectedDatabaseRole: string;
  workerId: string;
  environment: "production" | "uat" | "sandbox";
  idlePollMs: number;
  maxContexts: number;
  leaseMilliseconds: number;\n  maxAttempts: number;
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}
function bounded(env: Readonly<Record<string, string | undefined>>, name: string, fallback: number,
  minimum: number, maximum: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(name + "_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(name + "_OUT_OF_RANGE");
  return value;
}

export function readApplicationDataReconciliationWorkerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ApplicationDataReconciliationWorkerConfig {
  if (env.EPER_APPLICATION_DATA_RECONCILIATION_WORKER_ENABLED !== "true") {
    throw new Error("EPER_APPLICATION_DATA_RECONCILIATION_WORKER_DISABLED");
  }
  if (env.EPER_AUDIT_PERSISTENCE !== "postgres") {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_REQUIRES_POSTGRES_AUDIT");
  }
  const databaseUrl = required(env, "EPER_APPLICATION_DATA_RECONCILIATION_DATABASE_URL");
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_DATABASE_URL_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.username) {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_DATABASE_URL_INVALID");
  }
  let urlRole: string;
  try { urlRole = decodeURIComponent(parsed.username); } catch {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_DATABASE_URL_INVALID");
  }
  const expectedDatabaseRole = required(env, "EPER_APPLICATION_DATA_RECONCILIATION_EXPECTED_DATABASE_ROLE");
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(expectedDatabaseRole) || expectedDatabaseRole === "eper" ||
      urlRole !== expectedDatabaseRole) {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_DATABASE_ROLE_MISMATCH");
  }
  const environment = required(env, "EPER_ENVIRONMENT");
  if (!["production", "uat", "sandbox"].includes(environment)) {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_ENVIRONMENT_INVALID");
  }
  const workerId = env.EPER_APPLICATION_DATA_RECONCILIATION_WORKER_ID?.trim() || "eper-data-reconcile-" + randomUUID();
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(workerId)) {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_WORKER_ID_INVALID");
  }
  return {
    databaseUrl, expectedDatabaseRole, workerId,
    environment: environment as ApplicationDataReconciliationWorkerConfig["environment"],
    idlePollMs: bounded(env, "EPER_APPLICATION_DATA_RECONCILIATION_IDLE_POLL_MS", 1_000, 50, 60_000),
    maxContexts: bounded(env, "EPER_APPLICATION_DATA_RECONCILIATION_MAX_CONTEXTS", 1_000, 1, 10_000),
    leaseMilliseconds: bounded(env, "EPER_APPLICATION_DATA_RECONCILIATION_LEASE_MS", 60_000, 1_000, 3_600_000),\n    maxAttempts: bounded(env, "EPER_APPLICATION_DATA_RECONCILIATION_MAX_ATTEMPTS", 8, 1, 100),
  };
}
