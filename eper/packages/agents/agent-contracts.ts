export const AGENT_KINDS = ["crm", "sales", "marketing"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const AGENT_JOB_STATUSES = [
  "queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled",
] as const;
export type AgentJobStatus = (typeof AGENT_JOB_STATUSES)[number];

export const AGENT_DRAFT_STATUSES = [
  "pending_approval", "approved", "rejected", "expired",
] as const;
export type AgentDraftStatus = (typeof AGENT_DRAFT_STATUSES)[number];

export type AgentRiskClass = "read_only" | "draft_only" | "crm_write" | "external_communication" | "publish" | "financial_commitment";
export type AgentSideEffect = "none" | "crm_mutation" | "external_send" | "publish" | "audience_export" | "financial_commitment";

export interface AgentJob {
  jobId: string;
  tenantId: string;
  applicationId: string;
  requestedBy: string;
  agentId: AgentKind;
  intent: string;
  status: AgentJobStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  attempt: number;
  failureCode?: string;
  resultRef?: string;
}

export interface AgentDraft {
  draftId: string;
  tenantId: string;
  applicationId: string;
  jobId: string;
  agentId: AgentKind;
  intent: string;
  status: AgentDraftStatus;
  payload: Record<string, unknown>;
  sourceReferences: AgentSourceReference[];
  validationFindings: AgentValidationFinding[];
  contentHash: string;
  version: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface AgentSourceReference {
  sourceType: "crm_record" | "approved_asset" | "analytics_report" | "user_context";
  sourceId?: string;
  label: string;
  observedAt?: string;
}

export interface AgentValidationFinding {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
}

export interface AgentApprovalDecision {
  approvalId: string;
  tenantId: string;
  applicationId: string;
  draftId: string;
  draftVersion: number;
  contentHash: string;
  action: "approve" | "reject";
  actorId: string;
  actorRole: string;
  note?: string;
  decidedAt: string;
}

export interface AgentToolDefinition {
  toolId: string;
  version: number;
  inputSchemaVersion: string;
  requiredPermission: string;
  riskClass: AgentRiskClass;
  sideEffect: AgentSideEffect;
  timeoutMs: number;
  requiresHumanApproval: boolean;
  requiresDurableAudit: true;
  enabled: boolean;
}

export interface AgentConfiguration {
  tenantId: string;
  applicationId: string;
  environment: "development" | "test" | "uat" | "production";
  schemaVersion: number;
  version: number;
  enabledAgents: AgentKind[];
  enabledIntents: Partial<Record<AgentKind, string[]>>;
  providerMode: "template_only" | "provider_neutral";
  retentionDays: number;
  permittedToolIds: string[];
  approvalRequiredFor: AgentSideEffect[];
  updatedBy: string;
  updatedAt: string;
}

/** HTTP 202 job-creation request. Tenant/actor scope must be injected from trusted auth, not accepted here. */
export interface CreateAgentJobRequest {
  applicationId: string;
  agentId: AgentKind;
  intent: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  deadlineSeconds?: number;
}

export type AgentContractErrorCode =
  | "INVALID_AGENT_ID"
  | "INVALID_INTENT"
  | "INVALID_APPLICATION_ID"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_INPUT"
  | "INVALID_DEADLINE"
  | "HUMAN_APPROVAL_REQUIRED"
  | "MAKER_CHECKER_SEPARATION_REQUIRED"
  | "STALE_DRAFT_VERSION"
  | "STALE_DRAFT_HASH";

/**
 * Validates the transport shape only. Authorization, tenant/application assignment,
 * intent allowlists and source-data access must be checked separately on the server.
 */
export function validateCreateAgentJobRequest(value: unknown): CreateAgentJobRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const input = value as Record<string, unknown>;
  if (typeof input.applicationId !== "string" || !/^[a-zA-Z0-9._-]{2,100}$/.test(input.applicationId)) {
    throw new Error("INVALID_APPLICATION_ID");
  }
  if (typeof input.agentId !== "string" || !AGENT_KINDS.includes(input.agentId as AgentKind)) {
    throw new Error("INVALID_AGENT_ID");
  }
  if (typeof input.intent !== "string" || !/^[a-z][a-z0-9-]{1,79}$/.test(input.intent)) {
    throw new Error("INVALID_INTENT");
  }
  if (typeof input.idempotencyKey !== "string" || !/^[a-zA-Z0-9._:-]{16,128}$/.test(input.idempotencyKey)) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  if (!input.input || typeof input.input !== "object" || Array.isArray(input.input)) {
    throw new Error("INVALID_INPUT");
  }
  const deadlineSeconds = input.deadlineSeconds === undefined ? 120 : input.deadlineSeconds;
  if (typeof deadlineSeconds !== "number" || !Number.isInteger(deadlineSeconds) || deadlineSeconds < 1 || deadlineSeconds > 900) {
    throw new Error("INVALID_DEADLINE");
  }
  return {
    applicationId: input.applicationId,
    agentId: input.agentId as AgentKind,
    intent: input.intent,
    input: input.input as Record<string, unknown>,
    idempotencyKey: input.idempotencyKey,
    deadlineSeconds,
  };
}

/** Risk policy is deny-by-default: any side effect requires a human approval. */
export function requiresHumanApproval(sideEffect: AgentSideEffect): boolean {
  return sideEffect !== "none";
}

/** A draft may only be approved by a different principal and for the exact current version/hash. */
export function assertApprovalAllowed(input: {
  createdBy: string;
  reviewerId: string;
  currentVersion: number;
  requestedVersion: number;
  currentContentHash: string;
  requestedContentHash: string;
}): void {
  if (!input.reviewerId || input.reviewerId === input.createdBy) {
    throw new Error("MAKER_CHECKER_SEPARATION_REQUIRED");
  }
  if (input.requestedVersion !== input.currentVersion) throw new Error("STALE_DRAFT_VERSION");
  if (!input.requestedContentHash || input.requestedContentHash !== input.currentContentHash) {
    throw new Error("STALE_DRAFT_HASH");
  }
}
