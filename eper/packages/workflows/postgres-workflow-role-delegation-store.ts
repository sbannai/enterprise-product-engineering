import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

const ELEVATED_PERMISSIONS = ["workflow:admin", "role:assign", "access:manage"] as const;

export interface DelegateWorkflowRoleInput {
  tenantId: string;
  applicationId: string;
  grantorActorId: string;
  grantorRoleId: string;
  targetActorId: string;
  targetRoleId: string;
  expectedVersion: number;
  environment: AuditEnvironment;
  correlationId: string;
  serviceVersion?: string;
}

export interface DelegatedWorkflowRole {
  tenantId: string;
  applicationId: string;
  actorId: string;
  roleId: string;
  grantorActorId: string;
  status: "active";
  version: number;
  assignedAt: string;
  assignedBy: string;
}

type AssignmentRow = {
  tenant_id: string;
  application_id: string;
  actor_id: string;
  role_id: string;
  grantor_actor_id: string | null;
  assignment_status: "active";
  version: number | string;
  assigned_at: string | Date;
  assigned_by: string;
};

function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new Error("WORKFLOW_ROLE_DELEGATION_INVALID_" + name.toUpperCase());
  }
}

/**
 * Enforces scoped, non-escalating delegation at the persistence boundary.
 * The grantor's identity must come from the authenticated browser session;
 * callers must not accept it from an untrusted request body.
 */
export class PostgresWorkflowRoleDelegationStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async grant(input: DelegateWorkflowRoleInput): Promise<DelegatedWorkflowRole> {
    for (const [name, value] of Object.entries({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      grantorActorId: input.grantorActorId,
      grantorRoleId: input.grantorRoleId,
      targetActorId: input.targetActorId,
      targetRoleId: input.targetRoleId,
    })) validateId(value, name);
    if (input.grantorActorId === input.targetActorId) {
      throw new Error("WORKFLOW_ROLE_DELEGATION_SELF_GRANT_FORBIDDEN");
    }
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("WORKFLOW_ROLE_DELEGATION_EXPECTED_VERSION_INVALID");
    }
    if (typeof input.correlationId !== "string" || !input.correlationId.trim() || input.correlationId.length > 128) {
      throw new Error("WORKFLOW_ROLE_DELEGATION_CORRELATION_ID_REQUIRED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify([input.tenantId, input.applicationId, input.targetActorId, input.targetRoleId])],
      );

      const tenant = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_tenant_application_assignment
          WHERE tenant_id = $1 AND application_id = $2 FOR SHARE`,
        [input.tenantId, input.applicationId],
      );
      if (tenant.rows[0]?.assignment_status !== "active") {
        throw new Error("WORKFLOW_ROLE_DELEGATION_TENANT_APPLICATION_NOT_ACTIVE");
      }

      const grantor = await client.query<{ permissions: string[] | string }>(
        `SELECT rd.permissions
           FROM eper_workflow_actor_role_assignment ra
           JOIN eper_actor_application_assignment aa
             ON aa.tenant_id = ra.tenant_id AND aa.application_id = ra.application_id
            AND aa.actor_id = ra.actor_id AND aa.assignment_status = 'active'
           JOIN eper_workflow_role_definition rd
             ON rd.tenant_id = ra.tenant_id AND rd.application_id = ra.application_id
            AND rd.role_id = ra.role_id AND rd.role_status = 'active'
          WHERE ra.tenant_id = $1 AND ra.application_id = $2
            AND ra.actor_id = $3 AND ra.role_id = $4
            AND ra.assignment_status = 'active'
          FOR SHARE OF ra, rd`,
        [input.tenantId, input.applicationId, input.grantorActorId, input.grantorRoleId],
      );
      const grantorPermissions = grantor.rows[0]
        ? (typeof grantor.rows[0].permissions === "string"
          ? JSON.parse(grantor.rows[0].permissions) as string[]
          : grantor.rows[0].permissions)
        : [];
      if (!grantorPermissions.includes("access:manage")) {
        throw new Error("WORKFLOW_ROLE_DELEGATION_GRANTOR_NOT_AUTHORIZED");
      }

      const targetRole = await client.query<{ permissions: string[] | string }>(
        `SELECT permissions FROM eper_workflow_role_definition
          WHERE tenant_id = $1 AND application_id = $2 AND role_id = $3
            AND role_status = 'active' FOR SHARE`,
        [input.tenantId, input.applicationId, input.targetRoleId],
      );
      if (!targetRole.rows[0]) throw new Error("WORKFLOW_ROLE_DELEGATION_TARGET_ROLE_NOT_ACTIVE");
      const targetPermissions = typeof targetRole.rows[0].permissions === "string"
        ? JSON.parse(targetRole.rows[0].permissions) as string[]
        : targetRole.rows[0].permissions;
      if (targetPermissions.some(permission =>
        (ELEVATED_PERMISSIONS as readonly string[]).includes(permission) ||
        !grantorPermissions.includes(permission))) {
        throw new Error("WORKFLOW_ROLE_DELEGATION_PRIVILEGE_ESCALATION_FORBIDDEN");
      }

      const targetActor = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_actor_application_assignment
          WHERE tenant_id = $1 AND actor_id = $2 AND application_id = $3 FOR SHARE`,
        [input.tenantId, input.targetActorId, input.applicationId],
      );
      if (targetActor.rows[0]?.assignment_status !== "active") {
        throw new Error("WORKFLOW_ROLE_DELEGATION_TARGET_ACTOR_NOT_ACTIVE");
      }

      const prior = await client.query<{ version: number | string }>(
        `SELECT version FROM eper_workflow_actor_role_assignment
          WHERE tenant_id = $1 AND application_id = $2 AND actor_id = $3 AND role_id = $4
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.targetActorId, input.targetRoleId],
      );
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].version) : 0;
      if (currentVersion !== input.expectedVersion) {
        throw new Error("WORKFLOW_ROLE_DELEGATION_VERSION_CONFLICT:" + currentVersion);
      }

      const saved = await client.query<AssignmentRow>(
        `INSERT INTO eper_workflow_actor_role_assignment
          (tenant_id, application_id, actor_id, role_id, assignment_status, version,
           assigned_at, assigned_by, grantor_actor_id, revoked_at, revoked_by, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,'active',1,NOW(),$5,$5,NULL,NULL,NOW(),$5)
         ON CONFLICT (tenant_id, application_id, actor_id, role_id) DO UPDATE SET
           assignment_status = 'active',
           version = eper_workflow_actor_role_assignment.version + 1,
           assigned_at = NOW(), assigned_by = EXCLUDED.assigned_by,
           grantor_actor_id = EXCLUDED.grantor_actor_id,
           revoked_at = NULL, revoked_by = NULL,
           updated_at = NOW(), updated_by = EXCLUDED.updated_by
         RETURNING tenant_id, application_id, actor_id, role_id, grantor_actor_id,
                   assignment_status, version, assigned_at, assigned_by`,
        [input.tenantId, input.applicationId, input.targetActorId, input.targetRoleId, input.grantorActorId],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("WORKFLOW_ROLE_DELEGATION_WRITE_RETURNED_NO_ROW");

      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        environment: input.environment,
        actorType: "human",
        actorId: input.grantorActorId,
        action: "workflow.role_assignment.delegate",
        outcome: "success",
        resourceType: "workflow-actor-role-assignment",
        resourceId: input.targetActorId,
        correlationId: input.correlationId,
        source: "api",
        operationName: "POST /applications/:applicationId/workflow-role-delegations",
        serviceVersion: input.serviceVersion,
        payload: {
          grantorActorId: input.grantorActorId,
          grantorRoleId: input.grantorRoleId,
          targetActorId: input.targetActorId,
          targetRoleId: input.targetRoleId,
          version: Number(row.version),
        },
      });
      await client.query("COMMIT");
      return {
        tenantId: row.tenant_id,
        applicationId: row.application_id,
        actorId: row.actor_id,
        roleId: row.role_id,
        grantorActorId: row.grantor_actor_id ?? input.grantorActorId,
        status: row.assignment_status,
        version: Number(row.version),
        assignedAt: new Date(row.assigned_at).toISOString(),
        assignedBy: row.assigned_by,
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
