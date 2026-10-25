import { createHash, randomUUID } from "node:crypto";

export type AuditOutcome = "success" | "denied" | "failure";
export type AuditActorType = "human" | "service" | "system";
export type AuditSource = "api" | "ui" | "job" | "integration" | "platform";
export type AuditEnvironment = "production" | "uat" | "sandbox";

export interface AuditEventInput {
  tenantId: string;
  applicationId: string;
  environment: AuditEnvironment;
  actorType: AuditActorType;
  actorId: string;
  effectiveRoles?: string[];
  action: string;
  outcome: AuditOutcome;
  reasonCode?: string;
  resourceType?: string;
  resourceId?: string;
  operationId?: string;
  correlationId?: string;
  requestId?: string;
  source: AuditSource;
  operationName: string;
  serviceVersion?: string;
  approvalId?: string;
  parentEventId?: string;
  idempotencyKey?: string;
  beforeHash?: string;
  afterHash?: string;
  payload?: Record<string, unknown>;
}

export interface AuditSqlResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}
export interface AuditSqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<AuditSqlResult<Row>>;
  release(): void;
}
export interface AuditSqlPool {
  connect(): Promise<AuditSqlClient>;
}

const forbiddenKey = /(password|passwd|token|secret|authorization|cookie|api[_-]?key|client[_-]?secret|card[_-]?(number|pan|cvv)|cvv|bank[_-]?(account|credential))/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      result[key] = forbiddenKey.test(key) ? "[REDACTED]" : sanitize(item, depth + 1);
    }
    return result;
  }
  if (typeof value === "string") return value.length > 4000 ? value.slice(0, 4000) + "[TRUNCATED]" : value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

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

export function hashAuditEnvelope(envelope: Record<string, unknown>): string {
  return createHash("sha256").update(canonical(envelope)).digest("hex");
}

/**
 * Appends one audit event and its integrity hash in a database transaction.
 * The advisory transaction lock serializes chain-head selection so concurrent
 * writers cannot create two events with the same predecessor. Call this before
 * acknowledging high-risk operations; couple it to business mutations with the
 * same transaction/outbox where the mutation and audit share a database.
 */
export async function appendAuditEvent(pool: AuditSqlPool, input: AuditEventInput): Promise<{ eventId: string; eventHash: string }> {
  for (const [name, value] of Object.entries({
    tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
    action: input.action, operationName: input.operationName,
  })) {
    if (typeof value !== "string" || !value.trim()) throw new Error("audit_required_field_missing:" + name);
  }
  const occurredAt = new Date().toISOString();
  const eventId = randomUUID();
  const payload = sanitize(input.payload ?? {}) as Record<string, unknown>;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('eper_audit_events_chain'))");
    const head = await client.query<{ last_event_hash: string | null }>(
      "SELECT last_event_hash FROM eper_audit_chain_head WHERE singleton = TRUE FOR UPDATE"
    );
    if (head.rows.length !== 1) throw new Error("audit_chain_head_not_initialized");
    const previousEventHash = head.rows[0].last_event_hash;
    const envelope = {
      eventId, occurredAt, tenantId: input.tenantId, applicationId: input.applicationId,
      environment: input.environment, actorType: input.actorType, actorId: input.actorId,
      effectiveRoles: input.effectiveRoles ?? [], action: input.action, outcome: input.outcome,
      reasonCode: input.reasonCode ?? null, resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null, operationId: input.operationId ?? null,
      correlationId: input.correlationId ?? null, requestId: input.requestId ?? null,
      source: input.source, operationName: input.operationName, serviceVersion: input.serviceVersion ?? null,
      approvalId: input.approvalId ?? null, parentEventId: input.parentEventId ?? null,
      idempotencyKey: input.idempotencyKey ?? null, schemaVersion: 1,
      beforeHash: input.beforeHash ?? null, afterHash: input.afterHash ?? null,
      payload, previousEventHash,
    };
    const eventHash = hashAuditEnvelope(envelope);
    await client.query(
      `INSERT INTO eper_audit_events (
        event_id, occurred_at, tenant_id, application_id, environment, actor_type, actor_id,
        effective_roles, action, outcome, reason_code, resource_type, resource_id,
        operation_id, correlation_id, request_id, source, operation_name, service_version,
        approval_id, parent_event_id, idempotency_key, schema_version, before_hash, after_hash,
        payload, previous_event_hash, event_hash, integrity_metadata
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28,$29::jsonb
      )`,
      [
        envelope.eventId, envelope.occurredAt, envelope.tenantId, envelope.applicationId,
        envelope.environment, envelope.actorType, envelope.actorId, JSON.stringify(envelope.effectiveRoles),
        envelope.action, envelope.outcome, envelope.reasonCode, envelope.resourceType, envelope.resourceId,
        envelope.operationId, envelope.correlationId, envelope.requestId, envelope.source,
        envelope.operationName, envelope.serviceVersion, envelope.approvalId, envelope.parentEventId,
        envelope.idempotencyKey, envelope.schemaVersion, envelope.beforeHash, envelope.afterHash,
        JSON.stringify(envelope.payload), envelope.previousEventHash, eventHash,
        JSON.stringify({ algorithm: "sha256", chain: "global-advisory-lock-v1" }),
      ],
    );
    await client.query(
      "UPDATE eper_audit_chain_head SET last_event_hash = $1, updated_at = NOW() WHERE singleton = TRUE",
      [eventHash],
    );
    await client.query("COMMIT");
    return { eventId, eventHash };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* retain original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
