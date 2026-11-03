import {
  appendAuditEventInTransaction,
  assertAuditStoreReady,
  hashAuditEnvelope,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export type CustomerLifecycleStatus = "active" | "inactive" | "suspended" | "disabled";
export interface CustomerLifecycleRecord {
  tenantId: string;
  status: CustomerLifecycleStatus;
  reason: string;
  effectiveAt: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export interface ChangeCustomerLifecycleInput {
  tenantId: string;
  status: CustomerLifecycleStatus;
  reason: string;
  effectiveAt: string;
  expectedVersion: number;
  changedBy: string;
  environment: AuditEnvironment;
  correlationId: string;
  serviceVersion?: string;
}

type CustomerLifecycleRow = {
  tenant_id: string;
  customer_status: CustomerLifecycleStatus;
  status_reason: string;
  effective_at: string | Date;
  version: number | string;
  updated_at: string | Date;
  updated_by: string;
};

function mapRow(row: CustomerLifecycleRow): CustomerLifecycleRecord {
  return {
    tenantId: row.tenant_id,
    status: row.customer_status,
    reason: row.status_reason,
    effectiveAt: new Date(row.effective_at).toISOString(),
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by,
  };
}

export class CustomerLifecycleVersionConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super("CUSTOMER_LIFECYCLE_VERSION_CONFLICT");
    this.name = "CustomerLifecycleVersionConflictError";
  }
}

export class CustomerLifecycleStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CustomerLifecycleStoreError";
  }
}

/** Durable Product Admin controls for customer account status. */
export class PostgresCustomerLifecycleStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    try {
      // Validate the append-only chain and singleton head before accepting lifecycle traffic.
      await assertAuditStoreReady(this.pool);
      const client = await this.pool.connect();
      try {
        const columns = await client.query<{ table_name: string; column_name: string }>(`
          SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name IN ('eper_customer_account', 'eper_audit_events')
        `);
        const byTable = new Map<string, Set<string>>();
        for (const row of columns.rows) {
          const names = byTable.get(row.table_name) ?? new Set<string>();
          names.add(row.column_name);
          byTable.set(row.table_name, names);
        }
        const accountColumns = byTable.get("eper_customer_account") ?? new Set<string>();
        for (const required of ["tenant_id", "customer_status", "status_reason", "effective_at", "version", "updated_at", "updated_by"]) {
          if (!accountColumns.has(required)) throw new Error("CUSTOMER_LIFECYCLE_SCHEMA_VERSION_UNSUPPORTED");
        }
        const auditColumns = byTable.get("eper_audit_events") ?? new Set<string>();
        for (const required of ["event_id", "occurred_at", "tenant_id", "application_id", "environment", "actor_type",
          "actor_id", "effective_roles", "action", "outcome", "reason_code", "resource_type", "resource_id",
          "operation_id", "correlation_id", "request_id", "source", "operation_name", "service_version",
          "approval_id", "parent_event_id", "idempotency_key", "schema_version", "before_hash", "after_hash",
          "payload", "previous_event_hash", "event_hash", "integrity_metadata"]) {
          if (!auditColumns.has(required)) throw new Error("CUSTOMER_LIFECYCLE_AUDIT_SCHEMA_VERSION_UNSUPPORTED");
        }
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof Error && /CUSTOMER_LIFECYCLE_|EPER_AUDIT_/.test(error.message)) throw error;
      throw new Error("CUSTOMER_LIFECYCLE_READINESS_FAILED", { cause: error });
    }
  }

  async list(): Promise<Array<CustomerLifecycleRecord & {
    tariffKey: string | null; tariffVersion: number | null; billingBasis: string | null;
    tariffAssignmentStatus: string | null; tariffEffective: boolean;
    tariffAccessState: "customer_inactive" | "tariff_missing" | "tariff_inactive" | "tariff_not_started" | "tariff_expired" | "tariff_invalid" | "over_allowance" | "within_allowance";
    usageEvaluatedAt: string;
    activeApplicationIds: string[];
    maxApplications: number | null; activeApplicationCount: number;
    allowanceStatus: "not_configured" | "within_allowance" | "over_allowance";
  }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<CustomerLifecycleRow & {
        tariff_key: string | null; tariff_version: number | string | null; billing_basis: string | null;
        tariff_assignment_status: string | null; tariff_effective: boolean | null;
        tariff_starts_at: string | Date | null; tariff_ends_at: string | Date | null;
        usage_evaluated_at: string | Date;
        active_application_ids: string[];
        max_applications: number | string | null; active_application_count: number | string;
      }>(`
        SELECT c.tenant_id, c.customer_status, c.status_reason, c.effective_at, c.version, c.updated_at, c.updated_by,
               t.tariff_key, t.tariff_version, t.billing_basis, t.assignment_status AS tariff_assignment_status,
               (t.starts_at <= NOW() AND (t.ends_at IS NULL OR t.ends_at > NOW())) AS tariff_effective,
               t.starts_at AS tariff_starts_at, t.ends_at AS tariff_ends_at,
               NOW() AS usage_evaluated_at,
               t.max_applications,
               (SELECT COUNT(*) FROM eper_tenant_application_assignment a
                 WHERE a.tenant_id=c.tenant_id AND a.assignment_status='active') AS active_application_count,
               ARRAY(SELECT a.application_id FROM eper_tenant_application_assignment a
                      WHERE a.tenant_id=c.tenant_id AND a.assignment_status='active'
                      ORDER BY a.application_id) AS active_application_ids
          FROM eper_customer_account c
          LEFT JOIN eper_customer_tariff_assignment t ON t.tenant_id=c.tenant_id
         ORDER BY c.tenant_id LIMIT 5000
      `);
      return result.rows.map(row => {
        const activeApplicationCount = Number(row.active_application_count ?? 0);
        const maxApplications = row.max_applications == null ? null : Number(row.max_applications);
        const tariffEffective = row.tariff_assignment_status === "active" && row.tariff_effective === true;
        const allowanceStatus = maxApplications == null ? "not_configured" :
          activeApplicationCount > maxApplications ? "over_allowance" : "within_allowance";
        const now = new Date(row.usage_evaluated_at).getTime();
        const startsAt = row.tariff_starts_at == null ? null : new Date(row.tariff_starts_at).getTime();
        const endsAt = row.tariff_ends_at == null ? null : new Date(row.tariff_ends_at).getTime();
        const tariffAccessState = row.customer_status !== "active" ? "customer_inactive" :
          row.tariff_key == null ? "tariff_missing" :
          row.tariff_assignment_status !== "active" ? "tariff_inactive" :
          startsAt !== null && now < startsAt ? "tariff_not_started" :
          endsAt !== null && now >= endsAt ? "tariff_expired" :
          maxApplications == null ? "tariff_invalid" :
          activeApplicationCount > maxApplications ? "over_allowance" : "within_allowance";
        return { ...mapRow(row), tariffKey: row.tariff_key,
          tariffVersion: row.tariff_version == null ? null : Number(row.tariff_version),
          billingBasis: row.billing_basis, tariffAssignmentStatus: row.tariff_assignment_status,
          tariffEffective, tariffAccessState, usageEvaluatedAt: new Date(row.usage_evaluated_at).toISOString(),
          activeApplicationIds: row.active_application_ids ?? [], maxApplications, activeApplicationCount, allowanceStatus };
      });
    } finally {
      client.release();
    }
  }

  async get(tenantId: string): Promise<CustomerLifecycleRecord | null> {
    this.validateId(tenantId, "tenantId");
    const client = await this.pool.connect();
    try {
      const result = await client.query<CustomerLifecycleRow>(`
        SELECT tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by
        FROM eper_customer_account WHERE tenant_id = $1
      `, [tenantId]);
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async changeStatus(input: ChangeCustomerLifecycleInput): Promise<CustomerLifecycleRecord> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.changedBy, "changedBy");
    if (!["active", "inactive", "suspended", "disabled"].includes(input.status)) {
      throw new CustomerLifecycleStoreError("CUSTOMER_LIFECYCLE_STATUS_INVALID");
    }
    if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 1000) {
      throw new CustomerLifecycleStoreError("CUSTOMER_LIFECYCLE_REASON_REQUIRED");
    }
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new CustomerLifecycleStoreError("CUSTOMER_LIFECYCLE_EXPECTED_VERSION_INVALID");
    }
    const effectiveTime = Date.parse(input.effectiveAt);
    if (typeof input.effectiveAt !== "string" || !Number.isFinite(effectiveTime)) {
      throw new CustomerLifecycleStoreError("CUSTOMER_LIFECYCLE_EFFECTIVE_AT_INVALID");
    }
    if (!input.correlationId?.trim() || input.correlationId.length > 128) {
      throw new CustomerLifecycleStoreError("CUSTOMER_LIFECYCLE_CORRELATION_ID_REQUIRED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Coordinate account status changes with tariff switching and application grants/revocations.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "eper-tenant-commercial:" + input.tenantId,
      ]);
      const prior = await client.query<CustomerLifecycleRow>(`
        SELECT tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by
        FROM eper_customer_account WHERE tenant_id = $1 FOR UPDATE
      `, [input.tenantId]);
      if (!prior.rows[0]) throw new CustomerLifecycleStoreError("CUSTOMER_ACCOUNT_NOT_FOUND");
      const before = mapRow(prior.rows[0]);
      if (before.version !== input.expectedVersion) {
        throw new CustomerLifecycleVersionConflictError(before.version);
      }
      const saved = await client.query<CustomerLifecycleRow>(`
        UPDATE eper_customer_account
           SET customer_status = $2, status_reason = $3, effective_at = $4,
               version = version + 1, updated_at = NOW(), updated_by = $5
         WHERE tenant_id = $1
         RETURNING tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by
      `, [input.tenantId, input.status, input.reason.trim(), new Date(effectiveTime).toISOString(), input.changedBy]);
      if (!saved.rows[0]) throw new CustomerLifecycleStoreError("CUSTOMER_LIFECYCLE_UPDATE_RETURNED_NO_ROW");
      const after = mapRow(saved.rows[0]);
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId,
        // The lifecycle event is customer-account scoped, not application scoped.
        applicationId: "eper",
        environment: input.environment,
        actorType: "human",
        actorId: input.changedBy,
        action: "customer.lifecycle.status_change",
        outcome: "success",
        reasonCode: "product_admin_status_change",
        resourceType: "customer-account",
        resourceId: input.tenantId,
        correlationId: input.correlationId,
        source: "api",
        operationName: "customer.lifecycle.change_status",
        serviceVersion: input.serviceVersion,
        beforeHash: hashAuditEnvelope({ status: before.status, reason: before.reason, version: before.version }),
        afterHash: hashAuditEnvelope({ status: after.status, reason: after.reason, version: after.version }),
        payload: { previousStatus: before.status, status: after.status, reason: after.reason,
          effectiveAt: after.effectiveAt, previousVersion: before.version, version: after.version },
      });
      await client.query("COMMIT");
      return after;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private validateId(value: string, name: string): void {
    if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
      throw new CustomerLifecycleStoreError("CUSTOMER_LIFECYCLE_INVALID_" + name.toUpperCase());
    }
  }
}
