import { createHash, randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type { WorkflowActivity, WorkflowDefinition, WorkflowField } from "./workflow-configuration.js";

export type WorkflowTransitionAction = "submit" | "approve" | "reject" | "cancel";
export type WorkflowInstanceStatus = "running" | "completed" | "rejected" | "cancelled" | "failed";

export interface WorkflowExecutionContext {
  tenantId: string;
  applicationId: string;
  actorId: string;
  correlationId: string;
  environment: AuditEnvironment;
  serviceVersion?: string;
}

export interface StartWorkflowInstanceInput extends WorkflowExecutionContext {
  workflowId: string;
  idempotencyKey: string;
  businessReference?: string;
  data?: Record<string, unknown>;
}

export interface TransitionWorkflowInstanceInput extends WorkflowExecutionContext {
  instanceId: string;
  expectedVersion: number;
  idempotencyKey: string;
  action: WorkflowTransitionAction;
  payload?: Record<string, unknown>;
  targetActivityId?: string;
}

export interface WorkflowInstanceRecord {
  instanceId: string;
  tenantId: string;
  applicationId: string;
  workflowId: string;
  definitionVersion: number;
  definitionDigest: string;
  status: WorkflowInstanceStatus;
  currentActivityId: string | null;
  businessReference: string | null;
  data: Record<string, unknown>;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export class WorkflowExecutionError extends Error {
  constructor(readonly code: string, readonly statusCode: number) {
    super(code);
    this.name = "WorkflowExecutionError";
  }
}

type InstanceRow = {
  tenant_id: string; application_id: string; instance_id: string; workflow_id: string;
  definition_version: number | string; definition_digest: string; status: WorkflowInstanceStatus;
  current_activity_id: string | null; business_reference: string | null; data: Record<string, unknown> | string;
  version: number | string; created_by: string; created_at: string | Date;
  updated_at: string | Date; completed_at: string | Date | null;
  start_request_fingerprint?: string | null;
};
type DefinitionVersionRow = {
  event_type: "published" | "retired";
  definition_version: number | string;
  definition_digest: string;
  definition: WorkflowDefinition | string;
};
type TransitionRow = {
  request_fingerprint: string;
  response: Record<string, unknown> | string;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
      .join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function parseObject(value: Record<string, unknown> | string): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkflowExecutionError("WORKFLOW_EXECUTION_STORED_OBJECT_INVALID", 500);
  }
  return parsed as Record<string, unknown>;
}
function mapInstance(row: InstanceRow): WorkflowInstanceRecord {
  return {
    instanceId: row.instance_id, tenantId: row.tenant_id, applicationId: row.application_id,
    workflowId: row.workflow_id, definitionVersion: Number(row.definition_version),
    definitionDigest: row.definition_digest.trim(), status: row.status,
    currentActivityId: row.current_activity_id, businessReference: row.business_reference,
    data: parseObject(row.data), version: Number(row.version), createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}
function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new WorkflowExecutionError("WORKFLOW_EXECUTION_INVALID_" + name.toUpperCase(), 400);
  }
}
function validateContext(context: WorkflowExecutionContext): void {
  validateId(context.tenantId, "tenantId");
  validateId(context.applicationId, "applicationId");
  validateId(context.actorId, "actorId");
  validateId(context.correlationId, "correlationId");
}
function validateIdempotencyKey(value: string): void {
  if (typeof value !== "string" || value.trim().length < 16 || value.length > 128) {
    throw new WorkflowExecutionError("WORKFLOW_EXECUTION_IDEMPOTENCY_KEY_INVALID", 400);
  }
}
function validateObject(value: unknown, code: string, maxBytes = 65536): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Buffer.byteLength(JSON.stringify(value)) > maxBytes) {
    throw new WorkflowExecutionError(code, 400);
  }
  return value as Record<string, unknown>;
}
function parseDefinition(value: WorkflowDefinition | string): WorkflowDefinition {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.activities)) {
    throw new WorkflowExecutionError("WORKFLOW_EXECUTION_DEFINITION_INVALID", 500);
  }
  return parsed as WorkflowDefinition;
}
function validateActivityPayload(fields: WorkflowField[], payload: Record<string, unknown>): void {
  const fieldMap = new Map(fields.map(field => [field.id, field]));
  for (const key of Object.keys(payload)) {
    if (!fieldMap.has(key)) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_UNKNOWN_FIELD:" + key, 422);
  }
  for (const field of fields) {
    const value = payload[field.id];
    if (value === undefined) {
      if (field.required) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_REQUIRED_FIELD:" + field.id, 422);
      continue;
    }
    const invalid =
      (field.type === "text" || field.type === "textarea") &&
        (typeof value !== "string" || value.length > 4000) ||
      field.type === "number" && (typeof value !== "number" || !Number.isFinite(value)) ||
      field.type === "date" && (typeof value !== "string" || !Number.isFinite(Date.parse(value))) ||
      field.type === "checkbox" && typeof value !== "boolean" ||
      field.type === "select" && (typeof value !== "string" || !field.options?.includes(value));
    if (invalid) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_FIELD_TYPE_INVALID:" + field.id, 422);
  }
}
async function setRlsContext(client: AuditSqlClient, tenantId: string, applicationId: string): Promise<void> {
  await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
}
async function assertMembership(client: AuditSqlClient, context: WorkflowExecutionContext): Promise<void> {
  const tenant = await client.query<{ assignment_status: string }>(
    `SELECT assignment_status FROM eper_tenant_application_assignment
      WHERE tenant_id = $1 AND application_id = $2 FOR SHARE`,
    [context.tenantId, context.applicationId],
  );
  if (tenant.rows[0]?.assignment_status !== "active") {
    throw new WorkflowExecutionError("WORKFLOW_EXECUTION_TENANT_APPLICATION_NOT_ACTIVE", 403);
  }
  const actor = await client.query<{ assignment_status: string }>(
    `SELECT assignment_status FROM eper_actor_application_assignment
      WHERE tenant_id = $1 AND actor_id = $2 AND application_id = $3 FOR SHARE`,
    [context.tenantId, context.actorId, context.applicationId],
  );
  if (actor.rows[0]?.assignment_status !== "active") {
    throw new WorkflowExecutionError("WORKFLOW_EXECUTION_ACTOR_APPLICATION_NOT_ACTIVE", 403);
  }
}
async function authorizeRole(
  client: AuditSqlClient,
  context: WorkflowExecutionContext,
  roleId: string,
  permission: string,
): Promise<void> {
  const result = await client.query<{ role_id: string }>(
    `SELECT r.role_id FROM eper_workflow_actor_role_assignment r
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
       AND r.role_id = $4 AND r.assignment_status = 'active' AND rd.permissions ? $5
     LIMIT 1 FOR SHARE OF r, aa, ta, rd`,
    [context.tenantId, context.applicationId, context.actorId, roleId, permission],
  );
  if (!result.rows[0]) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_PERMISSION_DENIED", 403);
}
async function authorizeAdmin(
  client: AuditSqlClient,
  context: WorkflowExecutionContext,
): Promise<string> {
  const result = await client.query<{ role_id: string }>(
    `SELECT r.role_id FROM eper_workflow_actor_role_assignment r
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
  if (!result.rows[0]) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_PERMISSION_DENIED", 403);
  return result.rows[0].role_id;
}
function chooseNextActivity(activity: WorkflowActivity, targetActivityId?: string): string | null {
  if (activity.nextActivityIds.length === 0) {
    if (targetActivityId) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_TARGET_NOT_ALLOWED", 422);
    return null;
  }
  if (activity.nextActivityIds.length === 1) {
    const only = activity.nextActivityIds[0];
    if (targetActivityId && targetActivityId !== only) {
      throw new WorkflowExecutionError("WORKFLOW_EXECUTION_TARGET_NOT_ALLOWED", 422);
    }
    return only;
  }
  if (!targetActivityId || !activity.nextActivityIds.includes(targetActivityId)) {
    throw new WorkflowExecutionError("WORKFLOW_EXECUTION_TARGET_REQUIRED", 422);
  }
  return targetActivityId;
}

/**
 * Durable workflow execution primitives. All identity and authorization context
 * must come from trusted server-side middleware; request JSON is never trusted
 * for tenant, application, actor, role or permission claims.
 */
export class PostgresWorkflowExecutionService {
  constructor(
    private readonly pool: AuditSqlPool,
    private readonly serviceVersion?: string,
  ) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ ready_tables: number | string; start_key_present: boolean }>(
        `SELECT
           (SELECT count(*)::int
              FROM unnest(ARRAY[
                'eper_workflow_definition_versions',
                'eper_workflow_publication_events',
                'eper_workflow_instances',
                'eper_workflow_transitions',
                'eper_workflow_idempotency',
                'eper_workflow_actor_role_assignment',
                'eper_workflow_role_definition'
              ]) AS required(table_name)
              JOIN pg_class c ON c.oid = to_regclass('public.' || required.table_name)
             WHERE c.relrowsecurity AND c.relforcerowsecurity
               AND EXISTS (
                 SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public'
                    AND p.tablename = required.table_name
                    AND p.policyname = 'tenant_application_isolation'
               )
           ) AS ready_tables,
           EXISTS (
             SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'eper_workflow_instances'
                AND column_name = 'start_idempotency_key'
           ) AS start_key_present`,
      );
      const row = result.rows[0];
      if (Number(row?.ready_tables) !== 7 || row?.start_key_present !== true) {
        throw new Error("EPER_WORKFLOW_EXECUTION_SCHEMA_NOT_READY");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_WORKFLOW_EXECUTION_SCHEMA_NOT_READY") throw error;
      throw new Error("EPER_WORKFLOW_EXECUTION_READINESS_FAILED", { cause: error });
    } finally {
      client.release();
    }
  }

  async start(input: StartWorkflowInstanceInput): Promise<WorkflowInstanceRecord> {
    validateContext(input);
    validateId(input.workflowId, "workflowId");
    validateIdempotencyKey(input.idempotencyKey);
    const data = validateObject(input.data ?? {}, "WORKFLOW_EXECUTION_DATA_INVALID");
    if (input.businessReference !== undefined &&
        (typeof input.businessReference !== "string" || input.businessReference.length > 256)) {
      throw new WorkflowExecutionError("WORKFLOW_EXECUTION_BUSINESS_REFERENCE_INVALID", 400);
    }
    const requestFingerprint = digest({
      operation: "start", tenantId: input.tenantId, applicationId: input.applicationId,
      actorId: input.actorId, workflowId: input.workflowId,
      businessReference: input.businessReference ?? null, data,
    });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRlsContext(client, input.tenantId, input.applicationId);
      await assertMembership(client, input);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify([input.tenantId, input.applicationId, "workflow-start", input.idempotencyKey])],
      );
      const prior = await client.query<InstanceRow>(
        `SELECT * FROM eper_workflow_instances
          WHERE tenant_id = $1 AND application_id = $2 AND start_idempotency_key = $3
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].start_request_fingerprint?.trim() !== requestFingerprint) {
          throw new WorkflowExecutionError("WORKFLOW_EXECUTION_IDEMPOTENCY_CONFLICT", 409);
        }
        const original = await client.query<{ response: Record<string, unknown> | string }>(
          `SELECT response FROM eper_workflow_idempotency
            WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
              AND idempotency_key = $4`,
          [input.tenantId, input.applicationId, prior.rows[0].instance_id, input.idempotencyKey],
        );
        if (!original.rows[0]) throw new Error("WORKFLOW_EXECUTION_START_IDEMPOTENCY_RECORD_MISSING");
        const replay = parseObject(original.rows[0].response);
        await client.query("COMMIT");
        return replay as unknown as WorkflowInstanceRecord;
      }

      const publication = await client.query<DefinitionVersionRow>(
        `SELECT e.event_type, v.definition_version, v.definition_digest, v.definition
           FROM eper_workflow_publication_events e
           JOIN eper_workflow_definition_versions v
             ON v.tenant_id = e.tenant_id AND v.application_id = e.application_id
            AND v.workflow_id = e.workflow_id AND v.definition_version = e.definition_version
          WHERE e.tenant_id = $1 AND e.application_id = $2 AND e.workflow_id = $3
          ORDER BY e.event_sequence DESC LIMIT 1
          FOR SHARE OF e, v`,
        [input.tenantId, input.applicationId, input.workflowId],
      );
      const published = publication.rows[0];
      if (!published || published.event_type !== "published") {
        throw new WorkflowExecutionError("WORKFLOW_EXECUTION_WORKFLOW_NOT_PUBLISHED", 404);
      }
      const definition = parseDefinition(published.definition);
      if (definition.status !== "ACTIVE" || definition.id !== input.workflowId ||
          digest(definition) !== published.definition_digest.trim()) {
        throw new WorkflowExecutionError("WORKFLOW_EXECUTION_PUBLISHED_DEFINITION_INTEGRITY_FAILED", 500);
      }
      const firstActivity = definition.activities[0];
      if (!firstActivity) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_DEFINITION_HAS_NO_ACTIVITIES", 422);
      validateActivityPayload(firstActivity.fields, data);
      await authorizeRole(client, input, firstActivity.roleId, firstActivity.permission);

      const instanceId = randomUUID();
      const inserted = await client.query<InstanceRow>(
        `INSERT INTO eper_workflow_instances
          (tenant_id, application_id, instance_id, workflow_id, definition_version, definition_digest,
           status, current_activity_id, business_reference, data, version, created_by,
           start_idempotency_key, start_request_fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,'running',$7,$8,$9::jsonb,1,$10,$11,$12)
         RETURNING *`,
        [input.tenantId, input.applicationId, instanceId, input.workflowId,
          Number(published.definition_version), published.definition_digest.trim(),
          firstActivity.id, input.businessReference ?? null, JSON.stringify(data),
          input.actorId, input.idempotencyKey, requestFingerprint],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("WORKFLOW_EXECUTION_START_INSERT_RETURNED_NO_ROW");
      const response = mapInstance(row);
      const transitionId = randomUUID();
      await client.query(
        `INSERT INTO eper_workflow_transitions
          (tenant_id, application_id, transition_id, instance_id, from_activity_id, to_activity_id,
           action, actor_id, actor_role, expected_version, resulting_version, idempotency_key,
           request_fingerprint, correlation_id, payload_digest)
         VALUES ($1,$2,$3,$4,NULL,$5,'start',$6,$7,0,1,$8,$9,$10,$11)`,
        [input.tenantId, input.applicationId, transitionId, instanceId, firstActivity.id,
          input.actorId, firstActivity.roleId, input.idempotencyKey, requestFingerprint,
          input.correlationId, digest(data)],
      );
      await client.query(
        `INSERT INTO eper_workflow_idempotency
          (tenant_id, application_id, instance_id, idempotency_key, request_fingerprint, transition_id, response)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [input.tenantId, input.applicationId, instanceId, input.idempotencyKey,
          requestFingerprint, transitionId, JSON.stringify(response)],
      );
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "workflow.instance.start", outcome: "success",
        resourceType: "workflow-instance", resourceId: instanceId, correlationId: input.correlationId,
        source: "api", operationName: "POST /applications/:applicationId/workflows/:workflowId/instances",
        serviceVersion: input.serviceVersion ?? this.serviceVersion,
        afterHash: digest(response),
        payload: { workflowId: input.workflowId, definitionVersion: response.definitionVersion, instanceId },
      });
      await client.query("COMMIT");
      return response;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async transition(input: TransitionWorkflowInstanceInput): Promise<WorkflowInstanceRecord> {
    validateContext(input);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.instanceId)) {
      throw new WorkflowExecutionError("WORKFLOW_EXECUTION_INSTANCE_ID_INVALID", 400);
    }
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new WorkflowExecutionError("WORKFLOW_EXECUTION_EXPECTED_VERSION_INVALID", 400);
    }
    validateIdempotencyKey(input.idempotencyKey);
    if (!["submit", "approve", "reject", "cancel"].includes(input.action)) {
      throw new WorkflowExecutionError("WORKFLOW_EXECUTION_ACTION_INVALID", 400);
    }
    const payload = validateObject(input.payload ?? {}, "WORKFLOW_EXECUTION_PAYLOAD_INVALID");
    const requestFingerprint = digest({
      operation: "transition", tenantId: input.tenantId, applicationId: input.applicationId,
      actorId: input.actorId, instanceId: input.instanceId, expectedVersion: input.expectedVersion,
      action: input.action, payload, targetActivityId: input.targetActivityId ?? null,
    });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRlsContext(client, input.tenantId, input.applicationId);
      await assertMembership(client, input);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify([input.tenantId, input.applicationId, input.instanceId, input.idempotencyKey])],
      );
      const prior = await client.query<TransitionRow>(
        `SELECT request_fingerprint, response FROM eper_workflow_idempotency
          WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3 AND idempotency_key = $4`,
        [input.tenantId, input.applicationId, input.instanceId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_fingerprint.trim() !== requestFingerprint) {
          throw new WorkflowExecutionError("WORKFLOW_EXECUTION_IDEMPOTENCY_CONFLICT", 409);
        }
        const replay = parseObject(prior.rows[0].response);
        await client.query("COMMIT");
        return replay as unknown as WorkflowInstanceRecord;
      }

      const selected = await client.query<InstanceRow>(
        `SELECT * FROM eper_workflow_instances
          WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.instanceId],
      );
      const instance = selected.rows[0];
      if (!instance) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_INSTANCE_NOT_FOUND", 404);
      if (instance.status !== "running") throw new WorkflowExecutionError("WORKFLOW_EXECUTION_INSTANCE_TERMINAL", 409);
      if (Number(instance.version) !== input.expectedVersion) {
        throw new WorkflowExecutionError("WORKFLOW_EXECUTION_VERSION_CONFLICT", 409);
      }

      const definitionResult = await client.query<{ definition: WorkflowDefinition | string }>(
        `SELECT definition FROM eper_workflow_definition_versions
          WHERE tenant_id = $1 AND application_id = $2 AND workflow_id = $3
            AND definition_version = $4 AND definition_digest = $5`,
        [input.tenantId, input.applicationId, instance.workflow_id,
          Number(instance.definition_version), instance.definition_digest.trim()],
      );
      const definitionRow = definitionResult.rows[0];
      if (!definitionRow) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_PINNED_DEFINITION_NOT_FOUND", 500);
      const definition = parseDefinition(definitionRow.definition);
      if (definition.id !== instance.workflow_id || digest(definition) !== instance.definition_digest.trim()) {
        throw new WorkflowExecutionError("WORKFLOW_EXECUTION_PINNED_DEFINITION_INTEGRITY_FAILED", 500);
      }
      const current = definition.activities.find(activity => activity.id === instance.current_activity_id);
      if (!current) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_CURRENT_ACTIVITY_NOT_FOUND", 500);

      let actorRole: string;
      let nextActivityId: string | null = null;
      let nextStatus: WorkflowInstanceStatus = "running";
      let nextData = parseObject(instance.data);
      if (input.action === "cancel") {
        actorRole = await authorizeAdmin(client, input);
        nextStatus = "cancelled";
      } else if (input.action === "reject") {
        if (current.type !== "APPROVAL") throw new WorkflowExecutionError("WORKFLOW_EXECUTION_REJECT_REQUIRES_APPROVAL", 422);
        await authorizeRole(client, input, current.roleId, "workflow:approve");
        actorRole = current.roleId;
        nextStatus = "rejected";
      } else {
        const requiredPermission = input.action === "approve" ? "workflow:approve" : "workflow:act";
        if (input.action === "approve" && current.type !== "APPROVAL") {
          throw new WorkflowExecutionError("WORKFLOW_EXECUTION_APPROVE_REQUIRES_APPROVAL", 422);
        }
        if (input.action === "submit" && current.type === "APPROVAL") {
          throw new WorkflowExecutionError("WORKFLOW_EXECUTION_SUBMIT_NOT_ALLOWED_FOR_APPROVAL", 422);
        }
        await authorizeRole(client, input, current.roleId, requiredPermission);
        actorRole = current.roleId;
        validateActivityPayload(current.fields, payload);
        nextData = { ...nextData, ...payload };
        nextActivityId = chooseNextActivity(current, input.targetActivityId);
        if (nextActivityId === null) nextStatus = "completed";
      }

      const nextVersion = input.expectedVersion + 1;
      const terminal = nextStatus !== "running";
      const updated = await client.query<InstanceRow>(
        `UPDATE eper_workflow_instances
            SET status = $4, current_activity_id = $5, data = $6::jsonb,
                version = $7, updated_at = NOW(),
                completed_at = CASE WHEN $4::varchar = 'running' THEN NULL ELSE NOW() END
          WHERE tenant_id = $1 AND application_id = $2 AND instance_id = $3
            AND version = $8
          RETURNING *`,
        [input.tenantId, input.applicationId, input.instanceId, nextStatus,
          terminal ? null : nextActivityId, JSON.stringify(nextData), nextVersion, input.expectedVersion],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new WorkflowExecutionError("WORKFLOW_EXECUTION_VERSION_CONFLICT", 409);
      const response = mapInstance(updatedRow);
      const transitionId = randomUUID();
      await client.query(
        `INSERT INTO eper_workflow_transitions
          (tenant_id, application_id, transition_id, instance_id, from_activity_id, to_activity_id,
           action, actor_id, actor_role, expected_version, resulting_version, idempotency_key,
           request_fingerprint, correlation_id, payload_digest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [input.tenantId, input.applicationId, transitionId, input.instanceId,
          instance.current_activity_id, terminal ? null : nextActivityId, input.action,
          input.actorId, actorRole, input.expectedVersion, nextVersion, input.idempotencyKey,
          requestFingerprint, input.correlationId, digest(payload)],
      );
      await client.query(
        `INSERT INTO eper_workflow_idempotency
          (tenant_id, application_id, instance_id, idempotency_key, request_fingerprint, transition_id, response)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [input.tenantId, input.applicationId, input.instanceId, input.idempotencyKey,
          requestFingerprint, transitionId, JSON.stringify(response)],
      );
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "workflow.instance.transition", outcome: "success",
        resourceType: "workflow-instance", resourceId: input.instanceId, correlationId: input.correlationId,
        source: "api", operationName: "POST /workflow-instances/:instanceId/transitions",
        serviceVersion: input.serviceVersion ?? this.serviceVersion,
        beforeHash: digest({ status: instance.status, version: Number(instance.version), data: parseObject(instance.data) }),
        afterHash: digest(response),
        payload: { action: input.action, resultingStatus: nextStatus, resultingVersion: nextVersion, targetActivityId: nextActivityId },
      });
      await client.query("COMMIT");
      return response;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
