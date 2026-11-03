import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export type ProviderOperationStatus =
  | "QUEUED" | "DISPATCHING" | "RETRYING" | "SUCCEEDED"
  | "FAILED" | "NEEDS_ATTENTION" | "CANCELLED";

export interface ProviderOperation {
  operationId: string;
  tenantId: string;
  applicationId: string;
  connectionId: string;
  capabilityKey: string;
  capabilityVersion: string;
  idempotencyKey: string;
  correlationId: string;
  status: ProviderOperationStatus;
  requestDigest: string;
  payloadReference: string;
  providerReference: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  fencingToken: number;
  attemptCount: number;
  availableAt: string;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

type OperationRow = {
  operation_id: string;
  tenant_id: string;
  application_id: string;
  connection_id: string;
  capability_key: string;
  capability_version: string;
  idempotency_key: string;
  correlation_id: string;
  operation_status: ProviderOperationStatus;
  request_digest: string;
  payload_reference: string;
  provider_reference: string | null;
  lease_owner: string | null;
  lease_expires_at: Date | string | null;
  fencing_token: number | string;
  attempt_count: number | string;
  available_at: Date | string;
  last_error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function map(row: OperationRow): ProviderOperation {
  return {
    operationId: row.operation_id,
    tenantId: row.tenant_id,
    applicationId: row.application_id,
    connectionId: row.connection_id,
    capabilityKey: row.capability_key,
    capabilityVersion: row.capability_version,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    status: row.operation_status,
    requestDigest: row.request_digest,
    payloadReference: row.payload_reference,
    providerReference: row.provider_reference,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at === null ? null : iso(row.lease_expires_at),
    fencingToken: Number(row.fencing_token),
    attemptCount: Number(row.attempt_count),
    availableAt: iso(row.available_at),
    lastErrorCode: row.last_error_code,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function identity(value: string, label: string, max = 128): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("PROVIDER_OPERATION_" + label + "_INVALID");
  }
  return value.trim();
}

function digest(value: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("PROVIDER_OPERATION_REQUEST_DIGEST_INVALID");
  }
  return value;
}

export class ProviderOperationIdempotencyConflictError extends Error {
  constructor() {
    super("PROVIDER_OPERATION_IDEMPOTENCY_CONFLICT");
    this.name = "ProviderOperationIdempotencyConflictError";
  }
}

export class ProviderOperationStateConflictError extends Error {
  constructor(readonly currentStatus: ProviderOperationStatus | null) {
    super("PROVIDER_OPERATION_STATE_CONFLICT");
    this.name = "ProviderOperationStateConflictError";
  }
}

/**
 * Durable, application-scoped provider operation queue. Queue writes and
 * terminal/retry transitions are audited in the same PostgreSQL transaction.
 * Claiming uses SKIP LOCKED so concurrent workers cannot claim the same row.
 */
export class PostgresProviderOperationRepository {
  constructor(private readonly pool: AuditSqlPool) {}

  private async scope(client: AuditSqlClient, tenantId: string, applicationId: string): Promise<void> {
    await client.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantId]);
    await client.query("SELECT set_config('eper.application_id',$1,true)", [applicationId]);
  }

  private async audit(client: AuditSqlClient, input: {
    tenantId: string; applicationId: string; environment: AuditEnvironment;
    actorId: string; action: string; operationId: string; correlationId: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await appendAuditEventInTransaction(client, {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      environment: input.environment,
      actorType: "system",
      actorId: input.actorId,
      action: input.action,
      outcome: "success",
      resourceType: "provider-operation",
      resourceId: input.operationId,
      correlationId: input.correlationId,
      source: "job",
      operationName: input.action,
      payload: input.payload ?? {},
    });
  }

  async enqueue(input: {
    tenantId: string; applicationId: string; connectionId: string;
    capabilityKey: string; capabilityVersion: string; idempotencyKey: string;
    correlationId: string; requestDigest: string; payloadReference: string; actorId: string;
    auditEnvironment: AuditEnvironment;
  }): Promise<{ operation: ProviderOperation; created: boolean }> {
    const tenantId = identity(input.tenantId, "TENANT");
    const applicationId = identity(input.applicationId, "APPLICATION");
    const connectionId = identity(input.connectionId, "CONNECTION_ID");
    const capabilityKey = identity(input.capabilityKey, "CAPABILITY");
    const capabilityVersion = identity(input.capabilityVersion, "CAPABILITY_VERSION", 64);
    const idempotencyKey = identity(input.idempotencyKey, "IDEMPOTENCY_KEY", 200);
    const correlationId = identity(input.correlationId, "CORRELATION_ID");
    const actorId = identity(input.actorId, "ACTOR");
    const requestDigest = digest(input.requestDigest);
    const payloadReference = identity(input.payloadReference, "PAYLOAD_REFERENCE", 256);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/.test(payloadReference)) {
      throw new Error("PROVIDER_OPERATION_PAYLOAD_REFERENCE_INVALID");
    }
    const operationId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.scope(client, tenantId, applicationId);
      const inserted = await client.query<OperationRow>(
        `INSERT INTO eper_provider_operations
          (operation_id,tenant_id,application_id,connection_id,capability_key,capability_version,
           idempotency_key,correlation_id,operation_status,request_digest,payload_reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED',$9,$10)
         ON CONFLICT (tenant_id,application_id,connection_id,idempotency_key) DO NOTHING
         RETURNING operation_id,tenant_id,application_id,connection_id,capability_key,capability_version,
           idempotency_key,correlation_id,operation_status,request_digest,payload_reference,provider_reference,
           lease_owner,lease_expires_at,fencing_token,attempt_count,available_at,last_error_code,created_at,updated_at`,
        [operationId,tenantId,applicationId,connectionId,capabilityKey,capabilityVersion,
          idempotencyKey,correlationId,requestDigest,payloadReference],
      );
      let row = inserted.rows[0];
      const created = Boolean(row);
      if (!row) {
        const existing = await client.query<OperationRow>(
          `SELECT operation_id,tenant_id,application_id,connection_id,capability_key,capability_version,
            idempotency_key,correlation_id,operation_status,request_digest,payload_reference,provider_reference,
            lease_owner,lease_expires_at,fencing_token,attempt_count,available_at,last_error_code,created_at,updated_at
           FROM eper_provider_operations
           WHERE tenant_id=$1 AND application_id=$2 AND connection_id=$3 AND idempotency_key=$4
           FOR SHARE`,
          [tenantId,applicationId,connectionId,idempotencyKey],
        );
        row = existing.rows[0];
        if (!row) throw new Error("PROVIDER_OPERATION_IDEMPOTENCY_LOOKUP_EMPTY");
        if (row.request_digest !== requestDigest || row.payload_reference !== payloadReference
          || row.capability_key !== capabilityKey || row.capability_version !== capabilityVersion) {
          throw new ProviderOperationIdempotencyConflictError();
        }
      } else {
        await this.audit(client, {
          tenantId, applicationId, environment: input.auditEnvironment, actorId,
          action: "provider.operation.queued", operationId, correlationId,
          payload: { capabilityKey, capabilityVersion, requestDigest },
        });
      }
      await client.query("COMMIT");
      return { operation: map(row), created };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async claimNext(input: {
    tenantId: string; applicationId: string; workerId: string;
    leaseDurationSeconds?: number;
    auditEnvironment: AuditEnvironment;
  }): Promise<ProviderOperation | null> {
    const tenantId = identity(input.tenantId, "TENANT");
    const applicationId = identity(input.applicationId, "APPLICATION");
    const workerId = identity(input.workerId, "WORKER");
    const leaseDurationSeconds = input.leaseDurationSeconds ?? 60;
    if (!Number.isInteger(leaseDurationSeconds) || leaseDurationSeconds < 5 || leaseDurationSeconds > 3600) {
      throw new Error("PROVIDER_OPERATION_LEASE_DURATION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.scope(client, tenantId, applicationId);
      const claimed = await client.query<OperationRow>(
        `WITH candidate AS (
           SELECT o.operation_id FROM eper_provider_operations o
           JOIN eper_provider_connection_applications b
             ON b.tenant_id=o.tenant_id AND b.application_id=o.application_id
            AND b.connection_id=o.connection_id
           JOIN eper_provider_connections pc
             ON pc.tenant_id=o.tenant_id AND pc.connection_id=o.connection_id
           WHERE o.tenant_id=$1 AND o.application_id=$2
             AND ((o.operation_status IN ('QUEUED','RETRYING') AND o.available_at <= NOW())
               OR (o.operation_status='DISPATCHING' AND o.lease_expires_at <= NOW()))
             AND b.binding_status='ACTIVE' AND pc.connection_status='ACTIVE'
             AND b.allowed_capabilities ? o.capability_key
           ORDER BY o.available_at,o.created_at,o.operation_id
           FOR UPDATE OF o SKIP LOCKED LIMIT 1
         )
         UPDATE eper_provider_operations o
         SET operation_status='DISPATCHING',attempt_count=o.attempt_count+1,
             lease_owner=$4,lease_expires_at=NOW()+($3::int * INTERVAL '1 second'),
             fencing_token=o.fencing_token+1,updated_at=NOW(),last_error_code=NULL
         FROM candidate c WHERE o.operation_id=c.operation_id
         RETURNING o.operation_id,o.tenant_id,o.application_id,o.connection_id,o.capability_key,
           o.capability_version,o.idempotency_key,o.correlation_id,o.operation_status,o.request_digest,
           o.payload_reference,o.provider_reference,o.lease_owner,o.lease_expires_at,o.fencing_token,
           o.attempt_count,o.available_at,o.last_error_code,o.created_at,o.updated_at`,
        [tenantId,applicationId,leaseDurationSeconds,workerId],
      );
      const row = claimed.rows[0];
      if (row) {
        await this.audit(client, {
          tenantId, applicationId, environment: input.auditEnvironment, actorId: workerId,
          action: "provider.operation.dispatch_claimed", operationId: row.operation_id,
          correlationId: row.correlation_id,
          payload: { attemptCount: Number(row.attempt_count), fencingToken: Number(row.fencing_token), leaseExpiresAt: iso(row.lease_expires_at!) },
        });
      }
      await client.query("COMMIT");
      return row ? map(row) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async renewLease(input: {
    tenantId: string; applicationId: string; operationId: string; workerId: string;
    fencingToken: number; leaseDurationSeconds?: number;
    auditEnvironment: AuditEnvironment;
  }): Promise<ProviderOperation> {
    const tenantId = identity(input.tenantId, "TENANT");
    const applicationId = identity(input.applicationId, "APPLICATION");
    const operationId = identity(input.operationId, "OPERATION_ID");
    const workerId = identity(input.workerId, "WORKER");
    const leaseDurationSeconds = input.leaseDurationSeconds ?? 60;
    if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) {
      throw new Error("PROVIDER_OPERATION_FENCING_TOKEN_INVALID");
    }
    if (!Number.isInteger(leaseDurationSeconds) || leaseDurationSeconds < 5 || leaseDurationSeconds > 3600) {
      throw new Error("PROVIDER_OPERATION_LEASE_DURATION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.scope(client, tenantId, applicationId);
      const renewed = await client.query<OperationRow>(
        `UPDATE eper_provider_operations SET
           lease_expires_at=NOW()+($6::int * INTERVAL '1 second'),updated_at=NOW()
         WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3
           AND operation_status='DISPATCHING' AND lease_owner=$4
           AND fencing_token=$5 AND lease_expires_at > NOW()
         RETURNING operation_id,tenant_id,application_id,connection_id,capability_key,capability_version,
           idempotency_key,correlation_id,operation_status,request_digest,payload_reference,provider_reference,
           lease_owner,lease_expires_at,fencing_token,attempt_count,available_at,last_error_code,created_at,updated_at`,
        [tenantId,applicationId,operationId,workerId,input.fencingToken,leaseDurationSeconds],
      );
      const row = renewed.rows[0];
      if (!row) {
        const current = await client.query<{ operation_status: ProviderOperationStatus }>(
          "SELECT operation_status FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
          [tenantId,applicationId,operationId],
        );
        throw new ProviderOperationStateConflictError(current.rows[0]?.operation_status ?? null);
      }
      await this.audit(client, {
        tenantId, applicationId, environment: input.auditEnvironment, actorId: workerId,
        action: "provider.operation.lease_renewed", operationId,
        correlationId: row.correlation_id,
        payload: { fencingToken: Number(row.fencing_token), leaseExpiresAt: iso(row.lease_expires_at!) },
      });
      await client.query("COMMIT");
      return map(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async recordOutcome(input: {
    tenantId: string; applicationId: string; operationId: string; workerId: string;
    outcome: "SUCCEEDED" | "RETRY" | "FAILED" | "NEEDS_ATTENTION";
    providerReference?: string; errorCode?: string; retryAfterSeconds?: number; maxAttempts?: number;
    fencingToken: number;
    auditEnvironment: AuditEnvironment;
  }): Promise<ProviderOperation> {
    const tenantId = identity(input.tenantId, "TENANT");
    const applicationId = identity(input.applicationId, "APPLICATION");
    const operationId = identity(input.operationId, "OPERATION_ID");
    const workerId = identity(input.workerId, "WORKER");
    if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) {
      throw new Error("PROVIDER_OPERATION_FENCING_TOKEN_INVALID");
    }
    if (input.providerReference !== undefined) identity(input.providerReference, "PROVIDER_REFERENCE", 256);
    if (input.errorCode !== undefined && !/^[A-Z0-9_]{1,96}$/.test(input.errorCode)) {
      throw new Error("PROVIDER_OPERATION_ERROR_CODE_INVALID");
    }
    const retryAfterSeconds = input.retryAfterSeconds ?? 60;
    if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1 || retryAfterSeconds > 86400) {
      throw new Error("PROVIDER_OPERATION_RETRY_DELAY_INVALID");
    }
    const maxAttempts = input.maxAttempts ?? 5;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error("PROVIDER_OPERATION_MAX_ATTEMPTS_INVALID");
    }
    const status: ProviderOperationStatus = input.outcome === "RETRY" ? "RETRYING" : input.outcome;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.scope(client, tenantId, applicationId);
      const saved = await client.query<OperationRow>(
        `UPDATE eper_provider_operations SET
           operation_status=CASE WHEN $4='RETRYING' AND attempt_count >= $8
             THEN 'NEEDS_ATTENTION' ELSE $4 END,
           provider_reference=COALESCE($5,provider_reference),last_error_code=$6,
           available_at=CASE WHEN $4='RETRYING' AND attempt_count < $8
             THEN NOW()+($7::int * INTERVAL '1 second') ELSE available_at END,
           lease_owner=NULL,lease_expires_at=NULL,updated_at=NOW()
         WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3
           AND operation_status='DISPATCHING' AND lease_owner=$9
           AND fencing_token=$10 AND lease_expires_at > NOW()
         RETURNING operation_id,tenant_id,application_id,connection_id,capability_key,capability_version,
           idempotency_key,correlation_id,operation_status,request_digest,payload_reference,provider_reference,
           lease_owner,lease_expires_at,fencing_token,attempt_count,available_at,last_error_code,created_at,updated_at`,
        [tenantId,applicationId,operationId,status,input.providerReference ?? null,
          input.outcome === "SUCCEEDED" ? null : input.errorCode ?? "PROVIDER_OPERATION_FAILED",
          retryAfterSeconds,maxAttempts,workerId,input.fencingToken],
      );
      const row = saved.rows[0];
      if (!row) {
        const current = await client.query<{ operation_status: ProviderOperationStatus }>(
          "SELECT operation_status FROM eper_provider_operations WHERE tenant_id=$1 AND application_id=$2 AND operation_id=$3",
          [tenantId,applicationId,operationId],
        );
        throw new ProviderOperationStateConflictError(current.rows[0]?.operation_status ?? null);
      }
      await this.audit(client, {
        tenantId, applicationId, environment: input.auditEnvironment, actorId: workerId,
        action: "provider.operation." + status.toLowerCase(), operationId,
        correlationId: row.correlation_id,
        payload: { attemptCount: Number(row.attempt_count), errorCode: row.last_error_code },
      });
      await client.query("COMMIT");
      return map(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
