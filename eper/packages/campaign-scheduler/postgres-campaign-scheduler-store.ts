import { randomUUID } from "node:crypto";
import type { AuditSqlPool } from "../audit/audit-event-store.js";

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
  constructor(private readonly pool: AuditSqlPool) {}

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
    const client = await this.pool.connect();
    const id = randomUUID();
    try {
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO eper_campaign_schedules
          (id, tenant_id, application_id, campaign_id, trigger_type, timezone, schedule_definition, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8)
         RETURNING *`,
        [id, tenantId, applicationId, campaignId, input.triggerType, input.timezone,
          JSON.stringify(input.scheduleDefinition), createdBy],
      );
      return mapSchedule(result.rows[0]);
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
      const result = await client.query<Record<string, unknown>>(
        `UPDATE eper_campaign_schedules
           SET approval_status='approved', status='scheduled', next_run_at=$4, updated_by=$5, updated_at=now()
         WHERE tenant_id=$1 AND application_id=$2 AND id=$3 AND status IN ('draft','paused')
         RETURNING *`,
        [tenantId, applicationId, input.scheduleId, nextRunAt.toISOString(), actorId],
      );
      if (!result.rows[0]) throw new Error("CAMPAIGN_SCHEDULE_NOT_FOUND_OR_NOT_APPROVABLE");
      return mapSchedule(result.rows[0]);
    } finally { client.release(); }
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
          `UPDATE eper_campaign_executions SET status='cancelled', updated_at=now()
           WHERE tenant_id=$1 AND application_id=$2 AND schedule_id=$3 AND status IN ('queued','retry_wait')`,
          [tenantId, applicationId, input.scheduleId],
        );
      }
      await client.query("COMMIT");
      return mapSchedule(result.rows[0]);
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

  /** Atomic multi-worker claim. Side effects must still use the returned job id as their idempotency key. */
  async claimExecutions(workerId: string, limit = 10): Promise<CampaignExecutionRecord[]> {
    const worker = required(workerId, "CAMPAIGN_WORKER_ID_REQUIRED");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("CAMPAIGN_CLAIM_LIMIT_INVALID");
    const client = await this.pool.connect();
    try {
      const result = await client.query<Record<string, unknown>>(
        `WITH due AS (
           SELECT id FROM eper_campaign_executions
           WHERE status IN ('queued','retry_wait') AND available_at <= now()
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED
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
}
