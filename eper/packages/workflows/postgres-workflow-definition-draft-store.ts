import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import { validateWorkflowRuleConfiguration, type WorkflowDefinition } from "./workflow-configuration.js";
import { assertWorkflowCapabilityComposition } from "./workflow-capability-adapter.js";

export interface WorkflowDefinitionDraft {
  tenantId: string;
  applicationId: string;
  workflowId: string;
  draftVersion: number;
  definition: WorkflowDefinition;
  changeReason?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ReplaceWorkflowDefinitionDraftInput {
  tenantId: string;
  applicationId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  expectedVersion: number;
  changeReason?: string;
  changedBy: string;
  environment: AuditEnvironment;
  correlationId: string;
  serviceVersion?: string;
}

type DraftRow = {
  tenant_id: string;
  application_id: string;
  workflow_id: string;
  draft_version: number | string;
  definition: WorkflowDefinition | string;
  change_reason: string | null;
  created_at: string | Date;
  created_by: string;
  updated_at: string | Date;
  updated_by: string;
};

function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new Error("WORKFLOW_DRAFT_INVALID_" + name.toUpperCase());
  }
}
function mapDraft(row: DraftRow): WorkflowDefinitionDraft {
  return {
    tenantId: row.tenant_id,
    applicationId: row.application_id,
    workflowId: row.workflow_id,
    draftVersion: Number(row.draft_version),
    definition: typeof row.definition === "string" ? JSON.parse(row.definition) : row.definition,
    changeReason: row.change_reason ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by,
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by,
  };
}

/** Durable mutable draft store; published workflow snapshots remain immutable and separate. */
export class PostgresWorkflowDefinitionDraftStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        draft_table: string | null; row_security: boolean; force_row_security: boolean; policy_present: boolean;
      }>(`
        SELECT to_regclass('public.eper_workflow_definition_drafts')::text AS draft_table,
               COALESCE(c.relrowsecurity, false) AS row_security,
               COALESCE(c.relforcerowsecurity, false) AS force_row_security,
               EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public'
                          AND p.tablename = 'eper_workflow_definition_drafts'
                          AND p.policyname = 'tenant_application_isolation') AS policy_present
          FROM (SELECT 1) seed
          LEFT JOIN pg_class c ON c.oid = to_regclass('public.eper_workflow_definition_drafts')
      `);
      const row = result.rows[0];
      if (!row?.draft_table || !row.row_security || !row.force_row_security || !row.policy_present) {
        throw new Error("EPER_WORKFLOW_DRAFT_SCHEMA_NOT_READY");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_WORKFLOW_DRAFT_SCHEMA_NOT_READY") throw error;
      throw new Error("EPER_WORKFLOW_DRAFT_READINESS_FAILED", { cause: error });
    } finally { client.release(); }
  }

  async list(tenantId: string, applicationId: string): Promise<WorkflowDefinitionDraft[]> {
    validateId(tenantId, "tenantId");
    validateId(applicationId, "applicationId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      const result = await client.query<DraftRow>(
        `SELECT * FROM eper_workflow_definition_drafts
          WHERE tenant_id = $1 AND application_id = $2
          ORDER BY workflow_id`,
        [tenantId, applicationId],
      );
      await client.query("COMMIT");
      return result.rows.map(mapDraft);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }

  async get(tenantId: string, applicationId: string, workflowId: string): Promise<WorkflowDefinitionDraft | null> {
    validateId(tenantId, "tenantId");
    validateId(applicationId, "applicationId");
    validateId(workflowId, "workflowId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      const result = await client.query<DraftRow>(
        `SELECT * FROM eper_workflow_definition_drafts
          WHERE tenant_id = $1 AND application_id = $2 AND workflow_id = $3`,
        [tenantId, applicationId, workflowId],
      );
      await client.query("COMMIT");
      return result.rows[0] ? mapDraft(result.rows[0]) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }

  async replace(input: ReplaceWorkflowDefinitionDraftInput): Promise<WorkflowDefinitionDraft> {
    for (const [name, value] of Object.entries({
      tenantId: input.tenantId, applicationId: input.applicationId,
      workflowId: input.workflowId, changedBy: input.changedBy,
    })) validateId(value, name);
    if (!input.definition || typeof input.definition !== "object" ||
        input.definition.id !== input.workflowId || input.definition.status !== "DRAFT" ||
        !Array.isArray(input.definition.activities) || input.definition.activities.length < 1 ||
        input.definition.activities.length > 200) {
      throw new Error("WORKFLOW_DRAFT_DEFINITION_INVALID");
    }
    validateWorkflowRuleConfiguration(input.definition);
    const composition = assertWorkflowCapabilityComposition(input.definition);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("WORKFLOW_DRAFT_EXPECTED_VERSION_INVALID");
    }
    if (input.changeReason !== undefined &&
        (typeof input.changeReason !== "string" || input.changeReason.length > 1000)) {
      throw new Error("WORKFLOW_DRAFT_CHANGE_REASON_INVALID");
    }
    if (typeof input.correlationId !== "string" || !input.correlationId.trim() || input.correlationId.length > 128) {
      throw new Error("WORKFLOW_DRAFT_CORRELATION_ID_REQUIRED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify([input.tenantId, input.applicationId, input.workflowId])],
      );
      const tenant = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_tenant_application_assignment
          WHERE tenant_id = $1 AND application_id = $2 FOR SHARE`,
        [input.tenantId, input.applicationId],
      );
      if (tenant.rows[0]?.assignment_status !== "active") {
        throw new Error("WORKFLOW_DRAFT_TENANT_APPLICATION_NOT_ACTIVE");
      }
      const actor = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_actor_application_assignment
          WHERE tenant_id = $1 AND actor_id = $2 AND application_id = $3 FOR SHARE`,
        [input.tenantId, input.changedBy, input.applicationId],
      );
      if (actor.rows[0]?.assignment_status !== "active") {
        throw new Error("WORKFLOW_DRAFT_ACTOR_APPLICATION_NOT_ACTIVE");
      }
      const prior = await client.query<{ draft_version: number | string }>(
        `SELECT draft_version FROM eper_workflow_definition_drafts
          WHERE tenant_id = $1 AND application_id = $2 AND workflow_id = $3 FOR UPDATE`,
        [input.tenantId, input.applicationId, input.workflowId],
      );
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].draft_version) : 0;
      if (currentVersion !== input.expectedVersion) {
        throw new Error("WORKFLOW_DRAFT_VERSION_CONFLICT:" + currentVersion);
      }
      const saved = await client.query<DraftRow>(
        `INSERT INTO eper_workflow_definition_drafts
          (tenant_id, application_id, workflow_id, draft_version, definition, change_reason, created_by, updated_by)
         VALUES ($1,$2,$3,1,$4::jsonb,$5,$6,$6)
         ON CONFLICT (tenant_id, application_id, workflow_id) DO UPDATE SET
           draft_version = eper_workflow_definition_drafts.draft_version + 1,
           definition = EXCLUDED.definition, change_reason = EXCLUDED.change_reason,
           updated_at = NOW(), updated_by = EXCLUDED.updated_by
         RETURNING *`,
        [input.tenantId, input.applicationId, input.workflowId, JSON.stringify(input.definition),
          input.changeReason ?? null, input.changedBy],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("WORKFLOW_DRAFT_WRITE_RETURNED_NO_ROW");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId,
        environment: input.environment, actorType: "human", actorId: input.changedBy,
        action: "workflow.definition_draft.replace", outcome: "success",
        resourceType: "workflow-definition-draft", resourceId: input.workflowId,
        correlationId: input.correlationId, source: "api",
        operationName: "PUT /admin/applications/:applicationId/workflow-definitions/:workflowId/draft",
        serviceVersion: input.serviceVersion,
        payload: {
          workflowId: input.workflowId, draftVersion: Number(row.draft_version),
          activityCount: input.definition.activities.length,
          ruleIds: (input.definition.rules ?? []).map(rule => rule.id),
          capabilityCatalogueVersion: composition.catalogueVersion,
          capabilityNodeCount: composition.composition?.nodes.length ?? 0,
          capabilityEdgeCount: composition.composition?.edges.length ?? 0,
          changeReason: input.changeReason,
        },
      });
      await client.query("COMMIT");
      return mapDraft(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}
