import type {
  ActionApprovalAuthorizationRequest,
  ActionApprovalAuthorizer,
} from "./action-approval-authorization.js";
import type { ActionProposal, ApprovalDecisionRecord } from "./action-approval-contracts.js";
import type {
  ActionApprovalAuditContext,
  ActionExecutionClaim,
  ClaimActionExecutionInput,
  PostgresActionApprovalStore,
} from "./postgres-action-approval-store.js";

export interface ActionExecutionDispatchRequest {
  proposal: ActionProposal;
  approvalId: string;
  executionId: string;
  idempotencyKey: string;
  workerId: string;
}

/**
 * Host adapter contract. Implementations must use idempotencyKey for receiver-side
 * deduplication; an ambiguous network outcome must never be treated as proof of failure.
 * This package intentionally supplies no provider or CRM adapter.
 */
export interface ActionExecutionDispatcher {
  dispatch(request: ActionExecutionDispatchRequest): Promise<{ resultHash: string }>;
}

export interface ActionExecutionIndependentControls {
  evaluate(input: {
    proposal: ActionProposal;
    approval: ApprovalDecisionRecord;
    now: string;
  }): Promise<{ allowed: boolean; reasonCode?: string }>;
}

export interface ActionApprovalExecutionServiceOptions {
  store: Pick<PostgresActionApprovalStore, "getProposal" | "getApproval" | "claimExecution" | "finishExecution">;
  authorize: ActionApprovalAuthorizer;
  independentControls: ActionExecutionIndependentControls;
  dispatcher: ActionExecutionDispatcher;
  auditContext: ActionApprovalAuditContext;
  workerId: string;
  /** Must be explicitly true at a separately authorized host composition point. */
  dispatchEnabled?: boolean;
  now?: () => string;
}

export interface ExecuteApprovedActionInput {
  tenantId: string;
  applicationId: string;
  proposalId: string;
  proposalVersion: number;
  approvalId: string;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalNow(now: string): boolean {
  const parsed = Date.parse(now);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === now;
}

/**
 * Rechecks owner policy and independent controls before atomically claiming a
 * proposal. It does not create provider adapters and is disabled by default.
 */
export class ActionApprovalExecutionService {
  private readonly now: () => string;

  constructor(private readonly options: ActionApprovalExecutionServiceOptions) {
    if (!validText(options.workerId) || !/^[A-Za-z0-9._-]{2,128}$/.test(options.workerId)) {
      throw new Error("ACTION_EXECUTION_WORKER_ID_INVALID");
    }
    if (options.auditContext.actorType === "human" ||
        options.auditContext.actorId !== options.workerId ||
        options.auditContext.source !== "job") {
      throw new Error("ACTION_EXECUTION_AUDIT_IDENTITY_INVALID");
    }
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: ExecuteApprovedActionInput): Promise<ActionExecutionClaim> {
    if (this.options.dispatchEnabled !== true) throw new Error("ACTION_EXECUTION_DISABLED");
    if (!validText(input.tenantId) || !validText(input.applicationId) ||
        !validText(input.proposalId) || !validText(input.approvalId) ||
        !Number.isSafeInteger(input.proposalVersion) || input.proposalVersion < 1) {
      throw new Error("ACTION_EXECUTION_INPUT_INVALID");
    }
    const now = this.now();
    if (!canonicalNow(now)) throw new Error("ACTION_EXECUTION_TIMESTAMP_INVALID");

    const scope = {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      proposalId: input.proposalId,
      proposalVersion: input.proposalVersion,
    };
    const proposal = await this.options.store.getProposal(scope);
    if (!proposal) throw new Error("ACTION_PROPOSAL_NOT_FOUND");
    const approval = await this.options.store.getApproval({ ...scope, approvalId: input.approvalId });
    if (!approval) throw new Error("ACTION_APPROVAL_NOT_FOUND");

    const authorization: ActionApprovalAuthorizationRequest = {
      tenantId: proposal.tenantId,
      applicationId: proposal.applicationId,
      actorId: this.options.workerId,
      operation: "execute_proposal",
      proposalId: proposal.proposalId,
      proposalVersion: proposal.proposalVersion,
      proposalHash: proposal.payloadHash,
      approvalId: approval.approvalId,
      approverId: approval.approverId,
      actionType: proposal.actionType,
      sideEffectClass: proposal.sideEffectClass,
      targetType: proposal.targetType,
      targetId: proposal.targetId,
    };
    const permission = await this.options.authorize(authorization);
    if (!permission.allowed) throw new Error("ACTION_EXECUTION_AUTHORIZATION_DENIED");
    if (!validText(permission.policyVersion) || permission.policyVersion !== approval.policyVersion) {
      throw new Error("ACTION_EXECUTION_POLICY_VERSION_MISMATCH");
    }

    const controls = await this.options.independentControls.evaluate({ proposal, approval, now });
    if (!controls.allowed) {
      throw new Error("ACTION_EXECUTION_INDEPENDENT_CONTROL_DENIED:" + (controls.reasonCode ?? "CONTROL_DENIED"));
    }

    // Re-sample after all remote/policy/control I/O. The transactional claim
    // must evaluate expiry and revocation against the time at the claim boundary,
    // not the earlier snapshot used to evaluate independent controls.
    const claimNow = this.now();
    if (!canonicalNow(claimNow)) throw new Error("ACTION_EXECUTION_TIMESTAMP_INVALID");

    const claimInput: ClaimActionExecutionInput = {
      ...this.options.auditContext,
      tenantId: proposal.tenantId,
      applicationId: proposal.applicationId,
      proposalId: proposal.proposalId,
      proposalVersion: proposal.proposalVersion,
      approvalId: approval.approvalId,
      workerId: this.options.workerId,
      authorizationGranted: true,
      auditAvailable: true,
      consentAndIndependentControlsAllowed: true,
      now: claimNow,
    };
    const claim = await this.options.store.claimExecution(claimInput);
    if (claim.status === "succeeded") return claim;
    if (claim.status !== "processing" || claim.workerId !== this.options.workerId) {
      throw new Error("ACTION_EXECUTION_CLAIM_NOT_OWNED");
    }

    // If dispatch has an ambiguous outcome, retain the lease. A recovery worker
    // may retry only with the same idempotency key and an idempotent receiver.
    const dispatched = await this.options.dispatcher.dispatch({
      proposal,
      approvalId: approval.approvalId,
      executionId: claim.executionId,
      idempotencyKey: claim.idempotencyKey,
      workerId: this.options.workerId,
    });
    if (!validText(dispatched.resultHash) || !/^[a-f0-9]{64}$/.test(dispatched.resultHash)) {
      throw new Error("ACTION_EXECUTION_RESULT_HASH_INVALID");
    }
    return this.options.store.finishExecution({
      ...this.options.auditContext,
      tenantId: proposal.tenantId,
      applicationId: proposal.applicationId,
      executionId: claim.executionId,
      workerId: this.options.workerId,
      outcome: "succeeded",
      resultHash: dispatched.resultHash,
      now: this.now(),
    });
  }
}
