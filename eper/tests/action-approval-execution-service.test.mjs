import test from "node:test";
import assert from "node:assert/strict";
import { hashActionProposal } from "../dist/packages/approvals/action-approval-contracts.js";
import { ActionApprovalExecutionService } from "../dist/packages/approvals/action-approval-execution-service.js";

const now = "2026-10-31T16:00:00.000Z";
const envelope = {
  proposalId: "proposal-exec-01", proposalVersion: 1, tenantId: "tenant-exec",
  applicationId: "application-exec", actionType: "crm.contact.update",
  sideEffectClass: "crm_mutation", targetType: "contact", targetId: "contact-01",
  requestedBy: "requester-01", requesterType: "human",
  payload: { displayName: "Updated" }, idempotencyKey: "execution-idempotency-key-01",
  createdAt: "2026-10-31T15:00:00.000Z", expiresAt: "2026-10-31T18:00:00.000Z",
  correlationId: "correlation-exec-01",
};
const proposal = { ...envelope, payloadHash: hashActionProposal(envelope) };
const approval = {
  approvalId: "approval-exec-01", proposalId: proposal.proposalId,
  proposalVersion: proposal.proposalVersion, proposalHash: proposal.payloadHash,
  tenantId: proposal.tenantId, applicationId: proposal.applicationId,
  approverId: "approver-01", approverType: "human", decision: "approve",
  decidedAt: "2026-10-31T15:10:00.000Z", expiresAt: "2026-10-31T17:00:00.000Z",
  policyVersion: "owner-policy-v1",
};
const auditContext = {
  tenantId: proposal.tenantId, applicationId: proposal.applicationId,
  actorId: "worker-exec-01", actorType: "service", environment: "sandbox",
  source: "job", operationName: "action-approval.execution", correlationId: "correlation-exec-01",
};

function fixture(overrides = {}) {
  const calls = [];
  const claim = {
    executionId: "execution-01", approvalId: approval.approvalId,
    proposalId: proposal.proposalId, proposalVersion: 1, proposalHash: proposal.payloadHash,
    idempotencyKey: proposal.idempotencyKey, status: "processing", attemptCount: 1,
    workerId: "worker-exec-01", leaseExpiresAt: "2026-10-31T16:01:00.000Z", resultHash: null,
  };
  const store = {
    async getProposal() { calls.push("proposal"); return proposal; },
    async getApproval() { calls.push("approval"); return approval; },
    async claimExecution(input) { calls.push("claim"); calls.push(input); return claim; },
    async finishExecution(input) {
      calls.push("finish"); calls.push(input);
      return { ...claim, status: "succeeded", leaseExpiresAt: null, resultHash: input.resultHash };
    },
  };
  const options = {
    store,
    authorize: async request => { calls.push("authorize"); calls.push(request); return { allowed: true, policyVersion: "owner-policy-v1" }; },
    independentControls: { async evaluate() { calls.push("controls"); return { allowed: true }; } },
    dispatcher: { async dispatch(request) { calls.push("dispatch"); calls.push(request); return { resultHash: "a".repeat(64) }; } },
    auditContext, workerId: "worker-exec-01", dispatchEnabled: true, now: () => now,
    ...overrides,
  };
  return { service: new ActionApprovalExecutionService(options), calls, claim };
}

test("execution is disabled unless host composition explicitly enables dispatch", async () => {
  const { service, calls } = fixture({ dispatchEnabled: false });
  await assert.rejects(() => service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  }), /ACTION_EXECUTION_DISABLED/);
  assert.deepEqual(calls, []);
});

test("rechecks owner policy and independent controls before claiming and dispatching", async () => {
  const { service, calls } = fixture();
  const result = await service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(calls.filter(item => typeof item === "string"),
    ["proposal", "approval", "authorize", "controls", "claim", "dispatch", "finish"]);
  const authorization = calls.find(item => item && item.operation === "execute_proposal");
  assert.equal(authorization.proposalHash, proposal.payloadHash);
  assert.equal(authorization.approvalId, approval.approvalId);
  assert.equal(authorization.approverId, approval.approverId);
  const dispatch = calls.find(item => item && item.executionId === "execution-01");
  assert.equal(dispatch.idempotencyKey, proposal.idempotencyKey);
});

test("denied owner policy prevents claim and dispatch", async () => {
  const { service, calls } = fixture({
    authorize: async () => ({ allowed: false, reasonCode: "OWNER_POLICY_DENIED" }),
  });
  await assert.rejects(() => service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  }), /ACTION_EXECUTION_AUTHORIZATION_DENIED/);
  assert.equal(calls.includes("claim"), false);
  assert.equal(calls.includes("dispatch"), false);
});

test("policy version drift prevents claim and dispatch", async () => {
  const { service, calls } = fixture({
    authorize: async () => ({ allowed: true, policyVersion: "new-owner-policy-v2" }),
  });
  await assert.rejects(() => service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  }), /ACTION_EXECUTION_POLICY_VERSION_MISMATCH/);
  assert.equal(calls.includes("claim"), false);
  assert.equal(calls.includes("dispatch"), false);
});

test("independent control denial prevents claim and dispatch", async () => {
  const { service, calls } = fixture({
    independentControls: { async evaluate() { return { allowed: false, reasonCode: "CONSENT_REVOKED" }; } },
  });
  await assert.rejects(() => service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  }), /ACTION_EXECUTION_INDEPENDENT_CONTROL_DENIED:CONSENT_REVOKED/);
  assert.equal(calls.includes("claim"), false);
  assert.equal(calls.includes("dispatch"), false);
});

test("execution claim uses a fresh timestamp after authorization and controls", async () => {
  const timestamps = [
    "2026-10-31T16:00:00.000Z",
    "2026-10-31T16:05:00.000Z",
    "2026-10-31T16:05:01.000Z",
  ];
  const { service, calls } = fixture({ now: () => timestamps.shift() });
  await service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  });
  const claimInput = calls.find(item => item && item.operationName === "action-approval.execution" && item.now);
  assert.equal(claimInput.now, "2026-10-31T16:05:00.000Z");
});


test("already-succeeded idempotent claim returns without dispatch", async () => {
  const { service, calls, claim } = fixture({
    store: {
      async getProposal() { calls.push("proposal"); return proposal; },
      async getApproval() { calls.push("approval"); return approval; },
      async claimExecution() {
        calls.push("claim");
        return { ...claim, status: "succeeded", leaseExpiresAt: null, resultHash: "b".repeat(64) };
      },
      async finishExecution() { calls.push("finish"); throw new Error("must_not_finish"); },
    },
  });
  const result = await service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  });
  assert.equal(result.status, "succeeded");
  assert.equal(calls.includes("dispatch"), false);
  assert.equal(calls.includes("finish"), false);
});

test("claim owned by another worker prevents dispatch", async () => {
  const { service, calls, claim } = fixture({
    store: {
      async getProposal() { calls.push("proposal"); return proposal; },
      async getApproval() { calls.push("approval"); return approval; },
      async claimExecution() { calls.push("claim"); return { ...claim, workerId: "worker-other" }; },
      async finishExecution() { calls.push("finish"); throw new Error("must_not_finish"); },
    },
  });
  await assert.rejects(() => service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  }), /ACTION_EXECUTION_CLAIM_NOT_OWNED/);
  assert.equal(calls.includes("dispatch"), false);
  assert.equal(calls.includes("finish"), false);
});

test("ambiguous dispatcher failure retains claim and does not mark execution failed", async () => {
  const { service, calls } = fixture({
    dispatcher: {
      async dispatch() {
        calls.push("dispatch");
        throw new Error("AMBIGUOUS_PROVIDER_OUTCOME");
      },
    },
  });
  await assert.rejects(() => service.execute({
    tenantId: proposal.tenantId, applicationId: proposal.applicationId,
    proposalId: proposal.proposalId, proposalVersion: 1, approvalId: approval.approvalId,
  }), /AMBIGUOUS_PROVIDER_OUTCOME/);
  assert.equal(calls.includes("claim"), true);
  assert.equal(calls.includes("finish"), false);
});
