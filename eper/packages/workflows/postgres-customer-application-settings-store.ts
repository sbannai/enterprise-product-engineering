import { createHash } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export interface StoredSetting {
  tenantId: string;
  applicationId?: string;
  settingKey: string;
  config: unknown;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ReplaceSettingInput {
  tenantId: string;
  actorId: string;
  settingKey: string;
  config: unknown;
  expectedVersion: number;
  environment: AuditEnvironment;
  correlationId: string;
  serviceVersion?: string;
  applicationId?: string;
}

export class SettingVersionConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super("CUSTOMER_APPLICATION_SETTING_VERSION_CONFLICT");
    this.name = "SettingVersionConflictError";
  }
}

/**
 * Durable customer/application settings persistence.
 * Authentication and tenant/application ownership checks must be enforced by the
 * API layer before calling this store. Secret material must never be passed here.
 */
export class PostgresCustomerApplicationSettingsStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        customer_settings: string | null;
        application_settings: string | null;
        credential_references: string | null;
      }>(`
        SELECT
          to_regclass('public.eper_customer_setting')::text AS customer_settings,
          to_regclass('public.eper_application_setting')::text AS application_settings,
          to_regclass('public.eper_integration_credential_reference')::text AS credential_references
      `);
      if (!result.rows[0]?.customer_settings || !result.rows[0]?.application_settings || !result.rows[0]?.credential_references) {
        throw new Error("EPER_CUSTOMER_APPLICATION_SETTINGS_SCHEMA_NOT_APPLIED");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_CUSTOMER_APPLICATION_SETTINGS_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_CUSTOMER_APPLICATION_SETTINGS_READINESS_FAILED", { cause: error });
    } finally {
      client.release();
    }
  }

  async getCustomerSetting(tenantId: string, settingKey: string): Promise<StoredSetting | null> {
    this.validateId(tenantId, "tenantId");
    this.validateId(settingKey, "settingKey");
    const client = await this.pool.connect();
    try {
      const result = await client.query<SettingRow>(
        "SELECT tenant_id, setting_key, config, version, updated_at, updated_by FROM eper_customer_setting WHERE tenant_id = $1 AND setting_key = $2",
        [tenantId, settingKey],
      );
      return result.rows[0] ? toStored(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getApplicationSetting(tenantId: string, applicationId: string, settingKey: string): Promise<StoredSetting | null> {
    this.validateId(tenantId, "tenantId");
    this.validateId(applicationId, "applicationId");
    this.validateId(settingKey, "settingKey");
    const client = await this.pool.connect();
    try {
      const result = await client.query<ApplicationSettingRow>(
        "SELECT tenant_id, application_id, setting_key, config, version, updated_at, updated_by FROM eper_application_setting WHERE tenant_id = $1 AND application_id = $2 AND setting_key = $3",
        [tenantId, applicationId, settingKey],
      );
      return result.rows[0] ? toStored(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async replaceCustomerSetting(input: ReplaceSettingInput): Promise<StoredSetting> {
    if (input.applicationId !== undefined) throw new Error("CUSTOMER_SETTING_MUST_NOT_HAVE_APPLICATION_ID");
    return this.replace(input, false);
  }

  async replaceApplicationSetting(input: ReplaceSettingInput & { applicationId: string }): Promise<StoredSetting> {
    return this.replace(input, true);
  }

  private async replace(input: ReplaceSettingInput, applicationScoped: boolean): Promise<StoredSetting> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.actorId, "actorId");
    this.validateId(input.settingKey, "settingKey");
    if (applicationScoped) this.validateId(input.applicationId ?? "", "applicationId");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("CUSTOMER_APPLICATION_SETTING_EXPECTED_VERSION_INVALID");
    }
    if (!input.correlationId?.trim() || input.correlationId.length > 128) {
      throw new Error("CUSTOMER_APPLICATION_SETTING_CORRELATION_ID_REQUIRED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize writes by tenant + scope/key; version checks prevent stale overwrites.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`eper-setting:${input.tenantId}:${applicationScoped ? input.applicationId : "customer"}:${input.settingKey}`],
      );

      const table = applicationScoped ? "eper_application_setting" : "eper_customer_setting";
      const selectSql = applicationScoped
        ? "SELECT version, config FROM eper_application_setting WHERE tenant_id = $1 AND application_id = $2 AND setting_key = $3 FOR UPDATE"
        : "SELECT version, config FROM eper_customer_setting WHERE tenant_id = $1 AND setting_key = $2 FOR UPDATE";
      const keyValues = applicationScoped
        ? [input.tenantId, input.applicationId, input.settingKey]
        : [input.tenantId, input.settingKey];
      const prior = await client.query<{ version: number | string; config: unknown }>(selectSql, keyValues);
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].version) : 0;
      if (currentVersion !== input.expectedVersion) throw new SettingVersionConflictError(currentVersion);
      const priorConfig = prior.rows[0]
        ? (typeof prior.rows[0].config === "string" ? JSON.parse(prior.rows[0].config) : prior.rows[0].config)
        : undefined;
      const beforeHash = prior.rows[0] ? digest(priorConfig) : undefined;
      const nextVersion = currentVersion + 1;
      const saved = applicationScoped
        ? await client.query<ApplicationSettingRow>(
            `INSERT INTO eper_application_setting (tenant_id, application_id, setting_key, config, version, updated_at, updated_by)
             VALUES ($1, $2, $3, $4::jsonb, $5, NOW(), $6)
             ON CONFLICT (tenant_id, application_id, setting_key) DO UPDATE SET
               config = EXCLUDED.config, version = EXCLUDED.version, updated_at = NOW(), updated_by = EXCLUDED.updated_by
             RETURNING tenant_id, application_id, setting_key, config, version, updated_at, updated_by`,
            [input.tenantId, input.applicationId, input.settingKey, JSON.stringify(input.config), nextVersion, input.actorId],
          )
        : await client.query<SettingRow>(
            `INSERT INTO eper_customer_setting (tenant_id, setting_key, config, version, updated_at, updated_by)
             VALUES ($1, $2, $3::jsonb, $4, NOW(), $5)
             ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
               config = EXCLUDED.config, version = EXCLUDED.version, updated_at = NOW(), updated_by = EXCLUDED.updated_by
             RETURNING tenant_id, setting_key, config, version, updated_at, updated_by`,
            [input.tenantId, input.settingKey, JSON.stringify(input.config), nextVersion, input.actorId],
          );
      const row = saved.rows[0];
      if (!row) throw new Error("CUSTOMER_APPLICATION_SETTING_WRITE_RETURNED_NO_ROW");
      const stored = toStored(row);
      const appId = applicationScoped ? input.applicationId! : "customer-settings";
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId,
        applicationId: appId,
        environment: input.environment,
        actorType: "human",
        actorId: input.actorId,
        action: applicationScoped ? "application.setting.replace" : "customer.setting.replace",
        outcome: "success",
        resourceType: applicationScoped ? "application-setting" : "customer-setting",
        resourceId: input.settingKey,
        correlationId: input.correlationId,
        source: "api",
        operationName: applicationScoped ? "PUT /customer/applications/:applicationId/settings" : "PUT /customer/settings",
        serviceVersion: input.serviceVersion,
        beforeHash,
        afterHash: digest(stored.config),
        payload: {
          settingKey: input.settingKey,
          ...(applicationScoped ? { applicationId: input.applicationId } : {}),
          previousVersion: currentVersion,
          version: nextVersion,
        },
      });
      await client.query("COMMIT");
      return stored;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original error */ }
      throw error;
    } finally {
      client.release();
    }
  }


  async getCredentialReference(
    tenantId: string,
    applicationId: string,
    integrationKey: string,
    environment: AuditEnvironment,
  ): Promise<{ configured: boolean; rotatedAt: string | null; updatedAt: string; updatedBy: string } | null> {
    this.validateId(tenantId, "tenantId");
    this.validateId(applicationId, "applicationId");
    this.validateId(integrationKey, "integrationKey");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        configured: boolean; secret_reference: string; rotated_at: string | Date | null;
        updated_at: string | Date; updated_by: string;
      }>(
        "SELECT configured, secret_reference, rotated_at, updated_at, updated_by FROM eper_integration_credential_reference WHERE tenant_id = $1 AND application_id = $2 AND integration_key = $3 AND environment = $4",
        [tenantId, applicationId, integrationKey, environment],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        configured: row.configured,
        // Never expose the secret-store locator to dashboard/API consumers.
        rotatedAt: row.rotated_at ? new Date(row.rotated_at).toISOString() : null,
        updatedAt: new Date(row.updated_at).toISOString(),
        updatedBy: row.updated_by,
      };
    } finally {
      client.release();
    }
  }

  async replaceCredentialReference(input: {
    tenantId: string;
    applicationId: string;
    actorId: string;
    integrationKey: string;
    environment: AuditEnvironment;
    secretReference: string;
    correlationId: string;
    serviceVersion?: string;
  }): Promise<{ configured: boolean; rotatedAt: string; updatedAt: string; updatedBy: string }> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.actorId, "actorId");
    this.validateId(input.integrationKey, "integrationKey");
    if (typeof input.secretReference !== "string" || !input.secretReference.trim() || input.secretReference.length > 512 ||
        /^(sk_|rk_|pk_|whsec_|Bearer\s)/i.test(input.secretReference)) {
      throw new Error("INTEGRATION_SECRET_REFERENCE_INVALID");
    }
    if (!input.correlationId?.trim() || input.correlationId.length > 128) {
      throw new Error("INTEGRATION_CREDENTIAL_CORRELATION_ID_REQUIRED");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`eper-credential:${input.tenantId}:${input.applicationId}:${input.integrationKey}:${input.environment}`],
      );
      const prior = await client.query<{ secret_reference: string }>(
        "SELECT secret_reference FROM eper_integration_credential_reference WHERE tenant_id = $1 AND application_id = $2 AND integration_key = $3 AND environment = $4 FOR UPDATE",
        [input.tenantId, input.applicationId, input.integrationKey, input.environment],
      );
      const now = new Date().toISOString();
      const saved = await client.query<{
        configured: boolean; rotated_at: string | Date | null; updated_at: string | Date; updated_by: string;
      }>(
        `INSERT INTO eper_integration_credential_reference
          (tenant_id, application_id, integration_key, environment, secret_reference, configured, rotated_at, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6, NOW(), $7)
         ON CONFLICT (tenant_id, application_id, integration_key, environment) DO UPDATE SET
          secret_reference = EXCLUDED.secret_reference, configured = TRUE, rotated_at = EXCLUDED.rotated_at,
          updated_at = NOW(), updated_by = EXCLUDED.updated_by
         RETURNING configured, rotated_at, updated_at, updated_by`,
        [input.tenantId, input.applicationId, input.integrationKey, input.environment, input.secretReference, now, input.actorId],
      );
      const row = saved.rows[0];
      if (!row) throw new Error("INTEGRATION_CREDENTIAL_REFERENCE_WRITE_RETURNED_NO_ROW");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        environment: input.environment,
        actorType: "human",
        actorId: input.actorId,
        action: "integration.credential_reference.replace",
        outcome: "success",
        resourceType: "integration-credential-reference",
        resourceId: input.integrationKey,
        correlationId: input.correlationId,
        source: "api",
        operationName: "PUT /customer/applications/:applicationId/integrations/:integrationKey/credentials",
        serviceVersion: input.serviceVersion,
        beforeHash: prior.rows[0] ? digest(prior.rows[0].secret_reference) : undefined,
        afterHash: digest(input.secretReference),
        payload: { integrationKey: input.integrationKey, environment: input.environment, rotated: Boolean(prior.rows[0]) },
      });
      await client.query("COMMIT");
      return {
        configured: row.configured,
        rotatedAt: row.rotated_at ? new Date(row.rotated_at).toISOString() : now,
        updatedAt: new Date(row.updated_at).toISOString(),
        updatedBy: row.updated_by,
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private validateId(value: string, name: string): void {
    if (typeof value !== "string" || !value.trim() || value.length > 128) {
      throw new Error("CUSTOMER_APPLICATION_SETTING_" + name.toUpperCase() + "_INVALID");
    }
  }
}

interface SettingRow {
  tenant_id: string;
  setting_key: string;
  config: unknown;
  version: number | string;
  updated_at: string | Date;
  updated_by: string;
}
interface ApplicationSettingRow extends SettingRow { application_id: string }

function toStored(row: SettingRow | ApplicationSettingRow): StoredSetting {
  const stored: StoredSetting = {
    tenantId: row.tenant_id,
    settingKey: row.setting_key,
    config: typeof row.config === "string" ? JSON.parse(row.config) : row.config,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by,
  };
  if ("application_id" in row) stored.applicationId = row.application_id;
  return stored;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");
}
