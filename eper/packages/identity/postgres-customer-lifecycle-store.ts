import {
  appendAuditEventInTransaction,
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
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ account_table: string | null; audit_table: string | null }>(`
        SELECT to_regclass('public.eper_customer_account')::text AS account_table,
               to_regclass('public.eper_audit_events')::text AS audit_table
      `);
      if (!result.rows[0]?.account_table) throw new Error("CUSTOMER_LIFECYCLE_SCHEMA_NOT_APPLIED");
      if (!result.rows[0]?.audit_table) throw new Error("CUSTOMER_LIFECYCLE_REQUIRES_DURABLE_AUDIT");
      const columns = await client.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='eper_customer_account'
      `);
      const names = new Set(columns.rows.map(row => row.column_name));
      for (const required of ["customer_status", "status_reason", "effective_at", "version", "updated_at", "updated_by"]) {
        if (!names.has(required)) throw new Error("CUSTOMER_LIFECYCLE_SCHEMA_VERSION_UNSUPPORTED");
      }
    } catch (error) {
      if (error instanceof Error && /CUSTOMER_LIFECYCLE_/.test(error.message)) throw error;
      throw new Error("CUSTOMER_LIFECYCLE_READINESS_FAILED", { cause: error });
    } finally {
      client.release();
    }
  }

  async list(): Promise<CustomerLifecycleRecord[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<CustomerLifecycleRow>(`
        SELECT tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by
        FROM eper_customer_account ORDER BY tenant_id LIMIT 5000
      `);
      return result.rows.map(mapRow);
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
    if (typeof input.effectiveAt !== "string" || !Number.isFinite(effectiveTime) ||
        new Date(effectiveTime).toISOString() !== input.effectiveAt) {
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
      `, [input.tenantId, input.status, input.reason.trim(), input.effectiveAt, input.changedBy]);
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
        beforeHash: JSON.stringify({ status: before.status, reason: before.reason, version: before.version }),
        afterHash: JSON.stringify({ status: after.status, reason: after.reason, version: after.version }),
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
