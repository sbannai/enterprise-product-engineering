import { createHash, randomUUID } from "node:crypto";
import type { AuditSqlClient, AuditSqlPool } from "../audit/audit-event-store.js";
import type { ApplicationDataContext } from "../application-data/contracts.js";
import type { ApplicationDataWorkflowActivity, ApplicationDataWorkflowBinding } from "../application-data/workflow-binding.js";

export interface ApplicationDataActivityIntentWorkerOptions {
  workerId?: string;
  leaseMilliseconds?: number;
  maxAttempts?: number;
}
interface IntentRow {
  intent_id: string;
  tenant_id: string;
  application_id: string;
  instance_id: string;
  activity_execution_id: string;
  actor_id: string;
  actor_role_id: string | null;
  required_permission: "workflow:act" | "workflow:approve" | null;
  correlation_id: string;
  requirement_id: string;
  idempotency_key: string;
  entity_type: string;
  operation: "create" | "get" | "update" | "delete" | "query";
  binding: ApplicationDataWorkflowBinding | string;
  input: Record<string, unknown> | string;
  claim_generation: number | string;
  attempts: number | string;
  request_fingerprint: string;
}
export type ApplicationDataIntentWorkerResult =
  | { status: "idle" }
  | { status: "succeeded"; intentId: string; result: Record<string, unknown> }
  | { status: "retrying"; intentId: string; errorCode: string }
  | { status: "dead_letter"; intentId: string; errorCode: string };


function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

/** Shared fingerprint contract for workflow intent creation and execution. */
export function applicationDataIntentFingerprint(intent: {
  tenantId: string; applicationId: string; instanceId: string; activityExecutionId: string;
  actorId: string; actorRoleId: string; requiredPermission: "workflow:act" | "workflow:approve";
  correlationId: string; requirementId: string; idempotencyKey: string;
  entityType: string; operation: "create" | "get" | "update" | "delete" | "query";
  binding: ApplicationDataWorkflowBinding; input: Record<string, unknown>;
}): string {
  return createHash("sha256").update(canonical(intent)).digest("hex");
}

function object(value: Record<string, unknown> | string): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("WORKFLOW_APPLICATION_DATA_INTENT_PAYLOAD_INVALID");
  return parsed as Record<string, unknown>;
}
async function scope(client: AuditSqlClient, tenantId: string, applicationId: string): Promise<void> {
  await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
}

/**
 * Claims durable workflow data intents with lease fencing. The injected activity
 * is the only route to application data; workflow JSON never chooses a database.
 * The executor must use the intent's stable idempotency key for mutation retries.
 */
export class ApplicationDataActivityIntentWorker {
  private readonly workerId: string;
  private readonly leaseMilliseconds: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly pool: AuditSqlPool,
    private readonly activity: ApplicationDataWorkflowActivity,
    options: ApplicationDataActivityIntentWorkerOptions = {},
  ) {
    this.workerId = options.workerId ?? randomUUID();
    this.leaseMilliseconds = options.leaseMilliseconds ?? 60_000;
    this.maxAttempts = options.maxAttempts ?? 8;
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(this.workerId) ||
        !Number.isSafeInteger(this.leaseMilliseconds) || this.leaseMilliseconds < 1000 ||
        !Number.isSafeInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 100) {
      throw new Error("WORKFLOW_APPLICATION_DATA_WORKER_CONFIGURATION_INVALID");
    }
  }

  async runOnce(tenantId: string, applicationId: string): Promise<ApplicationDataIntentWorkerResult> {
    const client = await this.pool.connect();
    let intent: IntentRow | undefined;
    try {
      await client.query("BEGIN");
      await scope(client, tenantId, applicationId);
      const claimed = await client.query<IntentRow>(
        `WITH candidate AS (
           SELECT tenant_id, application_id, intent_id
             FROM eper_workflow_application_data_intents
            WHERE tenant_id = $1 AND application_id = $2
              AND available_at <= NOW()
              AND (intent_status = 'pending'
                OR (intent_status = 'processing' AND locked_at < NOW() - ($4::bigint * INTERVAL '1 millisecond')))
            ORDER BY available_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         UPDATE eper_workflow_application_data_intents i
            SET intent_status = 'processing', locked_at = NOW(), locked_by = $3,
                claim_generation = i.claim_generation + 1, attempts = i.attempts + 1,
                updated_at = NOW()
           FROM candidate c
          WHERE i.tenant_id = c.tenant_id AND i.application_id = c.application_id
            AND i.intent_id = c.intent_id
         RETURNING i.*`,
        [tenantId, applicationId, this.workerId, this.leaseMilliseconds],
      );
      intent = claimed.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain claim error */ }
      throw error;
    } finally {
      client.release();
    }
    if (!intent) return { status: "idle" };

    let result: Record<string, unknown>;
    try {
      const binding = (typeof intent.binding === "string" ? JSON.parse(intent.binding) : intent.binding) as ApplicationDataWorkflowBinding;
      if (!binding || binding.entityType !== intent.entity_type || binding.operation !== intent.operation) {
        throw new Error("WORKFLOW_APPLICATION_DATA_INTENT_BINDING_MISMATCH");
      }
      const input = object(intent.input);
      const fingerprint = applicationDataIntentFingerprint({
        tenantId: intent.tenant_id, applicationId: intent.application_id,
        instanceId: intent.instance_id, activityExecutionId: intent.activity_execution_id,
        actorId: intent.actor_id, actorRoleId: intent.actor_role_id ?? "",
        requiredPermission: intent.required_permission ?? "workflow:act", correlationId: intent.correlation_id,
        requirementId: intent.requirement_id, idempotencyKey: intent.idempotency_key,
        entityType: intent.entity_type, operation: intent.operation, binding, input,
      });
      if (fingerprint !== intent.request_fingerprint.trim()) {
        throw new Error("WORKFLOW_APPLICATION_DATA_INTENT_FINGERPRINT_MISMATCH");
      }
      const context: ApplicationDataContext = {
        tenantId: intent.tenant_id,
        applicationId: intent.application_id,
        actorId: intent.actor_id,
        workflowRoleId: intent.actor_role_id ?? undefined,
        workflowPermission: intent.required_permission ?? undefined,
        correlationId: intent.correlation_id,
        requirementId: intent.requirement_id,
        idempotencyKey: intent.idempotency_key,
      };
      result = await this.activity.execute(context, binding, input);
    } catch (error) {
      const errorCode = (error instanceof Error ? error.message : "WORKFLOW_APPLICATION_DATA_INTENT_FAILED").slice(0, 2000);
      const deadLetter = Number(intent.attempts ?? 1) >= this.maxAttempts;
      const recorded = await this.finish(intent, deadLetter ? "dead_letter" : "pending", undefined, errorCode);
      if (!recorded) {
        return { status: "retrying", intentId: intent.intent_id, errorCode: "WORKFLOW_APPLICATION_DATA_INTENT_LEASE_LOST" };
      }
      return { status: deadLetter ? "dead_letter" : "retrying", intentId: intent.intent_id, errorCode };
    }
    const completed = await this.finish(intent, "succeeded", result);
    if (!completed) {
      return { status: "retrying", intentId: intent.intent_id, errorCode: "WORKFLOW_APPLICATION_DATA_INTENT_LEASE_LOST" };
    }
    return { status: "succeeded", intentId: intent.intent_id, result };
  }

  private async finish(
    intent: IntentRow,
    status: "succeeded" | "pending" | "dead_letter",
    result?: Record<string, unknown>,
    errorCode?: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await scope(client, intent.tenant_id, intent.application_id);
      const updated = await client.query(
        `UPDATE eper_workflow_application_data_intents
            SET intent_status = $5::text,
                result = CASE WHEN $5::text = 'succeeded' THEN $6::jsonb ELSE NULL END,
                last_error = $7,
                available_at = CASE WHEN $5 = 'pending'
                  THEN NOW() + LEAST(300, power(2, LEAST(attempts, 8))) * INTERVAL '1 second'
                  ELSE available_at END,
                locked_at = NULL, locked_by = NULL,
                completed_at = CASE WHEN $5::text IN ('succeeded','dead_letter') THEN NOW() ELSE NULL END,
                updated_at = NOW()
          WHERE tenant_id = $1 AND application_id = $2 AND intent_id = $3
            AND intent_status = 'processing' AND locked_by = $4 AND claim_generation = $8`,
        [intent.tenant_id, intent.application_id, intent.intent_id, this.workerId, status,
          result ? JSON.stringify(result) : null, errorCode ?? null, Number(intent.claim_generation)],
      );
      await client.query("COMMIT");
      return (updated.rowCount ?? 0) === 1;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain completion error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
