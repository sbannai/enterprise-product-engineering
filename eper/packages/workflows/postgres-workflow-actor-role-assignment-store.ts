import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export interface WorkflowActorRoleAssignment {
  tenantId: string;
  applicationId: string;
  actorId: string;
  roleId: string;
  status: "active" | "revoked";
  version: number;
  assignedAt: string;
  assignedBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface ChangeWorkflowActorRoleAssignmentInput {
  tenantId: string;
  applicationId: string;
  actorId: string;
  roleId: string;
  changedBy: string;
  expectedVersion: number;
  environment: AuditEnvironment;
  correlationId: string;
  serviceVersion?: string;
}

type AssignmentRow = {
  tenant_id: string;
  application_id: string;
  actor_id: string;
  role_id: string;
  assignment_status: "active" | "revoked";
  version: number | string;
  assigned_at: string | Date;
  assigned_by: string;
  revoked_at: string | Date | null;
  revoked_by: string | null;
  updated_at: string | Date;
  updated_by: string;
};

function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new Error("WORKFLOW_ROLE_ASSIGNMENT_INVALID_" + name.toUpperCase());
  }
}

function mapRow(row: AssignmentRow): WorkflowActorRoleAssignment {
  return {
    tenantId: row.tenant_id,
    applicationId: row.application_id,
    actorId: row.actor_id,
    roleId: row.role_id,
    status: row.assignment_status,
    version: Number(row.version),
    assignedAt: new Date(row.assigned_at).toISOString(),
    assignedBy: row.assigned_by,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    revokedBy: row.revoked_by,
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by,
  };
}

/**
 * Durable role membership scoped to one tenant and application.
 * Call mutations only after the caller has established administrator authority.
 * The actor/application and tenant/application membership checks are repeated
 * inside the grant transaction so revocation cannot race a new role grant.
 */
export class PostgresWorkflowActorRoleAssignmentStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        assignment_table: string | null;
        row_security: boolean;
        force_row_security: boolean;
      }>(`
        SELECT to_regclass('public.eper_workflow_actor_role_assignment')::text AS assignment_table,
               COALESCE(c.relrowsecurity, false) AS row_security,
               COALESCE(c.relforcerowsecurity, false) AS force_row_security
          FROM (SELECT 1) seed
          LEFT JOIN pg_class c ON c.oid = to_regclass('public.eper_workflow_actor_role_assignment')
      `);
      const row = result.rows[0];
      if (!row?.assignment_table || !row.row_security || !row.force_row_security) {
        throw new Error("EPER_WORKFLOW_ROLE_ASSIGNMENT_SCHEMA_NOT_READY");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_WORKFLOW_ROLE_ASSIGNMENT_SCHEMA_NOT_READY") throw error;
      throw new Error("EPER_WORKFLOW_ROLE_ASSIGNMENT_READINESS_FAILED", { cause: error });
    } finally {
      client.release();
    }
  }

  async listActiveRoleIds(tenantId: string, applicationId: string, actorId: string): Promise<string[]> {
    validateId(tenantId, "tenantId");
    validateId(applicationId, "applicationId");
    validateId(actorId, "actorId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      const result = await client.query<{ role_id: string }>(
        `SELECT r.role_id FROM eper_workflow_actor_role_assignment r
          JOIN eper_actor_application_assignment aa
            ON aa.tenant_id = r.tenant_id AND aa.application_id = r.application_id
           AND aa.actor_id = r.actor_id AND aa.assignment_status = 'active'
          JOIN eper_tenant_application_assignment ta
            ON ta.tenant_id = r.tenant_id AND ta.application_id = r.application_id
           AND ta.assignment_status = 'active'
          JOIN eper_workflow_role_definition rd
            ON rd.tenant_id = r.tenant_id AND rd.application_id = r.application_id
           AND rd.role_id = r.role_id AND rd.role_status = 'active'
          WHERE r.tenant_id = $1 AND r.application_id = $2 AND r.actor_id = $3
            AND r.assignment_status = 'active'
          ORDER BY r.role_id`,
        [tenantId, applicationId, actorId],
      );
      await client.query("COMMIT");
      return result.rows.map(row => row.role_id);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async isAssigned(
    tenantId: string,
    applicationId: string,
    actorId: string,
    roleId: string,
  ): Promise<boolean> {
    return (await this.listActiveRoleIds(tenantId, applicationId, actorId)).includes(roleId);
  }

  async assign(input: ChangeWorkflowActorRoleAssignmentInput): Promise<WorkflowActorRoleAssignment> {
    return this.change(input, "active");
  }

  async revoke(input: ChangeWorkflowActorRoleAssignmentInput): Promise<WorkflowActorRoleAssignment> {
    return this.change(input, "revoked");
  }

  private async change(
    input: ChangeWorkflowActorRoleAssignmentInput,
    status: "active" | "revoked",
  ): Promise<WorkflowActorRoleAssignment> {
    for (const [name, value] of Object.entries({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      actorId: input.actorId,
      roleId: input.roleId,
      changedBy: input.changedBy,
    })) validateId(value, name);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("WORKFLOW_ROLE_ASSIGNMENT_EXPECTED_VERSION_INVALID");
    }
    if (typeof input.correlationId !== "string" || !input.correlationId.trim() || input.correlationId.length > 128) {
      throw new Error("WORKFLOW_ROLE_ASSIGNMENT_CORRELATION_ID_REQUIRED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify([input.tenantId, input.applicationId, input.actorId, input.roleId])],
      );

      const tenantAssignment = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_tenant_application_assignment
          WHERE tenant_id = $1 AND application_id = $2 FOR SHARE`,
        [input.tenantId, input.applicationId],
      );
      if (tenantAssignment.rows[0]?.assignment_status !== "active") {
        throw new Error("WORKFLOW_ROLE_ASSIGNMENT_TENANT_APPLICATION_NOT_ACTIVE");
      }

      if (status === "active") {
        const roleDefinition = await client.query<{ role_status: string }>(
          `SELECT role_status FROM eper_workflow_role_definition
            WHERE tenant_id = $1 AND application_id = $2 AND role_id = $3 FOR SHARE`,
          [input.tenantId, input.applicationId, input.roleId],
        );
        if (roleDefinition.rows[0]?.role_status !== "active") {
          throw new Error("WORKFLOW_ROLE_ASSIGNMENT_ROLE_NOT_ACTIVE");
        }
        const actorAssignment = await client.query<{ assignment_status: string }>(
          `SELECT assignment_status FROM eper_actor_application_assignment
            WHERE tenant_id = $1 AND actor_id = $2 AND application_id = $3 FOR SHARE`,
          [input.tenantId, input.actorId, input.applicationId],
        );
        if (actorAssignment.rows[0]?.assignment_status !== "active") {
          throw new Error("WORKFLOW_ROLE_ASSIGNMENT_ACTOR_APPLICATION_NOT_ACTIVE");
        }
      }

      const prior = await client.query<AssignmentRow>(
        `SELECT * FROM eper_workflow_actor_role_assignment
          WHERE tenant_id = $1 AND application_id = $2 AND actor_id = $3 AND role_id = $4
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.actorId, input.roleId],
      );
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].version) : 0;
      if (!prior.rows[0] && status === "revoked") {
        throw new Error("WORKFLOW_ROLE_ASSIGNMENT_NOT_FOUND");
      }
      if (currentVersion !== input.expectedVersion) {
        throw new Error("WORKFLOW_ROLE_ASSIGNMENT_VERSION_CONFLICT:" + currentVersion);
      }

      const saved = await client.query<AssignmentRow>(
        `INSERT INTO eper_workflow_actor_role_assignment
          (tenant_id, application_id, actor_id, role_id, assignment_status, version,
           assigned_at, assigned_by, revoked_at, revoked_by, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,1,NOW(),$6,
                 CASE WHEN $5 = 'revoked' THEN NOW() ELSE NULL END,
                 CASE WHEN $5 = 'revoked' THEN $6 ELSE NULL END,NOW(),$6)
         ON CONFLICT (tenant_id, application_id, actor_id, role_id) DO UPDATE SET
           assignment_status = EXCLUDED.assignment_status,
           version = eper_workflow_actor_role_assignment.version + 1,
           assigned_at = CASE WHEN EXCLUDED.assignment_status = 'active' THEN NOW()
                              ELSE eper_workflow_actor_role_assignment.assigned_at END,
           assigned_by = CASE WHEN EXCLUDED.assignment_status = 'active' THEN EXCLUDED.assigned_by
                              ELSE eper_workflow_actor_role_assignment.assigned_by END,
           revoked_at = CASE WHEN EXCLUDED.assignment_status = 'revoked' THEN NOW() ELSE NULL END,
           revoked_by = CASE WHEN EXCLUDED.assignment_status = 'revoked' THEN EXCLUDED.revoked_by ELSE NULL END,
           updated_at = NOW(), updated_by = EXCLUDED.updated_by
         RETURNING *`,
        [input.tenantId, input.applicationId, input.actorId, input.roleId, status, input.changedBy],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("WORKFLOW_ROLE_ASSIGNMENT_WRITE_RETURNED_NO_ROW");

      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        environment: input.environment,
        actorType: "human",
        actorId: input.changedBy,
        action: status === "active" ? "workflow.role_assignment.grant" : "workflow.role_assignment.revoke",
        outcome: "success",
        resourceType: "workflow-actor-role-assignment",
        resourceId: input.actorId,
        correlationId: input.correlationId,
        source: "api",
        operationName: status === "active"
          ? "POST /applications/:applicationId/workflow-role-assignments"
          : "DELETE /applications/:applicationId/workflow-role-assignments",
        serviceVersion: input.serviceVersion,
        payload: { actorId: input.actorId, roleId: input.roleId, status, version: Number(row.version) },
      });
      await client.query("COMMIT");
      return mapRow(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
