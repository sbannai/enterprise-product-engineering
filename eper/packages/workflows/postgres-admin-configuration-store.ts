import { createHash, randomUUID } from "node:crypto";
import { appendAuditEventInTransaction, type AuditSqlClient, type AuditSqlPool, type AuditEnvironment } from "../audit/audit-event-store.js";

export type AdminConfigurationResource = "workflows" | "roles-access" | "price-book" | "payment-vendor";
export interface StoredAdminConfiguration {
  tenantId: string;
  resourceType: AdminConfigurationResource;
  config: unknown;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export class AdminConfigurationConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super("ADMIN_CONFIGURATION_VERSION_CONFLICT");
    this.name = "AdminConfigurationConflictError";
  }
}
export class AdminConfigurationNotFoundError extends Error {
  constructor() {
    super("ADMIN_CONFIGURATION_NOT_FOUND");
    this.name = "AdminConfigurationNotFoundError";
  }
}
export interface ReplaceAdminConfigurationInput {
  tenantId: string;
  actorId: string;
  resourceType: AdminConfigurationResource;
  config: unknown;
  expectedVersion: number;
  correlationId: string;
  environment: AuditEnvironment;
  serviceVersion?: string;
}

/**
 * Durable tenant-scoped config storage. The config row and hash-chained audit event
 * are written on the same PostgreSQL transaction and therefore succeed or fail together.
 * Tenant and actor identity must be resolved by the caller from trusted server-side auth.
 */
export class PostgresAdminConfigurationStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async get(tenantId: string, resourceType: AdminConfigurationResource): Promise<StoredAdminConfiguration | null> {
    this.validateIdentity(tenantId, "tenantId");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        tenant_id: string; resource_type: AdminConfigurationResource; config: unknown;
        version: number | string; updated_at: string | Date; updated_by: string;
      }>(
        "SELECT tenant_id, resource_type, config, version, updated_at, updated_by FROM eper_admin_configuration WHERE tenant_id = $1 AND resource_type = $2",
        [tenantId, resourceType],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        tenantId: row.tenant_id, resourceType: row.resource_type,
        config: typeof row.config === "string" ? JSON.parse(row.config) : row.config,
        version: Number(row.version), updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.updated_by,
      };
    } finally {
      client.release();
    }
  }

  async replace(input: ReplaceAdminConfigurationInput): Promise<StoredAdminConfiguration> {
    this.validateIdentity(input.tenantId, "tenantId");
    this.validateIdentity(input.actorId, "actorId");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("ADMIN_CONFIGURATION_EXPECTED_VERSION_INVALID");
    }
    if (!input.correlationId?.trim() || input.correlationId.length > 128) {
      throw new Error("ADMIN_CONFIGURATION_CORRELATION_ID_REQUIRED");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const prior = await client.query<{ version: number | string }>(
        "SELECT version FROM eper_admin_configuration WHERE tenant_id = $1 AND resource_type = $2 FOR UPDATE",
        [input.tenantId, input.resourceType],
      );
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].version) : 0;
      if (currentVersion !== input.expectedVersion) throw new AdminConfigurationConflictError(currentVersion);
      const nextVersion = currentVersion + 1;
      const saved = await client.query<{
        tenant_id: string; resource_type: AdminConfigurationResource; config: unknown;
        version: number | string; updated_at: string | Date; updated_by: string;
      }>(
        `INSERT INTO eper_admin_configuration (tenant_id, resource_type, config, version, updated_at, updated_by)
         VALUES ($1, $2, $3::jsonb, $4, NOW(), $5)
         ON CONFLICT (tenant_id, resource_type) DO UPDATE SET
           config = EXCLUDED.config, version = EXCLUDED.version, updated_at = NOW(), updated_by = EXCLUDED.updated_by
         RETURNING tenant_id, resource_type, config, version, updated_at, updated_by`,
        [input.tenantId, input.resourceType, JSON.stringify(input.config), nextVersion, input.actorId],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("ADMIN_CONFIGURATION_WRITE_RETURNED_NO_ROW");
      const config = typeof row.config === "string" ? JSON.parse(row.config) : row.config;
      const digest = createHash("sha256").update(JSON.stringify(config)).digest("hex");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: "eper", environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "admin.configuration.replace",
        outcome: "success", resourceType: input.resourceType, resourceId: input.resourceType,
        correlationId: input.correlationId, source: "api",
        operationName: "PUT /admin/config/" + input.resourceType,
        serviceVersion: input.serviceVersion, beforeHash: undefined, afterHash: digest,
        payload: { resourceType: input.resourceType, version: nextVersion },
      });
      await client.query("COMMIT");
      return {
        tenantId: row.tenant_id, resourceType: row.resource_type, config,
        version: Number(row.version), updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.updated_by,
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private validateIdentity(value: string, name: string): void {
    if (typeof value !== "string" || !value.trim() || value.length > 128) {
      throw new Error("ADMIN_CONFIGURATION_" + name.toUpperCase() + "_INVALID");
    }
  }
}
