import type { AuditSqlPool } from "../audit/audit-event-store.js";
import type { WorkflowOutboxContext } from "./postgres-workflow-outbox-store.js";
import type { WorkflowOutboxContextSource } from "./workflow-outbox-process.js";

interface ActiveAssignmentRow { tenant_id: string; application_id: string; }

/**
 * Discovers the tenant/application scopes an outbox worker is allowed to scan.
 *
 * This adapter must be constructed with the platform worker's restricted database
 * pool. It deliberately reads only the active tenant-application ownership
 * allowlist; request credentials and caller-supplied tenant IDs are never used.
 * The worker still applies tenant/application RLS for every outbox operation.
 */
export class PostgresWorkflowOutboxContextSource implements WorkflowOutboxContextSource {
  constructor(private readonly pool: AuditSqlPool, private readonly maxContexts = 1_000) {
    if (!Number.isSafeInteger(maxContexts) || maxContexts < 1 || maxContexts > 10_000) {
      throw new Error("WORKFLOW_OUTBOX_CONTEXT_LIMIT_INVALID");
    }
  }

  async listActiveContexts(signal?: AbortSignal): Promise<WorkflowOutboxContext[]> {
    if (signal?.aborted) return [];
    const client = await this.pool.connect();
    try {
      if (signal?.aborted) return [];
      const result = await client.query<ActiveAssignmentRow>(
        `SELECT tenant_id, application_id
           FROM eper_tenant_application_assignment
          WHERE assignment_status = 'active'
          ORDER BY tenant_id, application_id
          LIMIT $1`,
        [this.maxContexts + 1],
      );
      if (result.rows.length > this.maxContexts) {
        throw new Error("WORKFLOW_OUTBOX_CONTEXT_LIMIT_EXCEEDED");
      }
      const seen = new Set<string>();
      const contexts: WorkflowOutboxContext[] = [];
      for (const row of result.rows) {
        if (typeof row.tenant_id !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(row.tenant_id) ||
            typeof row.application_id !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(row.application_id)) {
          throw new Error("WORKFLOW_OUTBOX_CONTEXT_ROW_INVALID");
        }
        const key = row.tenant_id + "\u0000" + row.application_id;
        if (seen.has(key)) throw new Error("WORKFLOW_OUTBOX_CONTEXT_DUPLICATE");
        seen.add(key);
        contexts.push({ tenantId: row.tenant_id, applicationId: row.application_id });
      }
      return contexts;
    } finally {
      client.release();
    }
  }
}
