import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { Pool } from "pg";
import { createApprovedWorkflowOutboxDispatcher, type ApprovedWorkflowOutboxDispatcher } from "../../packages/workflows/workflow-outbox-dispatcher-adapter.js";
import { runWorkflowOutboxRuntime } from "../../packages/workflows/workflow-outbox-runtime.js";
import { readWorkflowOutboxWorkerConfig } from "../../packages/workflows/workflow-outbox-worker-config.js";

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

async function assertRestrictedWorkerDatabaseRole(pool: Pool, expectedRole: string): Promise<void> {
  const client = await pool.connect();
  try {
    const identity = await client.query<{
      role_name: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT current_user::text AS role_name,
             r.rolsuper AS is_superuser,
             r.rolbypassrls AS bypasses_rls
        FROM pg_roles r
       WHERE r.rolname = current_user
    `);
    const role = identity.rows[0];
    if (!role || role.role_name !== expectedRole) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_MISMATCH");
    }
    if (role.is_superuser || role.bypasses_rls) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_PRIVILEGED");
    }

    const schema = await client.query<{
      assignments_table: string | null;
      events_table: string | null;
      delivery_table: string | null;
      events_rls: boolean | null;
      delivery_rls: boolean | null;
      events_owner: string | null;
      delivery_owner: string | null;
    }>(`
      SELECT to_regclass('public.eper_tenant_application_assignment')::text AS assignments_table,
             to_regclass('public.eper_workflow_outbox_events')::text AS events_table,
             to_regclass('public.eper_workflow_outbox_delivery')::text AS delivery_table,
             (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_events')) AS events_rls,
             (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_delivery')) AS delivery_rls,
             (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_events')) AS events_owner,
             (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = to_regclass('public.eper_workflow_outbox_delivery')) AS delivery_owner
    `);
    const tables = schema.rows[0];
    if (!tables?.assignments_table || !tables.events_table || !tables.delivery_table) {
      throw new Error("WORKFLOW_OUTBOX_SCHEMA_NOT_READY");
    }
    if (tables.events_rls !== true || tables.delivery_rls !== true ||
        tables.events_owner === expectedRole || tables.delivery_owner === expectedRole) {
      throw new Error("WORKFLOW_OUTBOX_RLS_BOUNDARY_INVALID");
    }

    const privileges = await client.query<{
      read_assignments: boolean;
      read_events: boolean;
      read_delivery: boolean;
      update_delivery: boolean;
      write_assignments: boolean;
      write_events: boolean;
      insert_delivery: boolean;
      delete_delivery: boolean;
    }>(`
      SELECT
        has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'SELECT') AS read_assignments,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'SELECT') AS read_events,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'SELECT') AS read_delivery,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'UPDATE') AS update_delivery,
        (has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'INSERT')
          OR has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'UPDATE')
          OR has_table_privilege(current_user, 'public.eper_tenant_application_assignment', 'DELETE')) AS write_assignments,
        (has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'INSERT')
          OR has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'UPDATE')
          OR has_table_privilege(current_user, 'public.eper_workflow_outbox_events', 'DELETE')) AS write_events,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'INSERT') AS insert_delivery,
        has_table_privilege(current_user, 'public.eper_workflow_outbox_delivery', 'DELETE') AS delete_delivery
    `);
    const grants = privileges.rows[0];
    if (!grants || !grants.read_assignments || !grants.read_events ||
        !grants.read_delivery || !grants.update_delivery ||
        grants.write_assignments || grants.write_events ||
        grants.insert_delivery || grants.delete_delivery) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_GRANTS_INVALID");
    }

    const inheritedPrivilege = await client.query<{ elevated_membership: boolean; owner_membership: boolean }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_roles r
           WHERE (r.rolsuper OR r.rolbypassrls)
             AND pg_has_role(current_user, r.rolname, 'MEMBER')
        ) AS elevated_membership,
        EXISTS (
          SELECT 1 FROM pg_class c
           WHERE c.oid IN (
             to_regclass('public.eper_workflow_outbox_events'),
             to_regclass('public.eper_workflow_outbox_delivery')
           )
             AND pg_has_role(current_user, pg_get_userbyid(c.relowner), 'MEMBER')
        ) AS owner_membership
    `);
    if (inheritedPrivilege.rows[0]?.elevated_membership || inheritedPrivilege.rows[0]?.owner_membership) {
      throw new Error("WORKFLOW_OUTBOX_DATABASE_ROLE_INHERITS_PRIVILEGE");
    }
  } finally {
    client.release();
  }
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

    const dispatcherRoot = await realpath(resolve(process.cwd(), "dist/apps/worker/dispatchers"));
    const dispatcherPath = await realpath(config.dispatcherModulePath);
    const dispatcherRelativePath = relative(dispatcherRoot, dispatcherPath);
    if (!dispatcherRelativePath || dispatcherRelativePath === ".." ||
        dispatcherRelativePath.startsWith(".." + sep) || !dispatcherPath.endsWith(".js")) {
      throw new Error("WORKFLOW_OUTBOX_DISPATCHER_MODULE_PATH_INVALID");
    }

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
      pool,
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
        onError(error, _context) {
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
