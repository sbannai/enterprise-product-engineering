import { createHash, randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import { assertApprovalAllowed, type AgentKind, type AgentJobStatus } from "./agent-contracts.js";

export interface AgentSqlClient extends AuditSqlClient {}
export interface AgentSqlPool extends AuditSqlPool {}

export interface EnqueueAgentJobInput {
  tenantId: string;
  applicationId: string;
  requestedBy: string;
  agentId: AgentKind;
  intent: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  deadlineSeconds?: number;
  correlationId: string;
  environment: AuditEnvironment;
}
export interface StoredAgentJob {
  jobId: string;
  tenantId: string;
  applicationId: string;
  requestedBy: string;
  agentId: AgentKind;
  intent: string;
  status: AgentJobStatus;
  idempotencyKey: string;
  attempt: number;
  deadlineAt: string;
  createdAt: string;
  updatedAt: string;
  failureCode?: string;
  resultRef?: string;
  input?: Record<string, unknown>;
}
export type EnqueueAgentJobResult =
  | { kind: "created" | "existing"; job: StoredAgentJob }
  | { kind: "idempotency_conflict" };

export interface PersistAgentDraftInput {
  tenantId: string;
  applicationId: string;
  jobId: string;
  agentId: AgentKind;
  intent: string;
  payload: Record<string, unknown>;
  sourceReferences?: Array<Record<string, unknown>>;
  validationFindings?: Array<Record<string, unknown>>;
  createdBy: string;
  expiresAt: string;
  correlationId: string;
  environment: AuditEnvironment;
}
export interface ReviewAgentDraftInput {
  tenantId: string;
  applicationId: string;
  draftId: string;
  reviewerId: string;
  reviewerRole: string;
  action: "approve" | "reject";
  expectedVersion: number;
  expectedContentHash: string;
  note?: string;
  correlationId: string;
  environment: AuditEnvironment;
}
export class AgentDraftConflictError extends Error {
  constructor(code: "AGENT_DRAFT_NOT_FOUND" | "AGENT_DRAFT_ALREADY_REVIEWED" | "STALE_DRAFT_VERSION" | "STALE_DRAFT_HASH" | "MAKER_CHECKER_SEPARATION_REQUIRED") {
    super(code);
    this.name = "AgentDraftConflictError";
  }
}
function requireId(value: string, name: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw new Error("INVALID_" + name.toUpperCase());
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}
function mapJob(row: Record<string, unknown>): StoredAgentJob {
  return {
    jobId: String(row.job_id), tenantId: String(row.tenant_id), applicationId: String(row.application_id),
    requestedBy: String(row.requested_by), agentId: row.agent_id as AgentKind, intent: String(row.intent),
    status: String(row.status) as AgentJobStatus, idempotencyKey: String(row.idempotency_key),
    attempt: Number(row.attempt), deadlineAt: new Date(String(row.deadline_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
    ...(row.failure_code ? { failureCode: String(row.failure_code) } : {}),
    ...(row.result_ref ? { resultRef: String(row.result_ref) } : {}),
    ...(row.input ? { input: (typeof row.input === "string" ? JSON.parse(row.input) : row.input) as Record<string, unknown> } : {}),
  };
}

/**
 * Durable agent persistence primitives. Every operation sets tenant/application
 * context on its transaction before touching RLS-protected tables. Callers must
 * supply tenant/application from trusted server-side identity, not request data.
 */
export class PostgresAgentStore {
  constructor(private readonly pool: AgentSqlPool) {}

  private async scopedClient(tenantId: string, applicationId: string): Promise<AgentSqlClient> {
    requireId(tenantId, "tenant_id");
    requireId(applicationId, "application_id");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)", [tenantId, applicationId]);
      return client;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      client.release();
      throw error;
    }
  }

  async enqueueJob(input: EnqueueAgentJobInput): Promise<EnqueueAgentJobResult> {
    requireId(input.requestedBy, "requested_by");
    requireId(input.correlationId, "correlation_id");
    if (!/^[a-zA-Z0-9._:-]{16,128}$/.test(input.idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
    const deadlineSeconds = input.deadlineSeconds ?? 120;
    if (!Number.isInteger(deadlineSeconds) || deadlineSeconds < 1 || deadlineSeconds > 900) throw new Error("INVALID_DEADLINE");
    const fingerprint = sha256({ applicationId: input.applicationId, agentId: input.agentId, intent: input.intent, input: input.input, requestedBy: input.requestedBy });
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      // The unique constraint, not a preflight SELECT, arbitrates concurrent retries.
      // A SELECT-then-INSERT alone races when two transactions see no prior row.
      const jobId = randomUUID();
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO eper_agent_jobs
          (tenant_id,application_id,job_id,requested_by,agent_id,intent,status,idempotency_key,request_fingerprint,input,deadline_at)
         VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,$9::jsonb,NOW()+($10::text || ' seconds')::interval)
         ON CONFLICT (tenant_id, application_id, idempotency_key) DO NOTHING
         RETURNING *`,
        [input.tenantId, input.applicationId, jobId, input.requestedBy, input.agentId, input.intent, input.idempotencyKey, fingerprint, JSON.stringify(input.input), deadlineSeconds],
      );
      if (!result.rows[0]) {
        // Under READ COMMITTED this statement sees the row committed by the winner.
        const existing = await client.query<Record<string, unknown>>(
          "SELECT * FROM eper_agent_jobs WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3 FOR UPDATE",
          [input.tenantId, input.applicationId, input.idempotencyKey],
        );
        const row = existing.rows[0];
        if (!row) throw new Error("AGENT_JOB_IDEMPOTENCY_LOOKUP_FAILED");
        const sameRequest = row.request_fingerprint === fingerprint;
        await appendAuditEventInTransaction(client, {
          tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
          actorType: "human", actorId: input.requestedBy, action: "agent.job.idempotency_replay",
          outcome: sameRequest ? "success" : "denied",
          reasonCode: sameRequest ? undefined : "IDEMPOTENCY_KEY_CONFLICT",
          resourceType: "agent-job", resourceId: String(row.job_id), correlationId: input.correlationId,
          source: "api", operationName: "POST /v1/agent-jobs",
          payload: { agentId: input.agentId, intent: input.intent },
        });
        await client.query("COMMIT");
        return sameRequest
          ? { kind: "existing", job: mapJob(row) }
          : { kind: "idempotency_conflict" };
      }
      const row = result.rows[0];
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.requestedBy, action: "agent.job.enqueue", outcome: "success",
        resourceType: "agent-job", resourceId: jobId, correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey, source: "api", operationName: "POST /v1/agent-jobs",
        payload: { agentId: input.agentId, intent: input.intent, status: "queued" },
      });
      await client.query("COMMIT");
      return { kind: "created", job: mapJob(row) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async getJob(input: { tenantId: string; applicationId: string; jobId: string }): Promise<StoredAgentJob | null> {
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      const result = await client.query<Record<string, unknown>>(
        "SELECT * FROM eper_agent_jobs WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3",
        [input.tenantId, input.applicationId, input.jobId],
      );
      await client.query("COMMIT");
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  /** Claims the oldest eligible job for this tenant/application; use a worker lease. */
  async claimNextJob(input: { tenantId: string; applicationId: string; workerId: string; environment: AuditEnvironment; leaseSeconds?: number }): Promise<StoredAgentJob | null> {
    requireId(input.workerId, "worker_id");
    const leaseSeconds = input.leaseSeconds ?? 60;
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) throw new Error("INVALID_AGENT_LEASE");
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      const expired = await client.query<Record<string, unknown>>(
        `UPDATE eper_agent_jobs
            SET status='failed', failure_code='AGENT_JOB_DEADLINE_EXCEEDED',
                version=version+1, updated_at=NOW(), lease_owner=NULL, lease_expires_at=NULL
          WHERE tenant_id=$1 AND application_id=$2 AND deadline_at <= NOW()
            AND status IN ('queued','running')
          RETURNING job_id, requested_by`,
        [input.tenantId, input.applicationId],
      );
      for (const row of expired.rows) {
        await appendAuditEventInTransaction(client, {
          tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
          actorType: "system", actorId: input.workerId, action: "agent.job.deadline_exceeded", outcome: "failure",
          reasonCode: "AGENT_JOB_DEADLINE_EXCEEDED", resourceType: "agent-job", resourceId: String(row.job_id),
          source: "job", operationName: "claim agent job",
          payload: { status: "failed" },
        });
      }
      const result = await client.query<Record<string, unknown>>(
        `WITH candidate AS (
           SELECT job_id FROM eper_agent_jobs
            WHERE tenant_id=$1 AND application_id=$2 AND deadline_at > NOW()
              AND ((status='queued' AND available_at <= NOW())
                OR (status='running' AND lease_expires_at < NOW()))
            ORDER BY available_at, created_at
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE eper_agent_jobs j
            SET status='running', lease_owner=$3,
                lease_expires_at=NOW()+($4::text || ' seconds')::interval,
                attempt=j.attempt+1, version=j.version+1, updated_at=NOW()
           FROM candidate c
          WHERE j.tenant_id=$1 AND j.application_id=$2 AND j.job_id=c.job_id
         RETURNING j.*`,
        [input.tenantId, input.applicationId, input.workerId, leaseSeconds],
      );
      if (result.rows[0]) {
        const claimed = result.rows[0];
        await appendAuditEventInTransaction(client, {
          tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
          actorType: "service", actorId: input.workerId, action: "agent.job.claim", outcome: "success",
          resourceType: "agent-job", resourceId: String(claimed.job_id), source: "job",
          operationName: "claim agent job",
          payload: { attempt: Number(claimed.attempt), leaseSeconds },
        });
      }
      await client.query("COMMIT");
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  /** Records a worker failure and schedules bounded exponential retry, or closes the job. */
  async failOrRetryJob(input: {
    tenantId: string; applicationId: string; jobId: string; workerId: string;
    failureCode: string; retryable: boolean; maxAttempts?: number; baseDelaySeconds?: number;
    environment: AuditEnvironment; correlationId: string;
  }): Promise<{ status: "queued" | "failed"; attempt: number; retryAt?: string }> {
    requireId(input.workerId, "worker_id");
    requireId(input.failureCode, "failure_code");
    requireId(input.correlationId, "correlation_id");
    if (!/^[A-Z0-9_:-]{2,80}$/.test(input.failureCode)) throw new Error("INVALID_AGENT_FAILURE_CODE");
    const maxAttempts = input.maxAttempts ?? 4;
    const baseDelaySeconds = input.baseDelaySeconds ?? 5;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10 ||
        !Number.isInteger(baseDelaySeconds) || baseDelaySeconds < 1 || baseDelaySeconds > 300) {
      throw new Error("INVALID_AGENT_RETRY_POLICY");
    }
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      const selected = await client.query<Record<string, unknown>>(
        "SELECT job_id,status,attempt,lease_owner,deadline_at FROM eper_agent_jobs WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3 FOR UPDATE",
        [input.tenantId, input.applicationId, input.jobId],
      );
      const job = selected.rows[0];
      if (!job) throw new Error("AGENT_JOB_NOT_FOUND");
      if (job.status !== "running" || job.lease_owner !== input.workerId) throw new Error("AGENT_JOB_LEASE_NOT_OWNED");
      const attempt = Number(job.attempt);
      const retry = input.retryable && attempt < maxAttempts && new Date(String(job.deadline_at)).getTime() > Date.now();
      const delay = Math.min(300, baseDelaySeconds * (2 ** Math.max(0, attempt - 1)));
      const result = await client.query<Record<string, unknown>>(
        `UPDATE eper_agent_jobs
            SET status=$4, failure_code=$5, available_at=CASE WHEN $4='queued' THEN NOW()+($6::text || ' seconds')::interval ELSE available_at END,
                lease_owner=NULL, lease_expires_at=NULL, updated_at=NOW(), version=version+1
          WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3
          RETURNING status,available_at`,
        [input.tenantId, input.applicationId, input.jobId, retry ? "queued" : "failed", input.failureCode, delay],
      );
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "service", actorId: input.workerId, action: retry ? "agent.job.retry_scheduled" : "agent.job.failed",
        outcome: retry ? "success" : "failure", reasonCode: input.failureCode,
        resourceType: "agent-job", resourceId: input.jobId, correlationId: input.correlationId,
        source: "job", operationName: "agent worker failure handling",
        payload: { attempt, maxAttempts, retryable: input.retryable, nextStatus: retry ? "queued" : "failed", retryDelaySeconds: retry ? delay : null },
      });
      await client.query("COMMIT");
      return retry
        ? { status: "queued", attempt, retryAt: new Date(String(result.rows[0].available_at)).toISOString() }
        : { status: "failed", attempt };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  /** Cancels a queued/running job; running workers must stop when their lease is next checked. */
  async cancelJob(input: {
    tenantId: string; applicationId: string; jobId: string; actorId: string;
    environment: AuditEnvironment; correlationId: string;
  }): Promise<boolean> {
    requireId(input.actorId, "actor_id");
    requireId(input.correlationId, "correlation_id");
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      const result = await client.query<Record<string, unknown>>(
        `UPDATE eper_agent_jobs
            SET status='cancelled', lease_owner=NULL, lease_expires_at=NULL,
                updated_at=NOW(), version=version+1
          WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3
            AND status IN ('queued','running')
          RETURNING job_id`,
        [input.tenantId, input.applicationId, input.jobId],
      );
      if (result.rows[0]) {
        await appendAuditEventInTransaction(client, {
          tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
          actorType: "human", actorId: input.actorId, action: "agent.job.cancel", outcome: "success",
          resourceType: "agent-job", resourceId: input.jobId, correlationId: input.correlationId,
          source: "api", operationName: "POST /v1/agent-jobs/:jobId/cancel",
          payload: { status: "cancelled" },
        });
      }
      await client.query("COMMIT");
      return Boolean(result.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async persistDraft(input: PersistAgentDraftInput): Promise<{ draftId: string; contentHash: string; version: number }> {
    requireId(input.createdBy, "created_by");
    requireId(input.correlationId, "correlation_id");
    const draftId = randomUUID();
    const contentHash = sha256(input.payload);
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      const job = await client.query<Record<string, unknown>>(
        "SELECT status,requested_by,agent_id,intent FROM eper_agent_jobs WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3 FOR UPDATE",
        [input.tenantId, input.applicationId, input.jobId],
      );
      const row = job.rows[0];
      if (!row) throw new Error("AGENT_JOB_NOT_FOUND");
      if (row.status !== "running") throw new Error("AGENT_JOB_NOT_RUNNING");
      const inserted = await client.query<Record<string, unknown>>(
        `INSERT INTO eper_agent_drafts
          (tenant_id,application_id,draft_id,job_id,agent_id,intent,status,payload,source_references,validation_findings,content_hash,version,created_by,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending_approval',$7::jsonb,$8::jsonb,$9::jsonb,$10,1,$11,$12)
         RETURNING draft_id,content_hash,version`,
        [input.tenantId, input.applicationId, draftId, input.jobId, input.agentId, input.intent,
          JSON.stringify(input.payload), JSON.stringify(input.sourceReferences ?? []), JSON.stringify(input.validationFindings ?? []),
          contentHash, input.createdBy, input.expiresAt],
      );
      await client.query(
        "UPDATE eper_agent_jobs SET status='awaiting_approval',result_ref=$4,version=version+1,updated_at=NOW(),lease_owner=NULL,lease_expires_at=NULL WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3",
        [input.tenantId, input.applicationId, input.jobId, draftId],
      );
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "service", actorId: input.createdBy, action: "agent.draft.persist", outcome: "success",
        resourceType: "agent-draft", resourceId: draftId, correlationId: input.correlationId,
        source: "job", operationName: "persist agent draft",
        payload: { jobId: input.jobId, agentId: input.agentId, intent: input.intent, contentHash },
      });
      const saved = inserted.rows[0];
      if (!saved) throw new Error("AGENT_DRAFT_INSERT_RETURNED_NO_ROW");
      await client.query("COMMIT");
      return { draftId: String(saved.draft_id), contentHash: String(saved.content_hash), version: Number(saved.version) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async getDraft(input: { tenantId: string; applicationId: string; draftId: string }): Promise<Record<string, unknown> | null> {
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      const result = await client.query<Record<string, unknown>>(
        "SELECT draft_id,job_id,agent_id,intent,status,payload,source_references,validation_findings,content_hash,version,created_by,created_at,expires_at FROM eper_agent_drafts WHERE tenant_id=$1 AND application_id=$2 AND draft_id=$3",
        [input.tenantId, input.applicationId, input.draftId],
      );
      await client.query("COMMIT");
      return result.rows[0] ?? null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async reviewDraft(input: ReviewAgentDraftInput): Promise<{ draftId: string; status: "approved" | "rejected"; approvalId: string }> {
    requireId(input.reviewerId, "reviewer_id");
    requireId(input.reviewerRole, "reviewer_role");
    requireId(input.correlationId, "correlation_id");
    if (input.note && input.note.length > 1000) throw new Error("INVALID_REVIEW_NOTE");
    const client = await this.scopedClient(input.tenantId, input.applicationId);
    try {
      const result = await client.query<Record<string, unknown>>(
        "SELECT draft_id,job_id,status,version,content_hash,created_by FROM eper_agent_drafts WHERE tenant_id=$1 AND application_id=$2 AND draft_id=$3 FOR UPDATE",
        [input.tenantId, input.applicationId, input.draftId],
      );
      const draft = result.rows[0];
      if (!draft) throw new AgentDraftConflictError("AGENT_DRAFT_NOT_FOUND");
      if (draft.status !== "pending_approval") throw new AgentDraftConflictError("AGENT_DRAFT_ALREADY_REVIEWED");
      try {
        assertApprovalAllowed({
          createdBy: String(draft.created_by), reviewerId: input.reviewerId,
          currentVersion: Number(draft.version), requestedVersion: input.expectedVersion,
          currentContentHash: String(draft.content_hash), requestedContentHash: input.expectedContentHash,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "STALE_DRAFT_HASH";
        if (code === "MAKER_CHECKER_SEPARATION_REQUIRED" || code === "STALE_DRAFT_VERSION" || code === "STALE_DRAFT_HASH") {
          throw new AgentDraftConflictError(code);
        }
        throw error;
      }
      const approvalId = randomUUID();
      const status = input.action === "approve" ? "approved" : "rejected";
      await client.query(
        "INSERT INTO eper_agent_approvals (tenant_id,application_id,approval_id,draft_id,draft_version,content_hash,action,actor_id,actor_role,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [input.tenantId, input.applicationId, approvalId, input.draftId, input.expectedVersion, input.expectedContentHash, input.action, input.reviewerId, input.reviewerRole, input.note?.trim() || null],
      );
      await client.query(
        "UPDATE eper_agent_drafts SET status=$4,version=version+1 WHERE tenant_id=$1 AND application_id=$2 AND draft_id=$3",
        [input.tenantId, input.applicationId, input.draftId, status],
      );
      await client.query(
        "UPDATE eper_agent_jobs SET status=CASE WHEN $4='approve' THEN 'succeeded' ELSE 'failed' END,failure_code=CASE WHEN $4='reject' THEN 'AGENT_DRAFT_REJECTED' ELSE NULL END,version=version+1,updated_at=NOW() WHERE tenant_id=$1 AND application_id=$2 AND job_id=$3 AND status='awaiting_approval'",
        [input.tenantId, input.applicationId, String(draft.job_id), input.action],
      );
      await appendAuditEventInTransaction(client, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.reviewerId, action: "agent.draft." + input.action, outcome: "success",
        resourceType: "agent-draft", resourceId: input.draftId, correlationId: input.correlationId,
        source: "api", operationName: "POST /v1/agent-drafts/:draftId/" + input.action,
        payload: { approvalId, draftVersion: input.expectedVersion, contentHash: input.expectedContentHash, noteProvided: Boolean(input.note?.trim()), execution: "NOT_EXECUTED" },
      });
      await client.query("COMMIT");
      return { draftId: input.draftId, status, approvalId };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
}
