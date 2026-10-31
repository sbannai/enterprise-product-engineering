/**
 * Host-owned authorization contract for action proposal review.
 *
 * EPER deliberately does not invent canonical approver roles, delegation,
 * thresholds, dual-control policy or approval validity. The host must supply
 * this policy callback. Missing/denied policy always fails closed.
 */
export type ActionApprovalAuthorizationOperation =
  | "view_queue"
  | "view_proposal"
  | "create_proposal"
  | "approve_proposal"
  | "reject_proposal"
  | "revoke_approval";

export interface ActionApprovalAuthorizationRequest {
  tenantId: string;
  applicationId: string;
  actorId: string;
  operation: ActionApprovalAuthorizationOperation;
  proposalId?: string;
  proposalVersion?: number;
  proposalHash?: string;
  approvalId?: string;
  actionType?: string;
  sideEffectClass?: string;
  targetType?: string;
  targetId?: string;
}

export type ActionApprovalAuthorizationResult =
  | { allowed: false; reasonCode?: string }
  | {
      allowed: true;
      /** Required for every decision; identifies the owner-approved policy snapshot. */
      policyVersion?: string;
      /** Required for proposal creation; calculated by host policy, never client supplied. */
      proposalExpiresAt?: string;
      /** Required for approval grants; calculated by host policy, never client supplied. */
      approvalExpiresAt?: string;
    };

export type ActionApprovalAuthorizer = (
  request: ActionApprovalAuthorizationRequest,
) => Promise<ActionApprovalAuthorizationResult>;
