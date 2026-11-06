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

      const targetRole = await client.query<{ permissions: string[] | string; delegable: boolean; scope_type: string }>(
        `SELECT permissions, delegable, scope_type FROM eper_workflow_role_definition
          WHERE tenant_id = $1 AND application_id = $2 AND role_id = $3
            AND role_status = 'active' FOR SHARE`,
        [input.tenantId, input.applicationId, input.targetRoleId],
      );
      if (!targetRole.rows[0]) throw new Error("WORKFLOW_ROLE_DELEGATION_TARGET_ROLE_NOT_ACTIVE");
      if (targetRole.rows[0].delegable !== true) throw new Error("WORKFLOW_ROLE_DELEGATION_TARGET_ROLE_NOT_DELEGABLE");
      if (targetRole.rows[0].scope_type !== "application") throw new Error("WORKFLOW_ROLE_DELEGATION_TARGET_ROLE_SCOPE_UNSUPPORTED");
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

  /** Revokes one scoped assignment and records the revocation atomically. */
  async revoke(input: DelegateWorkflowRoleInput): Promise<{ tenantId: string; applicationId: string; actorId: string; roleId: string; status: "revoked"; version: number; revokedBy: string }> {
    for (const [name, value] of Object.entries({
      tenantId: input.tenantId, applicationId: input.applicationId,
      grantorActorId: input.grantorActorId, grantorRoleId: input.grantorRoleId,
      targetActorId: input.targetActorId, targetRoleId: input.targetRoleId,
    })) validateId(value, name);
    if (input.grantorActorId === input.targetActorId) throw new Error("WORKFLOW_ROLE_DELEGATION_SELF_REVOKE_FORBIDDEN");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error("WORKFLOW_ROLE_DELEGATION_EXPECTED_VERSION_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        JSON.stringify([input.tenantId, input.applicationId, input.targetActorId, input.targetRoleId]),
      ]);
      const grantor = await client.query<{ permissions: string[] | string }>(
        `SELECT rd.permissions FROM eper_workflow_actor_role_assignment ra
          JOIN eper_actor_application_assignment aa
            ON aa.tenant_id=ra.tenant_id AND aa.application_id=ra.application_id
           AND aa.actor_id=ra.actor_id AND aa.assignment_status='active'
          JOIN eper_workflow_role_definition rd
            ON rd.tenant_id=ra.tenant_id AND rd.application_id=ra.application_id
           AND rd.role_id=ra.role_id AND rd.role_status='active'
         WHERE ra.tenant_id=$1 AND ra.application_id=$2 AND ra.actor_id=$3
           AND ra.role_id=$4 AND ra.assignment_status='active' FOR SHARE OF ra, rd`,
        [input.tenantId, input.applicationId, input.grantorActorId, input.grantorRoleId],
      );
      let permissions: string[] = [];
      if (grantor.rows[0]) {
        const rawPermissions = grantor.rows[0].permissions;
        permissions = typeof rawPermissions === "string"
          ? JSON.parse(rawPermissions) as string[]
          : rawPermissions;
      }
      if (!permissions.includes("access:manage")) {
        throw new Error("WORKFLOW_ROLE_DELEGATION_GRANTOR_NOT_AUTHORIZED");
      }
      const targetRole = await client.query<{ permissions: string[] | string }>(
        `SELECT permissions FROM eper_workflow_role_definition
          WHERE tenant_id=$1 AND application_id=$2 AND role_id=$3 AND role_status='active' FOR SHARE`,
        [input.tenantId, input.applicationId, input.targetRoleId],
      );
      if (!targetRole.rows[0]) throw new Error("WORKFLOW_ROLE_DELEGATION_TARGET_ROLE_NOT_ACTIVE");
      const rawTargetPermissions = targetRole.rows[0].permissions;
      const targetPermissions = typeof rawTargetPermissions === "string"
        ? JSON.parse(rawTargetPermissions) as string[]
        : rawTargetPermissions;
      // A Customer Admin may revoke peer/superior administration only when
      // their own durable role carries the separate role:assign authority.
      // This path never revokes workflow:admin; ordinary delegated roles must
      // remain within the grantor's effective permission set.
      if (targetPermissions.includes("workflow:admin") ||
          ((targetPermissions.includes("access:manage") || targetPermissions.includes("role:assign")) &&
            !permissions.includes("role:assign")) ||
          targetPermissions.some(permission => !permissions.includes(permission))) {
        throw new Error("WORKFLOW_ROLE_DELEGATION_PEER_ADMIN_MODIFICATION_FORBIDDEN");
      }
      const current = await client.query<{ version: number | string }>(
        `SELECT version FROM eper_workflow_actor_role_assignment
          WHERE tenant_id=$1 AND application_id=$2 AND actor_id=$3 AND role_id=$4
            AND assignment_status='active' FOR UPDATE`,
        [input.tenantId, input.applicationId, input.targetActorId, input.targetRoleId],
      );
      if (!current.rows[0]) throw new Error("WORKFLOW_ROLE_DELEGATION_ASSIGNMENT_NOT_FOUND");
      const version = Number(current.rows[0].version);
      if (version !== input.expectedVersion) throw new Error("WORKFLOW_ROLE_DELEGATION_VERSION_CONFLICT:" + version);
      if (targetPermissions.includes("access:manage")) {
        // Serialize all Customer Admin revocations within this tenant/application.
        // Without this shared lock, two concurrent revocations could each observe
        // two active admins and both commit, leaving the application with none.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          JSON.stringify(["customer-admin-last-admin", input.tenantId, input.applicationId]),
        ]);
        const adminCount = await client.query<{ admin_count: number | string }>(
          `SELECT COUNT(DISTINCT ra.actor_id)::int AS admin_count
             FROM eper_workflow_actor_role_assignment ra
             JOIN eper_actor_application_assignment aa
               ON aa.tenant_id=ra.tenant_id AND aa.application_id=ra.application_id
              AND aa.actor_id=ra.actor_id AND aa.assignment_status='active'
             JOIN eper_workflow_role_definition rd
               ON rd.tenant_id=ra.tenant_id AND rd.application_id=ra.application_id
              AND rd.role_id=ra.role_id AND rd.role_status='active'
            WHERE ra.tenant_id=$1 AND ra.application_id=$2
              AND ra.assignment_status='active' AND rd.permissions ? 'access:manage'`,
          [input.tenantId, input.applicationId],
        );
        if (Number(adminCount.rows[0]?.admin_count ?? 0) <= 1) {
          throw new Error("WORKFLOW_ROLE_DELEGATION_LAST_CUSTOMER_ADMIN_PROTECTED");
        }
      }
      const saved = await client.query<{ version: number | string }>(
        `UPDATE eper_workflow_actor_role_assignment
            SET assignment_status='revoked', version=version+1, revoked_at=NOW(),
                revoked_by=$5, updated_at=NOW(), updated_by=$5
          WHERE tenant_id=$1 AND application_id=$2 AND actor_id=$3 AND role_id=$4
          RETURNING version`,
        [input.tenantId, input.applicationId, input.targetActorId, input.targetRoleId, input.grantorActorId],
      );
      if (!saved.rows[0]) throw new Error("WORKFLOW_ROLE_DELEGATION_REVOKE_WRITE_FAILED");
      const nextVersion = Number(saved.rows[0].version);
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId,
        environment: input.environment, actorType: "human", actorId: input.grantorActorId,
        action: "workflow.role_assignment.revoke", outcome: "success",
        resourceType: "workflow-actor-role-assignment", resourceId: input.targetActorId,
        correlationId: input.correlationId, source: "api",
        operationName: "DELETE /applications/:applicationId/workflow-role-delegations",
        serviceVersion: input.serviceVersion,
        payload: { grantorActorId: input.grantorActorId, targetActorId: input.targetActorId,
          targetRoleId: input.targetRoleId, version: nextVersion },
      });
      await client.query("COMMIT");
      return { tenantId: input.tenantId, applicationId: input.applicationId,
        actorId: input.targetActorId, roleId: input.targetRoleId, status: "revoked",
        version: nextVersion, revokedBy: input.grantorActorId };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}
