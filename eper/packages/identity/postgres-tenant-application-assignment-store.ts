import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export interface TenantApplicationAssignment {
  tenantId: string; applicationId: string; status: "active" | "revoked"; version: number;
  assignedAt: string; assignedBy: string; revokedAt: string | null; revokedBy: string | null;
  updatedAt: string; updatedBy: string;
}
export interface ChangeTenantApplicationAssignmentInput {
  tenantId: string; applicationId: string; changedBy: string; expectedVersion: number;
  environment: AuditEnvironment; correlationId: string; serviceVersion?: string;
}
type Row = { tenant_id: string; application_id: string; assignment_status: "active" | "revoked";
  version: number | string; assigned_at: string | Date; assigned_by: string;
  revoked_at: string | Date | null; revoked_by: string | null; updated_at: string | Date; updated_by: string };
function mapRow(row: Row): TenantApplicationAssignment {
  return { tenantId: row.tenant_id, applicationId: row.application_id, status: row.assignment_status,
    version: Number(row.version), assignedAt: new Date(row.assigned_at).toISOString(), assignedBy: row.assigned_by,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null, revokedBy: row.revoked_by,
    updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.updated_by };
}
export class TenantApplicationAssignmentVersionConflictError extends Error {
  constructor(readonly currentVersion: number) { super("TENANT_APPLICATION_ASSIGNMENT_VERSION_CONFLICT"); }
}
/** Durable tenant ownership allowlist. Mutations require a trusted platform-admin identity. */
export class PostgresTenantApplicationAssignmentStore {
  constructor(private readonly pool: AuditSqlPool) {}
  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        assignment_table: string | null;
        customer_table: string | null;
        tariff_plan_table: string | null;
        tariff_assignment_table: string | null;
      }>(`SELECT
        to_regclass('public.eper_tenant_application_assignment')::text AS assignment_table,
        to_regclass('public.eper_customer_account')::text AS customer_table,
        to_regclass('public.eper_commercial_tariff_plan')::text AS tariff_plan_table,
        to_regclass('public.eper_customer_tariff_assignment')::text AS tariff_assignment_table`);
      const row = result.rows[0];
      if (!row?.assignment_table || !row.customer_table || !row.tariff_plan_table || !row.tariff_assignment_table) {
        throw new Error("EPER_CUSTOMER_COMMERCIAL_SCHEMA_NOT_APPLIED");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_CUSTOMER_COMMERCIAL_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_TENANT_APPLICATION_ASSIGNMENT_READINESS_FAILED", { cause: error });
    } finally { client.release(); }
  }
  async listActive(tenantId: string): Promise<string[]> {
    this.validateId(tenantId, "tenantId");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ application_id: string }>("SELECT application_id FROM eper_tenant_application_assignment WHERE tenant_id = $1 AND assignment_status = 'active' ORDER BY application_id", [tenantId]);
      return result.rows.map(row => row.application_id);
    } finally { client.release(); }
  }
  async listAssignments(tenantId: string): Promise<TenantApplicationAssignment[]> {
    this.validateId(tenantId, "tenantId");
    const client = await this.pool.connect();
    try {
      const result = await client.query<Row>("SELECT * FROM eper_tenant_application_assignment WHERE tenant_id = $1 ORDER BY application_id", [tenantId]);
      return result.rows.map(mapRow);
    } finally { client.release(); }
  }
  async assign(input: ChangeTenantApplicationAssignmentInput): Promise<TenantApplicationAssignment> { return this.change(input, "active"); }
  async revoke(input: ChangeTenantApplicationAssignmentInput): Promise<TenantApplicationAssignment> { return this.change(input, "revoked"); }
  private async change(input: ChangeTenantApplicationAssignmentInput, status: "active" | "revoked"): Promise<TenantApplicationAssignment> {
    this.validateId(input.tenantId, "tenantId"); this.validateId(input.applicationId, "applicationId"); this.validateId(input.changedBy, "changedBy");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("TENANT_APPLICATION_ASSIGNMENT_EXPECTED_VERSION_INVALID");
    if (!input.correlationId?.trim() || input.correlationId.length > 128) throw new Error("TENANT_APPLICATION_ASSIGNMENT_CORRELATION_ID_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize every activation for a tenant so concurrent requests cannot exceed its tariff.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["eper-tenant-commercial:" + input.tenantId]);
      const prior = await client.query<{ version: number | string }>("SELECT version FROM eper_tenant_application_assignment WHERE tenant_id = $1 AND application_id = $2 FOR UPDATE", [input.tenantId, input.applicationId]);
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].version) : 0;
      if (!prior.rows[0] && status === "revoked") throw new Error("TENANT_APPLICATION_ASSIGNMENT_NOT_FOUND");
      if (currentVersion !== input.expectedVersion) throw new TenantApplicationAssignmentVersionConflictError(currentVersion);
      if (status === "active") {
        const commercial = await client.query<{
          customer_status: string;
          assignment_status: string | null;
          starts_at: string | Date | null;
          ends_at: string | Date | null;
          max_applications: number | string | null;
          active_application_count: number | string;
        }>(`
          SELECT c.customer_status, t.assignment_status, t.starts_at, t.ends_at,
                 t.max_applications,
                 (SELECT COUNT(*) FROM eper_tenant_application_assignment a
                   WHERE a.tenant_id = c.tenant_id
                     AND a.assignment_status = 'active'
                     AND a.application_id <> $2) AS active_application_count
            FROM eper_customer_account c
            LEFT JOIN eper_customer_tariff_assignment t ON t.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1
           FOR UPDATE OF c
        `, [input.tenantId, input.applicationId]);
        const control = commercial.rows[0];
        if (!control) throw new Error("CUSTOMER_COMMERCIAL_ACCOUNT_NOT_CONFIGURED");
        if (control.customer_status !== "active") throw new Error("CUSTOMER_NOT_ACTIVE");
        if (control.assignment_status !== "active" ||
            (control.starts_at && new Date(control.starts_at).getTime() > Date.now()) ||
            (control.ends_at && new Date(control.ends_at).getTime() <= Date.now())) {
          throw new Error("CUSTOMER_TARIFF_NOT_ACTIVE");
        }
        if (Number(control.active_application_count) >= Number(control.max_applications)) {
          throw new Error("CUSTOMER_APPLICATION_TARIFF_LIMIT_EXCEEDED");
        }
      }
      const saved = await client.query<Row>(`INSERT INTO eper_tenant_application_assignment
        (tenant_id, application_id, assignment_status, version, assigned_at, assigned_by, revoked_at, revoked_by, updated_at, updated_by)
        VALUES ($1,$2,$3,1,CASE WHEN $3='active' THEN NOW() ELSE NOW() END,$4,CASE WHEN $3='revoked' THEN NOW() ELSE NULL END,CASE WHEN $3='revoked' THEN $4 ELSE NULL END,NOW(),$4)
        ON CONFLICT (tenant_id, application_id) DO UPDATE SET assignment_status=EXCLUDED.assignment_status,
        version=eper_tenant_application_assignment.version+1,
        assigned_at=CASE WHEN EXCLUDED.assignment_status='active' THEN NOW() ELSE eper_tenant_application_assignment.assigned_at END,
        assigned_by=CASE WHEN EXCLUDED.assignment_status='active' THEN EXCLUDED.assigned_by ELSE eper_tenant_application_assignment.assigned_by END,
        revoked_at=CASE WHEN EXCLUDED.assignment_status='revoked' THEN NOW() ELSE NULL END,
        revoked_by=CASE WHEN EXCLUDED.assignment_status='revoked' THEN EXCLUDED.revoked_by ELSE NULL END,
        updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *`,
        [input.tenantId,input.applicationId,status,input.changedBy]);
      if (!saved.rows[0]) throw new Error("TENANT_APPLICATION_ASSIGNMENT_WRITE_RETURNED_NO_ROW");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.changedBy,
        action: status === "active" ? "tenant.application_assignment.grant" : "tenant.application_assignment.revoke",
        outcome: "success", resourceType: "tenant-application-assignment", resourceId: input.applicationId,
        correlationId: input.correlationId, source: "api",
        operationName: status === "active" ? "POST /admin/tenant-application-assignments" : "DELETE /admin/tenant-application-assignments",
        serviceVersion: input.serviceVersion,
      });
      await client.query("COMMIT");
      return mapRow(saved.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  private validateId(value: string, name: string): void {
    if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) throw new Error("TENANT_APPLICATION_ASSIGNMENT_INVALID_" + name.toUpperCase());
  }
}
