import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import {
  assertPeripheralConfiguredForActivation,
  transitionPeripheral,
  type PeripheralConfiguration,
  type PeripheralKind,
  type PeripheralRegistration,
  type PeripheralScope,
  type PeripheralStatus,
} from "./index.js";

type PeripheralRow = {
  tenant_id: string;
  application_id: string;
  peripheral_id: string;
  peripheral_kind: PeripheralKind;
  display_name: string;
  adapter_key: string | null;
  adapter_version: string | null;
  lifecycle_status: PeripheralStatus;
  active_configuration_version: number | string | null;
  version: number | string;
};

export interface PeripheralAuditContext {
  actorId: string;
  environment: AuditEnvironment;
  correlationId: string;
}

export interface RegisterPeripheralInput extends PeripheralScope, PeripheralAuditContext {
  peripheralId?: string;
  kind: PeripheralKind;
  displayName: string;
}

export interface ConfigurePeripheralInput extends PeripheralScope, PeripheralAuditContext {
  peripheralId: string;
  expectedVersion: number;
  configuration: PeripheralConfiguration;
}

export interface TransitionPeripheralInput extends PeripheralScope, PeripheralAuditContext {
  peripheralId: string;
  expectedVersion: number;
  nextStatus: PeripheralStatus;
}

/**
 * PostgreSQL persistence for application-owned peripherals.
 * Every query sets transaction-local tenant/application context; every write
 * and its append-only audit event commit or roll back together.
 * Adapter I/O deliberately does not occur in this repository.
 */
export class PostgresPeripheralRepository {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ registrations: string | null; configurations: string | null }> `
        SELECT
          to_regclass('public.eper_application_peripheral')::text AS registrations,
          to_regclass('public.eper_application_peripheral_configuration')::text AS configurations
      `;
      if (!result.rows[0]?.registrations || !result.rows[0]?.configurations) {
        throw new Error("EPER_PERIPHERAL_SCHEMA_NOT_APPLIED");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_PERIPHERAL_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_PERIPHERAL_SCHEMA_READINESS_FAILED", { cause: error });
    } finally {
      client.release();
    }
  }

  async list(scope: PeripheralScope): Promise<PeripheralRegistration[]> {
    this.validateScope(scope);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await this.setScope(client, scope);
      const result = await client.query<PeripheralRow>(
        `SELECT tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
                adapter_key, adapter_version, lifecycle_status, active_configuration_version, version
           FROM eper_application_peripheral
          WHERE tenant_id = $1 AND application_id = $2
          ORDER BY created_at, peripheral_id`,
        [scope.tenantId, scope.applicationId],
      );
      await client.query("COMMIT");
      return result.rows.map((row) => this.mapRegistration(row));
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(scope: PeripheralScope, peripheralId: string): Promise<PeripheralRegistration | null> {
    this.validateScope(scope);
    this.validateId(peripheralId, "peripheralId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await this.setScope(client, scope);
      const result = await client.query<PeripheralRow>(
        `SELECT tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
                adapter_key, adapter_version, lifecycle_status, active_configuration_version, version
           FROM eper_application_peripheral
          WHERE tenant_id = $1 AND application_id = $2 AND peripheral_id = $3`,
        [scope.tenantId, scope.applicationId, peripheralId],
      );
      await client.query("COMMIT");
      return result.rows[0] ? this.mapRegistration(result.rows[0]) : null;
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async register(input: RegisterPeripheralInput): Promise<PeripheralRegistration> {
    this.validateMutation(input);
    if (!input.displayName.trim() || input.displayName.trim().length > 160) {
      throw new Error("EPER_PERIPHERAL_DISPLAY_NAME_INVALID");
    }
    const peripheralId = input.peripheralId ?? randomUUID();
    this.validateId(peripheralId, "peripheralId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setScope(client, input);
      const result = await client.query<PeripheralRow>(
        `INSERT INTO eper_application_peripheral
          (tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
           lifecycle_status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,'REGISTERED',$6,$6)
         RETURNING tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
                   adapter_key, adapter_version, lifecycle_status, active_configuration_version, version`,
        [input.tenantId, input.applicationId, peripheralId, input.kind, input.displayName.trim(), input.actorId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("EPER_PERIPHERAL_REGISTER_RETURNED_NO_ROW");
      await this.audit(client, input, "peripheral.register", peripheralId, { kind: input.kind });
      await client.query("COMMIT");
      return this.mapRegistration(row);
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async configure(input: ConfigurePeripheralInput): Promise<PeripheralRegistration> {
    this.validateMutation(input);
    this.validateId(input.peripheralId, "peripheralId");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new Error("EPER_PERIPHERAL_EXPECTED_VERSION_INVALID");
    }
    const config = input.configuration;
    if (!config.adapterKey.trim() || !/^\d+\.\d+\.\d+$/.test(config.adapterVersion) ||
        !config.settings || typeof config.settings !== "object" || Array.isArray(config.settings)) {
      throw new Error("EPER_PERIPHERAL_CONFIGURATION_INVALID");
    }
    if (config.secretReference !== undefined &&
        (!config.secretReference.trim() || config.secretReference.length > 512)) {
      throw new Error("EPER_PERIPHERAL_SECRET_REFERENCE_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setScope(client, input);
      const selected = await client.query<PeripheralRow>(
        `SELECT tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
                adapter_key, adapter_version, lifecycle_status, active_configuration_version, version
           FROM eper_application_peripheral
          WHERE tenant_id = $1 AND application_id = $2 AND peripheral_id = $3
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.peripheralId],
      );
      const current = selected.rows[0];
      if (!current) throw new Error("EPER_PERIPHERAL_NOT_FOUND");
      if (Number(current.version) !== input.expectedVersion) throw new Error("EPER_PERIPHERAL_VERSION_CONFLICT");
      if (current.lifecycle_status !== "REGISTERED" && current.lifecycle_status !== "CONFIGURED" &&
          current.lifecycle_status !== "SUSPENDED") {
        throw new Error("EPER_PERIPHERAL_CONFIGURATION_STATE_INVALID");
      }
      const nextVersion = await client.query<{ next_version: number | string }>(
        `SELECT coalesce(max(configuration_version), 0) + 1 AS next_version
           FROM eper_application_peripheral_configuration
          WHERE tenant_id = $1 AND application_id = $2 AND peripheral_id = $3`,
        [input.tenantId, input.applicationId, input.peripheralId],
      );
      const configurationVersion = Number(nextVersion.rows[0]?.next_version);
      await client.query(
        `INSERT INTO eper_application_peripheral_configuration
          (tenant_id, application_id, peripheral_id, configuration_version,
           adapter_key, adapter_version, settings, secret_reference, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [input.tenantId, input.applicationId, input.peripheralId, configurationVersion,
          config.adapterKey, config.adapterVersion, JSON.stringify(config.settings),
          config.secretReference ?? null, input.actorId],
      );
      const updated = await client.query<PeripheralRow>(
        `UPDATE eper_application_peripheral
            SET adapter_key = $4, adapter_version = $5,
                active_configuration_version = $6, lifecycle_status = 'CONFIGURED',
                version = version + 1, updated_by = $7, updated_at = clock_timestamp()
          WHERE tenant_id = $1 AND application_id = $2 AND peripheral_id = $3
          RETURNING tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
                    adapter_key, adapter_version, lifecycle_status, active_configuration_version, version`,
        [input.tenantId, input.applicationId, input.peripheralId, config.adapterKey,
          config.adapterVersion, configurationVersion, input.actorId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error("EPER_PERIPHERAL_CONFIGURE_RETURNED_NO_ROW");
      await this.audit(client, input, "peripheral.configure", input.peripheralId, {
        adapterKey: config.adapterKey, adapterVersion: config.adapterVersion,
        configurationVersion,
      });
      await client.query("COMMIT");
      return this.mapRegistration(row);
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async transition(input: TransitionPeripheralInput): Promise<PeripheralRegistration> {
    this.validateMutation(input);
    this.validateId(input.peripheralId, "peripheralId");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new Error("EPER_PERIPHERAL_EXPECTED_VERSION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setScope(client, input);
      const selected = await client.query<PeripheralRow>(
        `SELECT tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
                adapter_key, adapter_version, lifecycle_status, active_configuration_version, version
           FROM eper_application_peripheral
          WHERE tenant_id = $1 AND application_id = $2 AND peripheral_id = $3
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.peripheralId],
      );
      const current = selected.rows[0];
      if (!current) throw new Error("EPER_PERIPHERAL_NOT_FOUND");
      if (Number(current.version) !== input.expectedVersion) throw new Error("EPER_PERIPHERAL_VERSION_CONFLICT");
      const nextStatus = transitionPeripheral(current.lifecycle_status, input.nextStatus);
      if (nextStatus === "ACTIVE") {
        const configuration = await client.query<{
          adapter_key: string; adapter_version: string; settings: Record<string, unknown>; secret_reference: string | null;
        }>(
          `SELECT adapter_key, adapter_version, settings, secret_reference
             FROM eper_application_peripheral_configuration
            WHERE tenant_id = $1 AND application_id = $2 AND peripheral_id = $3
              AND configuration_version = $4`,
          [input.tenantId, input.applicationId, input.peripheralId, current.active_configuration_version],
        );
        const row = configuration.rows[0];
        assertPeripheralConfiguredForActivation({
          status: current.lifecycle_status,
          adapterKey: current.adapter_key,
          adapterVersion: current.adapter_version,
          configuration: row ? {
            adapterKey: row.adapter_key, adapterVersion: row.adapter_version,
            settings: row.settings, ...(row.secret_reference ? { secretReference: row.secret_reference } : {}),
          } : null,
        });
      }
      const updated = await client.query<PeripheralRow>(
        `UPDATE eper_application_peripheral
            SET lifecycle_status = $4, version = version + 1,
                updated_by = $5, updated_at = clock_timestamp()
          WHERE tenant_id = $1 AND application_id = $2 AND peripheral_id = $3
          RETURNING tenant_id, application_id, peripheral_id, peripheral_kind, display_name,
                    adapter_key, adapter_version, lifecycle_status, active_configuration_version, version`,
        [input.tenantId, input.applicationId, input.peripheralId, nextStatus, input.actorId],
      );
      const result = updated.rows[0];
      if (!result) throw new Error("EPER_PERIPHERAL_TRANSITION_RETURNED_NO_ROW");
      await this.audit(client, input, "peripheral.lifecycle.transition", input.peripheralId, {
        from: current.lifecycle_status, to: nextStatus,
      });
      await client.query("COMMIT");
      return this.mapRegistration(result);
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async setScope(client: AuditSqlClient, scope: PeripheralScope): Promise<void> {
    await client.query("SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
      [scope.tenantId, scope.applicationId]);
  }

  private async audit(
    client: AuditSqlClient,
    input: PeripheralAuditContext & PeripheralScope,
    action: string,
    peripheralId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await appendAuditEventInTransaction(client, {
      tenantId: input.tenantId, applicationId: input.applicationId,
      environment: input.environment, actorType: "human", actorId: input.actorId,
      action, outcome: "success", resourceType: "application-peripheral",
      resourceId: peripheralId, correlationId: input.correlationId,
      source: "api", operationName: action, payload,
    });
  }

  private mapRegistration(row: PeripheralRow): PeripheralRegistration {
    return {
      tenantId: row.tenant_id, applicationId: row.application_id,
      peripheralId: row.peripheral_id, kind: row.peripheral_kind,
      displayName: row.display_name, adapterKey: row.adapter_key,
      adapterVersion: row.adapter_version, status: row.lifecycle_status,
      configurationVersion: Number(row.active_configuration_version ?? 0),
    };
  }

  private validateScope(scope: PeripheralScope): void {
    this.validateId(scope.tenantId, "tenantId");
    this.validateId(scope.applicationId, "applicationId");
  }

  private validateMutation(input: PeripheralAuditContext & PeripheralScope): void {
    this.validateScope(input);
    this.validateId(input.actorId, "actorId");
    if (!input.correlationId?.trim()) throw new Error("EPER_PERIPHERAL_CORRELATION_ID_REQUIRED");
    if (!["production", "uat", "sandbox"].includes(input.environment)) {
      throw new Error("EPER_PERIPHERAL_AUDIT_ENVIRONMENT_INVALID");
    }
  }

  private validateId(value: string, name: string): void {
    if (typeof value !== "string" || !value.trim() || value.length > 128) {
      throw new Error("EPER_PERIPHERAL_" + name.toUpperCase() + "_INVALID");
    }
  }

  private async rollback(client: AuditSqlClient): Promise<void> {
    try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
  }
}
