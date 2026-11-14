import { createRequire } from "node:module";
import type { Pool } from "pg";
import type { AuditSqlClient, AuditSqlPool, AuditSqlResult } from "../../packages/audit/audit-event-store.js";
import { assertAuditStoreReady } from "../../packages/audit/audit-event-store.js";
import { ApplicationDataIntentReconciler } from "../../packages/workflows/application-data-intent-reconciler.js";
import { ApplicationDataReconciliationProcess } from "../../packages/workflows/application-data-reconciliation-process.js";
import { PostgresWorkflowOutboxContextSource } from "../../packages/workflows/postgres-workflow-outbox-context-source.js";
import { readApplicationDataReconciliationWorkerConfig } from "../../packages/workflows/application-data-reconciliation-worker-config.js";

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{1,95}$/.test(message) ? message : "WORKFLOW_APPLICATION_DATA_RECONCILIATION_RUNTIME_ERROR";
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
        release() { client.release(); },
      };
    },
  };
}

async function assertReconciliationSchemaReady(pool: Pool): Promise<void> {
  const result = await pool.query<{ intents_table: string | null; instances_table: string | null;
    transitions_table: string | null; definition_versions_table: string | null }>(`
    SELECT to_regclass('public.eper_workflow_application_data_intents')::text AS intents_table,
           to_regclass('public.eper_workflow_instances')::text AS instances_table,
           to_regclass('public.eper_workflow_transitions')::text AS transitions_table,
           to_regclass('public.eper_workflow_definition_versions')::text AS definition_versions_table
  `);
  const schema = result.rows[0];
  if (!schema?.intents_table || !schema.instances_table || !schema.transitions_table || !schema.definition_versions_table) {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_SCHEMA_NOT_READY");
  }
}

async function main(): Promise<void> {
  const config = readApplicationDataReconciliationWorkerConfig(process.env);
  const require = createRequire(import.meta.url);
  const pg = require("pg") as { Pool: new (options: {
    connectionString: string; max: number; connectionTimeoutMillis: number;
    idleTimeoutMillis: number; application_name: string;
  }) => Pool };
  const pool = new pg.Pool({
    connectionString: config.databaseUrl, max: 4, connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000, application_name: "eper-application-data-reconciliation",
  });
  const controller = new AbortController();
  let shuttingDown = false;
  const handlers = new Map<"SIGINT" | "SIGTERM", () => void>();
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ event: "application_data_reconciliation_shutdown_requested", signal }));
    controller.abort();
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = () => shutdown(signal);
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  try {
    const identity = await pool.query<{ role_name: string; is_superuser: boolean; bypasses_rls: boolean; has_reconcile_access: boolean; inherits_role_privileges: boolean }>(`
      SELECT current_user::text AS role_name, r.rolsuper AS is_superuser, r.rolbypassrls AS bypasses_rls, r.rolinherit AS inherits_role_privileges,
             pg_has_role(current_user, 'eper_application_data_reconcile_access', 'USAGE') AS has_reconcile_access
        FROM pg_roles r WHERE r.rolname = current_user
    `);
    const role = identity.rows[0];
    if (!role || role.role_name !== config.expectedDatabaseRole || role.is_superuser || role.bypasses_rls ||
        !role.has_reconcile_access || !role.inherits_role_privileges) {
      throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_DATABASE_ROLE_INVALID");
    }
    const auditPool = createAuditSqlPoolAdapter(pool);
    await assertAuditStoreReady(auditPool);
    await assertReconciliationSchemaReady(pool);

    const contexts = new PostgresWorkflowOutboxContextSource(auditPool, config.maxContexts);
    const reconciler: ApplicationDataIntentReconciler = new ApplicationDataIntentReconciler(auditPool, {
      workerId: config.workerId, leaseMilliseconds: config.leaseMilliseconds,
      environment: config.environment, serviceVersion: process.env.EPER_SERVICE_VERSION,
    });
    const reconciliationProcess = new ApplicationDataReconciliationProcess(reconciler, contexts, {
      idlePollMs: config.idlePollMs, maxContextsPerPass: config.maxContexts,
      onPass(result) {
        console.log(JSON.stringify({ event: "application_data_reconciliation_pass", workerId: config.workerId, ...result }));
      },
      onError(error, context) {
        console.error(JSON.stringify({
          event: "application_data_reconciliation_error", workerId: config.workerId,
          code: safeErrorCode(error), tenantId: context?.tenantId, applicationId: context?.applicationId,
        }));
      },
    });
    console.log(JSON.stringify({
      event: "application_data_reconciliation_worker_started",
      workerId: config.workerId, databaseRole: config.expectedDatabaseRole,
      maxContexts: config.maxContexts, idlePollMs: config.idlePollMs,
    }));
    await reconciliationProcess.run(controller.signal);
  } finally {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    await pool.end();
  }
}
await main().catch(error => {
  console.error(JSON.stringify({ event: "application_data_reconciliation_worker_fatal", code: safeErrorCode(error) }));
  process.exitCode = 1;
});
