import { createHash } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type { TrustedPlatformAdminPrincipal } from "../identity/platform-admin-principal.js";

export interface PlatformApplicationRemediationInput {
  principal: TrustedPlatformAdminPrincipal;
  tenantId: string;
  applicationId: string;
  expectedAssignmentVersion: number;
  reasonTicketReference: string;
  idempotencyKey: string;
  correlationId: string;
  environment: AuditEnvironment;
  serviceVersion?: string;
}

export interface PlatformApplicationRemediationResult {
  tenantId: string;
  applicationId: string;
  assignmentStatus: "revoked";
  assignmentVersion: number;
  activeApplicationCount: number;
  maxApplications: number | null;
  tariffAccessState: "within_allowance" | "over_allowance" | "tariff_inactive" | "tariff_missing" | "customer_inactive";
  evaluatedAt: string;
  correlationId: string;
  replayed: boolean;
}

type AssignmentRow = {
  tenant_id: string; application_id: string; assignment_status: "active" | "revoked";
  version: number | string;
};

function validateIdentifier(value: string, name: string, max = 128): void {
  if (typeof value !== "string" || value.length < 2 || value.length > max ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new Error("PLATFORM_APPLICATION_REMEDIATION_INVALID_" + name.toUpperCase());
  }
}

function hashRequest(input: PlatformApplicationRemediationInput): string {
  return createHash("sha256").update(JSON.stringify({
    tenantId: input.tenantId,
    applicationId: input.applicationId,
    expectedAssignmentVersion: input.expectedAssignmentVersion,
    reasonTicketReference: input.reasonTicketReference,
    platformActorId: input.principal.platformActorId,
    credentialId: input.principal.credentialId,
  })).digest("hex");
}

/** A platform-only, one-assignment mutation. Never changes tariff or customer lifecycle. */
export class PostgresPlatformApplicationRemediationStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        ledger_table: string | null; assignment_table: string | null;
        customer_table: string | null; tariff_table: string | null;
        row_security: boolean; force_row_security: boolean;
      }>(`
        SELECT
          to_regclass('public.eper_platform_application_remediation_idempotency')::text AS ledger_table,
          to_regclass('public.eper_tenant_application_assignment')::text AS assignment_table,
          to_regclass('public.eper_customer_account')::text AS customer_table,
          to_regclass('public.eper_customer_tariff_assignment')::text AS tariff_table,
          COALESCE(c.relrowsecurity, false) AS row_security,
          COALESCE(c.relforcerowsecurity, false) AS force_row_security
        FROM (SELECT 1) seed
        LEFT JOIN pg_class c ON c.oid = to_regclass('public.eper_platform_application_remediation_idempotency')
      `);
      const row = result.rows[0];
      if (!row?.ledger_table || !row.assignment_table || !row.customer_table || !row.tariff_table ||
          !row.row_security || !row.force_row_security) {
        throw new Error("EPER_PLATFORM_APPLICATION_REMEDIATION_SCHEMA_NOT_READY");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_PLATFORM_APPLICATION_REMEDIATION_SCHEMA_NOT_READY") throw error;
      throw new Error("EPER_PLATFORM_APPLICATION_REMEDIATION_READINESS_FAILED", { cause: error });
    } finally { client.release(); }
  }

  async remediate(input: PlatformApplicationRemediationInput): Promise<PlatformApplicationRemediationResult> {
    if (!input.principal.permissions.includes("application:remediate")) {
      throw new Error("PLATFORM_APPLICATION_REMEDIATION_PERMISSION_DENIED");
    }
    validateIdentifier(input.principal.platformActorId, "platformActorId");
    validateIdentifier(input.principal.credentialId, "credentialId");
    validateIdentifier(input.tenantId, "tenantId");
    validateIdentifier(input.applicationId, "applicationId");
    validateIdentifier(input.idempotencyKey, "idempotencyKey", 200);
    validateIdentifier(input.correlationId, "correlationId");
    if (!Number.isSafeInteger(input.expectedAssignmentVersion) || input.expectedAssignmentVersion < 1) {
      throw new Error("PLATFORM_APPLICATION_REMEDIATION_EXPECTED_VERSION_INVALID");
    }
    if (typeof input.reasonTicketReference !== "string" || !input.reasonTicketReference.trim() ||
        input.reasonTicketReference.length > 200) {
      throw new Error("PLATFORM_APPLICATION_REMEDIATION_REASON_REQUIRED");
    }

    const requestHash = hashRequest(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["eper-tenant-commercial:" + input.tenantId]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        JSON.stringify(["platform-application-remediation", input.tenantId, input.applicationId, input.idempotencyKey]),
      ]);

      const priorRequest = await client.query<{ request_hash: string; result: PlatformApplicationRemediationResult | string | null; completed_at: string | Date | null }>(
        `SELECT request_hash, result, completed_at
           FROM eper_platform_application_remediation_idempotency
          WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.idempotencyKey],
      );
      if (priorRequest.rows[0]) {
        const prior = priorRequest.rows[0];
        if (prior.request_hash.trim() !== requestHash) throw new Error("PLATFORM_APPLICATION_REMEDIATION_IDEMPOTENCY_KEY_REUSED");
        if (!prior.completed_at || !prior.result) throw new Error("PLATFORM_APPLICATION_REMEDIATION_IDEMPOTENCY_INCOMPLETE");
        const saved = typeof prior.result === "string" ? JSON.parse(prior.result) as PlatformApplicationRemediationResult : prior.result;
        await client.query("COMMIT");
        return { ...saved, replayed: true };
      }

      const customer = await client.query<{ customer_status: string }>(
        "SELECT customer_status FROM eper_customer_account WHERE tenant_id=$1 FOR SHARE", [input.tenantId]);
      if (!customer.rows[0]) throw new Error("PLATFORM_APPLICATION_REMEDIATION_CUSTOMER_NOT_FOUND");
      if (customer.rows[0].customer_status !== "active") throw new Error("PLATFORM_APPLICATION_REMEDIATION_CUSTOMER_INACTIVE");

      const assignment = await client.query<AssignmentRow>(
        `SELECT tenant_id, application_id, assignment_status, version
           FROM eper_tenant_application_assignment
          WHERE tenant_id=$1 AND application_id=$2
          FOR UPDATE`,
        [input.tenantId, input.applicationId],
      );
      const current = assignment.rows[0];
      if (!current || current.assignment_status !== "active") throw new Error("PLATFORM_APPLICATION_REMEDIATION_ASSIGNMENT_NOT_ACTIVE");
      if (Number(current.version) !== input.expectedAssignmentVersion) {
        throw new Error("PLATFORM_APPLICATION_REMEDIATION_VERSION_CONFLICT");
      }

      await client.query(
        `INSERT INTO eper_platform_application_remediation_idempotency
          (tenant_id, application_id, idempotency_key, request_hash, platform_actor_id,
           credential_id, expected_assignment_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [input.tenantId, input.applicationId, input.idempotencyKey, requestHash,
          input.principal.platformActorId, input.principal.credentialId, input.expectedAssignmentVersion],
      );

      const changed = await client.query<AssignmentRow>(
        `UPDATE eper_tenant_application_assignment
            SET assignment_status='revoked', version=version+1, revoked_at=NOW(),
                revoked_by=$3, updated_at=NOW(), updated_by=$3
          WHERE tenant_id=$1 AND application_id=$2
            AND assignment_status='active' AND version=$4
          RETURNING tenant_id, application_id, assignment_status, version`,
        [input.tenantId, input.applicationId, input.principal.platformActorId, input.expectedAssignmentVersion],
      );
      if (!changed.rows[0]) throw new Error("PLATFORM_APPLICATION_REMEDIATION_VERSION_CONFLICT");

      const count = await client.query<{ active_count: number | string }>(
        "SELECT COUNT(*)::int AS active_count FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND assignment_status='active'",
        [input.tenantId],
      );
      const tariff = await client.query<{
        customer_status: string; assignment_status: string | null; tariff_effective: boolean;
        max_applications: number | string | null; evaluated_at: string | Date;
      }>(
        `SELECT c.customer_status, t.assignment_status,
                 (t.starts_at <= NOW() AND (t.ends_at IS NULL OR t.ends_at > NOW())) AS tariff_effective,
                 t.max_applications, NOW() AS evaluated_at
           FROM eper_customer_account c
           LEFT JOIN eper_customer_tariff_assignment t ON t.tenant_id=c.tenant_id
          WHERE c.tenant_id=$1`,
        [input.tenantId],
      );
      const activeApplicationCount = Number(count.rows[0]?.active_count ?? 0);
      const tariffRow = tariff.rows[0];
      const maxApplications = tariffRow?.max_applications == null ? null : Number(tariffRow.max_applications);
      const effective = tariffRow?.assignment_status === "active" && tariffRow.tariff_effective === true;
      const tariffAccessState: PlatformApplicationRemediationResult["tariffAccessState"] =
        tariffRow?.customer_status !== "active" ? "customer_inactive" :
        !tariffRow?.assignment_status ? "tariff_missing" :
        !effective ? "tariff_inactive" :
        maxApplications !== null && activeApplicationCount > maxApplications ? "over_allowance" : "within_allowance";
      const result: PlatformApplicationRemediationResult = {
        tenantId: input.tenantId, applicationId: input.applicationId,
        assignmentStatus: "revoked", assignmentVersion: Number(changed.rows[0].version),
        activeApplicationCount, maxApplications, tariffAccessState,
        evaluatedAt: tariffRow?.evaluated_at ? new Date(tariffRow.evaluated_at).toISOString() : new Date().toISOString(), correlationId: input.correlationId, replayed: false,
      };

      await client.query(
        `UPDATE eper_platform_application_remediation_idempotency
            SET result=$4::jsonb, completed_at=NOW()
          WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3`,
        [input.tenantId, input.applicationId, input.idempotencyKey, JSON.stringify(result)],
      );
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.principal.platformActorId,
        action: "platform.application_assignment.remediate", outcome: "success",
        reasonCode: "product_admin_application_remediation",
        resourceType: "tenant-application-assignment", resourceId: input.applicationId,
        correlationId: input.correlationId, idempotencyKey: input.idempotencyKey,
        source: "platform", operationName: "POST /platform/tenants/:tenantId/applications/:applicationId/remediation",
        serviceVersion: input.serviceVersion,
        payload: {
          credentialId: input.principal.credentialId, expectedAssignmentVersion: input.expectedAssignmentVersion,
          resultingAssignmentVersion: result.assignmentVersion, reasonTicketReference: input.reasonTicketReference,
          activeApplicationCount, maxApplications, tariffAccessState,
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
}
