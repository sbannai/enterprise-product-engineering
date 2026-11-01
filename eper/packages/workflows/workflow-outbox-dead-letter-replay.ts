import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export interface WorkflowOutboxReplayContext {
  tenantId: string;
  applicationId: string;
  actorId: string;
  correlationId: string;
  environment: AuditEnvironment;
}
export interface WorkflowOutboxReplayResult {
  replayId: string;
  eventId: string;
  priorAttempts: number;
  alreadyApplied: boolean;
}
function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new Error("WORKFLOW_OUTBOX_REPLAY_INVALID_" + name.toUpperCase());
  }
}
function validateUuid(value: string): void {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("WORKFLOW_OUTBOX_REPLAY_EVENT_ID_INVALID");
  }
}
async function setRls(client: AuditSqlClient, context: WorkflowOutboxReplayContext): Promise<void> {
  await client.query("SELECT set_config('eper.tenant_id', $1, true)", [context.tenantId]);
  await client.query("SELECT set_config('eper.application_id', $1, true)", [context.applicationId]);
}

/**
 * Requeues a dead-letter event only for an active actor holding workflow:admin.
 * Replay is a new audited attempt against the immutable original event id; it
 * does not edit the event payload or reset delivery attempts.
 */
export async function replayWorkflowOutboxDeadLetter(
  pool: AuditSqlPool,
  context: WorkflowOutboxReplayContext,
  input: { eventId: string; workerId: string; reason: string; idempotencyKey: string },
): Promise<WorkflowOutboxReplayResult> {
  validateId(context.tenantId, "tenantId");
  validateId(context.applicationId, "applicationId");
  validateId(context.actorId, "actorId");
  validateId(context.correlationId, "correlationId");
  if (!["production", "uat", "sandbox"].includes(context.environment)) {
    throw new Error("WORKFLOW_OUTBOX_REPLAY_ENVIRONMENT_INVALID");
  }
  validateUuid(input.eventId);
  validateId(input.workerId, "workerId");
  if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 2000) {
    throw new Error("WORKFLOW_OUTBOX_REPLAY_REASON_REQUIRED");
  }
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length < 16 ||
      input.idempotencyKey.length > 128) {
    throw new Error("WORKFLOW_OUTBOX_REPLAY_IDEMPOTENCY_KEY_INVALID");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setRls(client, context);
    const authorization = await client.query<{ role_id: string }>(
      `SELECT r.role_id
         FROM eper_workflow_actor_role_assignment r
         JOIN eper_actor_application_assignment aa
           ON aa.tenant_id = r.tenant_id AND aa.application_id = r.application_id
          AND aa.actor_id = r.actor_id AND aa.assignment_status = 'active'
         JOIN eper_tenant_application_assignment ta
           ON ta.tenant_id = r.tenant_id AND ta.application_id = r.application_id
          AND ta.assignment_status = 'active'
         JOIN eper_workflow_role_definition rd
           ON rd.tenant_id = r.tenant_id AND rd.application_id = r.application_id
          AND rd.role_id = r.role_id AND rd.role_status = 'active'
        WHERE r.tenant_id = $1 AND r.application_id = $2 AND r.actor_id = $3
          AND r.assignment_status = 'active' AND rd.permissions ? 'workflow:admin'
        ORDER BY r.role_id LIMIT 1 FOR SHARE OF r, aa, ta, rd`,
      [context.tenantId, context.applicationId, context.actorId],
    );
    if (!authorization.rows[0]) throw new Error("WORKFLOW_OUTBOX_REPLAY_PERMISSION_DENIED");

    // Serialize requests using the same tenant/application idempotency key.
    // A concurrent caller then observes the committed prior replay before it
    // can lock a different delivery row and hit the unique constraint.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [context.tenantId + ":" + context.applicationId + ":" + input.idempotencyKey],
    );

    const prior = await client.query<{
      replay_id: string; event_id: string; prior_attempts: number | string;
    }>(
      `SELECT replay_id, event_id, prior_attempts
         FROM eper_workflow_outbox_replay_audit
        WHERE tenant_id = $1 AND application_id = $2 AND idempotency_key = $3`,
      [context.tenantId, context.applicationId, input.idempotencyKey],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].event_id !== input.eventId) {
        throw new Error("WORKFLOW_OUTBOX_REPLAY_IDEMPOTENCY_CONFLICT");
      }
      await client.query("COMMIT");
      return {
        replayId: prior.rows[0].replay_id, eventId: prior.rows[0].event_id,
        priorAttempts: Number(prior.rows[0].prior_attempts), alreadyApplied: true,
      };
    }

    const delivery = await client.query<{
      attempts: number | string; last_error: string | null;
    }>(
      `SELECT attempts, last_error
         FROM eper_workflow_outbox_delivery
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3
          AND delivery_status = 'dead_letter'
        FOR UPDATE`,
      [context.tenantId, context.applicationId, input.eventId],
    );
    if (!delivery.rows[0]) {
      // A concurrent retry with the same idempotency key may have completed while
      // this transaction waited for the delivery row lock. Re-read after the wait.
      const concurrentPrior = await client.query<{
        replay_id: string; event_id: string; prior_attempts: number | string;
      }>(
        `SELECT replay_id, event_id, prior_attempts
           FROM eper_workflow_outbox_replay_audit
          WHERE tenant_id = $1 AND application_id = $2 AND idempotency_key = $3`,
        [context.tenantId, context.applicationId, input.idempotencyKey],
      );
      if (concurrentPrior.rows[0]) {
        if (concurrentPrior.rows[0].event_id !== input.eventId) {
          throw new Error("WORKFLOW_OUTBOX_REPLAY_IDEMPOTENCY_CONFLICT");
        }
        await client.query("COMMIT");
        return {
          replayId: concurrentPrior.rows[0].replay_id, eventId: concurrentPrior.rows[0].event_id,
          priorAttempts: Number(concurrentPrior.rows[0].prior_attempts), alreadyApplied: true,
        };
      }
      throw new Error("WORKFLOW_OUTBOX_REPLAY_NOT_DEAD_LETTERED");
    }
    const priorAttempts = Number(delivery.rows[0].attempts);
    const priorLastError = delivery.rows[0].last_error;
    const replayId = randomUUID();

    await client.query(
      `INSERT INTO eper_workflow_outbox_replay_audit (
         tenant_id, application_id, replay_id, event_id, actor_id, reason,
         idempotency_key, prior_attempts, prior_last_error
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [context.tenantId, context.applicationId, replayId, input.eventId, context.actorId,
        input.reason.trim(), input.idempotencyKey, priorAttempts, priorLastError],
    );

    await appendAuditEventInTransaction(client, {
      tenantId: context.tenantId, applicationId: context.applicationId, environment: context.environment,
      actorType: "human", actorId: context.actorId, effectiveRoles: ["workflow:admin"],
      action: "workflow.outbox.dead_letter.replayed", outcome: "success",
      reasonCode: "OPERATOR_REQUESTED_REPLAY", resourceType: "workflow_outbox_event",
      resourceId: input.eventId, operationId: replayId, correlationId: context.correlationId,
      source: "api", operationName: "workflow-outbox-dead-letter-replay",
      idempotencyKey: input.idempotencyKey,
      payload: { replayId, eventId: input.eventId, workerId: input.workerId, priorAttempts, reason: input.reason.trim() },
    });

    const updated = await client.query<{ event_id: string }>(
      `UPDATE eper_workflow_outbox_delivery
          SET delivery_status = 'pending', available_at = clock_timestamp(),
              locked_at = NULL, locked_by = NULL, updated_at = clock_timestamp()
        WHERE tenant_id = $1 AND application_id = $2 AND event_id = $3
          AND delivery_status = 'dead_letter'
        RETURNING event_id`,
      [context.tenantId, context.applicationId, input.eventId],
    );
    if (!updated.rows[0]) throw new Error("WORKFLOW_OUTBOX_REPLAY_STATE_CONFLICT");
    await client.query("COMMIT");
    return { replayId, eventId: input.eventId, priorAttempts, alreadyApplied: false };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
    throw error;
  } finally {
    client.release();
  }
}
