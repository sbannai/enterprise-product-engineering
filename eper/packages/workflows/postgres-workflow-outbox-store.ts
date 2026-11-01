import type { AuditSqlClient, AuditSqlPool } from "../audit/audit-event-store.js";

export interface WorkflowOutboxContext {
  tenantId: string;
  applicationId: string;
}

export type WorkflowOutboxEventType =
  | "workflow.instance.started" | "workflow.instance.submitted" | "workflow.instance.approved"
  | "workflow.instance.rejected" | "workflow.instance.cancelled" | "workflow.instance.completed";

export interface WorkflowOutboxEvent {
  eventId: string;
  tenantId: string;
  applicationId: string;
  instanceId: string;
  transitionId: string;
  eventType: WorkflowOutboxEventType;
  eventVersion: number;
  payload: Record<string, unknown>;
  occurredAt: string;
  attempts: number;
}

export interface WorkflowOutboxClaimOptions {
  workerId: string;
  limit?: number;
  leaseSeconds?: number;
}

export interface WorkflowOutboxFailureOptions {
  workerId: string;
  maxAttempts: number;
  retryDelaySeconds: number;
  error: string;
}

export interface WorkflowOutboxFailureResult {
  status: "pending" | "dead_letter";
  attempts: number;
}

type EventRow = {
  event_id: string; tenant_id: string; application_id: string; instance_id: string;
  transition_id: string; event_type: WorkflowOutboxEventType; event_version: number | string;
  payload: Record<string, unknown> | string; occurred_at: string | Date; attempts: number | string;
};

function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new Error("WORKFLOW_OUTBOX_INVALID_" + name.toUpperCase());
  }
}
function parsePayload(value: Record<string, unknown> | string): Record<string, unknown> {
  const payload = typeof value === "string" ? JSON.parse(value) : value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("WORKFLOW_OUTBOX_EVENT_PAYLOAD_INVALID");
  }
  return payload as Record<string, unknown>;
}
function mapEvent(row: EventRow): WorkflowOutboxEvent {
  return {
    eventId: row.event_id, tenantId: row.tenant_id, applicationId: row.application_id,
    instanceId: row.instance_id, transitionId: row.transition_id, eventType: row.event_type,
    eventVersion: Number(row.event_version), payload: parsePayload(row.payload),
    occurredAt: new Date(row.occurred_at).toISOString(), attempts: Number(row.attempts),
  };
}
async function setRls(client: AuditSqlClient, context: WorkflowOutboxContext): Promise<void> {
  validateId(context.tenantId, "tenantId");
  validateId(context.applicationId, "applicationId");
  await client.query("SELECT set_config('eper.tenant_id', $1, true)", [context.tenantId]);
  await client.query("SELECT set_config('eper.application_id', $1, true)", [context.applicationId]);
}

/** Tenant/application-scoped at-least-once outbox lease and acknowledgement store. */
export class PostgresWorkflowOutboxStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async claim(context: WorkflowOutboxContext, options: WorkflowOutboxClaimOptions): Promise<WorkflowOutboxEvent[]> {
    await setRlsValidation(context);
    validateId(options.workerId, "workerId");
    const limit = options.limit ?? 20;
    const leaseSeconds = options.leaseSeconds ?? 60;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("WORKFLOW_OUTBOX_CLAIM_LIMIT_INVALID");
    }
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
      throw new Error("WORKFLOW_OUTBOX_LEASE_SECONDS_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, context);
      const result = await client.query<EventRow>(
        `WITH candidates AS (
           SELECT tenant_id, application_id, event_id
             FROM eper_workflow_outbox_delivery
            WHERE tenant_id = $1 AND application_id = $2
              AND (
                (delivery_status = 'pending' AND available_at <= NOW())
                OR
                (delivery_status = 'processing' AND locked_at <= NOW() - ($4::int * INTERVAL '1 second'))
              )
            ORDER BY available_at, event_id
            LIMIT $3
            FOR UPDATE SKIP LOCKED
         )
         UPDATE eper_workflow_outbox_delivery d
            SET delivery_status = 'processing', attempts = d.attempts + 1,
                locked_at = NOW(), locked_by = $5, updated_at = NOW()
           FROM candidates c
           JOIN eper_workflow_outbox_events e
             ON e.tenant_id = c.tenant_id AND e.application_id = c.application_id
            AND e.event_id = c.event_id
          WHERE d.tenant_id = c.tenant_id AND d.application_id = c.application_id
            AND d.event_id = c.event_id
         RETURNING e.event_id, e.tenant_id, e.application_id, e.instance_id,
                   e.transition_id, e.event_type, e.event_version, e.payload,
                   e.occurred_at, d.attempts`,
        [context.tenantId, context.applicationId, limit, leaseSeconds, options.workerId],
      );
      await client.query("COMMIT");
      return result.rows.map(mapEvent);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  /** Extends only a still-live lease owned by this worker; never resurrects an expired claim. */
  async renewLease(
    context: WorkflowOutboxContext,
    eventId: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    validateUuid(eventId);
    validateId(workerId, "workerId");
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
      throw new Error("WORKFLOW_OUTBOX_LEASE_SECONDS_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, context);
      const result = await client.query<{ event_id: string }>(
        `UPDATE eper_workflow_outbox_delivery
            SET locked_at = NOW(), updated_at = NOW()
          WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3
            AND delivery_status = 'processing' AND locked_by = $4
            AND locked_at > NOW() - ($5::int * INTERVAL '1 second')
          RETURNING event_id`,
        [context.tenantId, context.applicationId, eventId, workerId, leaseSeconds],
      );
      await client.query("COMMIT");
      return Boolean(result.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async markDelivered(context: WorkflowOutboxContext, eventId: string, workerId: string): Promise<void> {
    validateUuid(eventId);
    validateId(workerId, "workerId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, context);
      const result = await client.query<{ event_id: string }>(
        `UPDATE eper_workflow_outbox_delivery
            SET delivery_status = 'delivered', delivered_at = NOW(),
                locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = NOW()
          WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3
            AND delivery_status = 'processing' AND locked_by = $4
          RETURNING event_id`,
        [context.tenantId, context.applicationId, eventId, workerId],
      );
      if (!result.rows[0]) throw new Error("WORKFLOW_OUTBOX_LEASE_NOT_HELD");
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async markFailed(
    context: WorkflowOutboxContext,
    eventId: string,
    options: WorkflowOutboxFailureOptions,
  ): Promise<WorkflowOutboxFailureResult> {
    validateUuid(eventId);
    validateId(options.workerId, "workerId");
    if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 100) {
      throw new Error("WORKFLOW_OUTBOX_MAX_ATTEMPTS_INVALID");
    }
    if (!Number.isSafeInteger(options.retryDelaySeconds) ||
        options.retryDelaySeconds < 0 || options.retryDelaySeconds > 86_400) {
      throw new Error("WORKFLOW_OUTBOX_RETRY_DELAY_INVALID");
    }
    if (typeof options.error !== "string" || !options.error.trim()) {
      throw new Error("WORKFLOW_OUTBOX_FAILURE_REASON_REQUIRED");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, context);
      const result = await client.query<{ delivery_status: "pending" | "dead_letter"; attempts: number | string }>(
        `UPDATE eper_workflow_outbox_delivery
            SET delivery_status = CASE WHEN attempts >= $5::int THEN 'dead_letter' ELSE 'pending' END,
                available_at = CASE WHEN attempts >= $5::int THEN available_at
                                    ELSE NOW() + ($6::int * INTERVAL '1 second') END,
                locked_at = NULL, locked_by = NULL, last_error = $4::varchar(2000),
                updated_at = NOW()
          WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3
            AND delivery_status = 'processing' AND locked_by = $7
          RETURNING delivery_status, attempts`,
        [context.tenantId, context.applicationId, eventId, options.error.slice(0, 2000),
          options.maxAttempts, options.retryDelaySeconds, options.workerId],
      );
      if (!result.rows[0]) throw new Error("WORKFLOW_OUTBOX_LEASE_NOT_HELD");
      await client.query("COMMIT");
      return { status: result.rows[0].delivery_status, attempts: Number(result.rows[0].attempts) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
}

function validateUuid(value: string): void {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("WORKFLOW_OUTBOX_EVENT_ID_INVALID");
  }
}
function setRlsValidation(context: WorkflowOutboxContext): void {
  validateId(context.tenantId, "tenantId");
  validateId(context.applicationId, "applicationId");
}
