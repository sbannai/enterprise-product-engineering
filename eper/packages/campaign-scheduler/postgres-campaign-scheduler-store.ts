import { randomUUID } from "node:crypto";
import { appendAuditEventInTransaction, type AuditEnvironment, type AuditSqlPool, type AuditSqlClient } from "../audit/audit-event-store.js";

export type CampaignTriggerType = "once" | "recurring" | "event" | "condition";
export type CampaignScheduleStatus = "draft" | "scheduled" | "paused" | "cancelled" | "completed";
export type CampaignApprovalStatus = "pending" | "approved" | "rejected";
export type CampaignExecutionStatus = "queued" | "running" | "succeeded" | "retry_wait" | "dead_letter" | "cancelled";

export interface CreateCampaignScheduleInput {
  tenantId: string;
  applicationId: string;
  campaignId: string;
  triggerType: CampaignTriggerType;
  timezone: string;
  scheduleDefinition: Record<string, unknown>;
  createdBy: string;
}
export interface CampaignScheduleRecord {
  id: string;
  tenantId: string;
  applicationId: string;
  campaignId: string;
  triggerType: CampaignTriggerType;
  timezone: string;
  scheduleDefinition: Record<string, unknown>;
  approvalStatus: CampaignApprovalStatus;
  status: CampaignScheduleStatus;
  nextRunAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface CampaignExecutionRecord {
  id: string;
  scheduleId: string;
  tenantId: string;
  applicationId: string;
  scheduledFor: string;
  status: CampaignExecutionStatus;
  attemptCount: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  availableAt: string;
}
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TZ_PATTERN = /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)*$/;

function required(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw new Error(code);
  return value.trim();
}
function mapSchedule(row: Record<string, unknown>): CampaignScheduleRecord {
  const definition = typeof row.schedule_definition === "string" ? JSON.parse(row.schedule_definition) : row.schedule_definition;
  return {
    id: String(row.id), tenantId: String(row.tenant_id), applicationId: String(row.application_id),
    campaignId: String(row.campaign_id), triggerType: row.trigger_type as CampaignTriggerType,
    timezone: String(row.timezone), scheduleDefinition: definition as Record<string, unknown>,
    approvalStatus: row.approval_status as CampaignApprovalStatus, status: row.status as CampaignScheduleStatus,
    nextRunAt: row.next_run_at ? new Date(row.next_run_at as string | Date).toISOString() : null,
    createdBy: String(row.created_by), updatedBy: String(row.updated_by),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

/** PostgreSQL-backed schedule/queue primitives. Caller must supply trusted tenant and actor identities. */
export class PostgresCampaignSchedulerStore {
  constructor(
    private readonly pool: AuditSqlPool,
    private readonly auditEnvironment: AuditEnvironment = "uat",
    private readonly serviceVersion?: string,
  ) {}

  private async appendLifecycleAudit(client: AuditSqlClient, input: {
    tenantId: string; applicationId: string; actorId: string; action: string;
    resourceId: string; operationName: string; payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId, applicationId: input.applicationId,
        environment: this.auditEnvironment, actorType: "human", actorId: input.actorId,
        action: input.action, outcome: "success", resourceType: "campaign-schedule",
        resourceId: input.resourceId, source: "api", operationName: input.operationName,
        serviceVersion: this.serviceVersion, payload: input.payload,
      });
    } catch {
      throw new Error("CAMPAIGN_AUDIT_PERSISTENCE_FAILED");
    }
  }

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ schedules_table: string | null; executions_table: string | null }>(
        "SELECT to_regclass('public.eper_campaign_schedules')::text AS schedules_table, to_regclass('public.eper_campaign_executions')::text AS executions_table",
      );
      if (!result.rows[0]?.schedules_table || !result.rows[0]?.executions_table) {
        throw new Error("EPER_CAMPAIGN_SCHEDULER_SCHEMA_NOT_APPLIED");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_CAMPAIGN_SCHEDULER_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_CAMPAIGN_SCHEDULER_READINESS_CHECK_FAILED", { cause: error });
    } finally { client.release(); }
  }

  async createSchedule(input: CreateCampaignScheduleInput): Promise<CampaignScheduleRecord> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const campaignId = required(input.campaignId, "CAMPAIGN_ID_REQUIRED");
    const createdBy = required(input.createdBy, "CAMPAIGN_ACTOR_REQUIRED");
    if (!["once", "recurring", "event", "condition"].includes(input.triggerType)) throw new Error("CAMPAIGN_TRIGGER_TYPE_INVALID");
    if (!TZ_PATTERN.test(input.timezone) || input.timezone.length > 128) throw new Error("CAMPAIGN_TIMEZONE_INVALID");
    if (!input.scheduleDefinition || typeof input.scheduleDefinition !== "object" || Array.isArray(input.scheduleDefinition)) {
      throw new Error("CAMPAIGN_SCHEDULE_DEFINITION_REQUIRED");
    }
    if (input.triggerType === "recurring") {
      const intervalSeconds = input.scheduleDefinition.intervalSeconds;
      if (!Number.isInteger(intervalSeconds) || Number(intervalSeconds) < 60 || Number(intervalSeconds) > 31536000) {
        throw new Error("CAMPAIGN_RECURRING_INTERVAL_SECONDS_INVALID");
      }
    }
    const client = await this.pool.connect();
    const id = randomUUID();
    try {
      await client.query("BEGIN");
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO eper_campaign_schedules
          (id, tenant_id, application_id, campaign_id, trigger_type, timezone, schedule_definition, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8)
         RETURNING *`,
        [id, tenantId, applicationId, campaignId, input.triggerType, input.timezone,
          JSON.stringify(input.scheduleDefinition), createdBy],
      );
      const schedule = mapSchedule(result.rows[0]);
      await this.appendLifecycleAudit(client, { tenantId, applicationId, actorId: createdBy, action: "campaign_schedule_create", resourceId: schedule.id, operationName: "campaign.schedule.create", payload: { campaignId, triggerType: input.triggerType, status: schedule.status, approvalStatus: schedule.approvalStatus } });
      await client.query("COMMIT");
      return schedule;
    } catch (error) { try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ } throw error; }
    finally { client.release(); }
  }

  async listSchedules(input: {
    tenantId: string; applicationId: string; limit?: number; offset?: number;
  }): Promise<CampaignScheduleRecord[]> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const limit = input.limit ?? 25;
    const offset = input.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("CAMPAIGN_LIST_LIMIT_INVALID");
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000000) throw new Error("CAMPAIGN_LIST_OFFSET_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<Record<string, unknown>>(
        `SELECT * FROM eper_campaign_schedules
         WHERE tenant_id=$1 AND application_id=$2
         ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
        [tenantId, applicationId, limit, offset],
      );
      return result.rows.map(mapSchedule);
    } finally { client.release(); }
  }

  async getSchedule(input: {
    tenantId: string; applicationId: string; scheduleId: string;
  }): Promise<CampaignScheduleRecord | null> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    if (!ID_PATTERN.test(input.scheduleId)) throw new Error("CAMPAIGN_SCHEDULE_ID_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<Record<string, unknown>>(
        `SELECT * FROM eper_campaign_schedules
         WHERE tenant_id=$1 AND application_id=$2 AND id=$3 LIMIT 1`,
        [tenantId, applicationId, input.scheduleId],
      );
      return result.rows[0] ? mapSchedule(result.rows[0]) : null;
    } finally { client.release(); }
  }

  async approveAndSchedule(input: {
    tenantId: string; applicationId: string; scheduleId: string; actorId: string; nextRunAt: string;
  }): Promise<CampaignScheduleRecord> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const actorId = required(input.actorId, "CAMPAIGN_ACTOR_REQUIRED");
    if (!ID_PATTERN.test(input.scheduleId)) throw new Error("CAMPAIGN_SCHEDULE_ID_INVALID");
    const nextRunAt = new Date(input.nextRunAt);
    if (!Number.isFinite(nextRunAt.getTime()) || nextRunAt.getTime() <= Date.now()) throw new Error("CAMPAIGN_NEXT_RUN_MUST_BE_FUTURE");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Record<string, unknown>>(
        `UPDATE eper_campaign_schedules
           SET approval_status='approved', status='scheduled', next_run_at=$4, updated_by=$5, updated_at=now()
         WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND status IN ('draft','paused')
         RETURNING *`,
        [tenantId, applicationId, input.scheduleId, nextRunAt.toISOString(), actorId],
      );
      if (!result.rows[0]) throw new Error("CAMPAIGN_SCHEDULE_NOT_FOUND_OR_NOT_APPROVABLE");
      const schedule = mapSchedule(result.rows[0]);
      await this.appendLifecycleAudit(client, { tenantId, applicationId, actorId, action: "campaign_schedule_approve", resourceId: schedule.id, operationName: "campaign.schedule.approve", payload: { resultingStatus: schedule.status, approvalStatus: schedule.approvalStatus, nextRunAt: schedule.nextRunAt } });
      await client.query("COMMIT");
      return schedule;
    } catch (error) { try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ } throw error; }
    finally { client.release(); }
  }

  async pauseOrCancel(input: {
    tenantId: string; applicationId: string; scheduleId: string; actorId: string; action: "pause" | "cancel";
  }): Promise<CampaignScheduleRecord> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const actorId = required(input.actorId, "CAMPAIGN_ACTOR_REQUIRED");
    if (!ID_PATTERN.test(input.scheduleId)) throw new Error("CAMPAIGN_SCHEDULE_ID_INVALID");
    const status = input.action === "pause" ? "paused" : "cancelled";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Record<string, unknown>>(
        `UPDATE eper_campaign_schedules SET status=$4, updated_by=$5, updated_at=now()
         WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND status IN ('draft','scheduled','paused')
         RETURNING *`,
        [tenantId, applicationId, input.scheduleId, status, actorId],
      );
      if (!result.rows[0]) throw new Error("CAMPAIGN_SCHEDULE_NOT_FOUND_OR_NOT_MUTABLE");
      if (input.action === "cancel") {
        await client.query(
          `UPDATE eper_campaign_executions SET status='cancelled', updated_at=now(), locked_at=NULL, locked_by=NULL
           WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=$3 AND status IN ('queued','retry_wait','running')`,
          [tenantId, applicationId, input.scheduleId],
        );
      }
      const schedule = mapSchedule(result.rows[0]);
      await this.appendLifecycleAudit(client, { tenantId, applicationId, actorId, action: "campaign_schedule_" + input.action, resourceId: schedule.id, operationName: "campaign.schedule." + input.action, payload: { resultingStatus: schedule.status, approvalStatus: schedule.approvalStatus } });
      await client.query("COMMIT");
      return schedule;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  /** Insert once per tenant/app/idempotency key; duplicate dispatch requests return the existing job. */
  async enqueueExecution(input: {
    tenantId: string; applicationId: string; scheduleId: string; scheduledFor: string;
    idempotencyKey: string; payload?: Record<string, unknown>;
  }): Promise<CampaignExecutionRecord | null> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    if (!ID_PATTERN.test(input.scheduleId)) throw new Error("CAMPAIGN_SCHEDULE_ID_INVALID");
    const idempotencyKey = required(input.idempotencyKey, "CAMPAIGN_IDEMPOTENCY_KEY_REQUIRED");
    if (idempotencyKey.length > 256) throw new Error("CAMPAIGN_IDEMPOTENCY_KEY_INVALID");
    const scheduledFor = new Date(input.scheduledFor);
    if (!Number.isFinite(scheduledFor.getTime())) throw new Error("CAMPAIGN_SCHEDULED_FOR_INVALID");
    const payload = input.payload ?? {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("CAMPAIGN_EXECUTION_PAYLOAD_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO eper_campaign_executions
          (id, schedule_id, tenant_id, application_id, scheduled_for, idempotency_key, payload)
         SELECT $1, s.id, s.tenant_id, s.application_id, $5, $6, $7::jsonb
         FROM eper_campaign_schedules s
         WHERE s.tenant_id=$2 AND s.application_id=$3 AND s.id=$4
           AND s.status='scheduled' AND s.approval_status='approved'
         ON CONFLICT (tenant_id, application_id, idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
         RETURNING *`,
        [randomUUID(), tenantId, applicationId, input.scheduleId, scheduledFor.toISOString(), idempotencyKey, JSON.stringify(payload)],
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      const storedPayload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      return {
        id: String(row.id), scheduleId: String(row.schedule_id), tenantId: String(row.tenant_id),
        applicationId: String(row.application_id), scheduledFor: new Date(row.scheduled_for as string | Date).toISOString(),
        status: row.status as CampaignExecutionStatus, attemptCount: Number(row.attempt_count),
        idempotencyKey: String(row.idempotency_key), payload: storedPayload as Record<string, unknown>,
        availableAt: new Date(row.available_at as string | Date).toISOString(),
      };
    } finally { client.release(); }
  }

  /** Fan an approved tenant-scoped domain event into matching durable campaign executions. */
  async enqueueEventExecutions(input: {
    tenantId: string;
    applicationId: string;
    eventType: string;
    eventId: string;
    occurredAt: string;
    payload?: Record<string, unknown>;
  }): Promise<number> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const eventType = required(input.eventType, "CAMPAIGN_EVENT_TYPE_REQUIRED");
    const eventId = required(input.eventId, "CAMPAIGN_EVENT_ID_REQUIRED");
    if (eventType.length > 128 || eventId.length > 256) throw new Error("CAMPAIGN_EVENT_IDENTITY_INVALID");
    const occurredAt = new Date(input.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) throw new Error("CAMPAIGN_EVENT_OCCURRED_AT_INVALID");
    const payload = input.payload ?? {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("CAMPAIGN_EVENT_PAYLOAD_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO eper_campaign_executions
          (id, schedule_id, tenant_id, application_id, scheduled_for, idempotency_key, payload)
         SELECT gen_random_uuid(), s.id, s.tenant_id, s.application_id, $3,
           'event:' || $4 || ':' || s.id::text,
           jsonb_build_object('campaignId', s.campaign_id, 'eventType', $5, 'eventId', $4, 'eventPayload', $6::jsonb)
         FROM eper_campaign_schedules s
         WHERE s.tenant_id=$1 AND s.application_id=$2
           AND s.trigger_type='event' AND s.status='scheduled' AND s.approval_status='approved'
           AND s.schedule_definition->>'eventType'=$5
         ON CONFLICT (tenant_id, application_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [tenantId, applicationId, occurredAt.toISOString(), eventId, eventType, JSON.stringify(payload)],
      );
      return result.rowCount ?? result.rows.length;
    } finally { client.release(); }
  }

  /** Materialize one due interval per recurring schedule and advance to the next future interval. */
  async materializeDueRecurringSchedules(limit = 50): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("CAMPAIGN_MATERIALIZE_LIMIT_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `WITH due AS (
           SELECT id, tenant_id, application_id, campaign_id, next_run_at,
             (schedule_definition->>'intervalSeconds')::integer AS interval_seconds
           FROM eper_campaign_schedules
           WHERE status='scheduled' AND approval_status='approved'
             AND trigger_type='recurring' AND next_run_at <= now()
             AND (schedule_definition->>'intervalSeconds') ~ '^[0-9]+$'
             AND (schedule_definition->>'intervalSeconds')::integer BETWEEN 60 AND 31536000
           ORDER BY next_run_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         ), inserted AS (
           INSERT INTO eper_campaign_executions
             (id, schedule_id, tenant_id, application_id, scheduled_for, idempotency_key, payload)
           SELECT gen_random_uuid(), d.id, d.tenant_id, d.application_id, d.next_run_at,
             'campaign:' || d.id::text || ':' || to_char(d.next_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             jsonb_build_object('campaignId', d.campaign_id)
           FROM due d
           ON CONFLICT (tenant_id, application_id, idempotency_key) DO NOTHING
           RETURNING schedule_id, tenant_id, application_id
         ), advanced AS (
           UPDATE eper_campaign_schedules s
           SET next_run_at = d.next_run_at
             + (GREATEST(1, floor(extract(epoch FROM (now() - d.next_run_at)) / d.interval_seconds)::bigint + 1)
                * d.interval_seconds) * interval '1 second',
               updated_at=now()
           FROM due d
           WHERE s.id=d.id AND s.tenant_id=d.tenant_id AND s.application_id=d.application_id
           RETURNING s.id
         )
         SELECT count(*)::int AS materialized_count FROM inserted`,
        [limit],
      );
      return Number(result.rows[0]?.materialized_count ?? 0);
    } finally { client.release(); }
  }

  /** Materialize due one-time schedules into durable executions without double-claiming across schedulers. */
  async materializeDueOneTimeSchedules(limit = 50): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("CAMPAIGN_MATERIALIZE_LIMIT_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `WITH due AS (
           SELECT id, tenant_id, application_id, next_run_at
           FROM eper_campaign_schedules
           WHERE status='scheduled' AND approval_status='approved'
             AND trigger_type='once' AND next_run_at <= now()
           ORDER BY next_run_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         ), completed AS (
           UPDATE eper_campaign_schedules s
           SET status='completed', updated_at=now()
           FROM due d
           WHERE s.id=d.id AND s.tenant_id=d.tenant_id AND s.application_id=d.application_id
           RETURNING s.id, s.tenant_id, s.application_id, s.campaign_id, s.next_run_at
         ), inserted AS (
           INSERT INTO eper_campaign_executions
             (id, schedule_id, tenant_id, application_id, scheduled_for, idempotency_key, payload)
           SELECT gen_random_uuid(), c.id, c.tenant_id, c.application_id, c.next_run_at,
             'campaign:' || c.id::text || ':' || to_char(c.next_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             jsonb_build_object('campaignId', c.campaign_id)
           FROM completed c
           ON CONFLICT (tenant_id, application_id, idempotency_key) DO NOTHING
           RETURNING id
         )
         SELECT count(*)::int AS materialized_count FROM inserted`,
        [limit],
      );
      return Number(result.rows[0]?.materialized_count ?? 0);
    } finally { client.release(); }
  }

  /** Atomic multi-worker claim. Side effects must still use the returned job id as their idempotency key. */
  async claimExecutions(workerId: string, limit = 10): Promise<CampaignExecutionRecord[]> {
    const worker = required(workerId, "CAMPAIGN_WORKER_ID_REQUIRED");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("CAMPAIGN_CLAIM_LIMIT_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<Record<string, unknown>>(
        `WITH due AS (
           SELECT e.id FROM eper_campaign_executions e
           JOIN eper_campaign_schedules s
             ON s.id=e.schedule_id AND s.tenant_id=e.tenant_id AND s.application_id=e.application_id
           WHERE e.status IN ('queued','retry_wait') AND e.available_at <= now()
             AND s.status NOT IN ('paused','cancelled') AND s.approval_status='approved'
           ORDER BY e.available_at, e.created_at
           FOR UPDATE OF e SKIP LOCKED
           LIMIT $2
         )
         UPDATE eper_campaign_executions e
         SET status='running', attempt_count=e.attempt_count+1, locked_at=now(), locked_by=$1,
             started_at=COALESCE(e.started_at, now()), updated_at=now()
         FROM due WHERE e.id=due.id
         RETURNING e.*`,
        [worker, limit],
      );
      return result.rows.map((row) => {
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        return {
          id: String(row.id), scheduleId: String(row.schedule_id), tenantId: String(row.tenant_id),
          applicationId: String(row.application_id), scheduledFor: new Date(row.scheduled_for as string | Date).toISOString(),
          status: row.status as CampaignExecutionStatus, attemptCount: Number(row.attempt_count),
          idempotencyKey: String(row.idempotency_key), payload: payload as Record<string, unknown>,
          availableAt: new Date(row.available_at as string | Date).toISOString(),
        };
      });
    } finally { client.release(); }
  }

  /**
   * Re-check mutable schedule/approval state immediately before provider dispatch.
   * This is a necessary baseline check, not a replacement for consent, quiet-hours,
   * channel-configuration, or serialized cancellation authorization.
   */
  async isExecutionAuthorizedForDispatch(input: {
    tenantId: string; applicationId: string; executionId: string; workerId: string;
  }): Promise<boolean> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const workerId = required(input.workerId, "CAMPAIGN_WORKER_ID_REQUIRED");
    if (!ID_PATTERN.test(input.executionId)) throw new Error("CAMPAIGN_EXECUTION_ID_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ authorized: boolean }>(
        `SELECT (e.status='running' AND e.locked_by=$4
                  AND s.status='scheduled' AND s.approval_status='approved') AS authorized
         FROM eper_campaign_executions e
         JOIN eper_campaign_schedules s
           ON s.id=e.schedule_id AND s.tenant_id=e.tenant_id AND s.application_id=e.application_id
         WHERE e.tenant_id=$1 AND e.application_id=$2 AND e.id=$3
         LIMIT 1`,
        [tenantId, applicationId, input.executionId, workerId],
      );
      return result.rows[0]?.authorized === true;
    } finally { client.release(); }
  }

  async completeExecution(input: {
    tenantId: string; applicationId: string; executionId: string; workerId: string; result?: Record<string, unknown>;
  }): Promise<boolean> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const workerId = required(input.workerId, "CAMPAIGN_WORKER_ID_REQUIRED");
    if (!ID_PATTERN.test(input.executionId)) throw new Error("CAMPAIGN_EXECUTION_ID_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `UPDATE eper_campaign_executions
         SET status='succeeded', result=$5::jsonb, completed_at=now(), updated_at=now(), locked_at=NULL, locked_by=NULL
         WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND status='running' AND locked_by=$4`,
        [tenantId, applicationId, input.executionId, workerId, JSON.stringify(input.result ?? {})],
      );
      return result.rowCount === 1;
    } finally { client.release(); }
  }

  async failExecution(input: {
    tenantId: string; applicationId: string; executionId: string; workerId: string;
    errorCode: string; maxAttempts?: number; baseDelaySeconds?: number;
  }): Promise<"retry_wait" | "dead_letter" | "not_owned"> {
    const tenantId = required(input.tenantId, "CAMPAIGN_TENANT_REQUIRED");
    const applicationId = required(input.applicationId, "CAMPAIGN_APPLICATION_REQUIRED");
    const workerId = required(input.workerId, "CAMPAIGN_WORKER_ID_REQUIRED");
    const errorCode = required(input.errorCode, "CAMPAIGN_ERROR_CODE_REQUIRED").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0,64);
    if (!ID_PATTERN.test(input.executionId)) throw new Error("CAMPAIGN_EXECUTION_ID_INVALID");
    const maxAttempts = input.maxAttempts ?? 5;
    const baseDelaySeconds = input.baseDelaySeconds ?? 15;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20 ||
        !Number.isFinite(baseDelaySeconds) || baseDelaySeconds < 1 || baseDelaySeconds > 3600) {
      throw new Error("CAMPAIGN_RETRY_POLICY_INVALID");
    }
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ status: "retry_wait" | "dead_letter" }>(
        `UPDATE eper_campaign_executions
         SET status=CASE WHEN attempt_count >= $5 THEN 'dead_letter' ELSE 'retry_wait' END,
             last_error_code=$6,
             available_at=CASE WHEN attempt_count >= $5 THEN available_at
               ELSE now() + (LEAST($7 * power(2, GREATEST(attempt_count - 1, 0)), 3600) * interval '1 second') END,
             updated_at=now(), locked_at=NULL, locked_by=NULL,
             completed_at=CASE WHEN attempt_count >= $5 THEN now() ELSE NULL END
         WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND status='running' AND locked_by=$4
         RETURNING status`,
        [tenantId, applicationId, input.executionId, workerId, maxAttempts, errorCode, baseDelaySeconds],
      );
      return result.rows[0]?.status ?? "not_owned";
    } finally { client.release(); }
  }

  /** Recover worker crashes; replay remains safe only when dispatch side effects honor the job idempotency key. */
  async recoverStaleExecutions(staleAfterSeconds = 300, maxAttempts = 5): Promise<number> {
    if (!Number.isInteger(staleAfterSeconds) || staleAfterSeconds < 30 || staleAfterSeconds > 86400 ||
        !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error("CAMPAIGN_RECOVERY_POLICY_INVALID");
    }
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `UPDATE eper_campaign_executions
         SET status=CASE WHEN attempt_count >= $2 THEN 'dead_letter' ELSE 'retry_wait' END,
             last_error_code='WORKER_LEASE_EXPIRED',
             available_at=CASE WHEN attempt_count >= $2 THEN available_at
               ELSE now() + (LEAST(15 * power(2, GREATEST(attempt_count - 1, 0)), 3600) * interval '1 second') END,
             updated_at=now(), locked_at=NULL, locked_by=NULL,
             completed_at=CASE WHEN attempt_count >= $2 THEN now() ELSE NULL END
         WHERE status='running' AND locked_at < now() - ($1 * interval '1 second')`,
        [staleAfterSeconds, maxAttempts],
      );
      return result.rowCount ?? 0;
    } finally { client.release(); }
  }

}
