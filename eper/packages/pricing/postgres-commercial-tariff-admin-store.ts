import type { Pool } from "pg";
import { appendAuditEventInTransaction, type AuditEnvironment } from "../audit/audit-event-store.js";

export type CommercialBillingBasis = "single_application" | "multi_application";
export type CommercialBillingInterval = "monthly" | "annual" | "one_time";
export type CommercialTariffStatus = "draft" | "active" | "retired";
export type CommercialApprovalState = "not_required" | "pending" | "approved" | "rejected";

export interface CommercialTariffInput {
  tariffKey: string;
  billingBasis: CommercialBillingBasis;
  maxApplications: number;
  amount: string;
  currency: string;
  billingInterval: CommercialBillingInterval;
  effectiveFrom: string;
  effectiveTo?: string | null;
  changeReason: string;
  approvalRequired: boolean;
}

export interface CommercialTariffRecord extends CommercialTariffInput {
  tariffVersion: number;
  tariffStatus: CommercialTariffStatus;
  approvalState: CommercialApprovalState;
  createdAt: string;
  createdBy: string;
  publishedAt?: string | null;
  publishedBy?: string | null;
}

export interface CommercialTariffAdminContext {
  tenantId: string;
  actorId: string;
  correlationId: string;
  environment: AuditEnvironment;
  serviceVersion?: string;
}

export class CommercialTariffAdminError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "CommercialTariffAdminError";
  }
}

type SqlClient = {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  release(): void;
};

function validateInput(input: CommercialTariffInput): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(input.tariffKey)) throw new CommercialTariffAdminError("INVALID_TARIFF_KEY", 400);
  if (!["single_application", "multi_application"].includes(input.billingBasis)) throw new CommercialTariffAdminError("INVALID_BILLING_BASIS", 400);
  if (!Number.isSafeInteger(input.maxApplications) ||
      (input.billingBasis === "single_application" ? input.maxApplications !== 1 : input.maxApplications < 2)) {
    throw new CommercialTariffAdminError("INVALID_APPLICATION_ALLOWANCE", 400);
  }
  if (!/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,4})?$/.test(input.amount)) throw new CommercialTariffAdminError("INVALID_TARIFF_AMOUNT", 400);
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new CommercialTariffAdminError("INVALID_TARIFF_CURRENCY", 400);
  if (!["monthly", "annual", "one_time"].includes(input.billingInterval)) throw new CommercialTariffAdminError("INVALID_BILLING_INTERVAL", 400);
  if (!input.changeReason.trim() || input.changeReason.length > 1000) throw new CommercialTariffAdminError("TARIFF_CHANGE_REASON_REQUIRED", 400);
  const start = Date.parse(input.effectiveFrom);
  const end = input.effectiveTo ? Date.parse(input.effectiveTo) : null;
  if (!Number.isFinite(start) || (input.effectiveTo && (!Number.isFinite(end) || (end as number) <= start))) {
    throw new CommercialTariffAdminError("INVALID_TARIFF_EFFECTIVE_DATES", 400);
  }
}

function mapRecord(row: Record<string, unknown>): CommercialTariffRecord {
  return {
    tariffKey: String(row.tariff_key), tariffVersion: Number(row.tariff_version),
    billingBasis: row.billing_basis as CommercialBillingBasis, maxApplications: Number(row.max_applications),
    amount: String(row.amount), currency: String(row.currency).trim(),
    billingInterval: row.billing_interval as CommercialBillingInterval,
    effectiveFrom: new Date(row.effective_from as string | Date).toISOString(),
    effectiveTo: row.effective_to ? new Date(row.effective_to as string | Date).toISOString() : null,
    changeReason: String(row.change_reason ?? ""), approvalRequired: row.approval_required === true,
    approvalState: row.approval_state as CommercialApprovalState,
    tariffStatus: row.tariff_status as CommercialTariffStatus,
    createdAt: new Date(row.created_at as string | Date).toISOString(), createdBy: String(row.created_by),
    publishedAt: row.published_at ? new Date(row.published_at as string | Date).toISOString() : null,
    publishedBy: row.published_by == null ? null : String(row.published_by),
  };
}

export class PostgresCommercialTariffAdminStore {
  constructor(private readonly pool: Pool) {}

  async assertReady(): Promise<void> {
    const result = await this.pool.query<{ plans: string | null; audit: string | null }>(`
      SELECT to_regclass('public.eper_commercial_tariff_plan')::text AS plans,
             to_regclass('public.eper_audit_events')::text AS audit
    `);
    if (!result.rows[0]?.plans) throw new Error("COMMERCIAL_TARIFF_SCHEMA_NOT_APPLIED");
    if (!result.rows[0]?.audit) throw new Error("COMMERCIAL_TARIFF_REQUIRES_DURABLE_AUDIT");
    const columns = await this.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='eper_commercial_tariff_plan'
    `);
    const names = new Set(columns.rows.map((row) => row.column_name));
    for (const required of ["change_reason", "approval_required", "approval_state", "published_at", "published_by", "approved_at", "approved_by", "approval_reference"]) {
      if (!names.has(required)) throw new Error("COMMERCIAL_TARIFF_SCHEMA_VERSION_UNSUPPORTED");
    }
  }

  async list(context: CommercialTariffAdminContext): Promise<CommercialTariffRecord[]> {
    void context;
    const result = await this.pool.query(`
      SELECT * FROM eper_commercial_tariff_plan
      ORDER BY tariff_key ASC, tariff_version DESC
      LIMIT 5000
    `);
    return result.rows.map((row) => mapRecord(row as Record<string, unknown>));
  }

  async createDraft(input: CommercialTariffInput, context: CommercialTariffAdminContext): Promise<CommercialTariffRecord> {
    validateInput(input);
    const client = await this.pool.connect() as unknown as SqlClient;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`eper-commercial-tariff:${input.tariffKey}`]);
      const latest = await client.query<{ tariff_version: number }>(
        "SELECT COALESCE(MAX(tariff_version), 0) AS tariff_version FROM eper_commercial_tariff_plan WHERE tariff_key=$1",
        [input.tariffKey],
      );
      const version = Number(latest.rows[0]?.tariff_version ?? 0) + 1;
      const approvalState: CommercialApprovalState = input.approvalRequired ? "pending" : "not_required";
      const inserted = await client.query<Record<string, unknown>>( `
        INSERT INTO eper_commercial_tariff_plan (
          tariff_key, tariff_version, billing_basis, max_applications, amount, currency,
          billing_interval, effective_from, effective_to, tariff_status, created_by,
          change_reason, approval_required, approval_state
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12,$13)
        RETURNING *
      `, [input.tariffKey, version, input.billingBasis, input.maxApplications, input.amount,
        input.currency, input.billingInterval, input.effectiveFrom, input.effectiveTo ?? null,
        context.actorId, input.changeReason, input.approvalRequired, approvalState]);
      const record = inserted.rows[0];
      if (!record) throw new Error("COMMERCIAL_TARIFF_INSERT_RETURNED_NO_ROW");
      await appendAuditEventInTransaction(client as never, {
        tenantId: context.tenantId, applicationId: "platform", environment: context.environment,
        actorType: "human", actorId: context.actorId, action: "commercial.tariff.draft_created",
        outcome: "success", reasonCode: "PRODUCT_ADMIN_TARIFF_DRAFT", resourceType: "commercial_tariff",
        resourceId: input.tariffKey + ":" + version, correlationId: context.correlationId,
        source: "api", operationName: "commercial-tariff.create-draft", serviceVersion: context.serviceVersion,
        payload: { tariffKey: input.tariffKey, tariffVersion: version, billingBasis: input.billingBasis,
          maxApplications: input.maxApplications, amount: input.amount, currency: input.currency,
          billingInterval: input.billingInterval, effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null, approvalRequired: input.approvalRequired,
          changeReason: input.changeReason },
      });
      await client.query("COMMIT");
      return mapRecord(record);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      if (error instanceof CommercialTariffAdminError) throw error;
      const message = error instanceof Error ? error.message : "";
      if (message.includes("eper_commercial_tariff_plan_pkey")) throw new CommercialTariffAdminError("TARIFF_VERSION_CONFLICT", 409);
      throw error;
    } finally { client.release(); }
  }

  async approve(input: { tariffKey: string; tariffVersion: number; approvalReference: string }, context: CommercialTariffAdminContext): Promise<CommercialTariffRecord> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(input.tariffKey) ||
        !Number.isSafeInteger(input.tariffVersion) || input.tariffVersion < 1 ||
        !input.approvalReference.trim() || input.approvalReference.length > 200) {
      throw new CommercialTariffAdminError("INVALID_TARIFF_APPROVAL_INPUT", 400);
    }
    const client = await this.pool.connect() as unknown as SqlClient;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`eper-commercial-tariff:${input.tariffKey}`]);
      const found = await client.query<Record<string, unknown>>(
        "SELECT * FROM eper_commercial_tariff_plan WHERE tariff_key=$1 AND tariff_version=$2 FOR UPDATE",
        [input.tariffKey, input.tariffVersion],
      );
      if (!found.rows[0]) throw new CommercialTariffAdminError("TARIFF_VERSION_NOT_FOUND", 404);
      const current = mapRecord(found.rows[0]);
      if (current.tariffStatus !== "draft" || current.approvalState !== "pending") {
        throw new CommercialTariffAdminError("TARIFF_NOT_AWAITING_APPROVAL", 409);
      }
      if (current.createdBy === context.actorId) throw new CommercialTariffAdminError("TARIFF_MAKER_CANNOT_APPROVE_OWN_CHANGE", 403);
      const approved = await client.query<Record<string, unknown>>( `
        UPDATE eper_commercial_tariff_plan
        SET approval_state='approved', approved_at=NOW(), approved_by=$3, approval_reference=$4
        WHERE tariff_key=$1 AND tariff_version=$2 AND tariff_status='draft' AND approval_state='pending'
        RETURNING *
      `, [input.tariffKey, input.tariffVersion, context.actorId, input.approvalReference]);
      if (!approved.rows[0]) throw new CommercialTariffAdminError("TARIFF_APPROVAL_CONFLICT", 409);
      await appendAuditEventInTransaction(client as never, {
        tenantId: context.tenantId, applicationId: "platform", environment: context.environment,
        actorType: "human", actorId: context.actorId, action: "commercial.tariff.approved",
        outcome: "success", reasonCode: "PRODUCT_ADMIN_TARIFF_APPROVED", resourceType: "commercial_tariff",
        resourceId: input.tariffKey + ":" + input.tariffVersion, correlationId: context.correlationId,
        source: "api", operationName: "commercial-tariff.approve", serviceVersion: context.serviceVersion,
        approvalId: input.approvalReference,
        payload: { tariffKey: input.tariffKey, tariffVersion: input.tariffVersion,
          createdBy: current.createdBy, approvalReference: input.approvalReference },
      });
      await client.query("COMMIT");
      return mapRecord(approved.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }

  async publish(input: { tariffKey: string; tariffVersion: number; expectedStatus: CommercialApprovalState; approvalReference?: string }, context: CommercialTariffAdminContext): Promise<CommercialTariffRecord> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(input.tariffKey) ||
        !Number.isSafeInteger(input.tariffVersion) || input.tariffVersion < 1) {
      throw new CommercialTariffAdminError("INVALID_TARIFF_VERSION_REFERENCE", 400);
    }
    const client = await this.pool.connect() as unknown as SqlClient;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`eper-commercial-tariff:${input.tariffKey}`]);
      const found = await client.query<Record<string, unknown>>(
        "SELECT * FROM eper_commercial_tariff_plan WHERE tariff_key=$1 AND tariff_version=$2 FOR UPDATE",
        [input.tariffKey, input.tariffVersion],
      );
      if (!found.rows[0]) throw new CommercialTariffAdminError("TARIFF_VERSION_NOT_FOUND", 404);
      const current = mapRecord(found.rows[0]);
      if (current.tariffStatus !== "draft") throw new CommercialTariffAdminError("PUBLISHED_TARIFF_VERSION_IMMUTABLE", 409);
      if (current.approvalState === "pending" || current.approvalState === "rejected") {
        throw new CommercialTariffAdminError("TARIFF_APPROVAL_REQUIRED", 409);
      }
      const published = await client.query<Record<string, unknown>>( `
        UPDATE eper_commercial_tariff_plan
        SET tariff_status='active', published_at=NOW(), published_by=$3
        WHERE tariff_key=$1 AND tariff_version=$2 AND tariff_status='draft'
        RETURNING *
      `, [input.tariffKey, input.tariffVersion, context.actorId]);
      if (!published.rows[0]) throw new CommercialTariffAdminError("TARIFF_PUBLISH_CONFLICT", 409);
      await appendAuditEventInTransaction(client as never, {
        tenantId: context.tenantId, applicationId: "platform", environment: context.environment,
        actorType: "human", actorId: context.actorId, action: "commercial.tariff.published",
        outcome: "success", reasonCode: "PRODUCT_ADMIN_TARIFF_PUBLISHED", resourceType: "commercial_tariff",
        resourceId: input.tariffKey + ":" + input.tariffVersion, correlationId: context.correlationId,
        source: "api", operationName: "commercial-tariff.publish", serviceVersion: context.serviceVersion,
        approvalId: input.approvalReference,
        payload: { tariffKey: input.tariffKey, tariffVersion: input.tariffVersion,
          approvalState: current.approvalState, approvalReference: input.approvalReference ?? null },
      });
      await client.query("COMMIT");
      return mapRecord(published.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
      throw error;
    } finally { client.release(); }
  }
}
