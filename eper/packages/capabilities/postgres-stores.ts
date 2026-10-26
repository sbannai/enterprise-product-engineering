import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { TenantTransaction } from "./postgres-transaction.js";
import { withTenantTransaction, enqueueOutboxEvent } from "./postgres-transaction.js";
import type { AuthoritativeRecord } from "./authoritative-records.js";
import type { AuthorizationDecision, AuthorizationPolicy, AuthorizationRequest } from "./authorization.js";
import type { AuditEvidence } from "./audit-evidence.js";
import type { ExceptionCreateInput, ExceptionPatch, WorkflowException } from "./exception-handling.js";
import type { ReportQuery, ReportRow } from "./governed-reporting.js";

type JsonObject = Record<string, unknown>;
type DbRow = Record<string, unknown>;

function objectValue(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}
function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
function hash(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("PERSISTENCE_VALUE_NOT_SERIALIZABLE");
  return createHash("sha256").update(serialized).digest("hex");
}
function recordFromRow(row: DbRow): AuthoritativeRecord {
  return { id: String(row.record_id), tenantId: String(row.tenant_id), version: Number(row.version), state: String(row.state), data: jsonValue<JsonObject>(row.data) };
}
type VersionedWorkflowException = WorkflowException & { version: number };
function exceptionFromRow(row: DbRow): VersionedWorkflowException {
  return {
    id: String(row.exception_id), tenantId: String(row.tenant_id), requirementId: String(row.requirement_id),
    code: String(row.code), message: String(row.message), state: String(row.state) as WorkflowException["state"],
    retryCount: Number(row.retry_count), idempotencyKey: String(row.idempotency_key), version: Number(row.version),
    ...(row.owner == null ? {} : { owner: String(row.owner) }),
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
function stableAuditMaterial(input: Omit<AuditEvidence, "integrityHash">): string {
  // Version 1 canonicalization: fixed top-level field order; JSON-compatible payload.
  return JSON.stringify({
    id: input.id, tenantId: input.tenantId, requirementId: input.requirementId,
    action: input.action, principalId: input.principalId, correlationId: input.correlationId,
    occurredAt: input.occurredAt, payload: input.payload,
  });
}

export class PostgresAuthoritativeRecordStore {
  constructor(private readonly pool: Pool) {}

  async createGoverned(record: AuthoritativeRecord, context: { principalId: string; correlationId: string; requirementId: string }): Promise<AuthoritativeRecord> {
    const data = objectValue(record.data, "RECORD_DATA_INVALID");
    return withTenantTransaction(this.pool, record.tenantId, async ({ client, tenantId }) => {
      const { rows } = await client.query(
        "INSERT INTO authoritative_records(tenant_id,record_id,version,state,data) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING tenant_id,record_id,version,state,data",
        [tenantId, record.id, record.version, record.state, JSON.stringify(data)],
      );
      const saved = recordFromRow(rows[0]);
      const audit = { id: `record-created:${saved.id}:v${saved.version}`, tenantId, requirementId: context.requirementId, action: "AUTHORITATIVE_RECORD_CREATED", principalId: context.principalId, correlationId: context.correlationId, occurredAt: new Date().toISOString(), payload: { recordId: saved.id, version: saved.version, state: saved.state } };
      const integrityHash = createHash("sha256").update(stableAuditMaterial(audit)).digest("hex");
      await client.query("INSERT INTO audit_evidence(tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)", [tenantId,audit.id,audit.requirementId,audit.action,audit.principalId,audit.correlationId,audit.occurredAt,JSON.stringify(audit.payload),integrityHash]);
      await enqueueOutboxEvent({ tenantId, client }, { eventId: audit.id, tenantId, aggregateType: "authoritative_record", aggregateId: saved.id, eventType: "AUTHORITATIVE_RECORD_CREATED", correlationId: context.correlationId, payload: { recordId: saved.id, version: saved.version } });
      return saved;
    });
  }

  async updateGoverned(tenantId: string, id: string, expectedVersion: number, patch: Partial<Pick<AuthoritativeRecord, "state" | "data">>, context: { principalId: string; correlationId: string; requirementId: string }): Promise<AuthoritativeRecord> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("RECORD_EXPECTED_VERSION_INVALID");
    if (patch.data !== undefined) objectValue(patch.data, "RECORD_DATA_INVALID");
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rows } = await client.query("UPDATE authoritative_records SET state=COALESCE($4,state),data=COALESCE($5::jsonb,data),version=version+1,updated_at=now() WHERE tenant_id=$1 AND record_id=$2 AND version=$3 RETURNING tenant_id,record_id,version,state,data", [tenantId,id,expectedVersion,patch.state ?? null,patch.data === undefined ? null : JSON.stringify(patch.data)]);
      if (!rows[0]) throw new Error("RECORD_VERSION_CONFLICT");
      const saved = recordFromRow(rows[0]);
      const audit = { id: `record-updated:${saved.id}:v${saved.version}`, tenantId, requirementId: context.requirementId, action: "AUTHORITATIVE_RECORD_UPDATED", principalId: context.principalId, correlationId: context.correlationId, occurredAt: new Date().toISOString(), payload: { recordId: saved.id, version: saved.version, state: saved.state } };
      const integrityHash = createHash("sha256").update(stableAuditMaterial(audit)).digest("hex");
      await client.query("INSERT INTO audit_evidence(tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)", [tenantId,audit.id,audit.requirementId,audit.action,audit.principalId,audit.correlationId,audit.occurredAt,JSON.stringify(audit.payload),integrityHash]);
      await enqueueOutboxEvent({ tenantId, client }, { eventId: audit.id, tenantId, aggregateType: "authoritative_record", aggregateId: saved.id, eventType: "AUTHORITATIVE_RECORD_UPDATED", correlationId: context.correlationId, payload: { recordId: saved.id, version: saved.version } });
      return saved;
    });
  }

  async deleteGoverned(tenantId: string, id: string, expectedVersion: number, context: { principalId: string; correlationId: string; requirementId: string }): Promise<void> {
    await withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const existing = await client.query("SELECT state FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2 AND version=$3 FOR UPDATE", [tenantId,id,expectedVersion]);
      if (!existing.rows[0]) throw new Error("RECORD_VERSION_CONFLICT");
      await client.query("DELETE FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2 AND version=$3", [tenantId,id,expectedVersion]);
      const audit = { id: `record-deleted:${id}:v${expectedVersion}`, tenantId, requirementId: context.requirementId, action: "AUTHORITATIVE_RECORD_DELETED", principalId: context.principalId, correlationId: context.correlationId, occurredAt: new Date().toISOString(), payload: { recordId: id, version: expectedVersion } };
      const integrityHash = createHash("sha256").update(stableAuditMaterial(audit)).digest("hex");
      await client.query("INSERT INTO audit_evidence(tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)", [tenantId,audit.id,audit.requirementId,audit.action,audit.principalId,audit.correlationId,audit.occurredAt,JSON.stringify(audit.payload),integrityHash]);
      await enqueueOutboxEvent({ tenantId, client }, { eventId: audit.id, tenantId, aggregateType: "authoritative_record", aggregateId: id, eventType: "AUTHORITATIVE_RECORD_DELETED", correlationId: context.correlationId, payload: { recordId: id, version: expectedVersion } });
    });
  }

  async create(record: AuthoritativeRecord): Promise<AuthoritativeRecord> {
    const data = objectValue(record.data, "RECORD_DATA_INVALID");
    return withTenantTransaction(this.pool, record.tenantId, async ({ client, tenantId }) => {
      try {
        const { rows } = await client.query(
          `INSERT INTO authoritative_records(tenant_id, record_id, version, state, data)
           VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING tenant_id, record_id, version, state, data`,
          [tenantId, record.id, record.version, record.state, JSON.stringify(data)],
        );
        return recordFromRow(rows[0]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new Error("RECORD_ALREADY_EXISTS");
        throw error;
      }
    });
  }

  async get(tenantId: string, id: string): Promise<AuthoritativeRecord | undefined> {
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rows } = await client.query(
        "SELECT tenant_id, record_id, version, state, data FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2",
        [tenantId, id],
      );
      return rows[0] ? recordFromRow(rows[0]) : undefined;
    });
  }

  async update(tenantId: string, id: string, expectedVersion: number, patch: Partial<Pick<AuthoritativeRecord, "state" | "data">>): Promise<AuthoritativeRecord> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("RECORD_EXPECTED_VERSION_INVALID");
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("RECORD_PATCH_INVALID");
    if (patch.data !== undefined) objectValue(patch.data, "RECORD_DATA_INVALID");
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rows } = await client.query(
        `UPDATE authoritative_records SET
           state=COALESCE($4, state),
           data=COALESCE($5::jsonb, data),
           version=version+1, updated_at=now()
         WHERE tenant_id=$1 AND record_id=$2 AND version=$3
         RETURNING tenant_id, record_id, version, state, data`,
        [tenantId, id, expectedVersion, patch.state ?? null, patch.data === undefined ? null : JSON.stringify(patch.data)],
      );
      if (rows[0]) return recordFromRow(rows[0]);
      const exists = await client.query("SELECT 1 FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2", [tenantId, id]);
      if (!exists.rowCount) throw new Error("RECORD_NOT_FOUND");
      throw new Error("RECORD_VERSION_CONFLICT");
    });
  }

  async delete(tenantId: string, id: string, expectedVersion: number): Promise<void> {
    await withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rowCount } = await client.query(
        "DELETE FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2 AND version=$3",
        [tenantId, id, expectedVersion],
      );
      if (rowCount === 1) return;
      const exists = await client.query("SELECT 1 FROM authoritative_records WHERE tenant_id=$1 AND record_id=$2", [tenantId, id]);
      if (!exists.rowCount) throw new Error("RECORD_NOT_FOUND");
      throw new Error("RECORD_VERSION_CONFLICT");
    });
  }
}

export class PostgresAuthorizationPolicyStore {
  constructor(private readonly pool: Pool) {}


  async addPolicyGoverned(policy: AuthorizationPolicy & { id?: string }, context: { principalId: string; correlationId: string; requirementId: string }): Promise<void> {
    if (!policy.tenantId?.trim() || !Array.isArray(policy.actions) || !policy.actions.length ||
        !Array.isArray(policy.resources) || !policy.resources.length ||
        !["ALLOW", "DENY"].includes(policy.effect)) throw new Error("AUTHORIZATION_POLICY_INVALID");
    const policyId = policy.id ?? hash(policy).slice(0, 32);
    await withTenantTransaction(this.pool, policy.tenantId, async ({ client, tenantId }) => {
      await client.query("INSERT INTO authorization_policies(tenant_id,policy_id,principal_id,actions,resources,effect) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [tenantId,policyId,policy.principalId ?? null,JSON.stringify(policy.actions),JSON.stringify(policy.resources),policy.effect]);
      const audit = { id: `policy-created:${policyId}`, tenantId, requirementId: context.requirementId, action: "AUTHORIZATION_POLICY_CREATED", principalId: context.principalId, correlationId: context.correlationId, occurredAt: new Date().toISOString(), payload: { policyId, effect: policy.effect, actions: policy.actions, resources: policy.resources } };
      const integrityHash = createHash("sha256").update(stableAuditMaterial(audit)).digest("hex");
      await client.query("INSERT INTO audit_evidence(tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)", [tenantId,audit.id,audit.requirementId,audit.action,audit.principalId,audit.correlationId,audit.occurredAt,JSON.stringify(audit.payload),integrityHash]);
      await enqueueOutboxEvent({ tenantId, client }, { eventId: audit.id, tenantId, aggregateType: "authorization_policy", aggregateId: policyId, eventType: "AUTHORIZATION_POLICY_CREATED", correlationId: context.correlationId, payload: { policyId, effect: policy.effect } });
    });
  }

  async addPolicy(policy: AuthorizationPolicy & { id?: string }): Promise<void> {
    if (!policy.tenantId?.trim() || !Array.isArray(policy.actions) || !policy.actions.length ||
        !Array.isArray(policy.resources) || !policy.resources.length ||
        !["ALLOW", "DENY"].includes(policy.effect)) throw new Error("AUTHORIZATION_POLICY_INVALID");
    const policyId = policy.id ?? hash(policy).slice(0, 32);
    await withTenantTransaction(this.pool, policy.tenantId, async ({ client, tenantId }) => {
      try {
        await client.query(
          "INSERT INTO authorization_policies(tenant_id, policy_id, principal_id, actions, resources, effect) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)",
          [tenantId, policyId, policy.principalId ?? null, JSON.stringify(policy.actions), JSON.stringify(policy.resources), policy.effect],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new Error("AUTHORIZATION_POLICY_ALREADY_EXISTS");
        throw error;
      }
    });
  }

  async decide(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    return withTenantTransaction(this.pool, request.tenantId, async ({ client, tenantId }) => {
      const { rows } = await client.query(
        "SELECT principal_id, actions, resources, effect FROM authorization_policies WHERE tenant_id=$1",
        [tenantId],
      );
      const matches = rows.filter(row =>
        (row.principal_id == null || row.principal_id === request.principalId) &&
        jsonValue<string[]>(row.actions).includes(request.action) &&
        jsonValue<string[]>(row.resources).includes(request.resource));
      const deny = matches.some(row => row.effect === "DENY");
      const allow = matches.some(row => row.effect === "ALLOW");
      return {
        effect: deny || !allow ? "DENY" : "ALLOW",
        reason: deny ? "EXPLICIT_DENY_POLICY" : allow ? "ALLOW_POLICY_MATCH" : "NO_ALLOW_POLICY",
        request,
      };
    });
  }

  async snapshot(tenantId: string): Promise<readonly AuthorizationPolicy[]> {
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rows } = await client.query(
        "SELECT tenant_id, principal_id, actions, resources, effect FROM authorization_policies WHERE tenant_id=$1 ORDER BY policy_id",
        [tenantId],
      );
      return rows.map(row => ({
        tenantId: String(row.tenant_id),
        ...(row.principal_id == null ? {} : { principalId: String(row.principal_id) }),
        actions: jsonValue<string[]>(row.actions), resources: jsonValue<string[]>(row.resources),
        effect: String(row.effect) as AuthorizationPolicy["effect"],
      }));
    });
  }
}

export class PostgresAuditEvidenceStore {
  constructor(private readonly pool: Pool) {}

  async append(input: Omit<AuditEvidence, "integrityHash">): Promise<AuditEvidence> {
    const payload = objectValue(input.payload, "AUDIT_PAYLOAD_INVALID");
    const integrityHash = createHash("sha256").update(stableAuditMaterial({ ...input, payload })).digest("hex");
    return withTenantTransaction(this.pool, input.tenantId, async ({ client, tenantId }) => {
      try {
        await client.query(
          `INSERT INTO audit_evidence
           (tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash)
           VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)`,
          [tenantId, input.id, input.requirementId, input.action, input.principalId, input.correlationId, input.occurredAt, JSON.stringify(payload), integrityHash],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new Error("AUDIT_EVIDENCE_ALREADY_EXISTS");
        throw error;
      }
      return { ...input, payload: jsonValue(payload), integrityHash };
    });
  }

  async get(tenantId: string, id: string): Promise<AuditEvidence | undefined> {
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rows } = await client.query(
        "SELECT tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,integrity_hash FROM audit_evidence WHERE tenant_id=$1 AND evidence_id=$2",
        [tenantId, id],
      );
      const row = rows[0];
      return row ? {
        id: String(row.evidence_id), tenantId: String(row.tenant_id), requirementId: String(row.requirement_id),
        action: String(row.action), principalId: String(row.principal_id), correlationId: String(row.correlation_id),
        occurredAt: new Date(String(row.occurred_at)).toISOString(), payload: jsonValue(row.payload), integrityHash: String(row.integrity_hash),
      } : undefined;
    });
  }

  async listByRequirement(tenantId: string, requirementId: string): Promise<readonly AuditEvidence[]> {
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rows } = await client.query(
        "SELECT tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,integrity_hash FROM audit_evidence WHERE tenant_id=$1 AND requirement_id=$2 ORDER BY occurred_at,evidence_id",
        [tenantId, requirementId],
      );
      return rows.map(row => ({
        id: String(row.evidence_id), tenantId: String(row.tenant_id), requirementId: String(row.requirement_id),
        action: String(row.action), principalId: String(row.principal_id), correlationId: String(row.correlation_id),
        occurredAt: new Date(String(row.occurred_at)).toISOString(), payload: jsonValue(row.payload), integrityHash: String(row.integrity_hash),
      }));
    });
  }

  verify(entry: AuditEvidence): boolean {
    try {
      const { integrityHash, ...material } = entry;
      return /^[a-f0-9]{64}$/.test(integrityHash) &&
        createHash("sha256").update(stableAuditMaterial(material)).digest("hex") === integrityHash;
    } catch { return false; }
  }
}

/** Shared helper for mutation + audit + outbox in one database transaction. */
export async function commitGovernedMutation<T>(
  pool: Pool,
  tenantId: string,
  mutate: (tx: TenantTransaction) => Promise<T>,
  audit: (tx: TenantTransaction, value: T) => Promise<void>,
  event: (value: T) => Parameters<typeof enqueueOutboxEvent>[1],
): Promise<T> {
  return withTenantTransaction(pool, tenantId, async tx => {
    const value = await mutate(tx);
    await audit(tx, value);
    await enqueueOutboxEvent(tx, event(value));
    return value;
  });
}

export class PostgresExceptionStore {
  constructor(private readonly pool: Pool) {}

  async create(input: ExceptionCreateInput, correlationId: string, principalId: string): Promise<WorkflowException> {
    if (!input.tenantId?.trim() || !input.id?.trim() || !input.idempotencyKey?.trim() ||
        !input.requirementId?.trim() || !input.code?.trim() || !input.message?.trim() ||
        !correlationId?.trim() || !principalId?.trim()) throw new Error("EXCEPTION_CONTEXT_REQUIRED");
    const fingerprint = hash({
      id: input.id, tenantId: input.tenantId, requirementId: input.requirementId,
      code: input.code, message: input.message, idempotencyKey: input.idempotencyKey,
      owner: input.owner ?? null, createdAt: input.createdAt,
    });
    return withTenantTransaction(this.pool, input.tenantId, async ({ client, tenantId }) => {
      const existing = await client.query(
        "SELECT * FROM workflow_exceptions WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE",
        [tenantId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== fingerprint) {
          throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
        }
        return exceptionFromRow(existing.rows[0]);
      }

      const { rows } = await client.query(
        `INSERT INTO workflow_exceptions
         (tenant_id,exception_id,requirement_id,code,message,state,retry_count,idempotency_key,request_fingerprint,owner,version,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,'OPEN',0,$6,$7,$8,1,$9::timestamptz,$9::timestamptz)
         RETURNING *`,
        [tenantId, input.id, input.requirementId, input.code, input.message, input.idempotencyKey, fingerprint, input.owner ?? null, input.createdAt],
      );
      const created = exceptionFromRow(rows[0]);
      const auditInput = {
        id: `exception-created:${created.id}`, tenantId, requirementId: created.requirementId,
        action: "EXCEPTION_CREATED", principalId, correlationId,
        occurredAt: created.createdAt, payload: { exceptionId: created.id, state: created.state, version: created.version },
      };
      await this.insertAuditInTransaction(client, auditInput);
      await enqueueOutboxEvent({
        tenantId, client,
      }, {
        eventId: `exception-created:${created.id}`, tenantId, aggregateType: "workflow_exception",
        aggregateId: created.id, eventType: "EXCEPTION_CREATED", correlationId,
        payload: { exceptionId: created.id, state: created.state, requirementId: created.requirementId },
      });
      return created;
    });
  }

  async get(tenantId: string, id: string): Promise<WorkflowException | undefined> {
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const { rows } = await client.query(
        "SELECT * FROM workflow_exceptions WHERE tenant_id=$1 AND exception_id=$2",
        [tenantId, id],
      );
      return rows[0] ? exceptionFromRow(rows[0]) : undefined;
    });
  }

  async transition(
    tenantId: string, id: string, expectedVersion: number, patch: ExceptionPatch,
    correlationId: string, principalId: string,
  ): Promise<WorkflowException> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("EXCEPTION_VERSION_INVALID");
    return withTenantTransaction(this.pool, tenantId, async ({ client }) => {
      const currentResult = await client.query(
        "SELECT * FROM workflow_exceptions WHERE tenant_id=$1 AND exception_id=$2 FOR UPDATE",
        [tenantId, id],
      );
      if (!currentResult.rows[0]) throw new Error("EXCEPTION_NOT_FOUND");
      const current = exceptionFromRow(currentResult.rows[0]);
      if (current.version !== expectedVersion) throw new Error("EXCEPTION_VERSION_CONFLICT");
      const allowed: Record<WorkflowException["state"], readonly WorkflowException["state"][]> = {
        OPEN: ["RETRYING", "RESOLVED", "ESCALATED"],
        RETRYING: ["RETRYING", "RESOLVED", "ESCALATED"],
        RESOLVED: [],
        ESCALATED: ["RESOLVED"],
      };
      if (patch.state && !allowed[current.state].includes(patch.state)) throw new Error("EXCEPTION_INVALID_TRANSITION");
      const nextState = patch.state ?? current.state;
      const retryCount = nextState === "RETRYING" && patch.state === "RETRYING" ? current.retryCount + 1 : current.retryCount;
      const { rows } = await client.query(
        `UPDATE workflow_exceptions SET state=$4, retry_count=$5, owner=$6, message=$7,
         version=version+1, updated_at=now()
         WHERE tenant_id=$1 AND exception_id=$2 AND version=$3 RETURNING *`,
        [tenantId, id, expectedVersion, nextState, retryCount, patch.owner ?? current.owner ?? null, patch.message ?? current.message],
      );
      if (!rows[0]) throw new Error("EXCEPTION_VERSION_CONFLICT");
      const next = exceptionFromRow(rows[0]);
      const auditInput = {
        id: `exception-transition:${next.id}:v${next.version ?? expectedVersion + 1}`,
        tenantId, requirementId: next.requirementId, action: "EXCEPTION_TRANSITIONED",
        principalId, correlationId, occurredAt: next.updatedAt,
        payload: { exceptionId: next.id, from: current.state, to: next.state, version: expectedVersion + 1 },
      };
      await this.insertAuditInTransaction(client, auditInput);
      await enqueueOutboxEvent({ tenantId, client }, {
        eventId: auditInput.id, tenantId, aggregateType: "workflow_exception",
        aggregateId: next.id, eventType: "EXCEPTION_TRANSITIONED", correlationId,
        payload: { exceptionId: next.id, from: current.state, to: next.state, requirementId: next.requirementId },
      });
      return next;
    });
  }

  private async insertAuditInTransaction(
    client: import("pg").PoolClient,
    input: Omit<AuditEvidence, "integrityHash">,
  ): Promise<void> {
    const integrityHash = createHash("sha256").update(stableAuditMaterial(input)).digest("hex");
    await client.query(
      `INSERT INTO audit_evidence
       (tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)`,
      [input.tenantId, input.id, input.requirementId, input.action, input.principalId, input.correlationId, input.occurredAt, JSON.stringify(input.payload), integrityHash],
    );
  }
}

export class PostgresGovernedReportingStore {
  constructor(private readonly pool: Pool) {}

  async publish(row: ReportRow, publicationId: string, principalId: string, correlationId: string): Promise<void> {
    if (!row.tenantId?.trim() || !row.reportId?.trim() || !publicationId?.trim() ||
        !principalId?.trim() || !correlationId?.trim()) throw new Error("REPORT_CONTEXT_REQUIRED");
    if (!Array.isArray(row.sourceRequirementIds) || row.sourceRequirementIds.length === 0 ||
        !row.sourceRequirementIds.every(value => typeof value === "string" && value.trim())) {
      throw new Error("REPORT_PROVENANCE_REQUIRED");
    }
    objectValue(row.values, "REPORT_VALUES_INVALID");
    await withTenantTransaction(this.pool, row.tenantId, async ({ client, tenantId }) => {
      await client.query(
        `INSERT INTO governed_reports(tenant_id,report_id,publication_id,"values",source_requirement_ids,generated_at)
         VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::timestamptz)`,
        [tenantId, row.reportId, publicationId, JSON.stringify(row.values), JSON.stringify(row.sourceRequirementIds), row.generatedAt],
      );
      const audit = {
        id: `report-published:${row.reportId}:${publicationId}`, tenantId,
        requirementId: row.sourceRequirementIds[0], action: "GOVERNED_REPORT_PUBLISHED",
        principalId, correlationId, occurredAt: row.generatedAt,
        payload: { reportId: row.reportId, publicationId, sourceRequirementIds: row.sourceRequirementIds },
      };
      const integrityHash = createHash("sha256").update(stableAuditMaterial(audit)).digest("hex");
      await client.query(
        `INSERT INTO audit_evidence
         (tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)`,
        [tenantId, audit.id, audit.requirementId, audit.action, principalId, correlationId, audit.occurredAt, JSON.stringify(audit.payload), integrityHash],
      );
      await enqueueOutboxEvent({ tenantId, client }, {
        eventId: audit.id, tenantId, aggregateType: "governed_report",
        aggregateId: row.reportId, eventType: "GOVERNED_REPORT_PUBLISHED", correlationId,
        payload: { reportId: row.reportId, publicationId, sourceRequirementIds: row.sourceRequirementIds },
      });
    });
  }

  async query(request: ReportQuery): Promise<readonly ReportRow[]> {
    if (!request.tenantId?.trim() || !request.reportId?.trim()) throw new Error("REPORT_QUERY_CONTEXT_REQUIRED");
    const limit = request.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("REPORT_LIMIT_INVALID");
    return withTenantTransaction(this.pool, request.tenantId, async ({ client, tenantId }) => {
      const { rows } = await client.query(
        `SELECT tenant_id,report_id,"values",source_requirement_ids,generated_at
         FROM governed_reports WHERE tenant_id=$1 AND report_id=$2
         ORDER BY generated_at DESC LIMIT $3`,
        [tenantId, request.reportId, limit],
      );
      const filters = request.filters ?? {};
      return rows
        .map(row => ({
          tenantId: String(row.tenant_id), reportId: String(row.report_id),
          values: jsonValue<JsonObject>(row.values),
          sourceRequirementIds: jsonValue<string[]>(row.source_requirement_ids),
          generatedAt: new Date(String(row.generated_at)).toISOString(),
        }))
        .filter(row => Object.entries(filters).every(([key, value]) => row.values[key] === value));
    });
  }
}

// Type-level conformance target for the next service refactor; intentionally async.
export interface AsyncCapabilityPersistence {
  records: Pick<PostgresAuthoritativeRecordStore, "create" | "get" | "update" | "delete">;
  policies: Pick<PostgresAuthorizationPolicyStore, "addPolicy" | "decide" | "snapshot">;
  audit: Pick<PostgresAuditEvidenceStore, "append" | "get" | "listByRequirement" | "verify">;
  exceptions: Pick<PostgresExceptionStore, "create" | "get" | "transition">;
  reports: Pick<PostgresGovernedReportingStore, "publish" | "query">;
}
