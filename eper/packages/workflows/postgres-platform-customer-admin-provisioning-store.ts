import { createHash } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type {
  PlatformAdminPermission,
  TrustedPlatformAdminPrincipal,
} from "../identity/platform-admin-principal.js";

const CUSTOMER_ADMIN_ROLE_ID = "customer-admin";

export interface PlatformCustomerAdminMutationInput {
  principal: TrustedPlatformAdminPrincipal;
  operation: "provision" | "recover";
  tenantId: string;
  applicationId: string;
  targetActorId: string;
  idempotencyKey: string;
  correlationId: string;
  environment: AuditEnvironment;
  reasonTicketReference?: string;
  serviceVersion?: string;
}

export interface PlatformCustomerAdminMutationResult {
  tenantId: string;
  applicationId: string;
  actorId: string;
  roleId: string;
  status: "active";
  version: number;
  operation: "provision" | "recover";
  replayed: boolean;
}

type IdempotencyRow = {
  request_hash: string;
  result: PlatformCustomerAdminMutationResult | string | null;
  completed_at: string | Date | null;
};

type AssignmentRow = {
  tenant_id: string;
  application_id: string;
  actor_id: string;
  role_id: string;
  assignment_status: "active";
  version: number | string;
};

function validateIdentifier(value: string, name: string, max = 128): void {
  if (typeof value !== "string" || value.length < 2 || value.length > max ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new Error("PLATFORM_CUSTOMER_ADMIN_INVALID_" + name.toUpperCase());
  }
}

function requiredPermission(operation: "provision" | "recover"): PlatformAdminPermission {
  return operation === "provision"
    ? "customer_admin:provision"
    : "customer_admin:recover";
}

function requestHash(input: PlatformCustomerAdminMutationInput): string {
  return createHash("sha256").update(JSON.stringify({
    operation: input.operation,
    tenantId: input.tenantId,
    applicationId: input.applicationId,
    targetActorId: input.targetActorId,
    platformActorId: input.principal.platformActorId,
    credentialId: input.principal.credentialId,
    reasonTicketReference: input.reasonTicketReference ?? null,
  })).digest("hex");
}

function mapResult(row: AssignmentRow, operation: "provision" | "recover", replayed: boolean): PlatformCustomerAdminMutationResult {
  return {
    tenantId: row.tenant_id,
    applicationId: row.application_id,
    actorId: row.actor_id,
    roleId: row.role_id,
    status: row.assignment_status,
    version: Number(row.version),
    operation,
    replayed,
  };
}

/**
 * Platform-only first Customer Admin provisioning and lockout recovery.
 * The trusted principal is supplied by the platform auth adapter, never by a
 * request body. All resource membership checks, assignment writes, idempotency
 * and append-only audit evidence share one PostgreSQL transaction.
 */
export class PostgresPlatformCustomerAdminProvisioningStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        ledger_table: string | null;
        assignment_table: string | null;
        role_table: string | null;
        actor_membership_table: string | null;
        browser_sessions_table: string | null;
        identity_events_table: string | null;
        row_security: boolean;
        force_row_security: boolean;
      }>(`
        SELECT
          to_regclass('public.eper_platform_admin_operation_idempotency')::text AS ledger_table,
          to_regclass('public.eper_workflow_actor_role_assignment')::text AS assignment_table,
          to_regclass('public.eper_workflow_role_definition')::text AS role_table,
          to_regclass('public.eper_actor_application_assignment')::text AS actor_membership_table,
          to_regclass('public.eper_customer_browser_sessions')::text AS browser_sessions_table,
          to_regclass('public.eper_customer_identity_events')::text AS identity_events_table,
          COALESCE(c.relrowsecurity, false) AS row_security,
          COALESCE(c.relforcerowsecurity, false) AS force_row_security
        FROM (SELECT 1) seed
        LEFT JOIN pg_class c
          ON c.oid = to_regclass('public.eper_platform_admin_operation_idempotency')
      `);
      const state = result.rows[0];
      if (!state?.ledger_table || !state.assignment_table || !state.role_table ||
          !state.actor_membership_table || !state.browser_sessions_table ||
          !state.identity_events_table || !state.row_security || !state.force_row_security) {
        throw new Error("EPER_PLATFORM_CUSTOMER_ADMIN_SCHEMA_NOT_READY");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_PLATFORM_CUSTOMER_ADMIN_SCHEMA_NOT_READY") throw error;
      throw new Error("EPER_PLATFORM_CUSTOMER_ADMIN_READINESS_FAILED", { cause: error });
    } finally {
      client.release();
    }
  }

  async mutate(input: PlatformCustomerAdminMutationInput): Promise<PlatformCustomerAdminMutationResult> {
    const permission = requiredPermission(input.operation);
    if (!input.principal.permissions.includes(permission)) {
      throw new Error("PLATFORM_CUSTOMER_ADMIN_PERMISSION_DENIED");
    }
    validateIdentifier(input.principal.platformActorId, "platformActorId");
    validateIdentifier(input.principal.credentialId, "credentialId");
    validateIdentifier(input.tenantId, "tenantId");
    validateIdentifier(input.applicationId, "applicationId");
    validateIdentifier(input.targetActorId, "targetActorId");
    validateIdentifier(input.idempotencyKey, "idempotencyKey", 200);
    validateIdentifier(input.correlationId, "correlationId");
    if (input.operation === "recover" &&
        (typeof input.reasonTicketReference !== "string" ||
         !input.reasonTicketReference.trim() || input.reasonTicketReference.length > 200)) {
      throw new Error("PLATFORM_CUSTOMER_ADMIN_RECOVERY_REASON_REQUIRED");
    }
    if (input.reasonTicketReference && input.reasonTicketReference.length > 200) {
      throw new Error("PLATFORM_CUSTOMER_ADMIN_RECOVERY_REASON_INVALID");
    }

    const hash = requestHash(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify(["platform-customer-admin", input.tenantId, input.applicationId])],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify(["platform-customer-admin-idempotency", input.tenantId,
          input.applicationId, input.operation, input.idempotencyKey])],
      );

      const prior = await client.query<IdempotencyRow>(
        `SELECT request_hash, result, completed_at
           FROM eper_platform_admin_operation_idempotency
          WHERE tenant_id=$1 AND application_id=$2 AND operation=$3 AND idempotency_key=$4
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.operation, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash.trim() !== hash) {
          throw new Error("PLATFORM_CUSTOMER_ADMIN_IDEMPOTENCY_KEY_REUSED");
        }
        if (!prior.rows[0].completed_at || !prior.rows[0].result) {
          throw new Error("PLATFORM_CUSTOMER_ADMIN_IDEMPOTENCY_INCOMPLETE");
        }
        const saved = typeof prior.rows[0].result === "string"
          ? JSON.parse(prior.rows[0].result) as PlatformCustomerAdminMutationResult
          : prior.rows[0].result as PlatformCustomerAdminMutationResult;
        await client.query("COMMIT");
        return { ...saved, replayed: true };
      }

      const tenant = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_tenant_application_assignment
          WHERE tenant_id=$1 AND application_id=$2 FOR SHARE`,
        [input.tenantId, input.applicationId],
      );
      if (tenant.rows[0]?.assignment_status !== "active") {
        throw new Error("PLATFORM_CUSTOMER_ADMIN_TENANT_APPLICATION_NOT_ACTIVE");
      }

      const actor = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_actor_application_assignment
          WHERE tenant_id=$1 AND application_id=$2 AND actor_id=$3 FOR SHARE`,
        [input.tenantId, input.applicationId, input.targetActorId],
      );
      if (actor.rows[0]?.assignment_status !== "active") {
        throw new Error("PLATFORM_CUSTOMER_ADMIN_TARGET_ACTOR_NOT_ACTIVE");
      }

      const role = await client.query<{ role_status: string; permissions: string[] | string }>(
        `SELECT role_status, permissions FROM eper_workflow_role_definition
          WHERE tenant_id=$1 AND application_id=$2 AND role_id=$3 FOR SHARE`,
        [input.tenantId, input.applicationId, CUSTOMER_ADMIN_ROLE_ID],
      );
      if (role.rows[0]?.role_status !== "active") {
        throw new Error("PLATFORM_CUSTOMER_ADMIN_ROLE_NOT_ACTIVE");
      }
      const permissions = typeof role.rows[0].permissions === "string"
        ? JSON.parse(role.rows[0].permissions) as string[]
        : role.rows[0].permissions;
      if (!permissions.includes("access:manage")) {
        throw new Error("PLATFORM_CUSTOMER_ADMIN_ROLE_PERMISSION_INVALID");
      }

      const history = await client.query<{ total_count: number | string; active_count: number | string }>(
        `SELECT COUNT(*)::int AS total_count,
                COUNT(*) FILTER (WHERE assignment_status='active')::int AS active_count
           FROM eper_workflow_actor_role_assignment
          WHERE tenant_id=$1 AND application_id=$2 AND role_id=$3`,
        [input.tenantId, input.applicationId, CUSTOMER_ADMIN_ROLE_ID],
      );
      const totalCount = Number(history.rows[0]?.total_count ?? 0);
      const activeCount = Number(history.rows[0]?.active_count ?? 0);
      if (activeCount > 0) {
        throw new Error("PLATFORM_CUSTOMER_ADMIN_ALREADY_ACTIVE");
      }
      if (input.operation === "provision" && totalCount > 0) {
        throw new Error("PLATFORM_CUSTOMER_ADMIN_INITIAL_PROVISIONING_NOT_ALLOWED_AFTER_PRIOR_ASSIGNMENT");
      }
      if (input.operation === "recover" && totalCount === 0) {
        throw new Error("PLATFORM_CUSTOMER_ADMIN_RECOVERY_REQUIRES_PRIOR_ADMIN_HISTORY");
      }

      await client.query(
        `INSERT INTO eper_platform_admin_operation_idempotency
          (tenant_id, application_id, operation, idempotency_key, request_hash,
           platform_actor_id, credential_id, target_actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.tenantId, input.applicationId, input.operation, input.idempotencyKey,
          hash, input.principal.platformActorId, input.principal.credentialId, input.targetActorId],
      );

      const saved = await client.query<AssignmentRow>(
        `INSERT INTO eper_workflow_actor_role_assignment
          (tenant_id, application_id, actor_id, role_id, assignment_status, version,
           assigned_at, assigned_by, grantor_actor_id, revoked_at, revoked_by, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,'active',1,NOW(),$5,$5,NULL,NULL,NOW(),$5)
         ON CONFLICT (tenant_id, application_id, actor_id, role_id) DO UPDATE SET
           assignment_status='active',
           version=eper_workflow_actor_role_assignment.version+1,
           assigned_at=NOW(), assigned_by=EXCLUDED.assigned_by,
           grantor_actor_id=EXCLUDED.grantor_actor_id,
           revoked_at=NULL, revoked_by=NULL, updated_at=NOW(), updated_by=EXCLUDED.updated_by
         RETURNING tenant_id, application_id, actor_id, role_id, assignment_status, version`,
        [input.tenantId, input.applicationId, input.targetActorId,
          CUSTOMER_ADMIN_ROLE_ID, input.principal.platformActorId],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("PLATFORM_CUSTOMER_ADMIN_ASSIGNMENT_WRITE_FAILED");

      const result = mapResult(row, input.operation, false);
      await client.query(
        `UPDATE eper_platform_admin_operation_idempotency
            SET assignment_version=$5, result=$6::jsonb, completed_at=NOW()
          WHERE tenant_id=$1 AND application_id=$2 AND operation=$3 AND idempotency_key=$4`,
        [input.tenantId, input.applicationId, input.operation, input.idempotencyKey,
          result.version, JSON.stringify(result)],
      );

      // Force existing customer browser sessions to re-authenticate so the
      // next session resolves the newly changed role assignment from PostgreSQL.
      await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const invalidatedSessions = await client.query(
        `UPDATE eper_customer_browser_sessions
            SET revoked_at=NOW(), revoked_reason='platform_customer_admin_role_changed'
          WHERE tenant_id=$1 AND actor_id=$2 AND revoked_at IS NULL`,
        [input.tenantId, input.targetActorId],
      );
      if ((invalidatedSessions.rowCount ?? 0) > 0) {
        await client.query(
          `INSERT INTO eper_customer_identity_events
            (tenant_id, actor_id, action, outcome, correlation_id, metadata)
           VALUES ($1,$2,'session.revoked','success',$3,$4::jsonb)`,
          [input.tenantId, input.targetActorId, input.correlationId,
            JSON.stringify({ reason: "platform_customer_admin_role_changed",
              revokedSessionCount: invalidatedSessions.rowCount })],
        );
      }
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        environment: input.environment,
        actorType: "human",
        actorId: input.principal.platformActorId,
        action: input.operation === "provision"
          ? "platform.customer_admin.provision"
          : "platform.customer_admin.recover",
        outcome: "success",
        reasonCode: input.operation === "recover" ? "verified_customer_admin_lockout" : "first_customer_admin",
        resourceType: "workflow-actor-role-assignment",
        resourceId: input.targetActorId,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        source: "platform",
        operationName: input.operation === "provision"
          ? "POST /platform/tenants/:tenantId/applications/:applicationId/customer-admins"
          : "POST /platform/tenants/:tenantId/applications/:applicationId/customer-admin-recovery",
        serviceVersion: input.serviceVersion,
        payload: {
          platformActorId: input.principal.platformActorId,
          credentialId: input.principal.credentialId,
          targetActorId: input.targetActorId,
          roleId: CUSTOMER_ADMIN_ROLE_ID,
          operation: input.operation,
          reasonTicketReference: input.operation === "recover" ? input.reasonTicketReference : undefined,
          assignmentVersion: result.version,
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
