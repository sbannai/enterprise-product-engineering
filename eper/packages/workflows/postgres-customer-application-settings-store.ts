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
      }>(`
        SELECT
          to_regclass('public.eper_customer_setting')::text AS customer_settings,
          to_regclass('public.eper_application_setting')::text AS application_settings
      `);
      if (!result.rows[0]?.customer_settings || !result.rows[0]?.application_settings) {
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
