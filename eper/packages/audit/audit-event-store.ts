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


/**
 * Refuses to start protected audit-backed routes when the deployed schema is
 * absent or its append-only triggers are missing/disabled. This validates
 * deployment state; it does not prove hash-chain correctness or full coverage.
 */
export async function assertAuditStoreReady(pool: AuditSqlPool): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query<{
      events_table: string | null;
      chain_head_table: string | null;
      has_no_update_trigger: boolean;
      has_no_delete_trigger: boolean;
      chain_head_count: string | number;
    }>(`
      SELECT
        to_regclass('public.eper_audit_events')::text AS events_table,
        to_regclass('public.eper_audit_chain_head')::text AS chain_head_table,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = to_regclass('public.eper_audit_events')
            AND tgname = 'eper_audit_events_no_update'
            AND tgenabled <> 'D'
        ) AS has_no_update_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = to_regclass('public.eper_audit_events')
            AND tgname = 'eper_audit_events_no_delete'
            AND tgenabled <> 'D'
        ) AS has_no_delete_trigger,
        (SELECT COUNT(*) FROM eper_audit_chain_head WHERE singleton = TRUE) AS chain_head_count
    `);
    const state = result.rows[0];
    if (!state || !state.events_table || !state.chain_head_table) {
      throw new Error("EPER_AUDIT_SCHEMA_NOT_APPLIED");
    }
    if (!state.has_no_update_trigger || !state.has_no_delete_trigger) {
      throw new Error("EPER_AUDIT_APPEND_ONLY_CONTROLS_MISSING");
    }
    if (Number(state.chain_head_count) !== 1) {
      throw new Error("EPER_AUDIT_CHAIN_HEAD_NOT_INITIALIZED");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("EPER_AUDIT_")) throw error;
    throw new Error("EPER_AUDIT_READINESS_CHECK_FAILED", { cause: error });
  } finally {
    client.release();
  }
}


export interface AuditVerificationResult {
  eventsChecked: number;
  valid: boolean;
  errors: string[];
  computedHeadHash: string | null;
  storedHeadHash: string | null;
}

/**
 * Replays events by their predecessor-hash links (not timestamps), recomputes
 * canonical event hashes, checks for forks/orphans, and compares the result
 * with the persisted chain head. A valid report is evidence only for the
 * rows visible to this database role at verification time.
 */
export async function verifyAuditChain(pool: AuditSqlPool): Promise<AuditVerificationResult> {
  const client = await pool.connect();
  const errors: string[] = [];
  let eventsChecked = 0;
  let computedHeadHash: string | null = null;
  let storedHeadHash: string | null = null;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const head = await client.query<{ last_event_hash: string | null }>(
      "SELECT last_event_hash FROM eper_audit_chain_head WHERE singleton = TRUE"
    );
    if (head.rows.length !== 1) {
      errors.push("chain_head_missing_or_duplicated");
    } else {
      storedHeadHash = head.rows[0].last_event_hash;
    }
    const rows = await client.query<Record<string, unknown>>(
      `SELECT event_id, occurred_at, tenant_id, application_id, environment, actor_type, actor_id,
        effective_roles, action, outcome, reason_code, resource_type, resource_id, operation_id,
        correlation_id, request_id, source, operation_name, service_version, approval_id,
        parent_event_id, idempotency_key, schema_version, before_hash, after_hash, payload,
        previous_event_hash, event_hash
       FROM eper_audit_events`
    );
    const byPrevious = new Map<string, Record<string, unknown>[]>();
    for (const row of rows.rows) {
      const predecessor = row.previous_event_hash == null ? "" : String(row.previous_event_hash).trim();
      const bucket = byPrevious.get(predecessor) ?? [];
      bucket.push(row);
      byPrevious.set(predecessor, bucket);
    }
    let previousHash: string | null = null;
    const visited = new Set<string>();
    while (true) {
      const candidates = byPrevious.get(previousHash ?? "") ?? [];
      if (candidates.length === 0) break;
      if (candidates.length > 1) {
        errors.push("chain_fork_after:" + (previousHash ?? "GENESIS"));
        break;
      }
      const row = candidates[0];
      const eventId = String(row.event_id);
      if (visited.has(eventId)) {
        errors.push("chain_cycle:" + eventId);
        break;
      }
      visited.add(eventId);
      eventsChecked += 1;
      const actualPrevious = row.previous_event_hash == null ? null : String(row.previous_event_hash).trim();
      const envelope = {
        eventId,
        occurredAt: new Date(row.occurred_at as string | Date).toISOString(),
        tenantId: String(row.tenant_id),
        applicationId: String(row.application_id),
        environment: row.environment,
        actorType: row.actor_type,
        actorId: row.actor_id,
        effectiveRoles: typeof row.effective_roles === "string" ? JSON.parse(row.effective_roles) : row.effective_roles,
        action: row.action,
        outcome: row.outcome,
        reasonCode: row.reason_code ?? null,
        resourceType: row.resource_type ?? null,
        resourceId: row.resource_id ?? null,
        operationId: row.operation_id ?? null,
        correlationId: row.correlation_id ?? null,
        requestId: row.request_id ?? null,
        source: row.source,
        operationName: row.operation_name,
        serviceVersion: row.service_version ?? null,
        approvalId: row.approval_id ?? null,
        parentEventId: row.parent_event_id ?? null,
        idempotencyKey: row.idempotency_key ?? null,
        schemaVersion: Number(row.schema_version),
        beforeHash: row.before_hash == null ? null : String(row.before_hash).trim(),
        afterHash: row.after_hash == null ? null : String(row.after_hash).trim(),
        payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
        previousEventHash: actualPrevious,
      };
      const computedHash = hashAuditEnvelope(envelope);
      const storedHash = String(row.event_hash ?? "").trim();
      if (computedHash !== storedHash) errors.push("event_hash_mismatch:" + eventId);
      previousHash = storedHash;
    }
    computedHeadHash = previousHash;
    if (visited.size !== rows.rows.length) errors.push("orphan_or_unreachable_events");
    if (computedHeadHash !== storedHeadHash) errors.push("stored_chain_head_mismatch");
    await client.query("COMMIT");
    return { eventsChecked, valid: errors.length === 0, errors, computedHeadHash, storedHeadHash };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}
