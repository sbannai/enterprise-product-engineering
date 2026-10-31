import { createHash } from "node:crypto";

export const ACTION_SIDE_EFFECT_CLASSES = [
  "crm_mutation", "external_communication", "publish", "audience_export",
  "financial_commitment", "other_external_action",
] as const;
export type ActionSideEffectClass = (typeof ACTION_SIDE_EFFECT_CLASSES)[number];
export type ApprovalDecision = "approve" | "reject" | "revoke";
export type ApprovalActorType = "human" | "service" | "system";

export interface ActionProposalEnvelope {
  proposalId: string;
  proposalVersion: number;
  tenantId: string;
  applicationId: string;
  actionType: string;
  sideEffectClass: ActionSideEffectClass;
  targetType: string;
  targetId: string;
  requestedBy: string;
  requesterType: ApprovalActorType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
  correlationId: string;
}

export interface ActionProposal extends ActionProposalEnvelope {
  payloadHash: string;
}

export interface ApprovalDecisionRecord {
  approvalId: string;
  proposalId: string;
  proposalVersion: number;
  proposalHash: string;
  tenantId: string;
  applicationId: string;
  approverId: string;
  approverType: ApprovalActorType;
  decision: ApprovalDecision;
  decidedAt: string;
  expiresAt: string;
  revokedAt?: string;
  policyVersion: string;
}

export interface ActionApprovalGateInput {
  proposal: ActionProposal;
  approval: ApprovalDecisionRecord | null;
  executionScope: { tenantId: string; applicationId: string };
  authorizationGranted: boolean;
  auditAvailable: boolean;
  consentAndIndependentControlsAllowed: boolean;
  now: string;
}

export type ActionApprovalGateResult =
  | { allowed: true; approvalId: string; proposalHash: string }
  | { allowed: false; reason:
      | "PROPOSAL_HASH_INVALID"
      | "PROPOSAL_EXPIRED"
      | "TENANT_SCOPE_MISMATCH"
      | "APPLICATION_SCOPE_MISMATCH"
      | "APPROVAL_MISSING"
      | "APPROVAL_NOT_APPROVED"
      | "HUMAN_APPROVER_REQUIRED"
      | "MAKER_CHECKER_SEPARATION_REQUIRED"
      | "APPROVAL_SCOPE_MISMATCH"
      | "APPROVAL_PROPOSAL_MISMATCH"
      | "APPROVAL_HASH_MISMATCH"
      | "APPROVAL_EXPIRED"
      | "APPROVAL_REVOKED"
      | "AUTHORIZATION_DENIED"
      | "AUDIT_UNAVAILABLE"
      | "INDEPENDENT_CONTROL_DENIED"
      | "INVALID_GATE_TIMESTAMP"
    };

function canonical(value: unknown, seen = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("ACTION_PROPOSAL_PAYLOAD_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("ACTION_PROPOSAL_PAYLOAD_INVALID");
    seen.add(value);
    const result = "[" + value.map((item) => canonical(item, seen)).join(",") + "]";
    seen.delete(value);
    return result;
  }
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) throw new Error("ACTION_PROPOSAL_PAYLOAD_INVALID");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("ACTION_PROPOSAL_PAYLOAD_INVALID");
    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const result = "{" + entries.map(([key, item]) => {
      if (item === undefined) throw new Error("ACTION_PROPOSAL_PAYLOAD_INVALID");
      return JSON.stringify(key) + ":" + canonical(item, seen);
    }).join(",") + "}";
    seen.delete(value);
    return result;
  }
  throw new Error("ACTION_PROPOSAL_PAYLOAD_INVALID");
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/** Hash binds the exact action, target, scope, requester, version and payload. */
export function hashActionProposal(envelope: ActionProposalEnvelope): string {
  validateActionProposalEnvelope(envelope);
  return createHash("sha256").update(canonical({
    proposalId: envelope.proposalId,
    proposalVersion: envelope.proposalVersion,
    tenantId: envelope.tenantId,
    applicationId: envelope.applicationId,
    actionType: envelope.actionType,
    sideEffectClass: envelope.sideEffectClass,
    targetType: envelope.targetType,
    targetId: envelope.targetId,
    requestedBy: envelope.requestedBy,
    requesterType: envelope.requesterType,
    payload: envelope.payload,
    idempotencyKey: envelope.idempotencyKey,
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt,
    correlationId: envelope.correlationId,
  })).digest("hex");
}

export function validateActionProposalEnvelope(value: ActionProposalEnvelope): void {
  if (!value || typeof value !== "object" ||
      !validText(value.proposalId) || !Number.isSafeInteger(value.proposalVersion) || value.proposalVersion < 1 ||
      !validText(value.tenantId) || !validText(value.applicationId) ||
      !validText(value.actionType) || !ACTION_SIDE_EFFECT_CLASSES.includes(value.sideEffectClass) ||
      !validText(value.targetType) || !validText(value.targetId) || !validText(value.requestedBy) ||
      !["human", "service", "system"].includes(value.requesterType) ||
      !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload) ||
      !validText(value.idempotencyKey) || !validText(value.correlationId) ||
      !validTimestamp(value.createdAt) || !validTimestamp(value.expiresAt) ||
      Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    throw new Error("ACTION_PROPOSAL_INVALID");
  }
  canonical(value.payload);
}

/** Returns a deterministic policy decision. It never invokes a dispatcher. */
export function evaluateActionApprovalGate(input: ActionApprovalGateInput): ActionApprovalGateResult {
  const { proposal, approval } = input;
  if (!validTimestamp(input.now)) return { allowed: false, reason: "INVALID_GATE_TIMESTAMP" };
  let expectedHash: string;
  try {
    expectedHash = hashActionProposal(proposal);
  } catch {
    return { allowed: false, reason: "PROPOSAL_HASH_INVALID" };
  }
  if (proposal.payloadHash !== expectedHash) return { allowed: false, reason: "PROPOSAL_HASH_INVALID" };
  const now = Date.parse(input.now);
  if (Date.parse(proposal.expiresAt) <= now) return { allowed: false, reason: "PROPOSAL_EXPIRED" };
  if (input.executionScope.tenantId !== proposal.tenantId) return { allowed: false, reason: "TENANT_SCOPE_MISMATCH" };
  if (input.executionScope.applicationId !== proposal.applicationId) return { allowed: false, reason: "APPLICATION_SCOPE_MISMATCH" };
  if (!approval) return { allowed: false, reason: "APPROVAL_MISSING" };
  if (approval.decision !== "approve") return { allowed: false, reason: "APPROVAL_NOT_APPROVED" };
  if (approval.approverType !== "human" || !validText(approval.approverId)) {
    return { allowed: false, reason: "HUMAN_APPROVER_REQUIRED" };
  }
  if (approval.approverId === proposal.requestedBy) {
    return { allowed: false, reason: "MAKER_CHECKER_SEPARATION_REQUIRED" };
  }
  if (approval.tenantId !== proposal.tenantId) return { allowed: false, reason: "TENANT_SCOPE_MISMATCH" };
  if (approval.applicationId !== proposal.applicationId) return { allowed: false, reason: "APPLICATION_SCOPE_MISMATCH" };
  if (approval.proposalId !== proposal.proposalId || approval.proposalVersion !== proposal.proposalVersion) {
    return { allowed: false, reason: "APPROVAL_PROPOSAL_MISMATCH" };
  }
  if (approval.proposalHash !== expectedHash) return { allowed: false, reason: "APPROVAL_HASH_MISMATCH" };
  if (!validTimestamp(approval.decidedAt) || !validTimestamp(approval.expiresAt) ||
      !validText(approval.policyVersion) || Date.parse(approval.decidedAt) > now) {
    return { allowed: false, reason: "APPROVAL_EXPIRED" };
  }
  if (approval.revokedAt && validTimestamp(approval.revokedAt) && Date.parse(approval.revokedAt) <= now) {
    return { allowed: false, reason: "APPROVAL_REVOKED" };
  }
  if (Date.parse(approval.expiresAt) <= now) return { allowed: false, reason: "APPROVAL_EXPIRED" };
  if (!input.authorizationGranted) return { allowed: false, reason: "AUTHORIZATION_DENIED" };
  if (!input.auditAvailable) return { allowed: false, reason: "AUDIT_UNAVAILABLE" };
  if (!input.consentAndIndependentControlsAllowed) return { allowed: false, reason: "INDEPENDENT_CONTROL_DENIED" };
  return { allowed: true, approvalId: approval.approvalId, proposalHash: expectedHash };
}
