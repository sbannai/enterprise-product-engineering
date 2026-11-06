import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type {
  ProviderValidationSnapshot,
  ProviderValidationStore,
} from "./provider-connection-validation-service.js";

type ValidationSnapshotRow = {
  tenant_id: string;
  connection_id: string;
  provider_key: string;
  adapter_key: string;
  adapter_version: string;
  auth_mode: string;
  secret_reference: string;
  environment: ProviderValidationSnapshot["environment"];
  safe_metadata: Record<string, unknown> | string;
  connection_status: ProviderValidationSnapshot["status"];
  version: number | string;
};

function jsonObject(value: Record<string, unknown> | string): Record<string, unknown> {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

/**
 * PostgreSQL implementation for the server-only validation boundary.
 * Validation outcome, connection status/version and append-only audit record
 * commit atomically. A concurrent rotate/revoke wins by changing the version.
 */
export class PostgresProviderValidationStore implements ProviderValidationStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async getValidationSnapshot(
    tenantId: string,
    applicationId: string,
    connectionId: string,
  ): Promise<ProviderValidationSnapshot | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      const result = await client.query<ValidationSnapshotRow>(
        `SELECT c.tenant_id, c.connection_id, c.provider_key, d.adapter_key,
          d.adapter_version, c.auth_mode, c.secret_reference, c.environment,
          c.safe_metadata, c.connection_status, c.version
         FROM eper_provider_connections c
         JOIN eper_provider_definitions d ON d.provider_key = c.provider_key
         JOIN eper_provider_connection_applications b
           ON b.tenant_id = c.tenant_id AND b.connection_id = c.connection_id
         WHERE c.tenant_id = $1 AND b.application_id = $2 AND c.connection_id = $3
           AND b.binding_status IN ('PENDING_VALIDATION', 'ACTIVE')
         FOR SHARE OF c, d, b`,
        [tenantId, applicationId, connectionId],
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      if (!row) return null;
      return {
        tenantId: row.tenant_id,
        connectionId: row.connection_id,
        providerKey: row.provider_key,
        adapterKey: row.adapter_key,
        adapterVersion: row.adapter_version,
        authMode: row.auth_mode,
        secretReference: row.secret_reference,
        environment: row.environment,
        safeMetadata: jsonObject(row.safe_metadata),
        status: row.connection_status,
        version: Number(row.version),
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async recordValidationOutcome(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
    expectedVersion: number;
    outcome: "SUCCEEDED" | "FAILED";
    errorCode?: string;
    actorId: string;
    correlationId: string;
    auditEnvironment: AuditEnvironment;
  }): Promise<{ status: "ACTIVE" | "DEGRADED"; version: number }> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new Error("PROVIDER_CONNECTION_VERSION_INVALID");
    }
    if (input.outcome === "FAILED" &&
      (typeof input.errorCode !== "string" || !/^[A-Z0-9_]{1,64}$/.test(input.errorCode))) {
      throw new Error("PROVIDER_VALIDATION_ERROR_CODE_INVALID");
    }
    if (input.outcome === "SUCCEEDED" && input.errorCode !== undefined) {
      throw new Error("PROVIDER_VALIDATION_SUCCESS_HAS_ERROR_CODE");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [input.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [input.applicationId]);
      const saved = await client.query<{
        provider_key: string;
        connection_status: "ACTIVE" | "DEGRADED";
        version: number | string;
      }>(
        `UPDATE eper_provider_connections
         SET connection_status = $4, version = version + 1,
             updated_at = NOW(), updated_by = $5
         WHERE tenant_id = $1 AND connection_id = $2 AND version = $3
           AND connection_status IN ('PENDING_VALIDATION', 'ACTIVE', 'DEGRADED')
           AND EXISTS (
             SELECT 1 FROM eper_provider_connection_applications b
             WHERE b.tenant_id = $1 AND b.application_id = $6 AND b.connection_id = $2
               AND b.binding_status IN ('PENDING_VALIDATION', 'ACTIVE')
           )
         RETURNING provider_key, connection_status, version`,
        [input.tenantId, input.connectionId, input.expectedVersion,
          input.outcome === "SUCCEEDED" ? "ACTIVE" : "DEGRADED", input.actorId, input.applicationId],
      );
      const row = saved.rows[0];
      if (!row) {
        const current = await client.query<{ version: number | string; connection_status: string }>(
          "SELECT version, connection_status FROM eper_provider_connections WHERE tenant_id = $1 AND connection_id = $2 FOR SHARE",
          [input.tenantId, input.connectionId],
        );
        if (!current.rows[0]) throw new Error("PROVIDER_CONNECTION_NOT_FOUND");
        if (current.rows[0].connection_status === "REVOKED" ||
            current.rows[0].connection_status === "SUSPENDED") {
          throw new Error("PROVIDER_CONNECTION_NOT_VALIDATABLE");
        }
        throw new Error("PROVIDER_CONNECTION_VERSION_CONFLICT");
      }

      await client.query(
        `UPDATE eper_provider_connection_applications
         SET binding_status = $4, version = version + 1,
             updated_at = NOW(), updated_by = $5
         WHERE tenant_id = $1 AND connection_id = $2 AND application_id = $3`,
        [input.tenantId, input.connectionId, input.applicationId,
          input.outcome === "SUCCEEDED" ? "ACTIVE" : "SUSPENDED", input.actorId],
      );

      await client.query(
        `INSERT INTO eper_provider_validation_events
          (validation_event_id, tenant_id, connection_id, provider_key,
           expected_connection_version, resulting_connection_version,
           validation_outcome, error_code, actor_id, correlation_id, audit_environment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [randomUUID(), input.tenantId, input.connectionId, row.provider_key,
          input.expectedVersion, Number(row.version), input.outcome, input.errorCode ?? null,
          input.actorId, input.correlationId, input.auditEnvironment],
      );

      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        environment: input.auditEnvironment,
        actorType: "human",
        actorId: input.actorId,
        action: "provider.connection.validate",
        outcome: input.outcome === "SUCCEEDED" ? "success" : "failure",
        reasonCode: input.errorCode,
        resourceType: "provider-connection",
        resourceId: input.connectionId,
        correlationId: input.correlationId,
        source: "api",
        operationName: "provider.connection.validate",
        payload: {
          providerKey: row.provider_key,
          expectedVersion: input.expectedVersion,
          resultingVersion: Number(row.version),
          validationOutcome: input.outcome,
        },
      });

      await client.query("COMMIT");
      return { status: row.connection_status, version: Number(row.version) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
