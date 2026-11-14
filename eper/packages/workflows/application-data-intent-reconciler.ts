import { createHash, randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import { resolveWorkflowNextActivity, WorkflowExecutionError } from "./postgres-workflow-execution-service.js";
import type { WorkflowDefinition } from "./workflow-configuration.js";

interface ReconciliationRow {
  intent_id: string;
  tenant_id: string;
  application_id: string;
  instance_id: string;
  activity_execution_id: string;
  activity_id: string;
  actor_id: string;
  correlation_id: string;
  requirement_id: string;
  idempotency_key: string;
  binding: Record<string, unknown> | string;
  result: Record<string, unknown> | string;
  reconciliation_claim_generation: number | string;
  reconciliation_attempts: number | string;
}
interface InstanceRow {
  instance_id: string;
  workflow_id: string;
  definition_version: number | string;
  definition_digest: string;
  status: string;
  current_activity_id: string | null;
  pending_activity_execution_id: string | null;
  data: Record<string, unknown> | string;
  version: number | string;
}
export interface ApplicationDataIntentReconcilerOptions {
  workerId?: string;
  leaseMilliseconds?: number;
  maxAttempts?: number;
  environment: AuditEnvironment;
  serviceVersion?: string;
}
export type ApplicationDataReconciliationResult =
  | { status: "idle" }
  | { status: "advanced"; intentId: string; instanceId: string; resultingVersion: number }
  | { status: "stale"; intentId: string; reason: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function asObject(value: Record<string, unknown> | string): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_OBJECT_INVALID");
  }
  return parsed as Record<string, unknown>;
}
async function setScope(client: AuditSqlClient, tenantId: string, applicationId: string): Promise<void> {
  await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
}

/**
 * Reconciles a successful data mutation into workflow state. The mutation may
 * have occurred in another persistence adapter; only this PostgreSQL transaction
 * advances the workflow and marks the intent advanced. Replays never re-run data.
 */
export class ApplicationDataIntentReconciler {
  private readonly workerId: string;
  private readonly leaseMilliseconds: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly pool: AuditSqlPool,
    private readonly options: ApplicationDataIntentReconcilerOptions,
  ) {
    this.workerId = options.workerId ?? randomUUID();
    this.leaseMilliseconds = options.leaseMilliseconds ?? 60_000;
    this.maxAttempts = options.maxAttempts ?? 8;
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(this.workerId) ||
        !Number.isSafeInteger(this.leaseMilliseconds) || this.leaseMilliseconds < 1000 ||
        !Number.isSafeInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 100 ||
        !["production", "uat", "sandbox"].includes(options.environment)) {
      throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILER_CONFIGURATION_INVALID");
    }
  }

  async runOnce(tenantId: string, applicationId: string): Promise<ApplicationDataReconciliationResult> {
    const client = await this.pool.connect();
    let intent: ReconciliationRow | undefined;
    try {
      await client.query("BEGIN");
      await setScope(client, tenantId, applicationId);
      const claimed = await client.query<ReconciliationRow>(
        `WITH candidate AS (
           SELECT tenant_id, application_id, intent_id
             FROM eper_workflow_application_data_intents
            WHERE tenant_id = $1 AND application_id = $2
              AND intent_status = 'succeeded'
              AND reconciliation_status IN ('pending','processing')
              AND reconciliation_available_at <= NOW()
              AND (reconciliation_status = 'pending'
                OR reconciliation_locked_at < NOW() - ($4::bigint * INTERVAL '1 millisecond'))
            ORDER BY reconciliation_available_at, completed_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         UPDATE eper_workflow_application_data_intents i
            SET reconciliation_status = 'processing',
                reconciliation_locked_at = NOW(),
                reconciliation_locked_by = $3,
                reconciliation_claim_generation = i.reconciliation_claim_generation + 1,
                reconciliation_attempts = i.reconciliation_attempts + 1,
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
      try { await client.query("ROLLBACK"); } catch { /* preserve claim error */ }
      throw error;
    } finally {
      client.release();
    }
    if (!intent) return { status: "idle" };

    const currentIntentForRelease = intent;
    const completion = await this.pool.connect();
    try {
      await completion.query("BEGIN");
      await setScope(completion, tenantId, applicationId);
      const lockedIntent = await completion.query<ReconciliationRow>(
        `SELECT * FROM eper_workflow_application_data_intents
          WHERE tenant_id = $1 AND application_id = $2 AND intent_id = $3
            AND intent_status = 'succeeded' AND reconciliation_status = 'processing'
            AND reconciliation_locked_by = $4 AND reconciliation_claim_generation = $5
          FOR UPDATE`,
        [tenantId, applicationId, intent.intent_id, this.workerId, Number(intent.reconciliation_claim_generation)],
      );
      if (!lockedIntent.rows[0]) {
        await completion.query("ROLLBACK");
        return { status: "stale", intentId: intent.intent_id, reason: "RECONCILIATION_LEASE_LOST" };
      }
      const currentIntent = lockedIntent.rows[0];
      const selected = await completion.query<InstanceRow>(
        `SELECT * FROM eper_workflow_instances
          WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
          FOR UPDATE`,
        [tenantId, applicationId, currentIntent.instance_id],
      );
      const instance = selected.rows[0];
      if (!instance || instance.status !== "waiting_for_data" ||
          instance.pending_activity_execution_id !== currentIntent.activity_execution_id ||
          instance.current_activity_id !== currentIntent.activity_id) {
        throw new WorkflowExecutionError("WORKFLOW_APPLICATION_DATA_RECONCILIATION_INSTANCE_MISMATCH", 409);
      }
      const definitionResult = await completion.query<{ definition: WorkflowDefinition | string }>(
        `SELECT definition FROM eper_workflow_definition_versions
          WHERE tenant_id = $1 AND application_id = $2 AND workflow_id = $3
            AND definition_version = $4 AND definition_digest = $5`,
        [tenantId, applicationId, instance.workflow_id, Number(instance.definition_version), instance.definition_digest.trim()],
      );
      if (!definitionResult.rows[0]) throw new Error("WORKFLOW_EXECUTION_PINNED_DEFINITION_NOT_FOUND");
      const definition = typeof definitionResult.rows[0].definition === "string"
        ? JSON.parse(definitionResult.rows[0].definition) as WorkflowDefinition
        : definitionResult.rows[0].definition;
      if (digest(definition) !== instance.definition_digest.trim()) {
        throw new Error("WORKFLOW_EXECUTION_PINNED_DEFINITION_INTEGRITY_FAILED");
      }
      const activity = definition.activities.find(item => item.id === currentIntent.activity_id);
      if (!activity?.applicationDataBinding) throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_BINDING_MISSING");
      const binding = asObject(currentIntent.binding);
      const expectedBinding = {
        entityType: activity.applicationDataBinding.entityType,
        operation: activity.applicationDataBinding.operation,
        ...(activity.applicationDataBinding.recordIdField ? { recordIdField: activity.applicationDataBinding.recordIdField } : {}),
        ...(activity.applicationDataBinding.expectedVersionField ? { expectedVersionField: activity.applicationDataBinding.expectedVersionField } : {}),
        ...(activity.applicationDataBinding.dataField ? { dataField: activity.applicationDataBinding.dataField } : {}),
        ...(activity.applicationDataBinding.resultKey ? { resultKey: activity.applicationDataBinding.resultKey } : {}),
      };
      if (digest(binding) !== digest(expectedBinding)) {
        throw new Error("WORKFLOW_APPLICATION_DATA_RECONCILIATION_BINDING_MISMATCH");
      }
      const data = asObject(instance.data);
      const result = asObject(currentIntent.result);
      // The executor returns the binding result under "result" when no custom key is configured.
      // Preserve that default here so workflow routing and subsequent activities receive the committed data.
      const resultKey = activity.applicationDataBinding.resultKey ?? "result";
      const nextData = { ...data, [resultKey]: result[resultKey] ?? result };
      const routing = resolveWorkflowNextActivity(definition, activity, nextData);
      const nextStatus = routing.targetActivityId === null ? "completed" : "running";
      const nextVersion = Number(instance.version) + 1;
      const transitionId = randomUUID();
      const transitionKey = "data-reconcile-" + currentIntent.activity_execution_id;
      const requestFingerprint = digest({
        operation: "application-data-reconcile", tenantId, applicationId,
        instanceId: currentIntent.instance_id, activityExecutionId: currentIntent.activity_execution_id,
        resultDigest: digest(result), resultingVersion: nextVersion,
      });
      const action = activity.type === "APPROVAL" ? "approve" : "submit";
      const updated = await completion.query(
        `UPDATE eper_workflow_instances
            SET status = $4::text, current_activity_id = $5, data = $6::jsonb,
                pending_activity_execution_id = NULL, version = $7,
                updated_at = NOW(), completed_at = CASE WHEN $4::text = 'completed' THEN NOW() ELSE NULL END
          WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
            AND status = 'waiting_for_data' AND version = $8
            AND pending_activity_execution_id = $9
          RETURNING instance_id`,
        [tenantId, applicationId, currentIntent.instance_id, nextStatus,
          routing.targetActivityId, JSON.stringify(nextData), nextVersion, Number(instance.version),
          currentIntent.activity_execution_id],
      );
      if ((updated.rowCount ?? 0) !== 1) throw new WorkflowExecutionError("WORKFLOW_APPLICATION_DATA_RECONCILIATION_VERSION_CONFLICT", 409);

      await completion.query(
        `INSERT INTO eper_workflow_transitions
          (tenant_id, application_id, transition_id, instance_id, from_activity_id, to_activity_id,
           action, actor_id, actor_role, expected_version, resulting_version, idempotency_key,
           request_fingerprint, correlation_id, payload_digest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [tenantId, applicationId, transitionId, currentIntent.instance_id, currentIntent.activity_id,
          routing.targetActivityId, action, currentIntent.actor_id, activity.roleId,
          Number(instance.version), nextVersion, transitionKey, requestFingerprint,
          currentIntent.correlation_id, digest(result)],
      );
      const eventType = nextStatus === "completed" ? "workflow.instance.completed"
        : action === "approve" ? "workflow.instance.approved" : "workflow.instance.submitted";
      const eventId = randomUUID();
      const eventPayload = {
        workflowId: instance.workflow_id, instanceId: currentIntent.instance_id,
        action, resultingStatus: nextStatus, resultingVersion: nextVersion,
        fromActivityId: currentIntent.activity_id, toActivityId: routing.targetActivityId,
        applicationDataIntentId: currentIntent.intent_id,
        activityExecutionId: currentIntent.activity_execution_id,
        resultDigest: digest(result), correlationId: currentIntent.correlation_id,
        ...(routing.ruleDecision ? { routingDecision: routing.ruleDecision } : {}),
      };
      await completion.query(
        `INSERT INTO eper_workflow_outbox_events
          (tenant_id, application_id, event_id, instance_id, transition_id, event_type, event_version, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [tenantId, applicationId, eventId, currentIntent.instance_id, transitionId, eventType, nextVersion, JSON.stringify(eventPayload)],
      );
      await completion.query(
        `INSERT INTO eper_workflow_outbox_delivery
          (tenant_id, application_id, event_id, delivery_status, attempts, available_at)
         VALUES ($1,$2,$3,'pending',0,NOW())`,
        [tenantId, applicationId, eventId],
      );
      await appendAuditEventInTransaction(completion, {
        tenantId, applicationId, environment: this.options.environment,
        actorType: "service", actorId: this.workerId, action: "workflow.application_data.reconciled",
        outcome: "success", resourceType: "workflow-instance", resourceId: currentIntent.instance_id,
        correlationId: currentIntent.correlation_id, source: "job",
        operationName: "ApplicationDataIntentReconciler.runOnce",
        serviceVersion: this.options.serviceVersion,
        beforeHash: digest({ status: instance.status, version: Number(instance.version), data }),
        afterHash: digest({ status: nextStatus, version: nextVersion, data: nextData }),
        payload: { intentId: currentIntent.intent_id, activityExecutionId: currentIntent.activity_execution_id,
          requirementId: currentIntent.requirement_id, resultDigest: digest(result) },
      });
      const advanced = await completion.query(
        `UPDATE eper_workflow_application_data_intents
            SET intent_status = 'advanced', reconciliation_status = 'completed',
                reconciliation_locked_at = NULL, reconciliation_locked_by = NULL,
                completed_at = NOW(), updated_at = NOW()
          WHERE tenant_id = $1 AND application_id = $2 AND intent_id = $3
            AND intent_status = 'succeeded' AND reconciliation_status = 'processing'
            AND reconciliation_locked_by = $4 AND reconciliation_claim_generation = $5`,
        [tenantId, applicationId, currentIntent.intent_id, this.workerId,
          Number(currentIntent.reconciliation_claim_generation)],
      );
      if ((advanced.rowCount ?? 0) !== 1) throw new WorkflowExecutionError("WORKFLOW_APPLICATION_DATA_RECONCILIATION_LEASE_LOST", 409);
      await completion.query("COMMIT");
      return { status: "advanced", intentId: currentIntent.intent_id,
        instanceId: currentIntent.instance_id, resultingVersion: nextVersion };
    } catch (error) {
      try { await completion.query("ROLLBACK"); } catch { /* preserve reconciliation error */ }
      await this.releaseFailedClaim(currentIntentForRelease, error);
      throw error;
    } finally {
      completion.release();
    }
  }

  private async releaseFailedClaim(intent: ReconciliationRow, error: unknown): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setScope(client, intent.tenant_id, intent.application_id);
      const message = (error instanceof Error ? error.message : "WORKFLOW_APPLICATION_DATA_RECONCILIATION_FAILED").slice(0, 2000);
      await client.query(
        `UPDATE eper_workflow_application_data_intents
            SET reconciliation_status = CASE WHEN reconciliation_attempts >= $6
                  THEN 'dead_letter' ELSE 'pending' END,
                reconciliation_available_at = CASE WHEN reconciliation_attempts >= $6
                  THEN reconciliation_available_at
                  ELSE NOW() + LEAST(900, power(2, LEAST(reconciliation_attempts, 10))) * INTERVAL '1 second' END,
                reconciliation_locked_at = NULL, reconciliation_locked_by = NULL,
                last_error = $7, updated_at = NOW()
          WHERE tenant_id = $1 AND application_id = $2 AND intent_id = $3
            AND intent_status = 'succeeded' AND reconciliation_status = 'processing'
            AND reconciliation_locked_by = $4 AND reconciliation_claim_generation = $5`,
        [intent.tenant_id, intent.application_id, intent.intent_id, this.workerId,
          Number(intent.reconciliation_claim_generation), this.maxAttempts, message],
      );
      await client.query("COMMIT");
    } catch (releaseError) {
      try { await client.query("ROLLBACK"); } catch { /* retain release error */ }
      throw releaseError;
    } finally {
      client.release();
    }
  }
}
