import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export interface TenantTransaction {
  readonly tenantId: string;
  readonly client: PoolClient;
}

export interface OutboxEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion?: number;
  correlationId: string;
  causationId?: string;
  payload: T;
  occurredAt?: Date;
}

/**
 * Runs a unit of work under a transaction-local tenant identity.
 * Callers must include tenant_id in predicates even though RLS is also enabled.
 * No external side effects should happen inside work; enqueue an outbox event instead.
 */
export async function withTenantTransaction<T>(
  pool: Pool,
  tenantId: string,
  work: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (typeof tenantId !== "string" || tenantId.trim().length === 0) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const client = await pool.connect();
  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
    const result = await work({ tenantId, client });
    await client.query("COMMIT");
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure; the pool will discard broken connections as needed.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function enqueueOutboxEvent(
  transaction: TenantTransaction,
  event: OutboxEvent,
): Promise<void> {
  if (event.tenantId !== transaction.tenantId) {
    throw new Error("TENANT_CONTEXT_MISMATCH");
  }
  if (!event.eventId?.trim() || !event.aggregateType?.trim() ||
      !event.aggregateId?.trim() || !event.eventType?.trim() ||
      !event.correlationId?.trim() || !event.payload ||
      typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error("OUTBOX_EVENT_INVALID");
  }

  await transaction.client.query(
    `INSERT INTO transactional_outbox
      (event_id, tenant_id, aggregate_type, aggregate_id, event_type,
       event_version, correlation_id, causation_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, COALESCE($10::timestamptz, now()))`,
    [
      event.eventId,
      transaction.tenantId,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      event.eventVersion ?? 1,
      event.correlationId,
      event.causationId ?? null,
      JSON.stringify(event.payload),
      event.occurredAt?.toISOString() ?? null,
    ],
  );
}

/** Only returns pending rows for this transaction's tenant. Use SKIP LOCKED for competing workers. */
export async function claimPendingOutboxEvents(
  transaction: TenantTransaction,
  limit = 100,
): Promise<QueryResult<QueryResultRow>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("OUTBOX_LIMIT_INVALID");
  }
  return transaction.client.query(
    `SELECT event_id, tenant_id, aggregate_type, aggregate_id, event_type,
            event_version, correlation_id, causation_id, payload, occurred_at, attempts
       FROM transactional_outbox
      WHERE tenant_id = $1 AND delivered_at IS NULL AND available_at <= now()
      ORDER BY occurred_at, event_id
      FOR UPDATE SKIP LOCKED
      LIMIT $2`,
    [transaction.tenantId, limit],
  );
}

export async function markOutboxDelivered(
  transaction: TenantTransaction,
  eventId: string,
): Promise<void> {
  const result = await transaction.client.query(
    `UPDATE transactional_outbox
        SET delivered_at = now(), last_error = NULL
      WHERE tenant_id = $1 AND event_id = $2 AND delivered_at IS NULL`,
    [transaction.tenantId, eventId],
  );
  if (result.rowCount !== 1) throw new Error("OUTBOX_EVENT_NOT_PENDING");
}

export async function recordOutboxFailure(
  transaction: TenantTransaction,
  eventId: string,
  errorMessage: string,
  retryDelaySeconds = 30,
): Promise<void> {
  if (!Number.isSafeInteger(retryDelaySeconds) || retryDelaySeconds < 1 || retryDelaySeconds > 86400) {
    throw new Error("OUTBOX_RETRY_DELAY_INVALID");
  }
  const result = await transaction.client.query(
    `UPDATE transactional_outbox
        SET attempts = attempts + 1,
            last_error = $3,
            available_at = now() + ($4::text || ' seconds')::interval
      WHERE tenant_id = $1 AND event_id = $2 AND delivered_at IS NULL`,
    [transaction.tenantId, eventId, errorMessage.slice(0, 2000), retryDelaySeconds],
  );
  if (result.rowCount !== 1) throw new Error("OUTBOX_EVENT_NOT_PENDING");
}
