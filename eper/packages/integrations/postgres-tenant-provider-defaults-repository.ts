import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export type ProviderPolicy = Record<string, unknown>;
export type EffectiveProviderPolicy = {
  tenantId: string;
  applicationId: string;
  connectionId: string;
  policy: ProviderPolicy;
  source: "APPLICATION_OVERRIDE" | "TENANT_DEFAULT" | "NONE";
  tenantDefaultVersion: number | null;
};

export class TenantProviderDefaultConflictError extends Error {
  constructor(readonly currentVersion: number | null) {
    super("TENANT_PROVIDER_DEFAULT_VERSION_CONFLICT");
    this.name = "TenantProviderDefaultConflictError";
  }
}

const secretKey = /(password|passwd|secret|token|authorization|cookie|api[_-]?key|client[_-]?secret|credential|private[_-]?key)/i;

function containsSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => secretKey.test(key) || containsSecretKey(nested),
  );
}

function validatePolicy(policy: ProviderPolicy): void {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("TENANT_PROVIDER_DEFAULTS_MUST_BE_OBJECT");
  }
  if (containsSecretKey(policy)) throw new Error("TENANT_PROVIDER_DEFAULTS_SECRET_KEY_FORBIDDEN");
  if (JSON.stringify(policy).length > 32_768) throw new Error("TENANT_PROVIDER_DEFAULTS_TOO_LARGE");
}

function validateIdentity(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new Error("TENANT_PROVIDER_DEFAULT_" + label + "_INVALID");
  }
}

type PolicyRow = { policy: ProviderPolicy | string; version?: number | string };

function parsePolicy(value: ProviderPolicy | string): ProviderPolicy {
  const policy = typeof value === "string" ? JSON.parse(value) as ProviderPolicy : value;
  validatePolicy(policy);
  return policy;
}

/**
 * Persists customer-wide provider defaults and resolves them against
 * application-scoped overrides. Secret material remains outside this store.
 * Mutations and append-only audit records share one transaction.
 */
export class PostgresTenantProviderDefaultsRepository {
  constructor(private readonly pool: AuditSqlPool) {}

  private async setTenant(client: AuditSqlClient, tenantId: string): Promise<void> {
    await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
  }

  private async setApplication(client: AuditSqlClient, applicationId: string): Promise<void> {
    await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
  }

  async getTenantDefault(tenantId: string, connectionId: string): Promise<{
    defaults: ProviderPolicy; version: number;
  } | null> {
    validateIdentity(tenantId, "TENANT");
    validateIdentity(connectionId, "CONNECTION_ID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenant(client, tenantId);
      const result = await client.query<PolicyRow>(
        `SELECT defaults AS policy, version FROM eper_tenant_provider_defaults
         WHERE tenant_id=$1 AND connection_id=$2`,
        [tenantId, connectionId],
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return row ? { defaults: parsePolicy(row.policy), version: Number(row.version) } : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * expectedVersion=0 creates only; positive values update only that version.
   * A stale or duplicate create is rejected without overwriting newer settings.
   */
  async saveTenantDefault(input: {
    tenantId: string;
    connectionId: string;
    actorId: string;
    defaults: ProviderPolicy;
    expectedVersion: number;
    correlationId: string;
    auditEnvironment: AuditEnvironment;
  }): Promise<{ defaults: ProviderPolicy; version: number }> {
    validateIdentity(input.tenantId, "TENANT");
    validateIdentity(input.connectionId, "CONNECTION_ID");
    validateIdentity(input.actorId, "ACTOR");
    validateIdentity(input.correlationId, "CORRELATION_ID");
    validatePolicy(input.defaults);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("TENANT_PROVIDER_DEFAULT_EXPECTED_VERSION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenant(client, input.tenantId);
      const saved = input.expectedVersion === 0
        ? await client.query<PolicyRow>(
          `INSERT INTO eper_tenant_provider_defaults
            (tenant_id, connection_id, defaults, updated_by)
           VALUES ($1,$2,$3::jsonb,$4)
           ON CONFLICT (tenant_id, connection_id) DO NOTHING
           RETURNING defaults AS policy, version`,
          [input.tenantId, input.connectionId, JSON.stringify(input.defaults), input.actorId],
        )
        : await client.query<PolicyRow>(
          `UPDATE eper_tenant_provider_defaults
           SET defaults=$3::jsonb, version=version+1, updated_at=NOW(), updated_by=$4
           WHERE tenant_id=$1 AND connection_id=$2 AND version=$5
           RETURNING defaults AS policy, version`,
          [input.tenantId, input.connectionId, JSON.stringify(input.defaults), input.actorId, input.expectedVersion],
        );
      const row = saved.rows[0];
      if (!row) {
        const current = await client.query<{ version: number | string }>(
          "SELECT version FROM eper_tenant_provider_defaults WHERE tenant_id=$1 AND connection_id=$2",
          [input.tenantId, input.connectionId],
        );
        throw new TenantProviderDefaultConflictError(
          current.rows[0] ? Number(current.rows[0].version) : null,
        );
      }
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId,
        applicationId: "eper",
        environment: input.auditEnvironment,
        actorType: "human",
        actorId: input.actorId,
        action: input.expectedVersion === 0
          ? "provider.tenant_default.create" : "provider.tenant_default.update",
        outcome: "success",
        resourceType: "provider_connection_defaults",
        resourceId: input.connectionId,
        correlationId: input.correlationId,
        source: "api",
        operationName: "provider.tenant_default.save",
        payload: { version: Number(row.version), keys: Object.keys(input.defaults).sort() },
      });
      await client.query("COMMIT");
      return { defaults: parsePolicy(row.policy), version: Number(row.version) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveEffectivePolicy(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
  }): Promise<EffectiveProviderPolicy> {
    validateIdentity(input.tenantId, "TENANT");
    validateIdentity(input.applicationId, "APPLICATION_ID");
    validateIdentity(input.connectionId, "CONNECTION_ID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenant(client, input.tenantId);
      await this.setApplication(client, input.applicationId);
      const override = await client.query<PolicyRow>(
        `SELECT policy FROM eper_application_provider_policies
         WHERE tenant_id=$1 AND application_id=$2 AND connection_id=$3`,
        [input.tenantId, input.applicationId, input.connectionId],
      );
      if (override.rows[0]) {
        const defaults = await client.query<{ version: number | string }>(
          `SELECT version FROM eper_tenant_provider_defaults
           WHERE tenant_id=$1 AND connection_id=$2`,
          [input.tenantId, input.connectionId],
        );
        await client.query("COMMIT");
        return {
          ...input,
          policy: parsePolicy(override.rows[0].policy),
          source: "APPLICATION_OVERRIDE",
          tenantDefaultVersion: defaults.rows[0] ? Number(defaults.rows[0].version) : null,
        };
      }
      const fallback = await client.query<PolicyRow>(
        `SELECT defaults AS policy, version FROM eper_tenant_provider_defaults
         WHERE tenant_id=$1 AND connection_id=$2`,
        [input.tenantId, input.connectionId],
      );
      await client.query("COMMIT");
      const row = fallback.rows[0];
      return {
        ...input,
        policy: row ? parsePolicy(row.policy) : {},
        source: row ? "TENANT_DEFAULT" : "NONE",
        tenantDefaultVersion: row ? Number(row.version) : null,
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
