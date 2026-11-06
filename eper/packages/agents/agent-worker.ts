import type { AuditEnvironment } from "../audit/audit-event-store.js";
import { buildAgentDraft } from "./agent-workflows.js";
import { PostgresAgentStore } from "./postgres-agent-store.js";

export interface AgentWorkerOptions {
  store: PostgresAgentStore;
  tenantId: string;
  applicationId: string;
  workerId: string;
  environment: AuditEnvironment;
  leaseSeconds?: number;
  maxAttempts?: number;
  draftRetentionHours?: number;
}

/**
 * Processes at most one queued job and returns immediately when the queue is empty.
 * Intended for a bounded worker loop/scheduler; it never holds an HTTP request open.
 * No external provider, CRM mutation, send, or publish tool is invoked here.
 */
export async function processAgentJobOnce(options: AgentWorkerOptions): Promise<
  | { outcome: "idle" }
  | { outcome: "draft_created"; jobId: string; draftId: string; contentHash: string }
  | { outcome: "retry_scheduled"; jobId: string; retryAt?: string }
  | { outcome: "failed"; jobId: string; failureCode: string }
> {
  const job = await options.store.claimNextJob({
    tenantId: options.tenantId,
    applicationId: options.applicationId,
    workerId: options.workerId,
    environment: options.environment,
    leaseSeconds: options.leaseSeconds,
  });
  if (!job) return { outcome: "idle" };

  try {
    if (!job.input || typeof job.input !== "object" || Array.isArray(job.input)) {
      throw new Error("AGENT_JOB_INPUT_INVALID");
    }
    const payload = buildAgentDraft(job.agentId, job.intent, job.input);
    const retentionHours = options.draftRetentionHours ?? 168;
    if (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 2160) {
      throw new Error("AGENT_DRAFT_RETENTION_POLICY_INVALID");
    }
    const saved = await options.store.persistDraft({
      tenantId: job.tenantId,
      applicationId: job.applicationId,
      jobId: job.jobId,
      agentId: job.agentId,
      intent: job.intent,
      payload,
      sourceReferences: [],
      validationFindings: [],
      createdBy: job.requestedBy,
      expiresAt: new Date(Date.now() + retentionHours * 60 * 60 * 1000).toISOString(),
      correlationId: "agent-worker-" + job.jobId,
      environment: options.environment,
    });
    return { outcome: "draft_created", jobId: job.jobId, draftId: saved.draftId, contentHash: saved.contentHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AGENT_WORKER_UNEXPECTED_FAILURE";
    const failureCode = /^[A-Z0-9_:-]{2,80}$/.test(message) ? message : "AGENT_WORKER_UNEXPECTED_FAILURE";
    const result = await options.store.failOrRetryJob({
      tenantId: job.tenantId,
      applicationId: job.applicationId,
      jobId: job.jobId,
      workerId: options.workerId,
      failureCode,
      retryable: failureCode !== "AGENT_INTENT_UNSUPPORTED" && failureCode !== "AGENT_JOB_INPUT_INVALID" && failureCode !== "AGENT_DRAFT_RETENTION_POLICY_INVALID",
      maxAttempts: options.maxAttempts,
      environment: options.environment,
      correlationId: "agent-worker-" + job.jobId,
    });
    return result.status === "queued"
      ? { outcome: "retry_scheduled", jobId: job.jobId, retryAt: result.retryAt }
      : { outcome: "failed", jobId: job.jobId, failureCode };
  }
}
