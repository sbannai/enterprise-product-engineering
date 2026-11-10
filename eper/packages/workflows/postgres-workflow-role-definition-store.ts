import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export const WORKFLOW_ROLE_PERMISSIONS = [
  "workflow:view", "workflow:act", "workflow:approve",
  "workflow:admin", "role:assign", "access:manage",
  "provider.connection.create", "provider.connection.read", "provider.connection.bind",
  "provider.connection.validate", "provider.connection.rotate", "provider.connection.revoke",
  "customer.asset.upload",
  "peripheral.register", "peripheral.configure", "peripheral.read",
  "peripheral.activate", "peripheral.suspend",
  "remote_desktop.session.request", "remote_desktop.consent.accept",
  "remote_desktop.control.grant", "remote_desktop.consent.revoke",
  "remote_desktop.session.start", "remote_desktop.session.stop",
] as const;
export type WorkflowRolePermission = typeof WORKFLOW_ROLE_PERMISSIONS[number];

export interface WorkflowRoleDefinition {
  tenantId: string;
  applicationId: string;
  roleId: string;
  name: string;
  description?: string;
  permissions: WorkflowRolePermission[];
  delegable: boolean;
  scopeType: "application";
  status: "active" | "disabled";
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ReplaceWorkflowRoleDefinitionInput {
  tenantId: string;
  applicationId: string;
  roleId: string;
  name: string;
  description?: string;
  permissions: WorkflowRolePermission[];
  delegable: boolean;
  status: "active" | "disabled";
  expectedVersion: number;
  changedBy: string;
  environment: AuditEnvironment;
  correlationId: string;
  serviceVersion?: string;
}

type RoleRow = {
  tenant_id: string;
  application_id: string;
  role_id: string;
  name: string;
  description: string | null;
  permissions: WorkflowRolePermission[] | string;
  role_status: "active" | "disabled";
  delegable: boolean;
  scope_type: "application";
  version: number | string;
  updated_at: string | Date;
  updated_by: string;
};

function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new Error("WORKFLOW_ROLE_DEFINITION_INVALID_" + name.toUpperCase());
  }
}
function mapRole(row: RoleRow): WorkflowRoleDefinition {
  const permissions = typeof row.permissions === "string" ? JSON.parse(row.permissions) : row.permissions;
  return {
    tenantId: row.tenant_id, applicationId: row.application_id, roleId: row.role_id,
    name: row.name, description: row.description ?? undefined,
    permissions, delegable: row.delegable, scopeType: row.scope_type, status: row.role_status, version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.updated_by,
  };
}

/** Durable role catalogue. Admin authorization is established by the calling API layer. */
export class PostgresWorkflowRoleDefinitionStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        role_table: string | null; row_security: boolean; force_row_security: boolean;
        policy_present: boolean; delegable_column_present: boolean; scope_type_column_present: boolean;
      }>(`
        SELECT to_regclass('public.eper_workflow_role_definition')::text AS role_table,
               COALESCE(c.relrowsecurity, false) AS row_security,
               COALESCE(c.relforcerowsecurity, false) AS force_row_security,
               EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public'
                          AND p.tablename = 'eper_workflow_role_definition'
                          AND p.policyname = 'tenant_application_isolation') AS policy_present,
               EXISTS (SELECT 1 FROM information_schema.columns col
                        WHERE col.table_schema = 'public'
                          AND col.table_name = 'eper_workflow_role_definition'
                          AND col.column_name = 'delegable') AS delegable_column_present,
               EXISTS (SELECT 1 FROM information_schema.columns col
                        WHERE col.table_schema = 'public'
                          AND col.table_name = 'eper_workflow_role_definition'
                          AND col.column_name = 'scope_type') AS scope_type_column_present
          FROM (SELECT 1) seed
          LEFT JOIN pg_class c ON c.oid = to_regclass('public.eper_workflow_role_definition')
      `);
      const row = result.rows[0];
      if (!row?.role_table || !row.row_security || !row.force_row_security ||
          !row.policy_present || !row.delegable_column_present || !row.scope_type_column_present) {
        throw new Error("EPER_WORKFLOW_ROLE_DEFINITION_SCHEMA_NOT_READY");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_WORKFLOW_ROLE_DEFINITION_SCHEMA_NOT_READY") throw error;
      throw new Error("EPER_WORKFLOW_ROLE_DEFINITION_READINESS_FAILED", { cause: error });
    } finally { client.release(); }
  }

  async list(tenantId: string, applicationId: string): Promise<WorkflowRoleDefinition[]> {
    validateId(tenantId, "tenantId");
    validateId(applicationId, "applicationId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      const result = await client.query<RoleRow>(
        `SELECT * FROM eper_workflow_role_definition
          WHERE tenant_id = $1 AND application_id = $2
          ORDER BY role_id`,
        [tenantId, applicationId],
      );
      await client.query("COMMIT");
      return result.rows.map(mapRole);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }

  async replace(input: ReplaceWorkflowRoleDefinitionInput): Promise<WorkflowRoleDefinition> {
    for (const [name, value] of Object.entries({
      tenantId: input.tenantId, applicationId: input.applicationId,
      roleId: input.roleId, changedBy: input.changedBy,
    })) validateId(value, name);
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200) {
      throw new Error("WORKFLOW_ROLE_DEFINITION_NAME_INVALID");
    }
    if (input.description !== undefined &&
        (typeof input.description !== "string" || input.description.length > 2000)) {
      throw new Error("WORKFLOW_ROLE_DEFINITION_DESCRIPTION_INVALID");
    }
    if (!Array.isArray(input.permissions) || input.permissions.length < 1 ||
        input.permissions.length > WORKFLOW_ROLE_PERMISSIONS.length ||
        input.permissions.some(permission => !(WORKFLOW_ROLE_PERMISSIONS as readonly string[]).includes(permission)) ||
        new Set(input.permissions).size !== input.permissions.length) {
      throw new Error("WORKFLOW_ROLE_DEFINITION_PERMISSIONS_INVALID");
    }
    if (typeof input.delegable !== "boolean") {
      throw new Error("WORKFLOW_ROLE_DEFINITION_DELEGABLE_FLAG_INVALID");
    }
    if (input.status !== "active" && input.status !== "disabled") {
      throw new Error("WORKFLOW_ROLE_DEFINITION_STATUS_INVALID");
    }
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("WORKFLOW_ROLE_DEFINITION_EXPECTED_VERSION_INVALID");
    }
    if (typeof input.correlationId !== "string" || !input.correlationId.trim() || input.correlationId.length > 128) {
      throw new Error("WORKFLOW_ROLE_DEFINITION_CORRELATION_ID_REQUIRED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify([input.tenantId, input.applicationId, input.roleId])],
      );
      const tenant = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_tenant_application_assignment
          WHERE tenant_id = $1 AND application_id = $2 FOR SHARE`,
        [input.tenantId, input.applicationId],
      );
      if (tenant.rows[0]?.assignment_status !== "active") {
        throw new Error("WORKFLOW_ROLE_DEFINITION_TENANT_APPLICATION_NOT_ACTIVE");
      }
      const prior = await client.query<{ version: number | string }>(
        `SELECT version FROM eper_workflow_role_definition
          WHERE tenant_id = $1 AND application_id = $2 AND role_id = $3 FOR UPDATE`,
        [input.tenantId, input.applicationId, input.roleId],
      );
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].version) : 0;
      if (currentVersion !== input.expectedVersion) {
        throw new Error("WORKFLOW_ROLE_DEFINITION_VERSION_CONFLICT:" + currentVersion);
      }
      const saved = await client.query<RoleRow>(
        `INSERT INTO eper_workflow_role_definition
          (tenant_id, application_id, role_id, name, description, permissions, role_status, delegable, scope_type,
           version, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'application',1,$9,$9)
         ON CONFLICT (tenant_id, application_id, role_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description,
           permissions = EXCLUDED.permissions, role_status = EXCLUDED.role_status,
           delegable = EXCLUDED.delegable,
           version = eper_workflow_role_definition.version + 1,
           updated_at = NOW(), updated_by = EXCLUDED.updated_by
         RETURNING *`,
        [input.tenantId, input.applicationId, input.roleId, input.name.trim(),
          input.description ?? null, JSON.stringify(input.permissions), input.status, input.delegable, input.changedBy],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("WORKFLOW_ROLE_DEFINITION_WRITE_RETURNED_NO_ROW");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId,
        environment: input.environment, actorType: "human", actorId: input.changedBy,
        action: "workflow.role_definition.replace", outcome: "success",
        resourceType: "workflow-role-definition", resourceId: input.roleId,
        correlationId: input.correlationId, source: "api",
        operationName: "PUT /applications/:applicationId/workflow-roles/:roleId",
        serviceVersion: input.serviceVersion,
        payload: { roleId: input.roleId, permissions: input.permissions, delegable: input.delegable, status: input.status, version: Number(row.version) },
      });
      await client.query("COMMIT");
      return mapRole(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}
