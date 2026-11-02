import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export type ProviderConnectionStatus =
  | "PENDING_VALIDATION" | "ACTIVE" | "DEGRADED" | "SUSPENDED" | "REVOKED";

export interface ProviderConnection {
  tenantId: string;
  connectionId: string;
  providerKey: string;
  displayName: string;
  authMode: string;
  status: ProviderConnectionStatus;
  environment: "development" | "sandbox" | "uat" | "production";
  safeMetadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Secret references deliberately never appear in this read model. */
export interface ApplicationProviderConnection extends ProviderConnection {
  applicationId: string;
  bindingStatus: "ACTIVE" | "SUSPENDED" | "REVOKED";
  allowedCapabilities: string[];
}

export interface CreateProviderConnectionInput {
  tenantId: string;
  actorId: string;
  providerKey: string;
  displayName: string;
  authMode: string;
  secretReference: string;
  environment: "development" | "sandbox" | "uat" | "production";
  safeMetadata?: Record<string, unknown>;
  correlationId: string;
  auditEnvironment: AuditEnvironment;
}

export interface BindProviderConnectionInput {
  tenantId: string;
  applicationId: string;
  connectionId: string;
  actorId: string;
  allowedCapabilities: string[];
  correlationId: string;
  auditEnvironment: AuditEnvironment;
}

export class ProviderConnectionConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super("PROVIDER_CONNECTION_VERSION_CONFLICT");
    this.name = "ProviderConnectionConflictError";
  }
}

export class ProviderConnectionNotFoundError extends Error {
  constructor() {
    super("PROVIDER_CONNECTION_NOT_FOUND");
    this.name = "ProviderConnectionNotFoundError";
  }
}

type ConnectionRow = {
  tenant_id: string;
  connection_id: string;
  provider_key: string;
  display_name: string;
  auth_mode: string;
  connection_status: ProviderConnectionStatus;
  environment: ProviderConnection["environment"];
  safe_metadata: Record<string, unknown> | string;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

function safeJson(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toConnection(row: ConnectionRow): ProviderConnection {
  return {
    tenantId: row.tenant_id,
    connectionId: row.connection_id,
    providerKey: row.provider_key,
    displayName: row.display_name,
    authMode: row.auth_mode,
    status: row.connection_status,
    environment: row.environment,
    safeMetadata: safeJson(row.safe_metadata),
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Tenant-scoped provider connection lifecycle. The secret manager owns secret
 * material; this repository persists only an opaque reference. Every mutation
 * and its append-only audit event share one PostgreSQL transaction.
 */
export class PostgresProviderConnectionRepository {
  constructor(private readonly pool: AuditSqlPool) {}

  private async setTenantContext(client: AuditSqlClient, tenantId: string): Promise<void> {
    await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
  }

  private async setApplicationContext(client: AuditSqlClient, applicationId: string): Promise<void> {
    await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
  }

  async create(input: CreateProviderConnectionInput): Promise<ProviderConnection> {
    this.validateIdentity(input.tenantId, "TENANT");
    this.validateIdentity(input.actorId, "ACTOR");
    this.validateIdentity(input.providerKey, "PROVIDER_KEY");
    this.validateIdentity(input.secretReference, "SECRET_REFERENCE");
    this.validateCorrelation(input.correlationId);
    if (!input.displayName?.trim() || input.displayName.length > 160) {
      throw new Error("PROVIDER_CONNECTION_DISPLAY_NAME_INVALID");
    }
    if (!input.authMode?.trim() || input.authMode.length > 64) {
      throw new Error("PROVIDER_CONNECTION_AUTH_MODE_INVALID");
    }
    const connectionId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, input.tenantId);
      const provider = await client.query<{ provider_status: string }>(
        "SELECT provider_status FROM eper_provider_definitions WHERE provider_key = $1 FOR SHARE",
        [input.providerKey],
      );
      if (!provider.rows[0] || provider.rows[0].provider_status !== "ACTIVE") {
        throw new Error("PROVIDER_DEFINITION_NOT_ACTIVE");
      }
      const saved = await client.query<ConnectionRow>(
        `INSERT INTO eper_provider_connections
          (tenant_id, connection_id, provider_key, display_name, auth_mode, secret_reference,
           connection_status, environment, safe_metadata, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,'PENDING_VALIDATION',$7,$8::jsonb,$9,$9)
         RETURNING tenant_id, connection_id, provider_key, display_name, auth_mode,
           connection_status, environment, safe_metadata, version, created_at, updated_at`,
        [input.tenantId, connectionId, input.providerKey, input.displayName.trim(),
          input.authMode, input.secretReference, input.environment,
          JSON.stringify(input.safeMetadata ?? {}), input.actorId],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("PROVIDER_CONNECTION_WRITE_RETURNED_NO_ROW");
      await this.audit(client, {
        tenantId: input.tenantId, applicationId: "eper", environment: input.auditEnvironment,
        actorId: input.actorId, action: "provider.connection.create",
        resourceId: connectionId, correlationId: input.correlationId,
      });
      await client.query("COMMIT");
      return toConnection(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: string, connectionId: string): Promise<ProviderConnection | null> {
    this.validateIdentity(tenantId, "TENANT");
    this.validateIdentity(connectionId, "CONNECTION_ID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, tenantId);
      const result = await client.query<ConnectionRow>(
        `SELECT tenant_id, connection_id, provider_key, display_name, auth_mode,
          connection_status, environment, safe_metadata, version, created_at, updated_at
         FROM eper_provider_connections WHERE tenant_id = $1 AND connection_id = $2`,
        [tenantId, connectionId],
      );
      await client.query("COMMIT");
      return result.rows[0] ? toConnection(result.rows[0]) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Lists only connections explicitly bound to the requested application.
   * Both tenant and application RLS contexts are established in this transaction.
   * The result intentionally contains no secret reference or credential material.
   */
  async listForApplication(tenantId: string, applicationId: string): Promise<ApplicationProviderConnection[]> {
    this.validateIdentity(tenantId, "TENANT");
    this.validateIdentity(applicationId, "APPLICATION_ID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, tenantId);
      await this.setApplicationContext(client, applicationId);
      const result = await client.query<ConnectionRow & {
        binding_status: ApplicationProviderConnection["bindingStatus"];
        allowed_capabilities: string[] | string;
      }>(
        `SELECT c.tenant_id, c.connection_id, c.provider_key, c.display_name, c.auth_mode,
          c.connection_status, c.environment, c.safe_metadata, c.version, c.created_at, c.updated_at,
          b.binding_status, b.allowed_capabilities
         FROM eper_provider_connections c
         JOIN eper_provider_connection_applications b
           ON b.tenant_id = c.tenant_id AND b.connection_id = c.connection_id
         WHERE b.tenant_id = $1 AND b.application_id = $2
         ORDER BY c.display_name, c.connection_id`,
        [tenantId, applicationId],
      );
      await client.query("COMMIT");
      return result.rows.map((row) => ({
        ...toConnection(row),
        applicationId,
        bindingStatus: row.binding_status,
        allowedCapabilities: typeof row.allowed_capabilities === "string"
          ? JSON.parse(row.allowed_capabilities) as string[] : row.allowed_capabilities,
      }));
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async bindApplication(input: BindProviderConnectionInput): Promise<"ACTIVE" | "PENDING_VALIDATION"> {
    this.validateIdentity(input.tenantId, "TENANT");
    this.validateIdentity(input.applicationId, "APPLICATION_ID");
    this.validateIdentity(input.actorId, "ACTOR");
    this.validateIdentity(input.connectionId, "CONNECTION_ID");
    this.validateCorrelation(input.correlationId);
    const capabilities = [...new Set(input.allowedCapabilities.map((value) => value.trim()))];
    if (!capabilities.length || capabilities.some((value) => !value || value.length > 128)) {
      throw new Error("PROVIDER_BINDING_CAPABILITIES_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, input.tenantId);
      await this.setApplicationContext(client, input.applicationId);
      const connection = await client.query<{
        provider_key: string; connection_status: ProviderConnectionStatus;
        capabilities: string[] | string;
      }>(
        `SELECT c.provider_key, c.connection_status, d.capabilities
         FROM eper_provider_connections c
         JOIN eper_provider_definitions d ON d.provider_key = c.provider_key
         WHERE c.tenant_id = $1 AND c.connection_id = $2
         FOR SHARE OF c, d`,
        [input.tenantId, input.connectionId],
      );
      const row = connection.rows[0];
      if (!row) throw new ProviderConnectionNotFoundError();
      if (row.connection_status !== "ACTIVE" && row.connection_status !== "PENDING_VALIDATION" && row.connection_status !== "DEGRADED") throw new Error("PROVIDER_CONNECTION_NOT_ACTIVE");
      const supported = new Set(typeof row.capabilities === "string"
        ? JSON.parse(row.capabilities) as string[] : row.capabilities);
      if (capabilities.some((capability) => !supported.has(capability))) {
        throw new Error("PROVIDER_CAPABILITY_NOT_SUPPORTED");
      }
      await client.query(
        `INSERT INTO eper_provider_connection_applications
          (tenant_id, application_id, connection_id, provider_key, allowed_capabilities,
           binding_status, updated_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$7,$6)
         ON CONFLICT (tenant_id, application_id, connection_id) DO UPDATE SET
           allowed_capabilities = EXCLUDED.allowed_capabilities,
           binding_status = EXCLUDED.binding_status, version = eper_provider_connection_applications.version + 1,
           updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [input.tenantId, input.applicationId, input.connectionId, row.provider_key,
          JSON.stringify(capabilities), input.actorId, row.connection_status === "ACTIVE" ? "ACTIVE" : "PENDING_VALIDATION"],
      );
      await this.audit(client, {
        tenantId: input.tenantId, applicationId: input.applicationId,
        environment: input.auditEnvironment, actorId: input.actorId,
        action: "provider.connection.bind_application", resourceId: input.connectionId,
        correlationId: input.correlationId,
      });
      await client.query("COMMIT");
      return row.connection_status === "ACTIVE" ? "ACTIVE" : "PENDING_VALIDATION";
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async rotateSecretReference(input: {
    tenantId: string; applicationId: string; connectionId: string; actorId: string; secretReference: string;
    expectedVersion: number; correlationId: string; auditEnvironment: AuditEnvironment;
  }): Promise<ProviderConnection> {
    this.validateIdentity(input.tenantId, "TENANT");
    this.validateIdentity(input.applicationId, "APPLICATION_ID");
    this.validateIdentity(input.connectionId, "CONNECTION_ID");
    this.validateIdentity(input.actorId, "ACTOR");
    this.validateIdentity(input.secretReference, "SECRET_REFERENCE");
    this.validateCorrelation(input.correlationId);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new Error("PROVIDER_CONNECTION_EXPECTED_VERSION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, input.tenantId);
      await this.setApplicationContext(client, input.applicationId);
      const prior = await client.query<{ version: number | string; connection_status: ProviderConnectionStatus }>(
        "SELECT version, connection_status FROM eper_provider_connections WHERE tenant_id = $1 AND connection_id = $2 FOR UPDATE",
        [input.tenantId, input.connectionId],
      );
      if (!prior.rows[0]) throw new ProviderConnectionNotFoundError();
      const bindings = await client.query<{ application_id: string }>(
        "SELECT application_id FROM eper_provider_connection_applications WHERE tenant_id = $1 AND connection_id = $2 FOR UPDATE",
        [input.tenantId, input.connectionId],
      );
      if (bindings.rows.length !== 1 || bindings.rows[0].application_id !== input.applicationId) {
        throw new Error("PROVIDER_CONNECTION_SHARED_BINDING_ADMIN_REQUIRED");
      }
      const currentVersion = Number(prior.rows[0].version);
      if (currentVersion !== input.expectedVersion) throw new ProviderConnectionConflictError(currentVersion);
      if (prior.rows[0].connection_status === "REVOKED") throw new Error("PROVIDER_CONNECTION_REVOKED");
      const saved = await client.query<ConnectionRow>(
        `UPDATE eper_provider_connections SET secret_reference = $3, version = version + 1,
          updated_at = NOW(), updated_by = $4, connection_status = 'PENDING_VALIDATION'
         WHERE tenant_id = $1 AND connection_id = $2
         RETURNING tenant_id, connection_id, provider_key, display_name, auth_mode,
           connection_status, environment, safe_metadata, version, created_at, updated_at`,
        [input.tenantId, input.connectionId, input.secretReference, input.actorId],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("PROVIDER_CONNECTION_ROTATION_RETURNED_NO_ROW");
      await client.query(
        `UPDATE eper_provider_connection_applications SET binding_status = 'SUSPENDED',
          version = version + 1, updated_at = NOW(), updated_by = $3
         WHERE tenant_id = $1 AND connection_id = $2`,
        [input.tenantId, input.connectionId, input.actorId],
      );
      await this.audit(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.auditEnvironment,
        actorId: input.actorId, action: "provider.connection.rotate_secret_reference",
        resourceId: input.connectionId, correlationId: input.correlationId,
      });
      await client.query("COMMIT");
      return toConnection(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async revoke(input: {
    tenantId: string; applicationId: string; connectionId: string; actorId: string; expectedVersion: number;
    correlationId: string; auditEnvironment: AuditEnvironment;
  }): Promise<ProviderConnection> {
    this.validateIdentity(input.tenantId, "TENANT");
    this.validateIdentity(input.applicationId, "APPLICATION_ID");
    this.validateIdentity(input.connectionId, "CONNECTION_ID");
    this.validateIdentity(input.actorId, "ACTOR");
    this.validateCorrelation(input.correlationId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, input.tenantId);
      await this.setApplicationContext(client, input.applicationId);
      const prior = await client.query<{ version: number | string }>(
        "SELECT version FROM eper_provider_connections WHERE tenant_id = $1 AND connection_id = $2 FOR UPDATE",
        [input.tenantId, input.connectionId],
      );
      if (!prior.rows[0]) throw new ProviderConnectionNotFoundError();
      const bindings = await client.query<{ application_id: string }>(
        "SELECT application_id FROM eper_provider_connection_applications WHERE tenant_id = $1 AND connection_id = $2 FOR UPDATE",
        [input.tenantId, input.connectionId],
      );
      if (bindings.rows.length !== 1 || bindings.rows[0].application_id !== input.applicationId) {
        throw new Error("PROVIDER_CONNECTION_SHARED_BINDING_ADMIN_REQUIRED");
      }
      const currentVersion = Number(prior.rows[0].version);
      if (currentVersion !== input.expectedVersion) throw new ProviderConnectionConflictError(currentVersion);
      const saved = await client.query<ConnectionRow>(
        `UPDATE eper_provider_connections SET connection_status = 'REVOKED',
          version = version + 1, updated_at = NOW(), updated_by = $3
         WHERE tenant_id = $1 AND connection_id = $2
         RETURNING tenant_id, connection_id, provider_key, display_name, auth_mode,
           connection_status, environment, safe_metadata, version, created_at, updated_at`,
        [input.tenantId, input.connectionId, input.actorId],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("PROVIDER_CONNECTION_REVOCATION_RETURNED_NO_ROW");
      await client.query(
        `UPDATE eper_provider_connection_applications SET binding_status = 'REVOKED',
          version = version + 1, updated_at = NOW(), updated_by = $3
         WHERE tenant_id = $1 AND connection_id = $2`,
        [input.tenantId, input.connectionId, input.actorId],
      );
      await this.audit(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.auditEnvironment,
        actorId: input.actorId, action: "provider.connection.revoke",
        resourceId: input.connectionId, correlationId: input.correlationId,
      });
      await client.query("COMMIT");
      return toConnection(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private async audit(client: AuditSqlClient, input: {
    tenantId: string; applicationId: string; environment: AuditEnvironment; actorId: string;
    action: string; resourceId: string; correlationId: string;
  }): Promise<void> {
    await appendAuditEventInTransaction(client, {
      ...input, actorType: "human", outcome: "success", resourceType: "provider-connection",
      source: "api", operationName: input.action, payload: { connectionId: input.resourceId },
    });
  }

  private validateIdentity(value: string, label: string): void {
    if (typeof value !== "string" || !value.trim() || value.length > 512) {
      throw new Error("PROVIDER_" + label + "_INVALID");
    }
  }

  private validateCorrelation(value: string): void {
    if (typeof value !== "string" || !value.trim() || value.length > 128) {
      throw new Error("PROVIDER_CORRELATION_ID_REQUIRED");
    }
  }
}
