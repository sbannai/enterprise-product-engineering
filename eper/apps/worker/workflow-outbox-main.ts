import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { Pool } from "pg";
import type { AuditSqlClient, AuditSqlPool, AuditSqlResult } from "../../packages/audit/audit-event-store.js";
import {
  createApprovedWorkflowOutboxDispatcher,
  type ApprovedWorkflowOutboxDispatcher,
} from "../../packages/workflows/workflow-outbox-dispatcher-adapter.js";
import { assertRestrictedWorkerDatabaseRole } from "../../packages/workflows/workflow-outbox-worker-database.js";
import { runWorkflowOutboxRuntime } from "../../packages/workflows/workflow-outbox-runtime.js";
import { readWorkflowOutboxWorkerConfig } from "../../packages/workflows/workflow-outbox-worker-config.js";
import { resolveWorkflowOutboxDispatcherRealPath } from "../../packages/workflows/workflow-outbox-dispatcher-module.js";

interface WorkflowOutboxDispatcherModule {
  createWorkflowOutboxDispatcher(input: {
    pool: Pool;
    env: NodeJS.ProcessEnv;
  }): Promise<ApprovedWorkflowOutboxDispatcher> | ApprovedWorkflowOutboxDispatcher;
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{1,95}$/.test(message) ? message : "WORKFLOW_OUTBOX_RUNTIME_ERROR";
}

function createAuditSqlPoolAdapter(pool: Pool): AuditSqlPool {
  return {
    async connect(): Promise<AuditSqlClient> {
      const client = await pool.connect();
      return {
        async query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<AuditSqlResult<Row>> {
          const result = await client.query(sql, values as never[] | undefined);
          return { rows: result.rows as Row[], rowCount: result.rowCount };
        },
        release() {
          client.release();
        },
      };
    },
  };
}

async function main(): Promise<void> {
  const config = readWorkflowOutboxWorkerConfig(process.env);
  const require = createRequire(import.meta.url);
  const pg = require("pg") as {
    Pool: new (options: {
      connectionString: string;
      max: number;
      connectionTimeoutMillis: number;
      idleTimeoutMillis: number;
      application_name: string;
    }) => Pool;
  };
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: "eper-workflow-outbox-worker",
  });
  const controller = new AbortController();
  let shuttingDown = false;
  const signalHandlers = new Map<"SIGINT" | "SIGTERM", () => void>();

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ event: "workflow_outbox_shutdown_requested", signal }));
    controller.abort(new Error("WORKFLOW_OUTBOX_SHUTDOWN"));
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = () => shutdown(signal);
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }

  try {
    await assertRestrictedWorkerDatabaseRole(pool, config.expectedDatabaseRole);

    const dispatcherPath = await resolveWorkflowOutboxDispatcherRealPath(config.dispatcherModulePath);
    const dispatcherModule = await import(pathToFileURL(dispatcherPath).href) as WorkflowOutboxDispatcherModule;
    if (typeof dispatcherModule.createWorkflowOutboxDispatcher !== "function") {
      throw new Error("WORKFLOW_OUTBOX_DISPATCHER_FACTORY_REQUIRED");
    }
    const adapter = await dispatcherModule.createWorkflowOutboxDispatcher({ pool, env: process.env });
    const dispatcher = createApprovedWorkflowOutboxDispatcher(adapter);

    console.log(JSON.stringify({
      event: "workflow_outbox_worker_started",
      workerId: config.workerId,
      databaseRole: config.expectedDatabaseRole,
      batchSize: config.batchSize,
      maxContexts: config.maxContexts,
    }));

    await runWorkflowOutboxRuntime({
      pool: createAuditSqlPoolAdapter(pool),
      dispatcher,
      workerId: config.workerId,
      maxContexts: config.maxContexts,
      worker: {
        maxAttempts: config.maxAttempts,
        leaseSeconds: config.leaseSeconds,
        baseRetryDelaySeconds: config.baseRetryDelaySeconds,
        maxRetryDelaySeconds: config.maxRetryDelaySeconds,
      },
      process: {
        batchSize: config.batchSize,
        idlePollMs: config.idlePollMs,
        maxContextsPerPass: config.maxContexts,
        onPass(result) {
          console.log(JSON.stringify({ event: "workflow_outbox_pass", ...result }));
        },
        onError(error) {
          console.error(JSON.stringify({ event: "workflow_outbox_error", code: safeErrorCode(error) }));
        },
      },
    }, controller.signal);
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    await pool.end();
  }
}

await main().catch((error) => {
  console.error(JSON.stringify({ event: "workflow_outbox_worker_fatal", code: safeErrorCode(error) }));
  process.exitCode = 1;
});
