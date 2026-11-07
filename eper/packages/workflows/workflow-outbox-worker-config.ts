import { isAbsolute, relative, resolve, sep } from "node:path";

export interface WorkflowOutboxWorkerConfig {
  databaseUrl: string;
  expectedDatabaseRole: string;
  workerId: string;
  dispatcherModulePath: string;
  batchSize: number;
  idlePollMs: number;
  maxContexts: number;
  maxAttempts: number;
  leaseSeconds: number;
  baseRetryDelaySeconds: number;
  maxRetryDelaySeconds: number;
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(name + "_REQUIRED");
  return value;
}

function boundedInteger(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(name + "_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(name + "_OUT_OF_RANGE");
  }
  return value;
}

/** Only deployment-bundled dispatcher modules are loadable by this worker. */
export function resolveWorkflowOutboxDispatcherModulePath(value: string, cwd = process.cwd()): string {
  const root = resolve(cwd, "dist/apps/worker/dispatchers");
  const candidate = resolve(cwd, value);
  const relativePath = relative(root, candidate);
  if (!value.startsWith("./dist/apps/worker/dispatchers/") ||
      !relativePath || relativePath === "." || relativePath === ".." ||
      relativePath.startsWith(".." + sep) || isAbsolute(relativePath) ||
      !candidate.endsWith(".js")) {
    throw new Error("WORKFLOW_OUTBOX_DISPATCHER_MODULE_PATH_INVALID");
  }
  return candidate;
}

export function readWorkflowOutboxWorkerConfig(
  env: Readonly<Record<string, string | undefined>>,
  cwd = process.cwd(),
): WorkflowOutboxWorkerConfig {
  if (env.EPER_WORKFLOW_OUTBOX_WORKER_ENABLED !== "true") {
    throw new Error("EPER_WORKFLOW_OUTBOX_WORKER_DISABLED");
  }
  if (env.EPER_AUDIT_PERSISTENCE !== "postgres") {
    throw new Error("WORKFLOW_OUTBOX_WORKER_REQUIRES_POSTGRES_AUDIT");
  }

  const databaseUrl = required(env, "EPER_WORKFLOW_OUTBOX_DATABASE_URL");
  const expectedDatabaseRole = required(env, "EPER_WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE");
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(expectedDatabaseRole) || expectedDatabaseRole === "eper") {
    throw new Error("WORKFLOW_OUTBOX_EXPECTED_DATABASE_ROLE_INVALID");
  }

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("WORKFLOW_OUTBOX_DATABASE_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) || !parsedDatabaseUrl.username) {
    throw new Error("WORKFLOW_OUTBOX_DATABASE_URL_INVALID");
  }
  let databaseRoleFromUrl: string;
  try {
    databaseRoleFromUrl = decodeURIComponent(parsedDatabaseUrl.username);
  } catch {
    throw new Error("WORKFLOW_OUTBOX_DATABASE_URL_INVALID");
  }
  if (databaseRoleFromUrl !== expectedDatabaseRole) {
    throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_MISMATCH");
  }

  const applicationDatabaseUrl = env.DATABASE_URL?.trim();
  if (applicationDatabaseUrl) {
    if (applicationDatabaseUrl === databaseUrl) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_MUST_BE_SEPARATE");
    }
    try {
      const applicationRole = decodeURIComponent(new URL(applicationDatabaseUrl).username);
      if (applicationRole && applicationRole === expectedDatabaseRole) {
        throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_MUST_BE_SEPARATE");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "WORKFLOW_OUTBOX_DATABASE_ROLE_MUST_BE_SEPARATE") throw error;
      throw new Error("APPLICATION_DATABASE_URL_INVALID");
    }
  }

  const workerId = required(env, "EPER_WORKFLOW_OUTBOX_WORKER_ID");
  if (!/^[a-zA-Z0-9._-]{2,128}$/.test(workerId)) {
    throw new Error("WORKFLOW_OUTBOX_WORKER_ID_INVALID");
  }
  const dispatcherModulePath = resolveWorkflowOutboxDispatcherModulePath(
    required(env, "EPER_WORKFLOW_OUTBOX_DISPATCHER_MODULE"),
    cwd,
  );

  const baseRetryDelaySeconds = boundedInteger(env, "EPER_WORKFLOW_OUTBOX_BASE_RETRY_DELAY_SECONDS", 5, 0, 86_400);
  const maxRetryDelaySeconds = boundedInteger(env, "EPER_WORKFLOW_OUTBOX_MAX_RETRY_DELAY_SECONDS", 3_600, baseRetryDelaySeconds, 86_400);

  return {
    databaseUrl,
    expectedDatabaseRole,
    workerId,
    dispatcherModulePath,
    batchSize: boundedInteger(env, "EPER_WORKFLOW_OUTBOX_BATCH_SIZE", 20, 1, 100),
    idlePollMs: boundedInteger(env, "EPER_WORKFLOW_OUTBOX_IDLE_POLL_MS", 1_000, 50, 60_000),
    maxContexts: boundedInteger(env, "EPER_WORKFLOW_OUTBOX_MAX_CONTEXTS", 1_000, 1, 10_000),
    maxAttempts: boundedInteger(env, "EPER_WORKFLOW_OUTBOX_MAX_ATTEMPTS", 8, 1, 100),
    leaseSeconds: boundedInteger(env, "EPER_WORKFLOW_OUTBOX_LEASE_SECONDS", 60, 10, 3_600),
    baseRetryDelaySeconds,
    maxRetryDelaySeconds,
  };
}
