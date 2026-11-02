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
        tariff_history_table: string | null;
      }>(`SELECT
        to_regclass('public.eper_tenant_application_assignment')::text AS assignment_table,
        to_regclass('public.eper_customer_account')::text AS customer_table,
        to_regclass('public.eper_commercial_tariff_plan')::text AS tariff_plan_table,
        to_regclass('public.eper_customer_tariff_assignment')::text AS tariff_assignment_table,
        to_regclass('public.eper_customer_tariff_assignment_history')::text AS tariff_history_table`);
      const row = result.rows[0];
      if (!row?.assignment_table || !row.customer_table || !row.tariff_plan_table || !row.tariff_assignment_table || !row.tariff_history_table) {
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
  async getCustomerTariffAssignment(tenantId: string): Promise<Record<string, unknown> | null> {
    this.validateId(tenantId, "tenantId");
    const client=await this.pool.connect();
    let row: Record<string, unknown> | undefined;
    try {
      const result = await client.query<Record<string, unknown>>(
        `SELECT tenant_id, tariff_key, tariff_version, billing_basis, max_applications,
                accepted_amount, accepted_currency, billing_interval, assignment_status,
                starts_at, ends_at, version, accepted_by, accepted_at, acceptance_reference
           FROM eper_customer_tariff_assignment WHERE tenant_id=$1`, [tenantId]);
      row=result.rows[0];
    } finally { client.release(); }
    if(!row) return null;
    return {tenantId:row.tenant_id,tariffKey:row.tariff_key,tariffVersion:Number(row.tariff_version),
      billingBasis:row.billing_basis,maxApplications:Number(row.max_applications),
      acceptedAmount:String(row.accepted_amount),acceptedCurrency:String(row.accepted_currency).trim(),
      billingInterval:row.billing_interval,assignmentStatus:row.assignment_status,
      startsAt:new Date(row.starts_at as string|Date).toISOString(),
      endsAt:row.ends_at?new Date(row.ends_at as string|Date).toISOString():null,
      version:Number(row.version),acceptedBy:row.accepted_by,
      acceptedAt:row.accepted_at?new Date(row.accepted_at as string|Date).toISOString():null,
      acceptanceReference:row.acceptance_reference??null};
  }
  async switchCustomerTariff(input: {
    tenantId: string; tariffKey: string; tariffVersion: number; changedBy: string;
    expectedVersion: number; acceptanceReference: string; environment: AuditEnvironment;
    correlationId: string; serviceVersion?: string;
  }): Promise<{ tenantId: string; tariffKey: string; tariffVersion: number; billingBasis: string;
    maxApplications: number; acceptedAmount: string; acceptedCurrency: string; billingInterval: string;
    version: number; startsAt: string; endsAt: string | null; acceptedBy: string;
    acceptedAt: string; acceptanceReference: string }> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.changedBy, "changedBy");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(input.tariffKey) ||
        !Number.isSafeInteger(input.tariffVersion) || input.tariffVersion < 1 ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
        !input.acceptanceReference.trim() || input.acceptanceReference.length > 200 ||
        !input.correlationId?.trim() || input.correlationId.length > 128) {
      throw new Error("CUSTOMER_TARIFF_SWITCH_INPUT_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["eper-tenant-commercial:" + input.tenantId]);
      const customer = await client.query<{ customer_status: string }>(
        "SELECT customer_status FROM eper_customer_account WHERE tenant_id=$1 FOR UPDATE", [input.tenantId]);
      if (!customer.rows[0]) throw new Error("CUSTOMER_COMMERCIAL_ACCOUNT_NOT_CONFIGURED");
      if (customer.rows[0].customer_status !== "active") throw new Error("CUSTOMER_NOT_ACTIVE");
      const current = await client.query<{ version: number | string }>(
        "SELECT version FROM eper_customer_tariff_assignment WHERE tenant_id=$1 FOR UPDATE", [input.tenantId]);
      const currentVersion = current.rows[0] ? Number(current.rows[0].version) : 0;
      if (currentVersion !== input.expectedVersion) throw new Error("CUSTOMER_TARIFF_VERSION_CONFLICT");
      const plan = await client.query<{
        billing_basis: string; max_applications: number | string; amount: string | number;
        currency: string; billing_interval: string; effective_from: string | Date; effective_to: string | Date | null;
        approval_state: string;
      }>(`SELECT billing_basis, max_applications, amount, currency, billing_interval,
                 effective_from, effective_to, approval_state
            FROM eper_commercial_tariff_plan
           WHERE tariff_key=$1 AND tariff_version=$2 AND tariff_status='active'
             AND effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW())
           FOR SHARE`, [input.tariffKey, input.tariffVersion]);
      const tariff = plan.rows[0];
      if (!tariff) throw new Error("CUSTOMER_TARIFF_VERSION_NOT_EFFECTIVE");
      if (tariff.approval_state === "pending" || tariff.approval_state === "rejected") {
        throw new Error("CUSTOMER_TARIFF_VERSION_NOT_APPROVED");
      }
      const active = await client.query<{ count: number | string }>(
        "SELECT COUNT(*) AS count FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND assignment_status='active'",
        [input.tenantId]);
      if (Number(active.rows[0]?.count ?? 0) > Number(tariff.max_applications)) {
        throw new Error("CUSTOMER_TARIFF_SWITCH_REQUIRES_APPLICATION_SELECTION");
      }
      if (current.rows[0]) {
        // Backfill pre-history assignments (including legacy rows created before migration 011).
        await client.query(`INSERT INTO eper_customer_tariff_assignment_history
          (tenant_id, assignment_version, tariff_key, tariff_version, billing_basis, max_applications,
           accepted_amount, accepted_currency, billing_interval, assignment_status, starts_at, ends_at,
           accepted_by, accepted_at, acceptance_reference)
          SELECT tenant_id, version, tariff_key, tariff_version, billing_basis, max_applications,
                 accepted_amount, accepted_currency, billing_interval, assignment_status, starts_at, ends_at,
                 COALESCE(accepted_by, updated_by), COALESCE(accepted_at, updated_at),
                 COALESCE(acceptance_reference, 'legacy-existing-acceptance')
            FROM eper_customer_tariff_assignment
           WHERE tenant_id=$1 AND version=$2
          ON CONFLICT (tenant_id, assignment_version) DO NOTHING`, [input.tenantId,currentVersion]);
      }
      const version = currentVersion + 1;
      const saved = await client.query<{
        tenant_id: string; tariff_key: string; tariff_version: number | string; billing_basis: string;
        max_applications: number | string; accepted_amount: string | number; accepted_currency: string;
        billing_interval: string; version: number | string; starts_at: string | Date; ends_at: string | Date | null;
        accepted_by: string; accepted_at: string | Date; acceptance_reference: string;
      }>(`INSERT INTO eper_customer_tariff_assignment
          (tenant_id, tariff_key, tariff_version, billing_basis, max_applications, accepted_amount,
           accepted_currency, billing_interval, assignment_status, starts_at, ends_at, version,
           updated_at, updated_by, accepted_by, accepted_at, acceptance_reference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),$9,$10,NOW(),$11,$11,NOW(),$12)
        ON CONFLICT (tenant_id) DO UPDATE SET
          tariff_key=EXCLUDED.tariff_key, tariff_version=EXCLUDED.tariff_version,
          billing_basis=EXCLUDED.billing_basis, max_applications=EXCLUDED.max_applications,
          accepted_amount=EXCLUDED.accepted_amount, accepted_currency=EXCLUDED.accepted_currency,
          billing_interval=EXCLUDED.billing_interval, assignment_status='active',
          starts_at=NOW(), ends_at=EXCLUDED.ends_at, version=EXCLUDED.version,
          updated_at=NOW(), updated_by=EXCLUDED.updated_by, accepted_by=EXCLUDED.accepted_by,
          accepted_at=NOW(), acceptance_reference=EXCLUDED.acceptance_reference
        RETURNING tenant_id, tariff_key, tariff_version, billing_basis, max_applications,
          accepted_amount, accepted_currency, billing_interval, version, starts_at, ends_at,
          accepted_by, accepted_at, acceptance_reference`,
        [input.tenantId,input.tariffKey,input.tariffVersion,tariff.billing_basis,Number(tariff.max_applications),
          String(tariff.amount),String(tariff.currency).trim(),tariff.billing_interval,tariff.effective_to,
          version,input.changedBy,input.acceptanceReference]);
      const row=saved.rows[0];
      if(!row) throw new Error("CUSTOMER_TARIFF_SWITCH_WRITE_RETURNED_NO_ROW");
      await client.query(`INSERT INTO eper_customer_tariff_assignment_history
        (tenant_id, assignment_version, tariff_key, tariff_version, billing_basis, max_applications,
         accepted_amount, accepted_currency, billing_interval, assignment_status, starts_at, ends_at,
         accepted_by, accepted_at, acceptance_reference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$13,$14)`,
        [row.tenant_id,Number(row.version),row.tariff_key,Number(row.tariff_version),row.billing_basis,
          Number(row.max_applications),String(row.accepted_amount),String(row.accepted_currency).trim(),
          row.billing_interval,row.starts_at,row.ends_at,row.accepted_by,row.accepted_at,row.acceptance_reference]);
      await appendAuditEventInTransaction(client as AuditSqlClient,{
        tenantId:input.tenantId,applicationId:"platform",environment:input.environment,actorType:"human",
        actorId:input.changedBy,action:"customer.commercial_tariff.switched",outcome:"success",
        reasonCode:"CUSTOMER_ACCEPTED_PUBLISHED_TARIFF",resourceType:"customer-tariff-assignment",
        resourceId:input.tenantId,correlationId:input.correlationId,source:"api",
        operationName:"POST /customer/commercial-tariff",serviceVersion:input.serviceVersion,
        approvalId:input.acceptanceReference,
        payload:{tariffKey:row.tariff_key,tariffVersion:Number(row.tariff_version),
          billingBasis:row.billing_basis,maxApplications:Number(row.max_applications),
          acceptedAmount:String(row.accepted_amount),acceptedCurrency:String(row.accepted_currency).trim(),
          billingInterval:row.billing_interval,assignmentVersion:Number(row.version),
          acceptanceReference:row.acceptance_reference},
      });
      await client.query("COMMIT");
      return {tenantId:row.tenant_id,tariffKey:row.tariff_key,tariffVersion:Number(row.tariff_version),
        billingBasis:row.billing_basis,maxApplications:Number(row.max_applications),
        acceptedAmount:String(row.accepted_amount),acceptedCurrency:String(row.accepted_currency).trim(),
        billingInterval:row.billing_interval,version:Number(row.version),startsAt:new Date(row.starts_at).toISOString(),
        endsAt:row.ends_at?new Date(row.ends_at).toISOString():null,acceptedBy:row.accepted_by,
        acceptedAt:new Date(row.accepted_at).toISOString(),acceptanceReference:row.acceptance_reference};
    } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
    finally { client.release(); }
  }
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
          tariff_effective: boolean;
          max_applications: number | string | null;
          active_application_count: number | string;
        }>(`
          SELECT c.customer_status, t.assignment_status,
                 (t.starts_at <= NOW() AND (t.ends_at IS NULL OR t.ends_at > NOW())) AS tariff_effective,
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
        if (control.assignment_status !== "active" || control.tariff_effective !== true) {
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
