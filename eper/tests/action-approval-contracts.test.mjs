import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateActionApprovalGate,
  hashActionProposal,
} from "../dist/packages/approvals/action-approval-contracts.js";

const baseEnvelope = {
  proposalId: "proposal-001",
  proposalVersion: 1,
  tenantId: "tenant-01",
  applicationId: "app-01",
  actionType: "crm.contact.update",
  sideEffectClass: "crm_mutation",
  targetType: "contact",
  targetId: "contact-99",
  requestedBy: "human-requester",
  requesterType: "human",
  payload: { name: "Updated name", fields: ["name", "title"] },
  idempotencyKey: "idem-proposal-001",
  createdAt: "2026-10-31T10:00:00.000Z",
  expiresAt: "2026-10-31T12:00:00.000Z",
  correlationId: "corr-001",
};

function fixture(overrides = {}) {
  const envelope = { ...baseEnvelope, ...overrides };
  const proposal = { ...envelope, payloadHash: hashActionProposal(envelope) };
  const approval = {
    approvalId: "approval-001",
    proposalId: proposal.proposalId,
    proposalVersion: proposal.proposalVersion,
    proposalHash: proposal.payloadHash,
    tenantId: proposal.tenantId,
    applicationId: proposal.applicationId,
    approverId: "human-approver",
    approverType: "human",
    decision: "approve",
    decidedAt: "2026-10-31T10:30:00.000Z",
    expiresAt: "2026-10-31T11:30:00.000Z",
    policyVersion: "policy-v1",
  };
  return { proposal, approval };
}

function evaluate(overrides = {}) {
  const { proposal, approval } = fixture();
  return evaluateActionApprovalGate({
    proposal,
    approval,
    executionScope: { tenantId: proposal.tenantId, applicationId: proposal.applicationId },
    authorizationGranted: true,
    auditAvailable: true,
    consentAndIndependentControlsAllowed: true,
    now: "2026-10-31T11:00:00.000Z",
    ...overrides,
  });
}

test("allows a valid, separately approved, in-scope proposal", () => {
  const result = evaluate();
  assert.equal(result.allowed, true);
  if (result.allowed) assert.equal(result.approvalId, "approval-001");
});

test("hash is stable across object key order and binds action/target/scope", () => {
  const a = { ...baseEnvelope, payload: { first: 1, second: 2 } };
  const b = { ...baseEnvelope, payload: { second: 2, first: 1 } };
  assert.equal(hashActionProposal(a), hashActionProposal(b));
  assert.notEqual(hashActionProposal(a), hashActionProposal({ ...a, targetId: "other-target" }));
  assert.notEqual(hashActionProposal(a), hashActionProposal({ ...a, tenantId: "other-tenant" }));
  assert.notEqual(hashActionProposal(a), hashActionProposal({ ...a, actionType: "crm.contact.delete" }));
});

test("rejects a tampered payload hash", () => {
  const { proposal, approval } = fixture();
  proposal.payloadHash = "0".repeat(64);
  assert.deepEqual(evaluate({ proposal, approval }).reason, "PROPOSAL_HASH_INVALID");
});

test("rejects maker-checker self approval", () => {
  const { proposal, approval } = fixture();
  approval.approverId = proposal.requestedBy;
  assert.equal(evaluate({ proposal, approval }).reason, "MAKER_CHECKER_SEPARATION_REQUIRED");
});

test("rejects service and system approvers", () => {
  const { proposal, approval } = fixture();
  approval.approverType = "service";
  assert.equal(evaluate({ proposal, approval }).reason, "HUMAN_APPROVER_REQUIRED");
});

test("rejects missing, rejected and revoked approvals", () => {
  const { proposal, approval } = fixture();
  assert.equal(evaluate({ proposal, approval: null }).reason, "APPROVAL_MISSING");
  assert.equal(evaluate({ proposal, approval: { ...approval, decision: "reject" } }).reason, "APPROVAL_NOT_APPROVED");
  assert.equal(evaluate({ proposal, approval: { ...approval, revokedAt: "2026-10-31T10:45:00.000Z" } }).reason, "APPROVAL_REVOKED");
  assert.equal(evaluate({ proposal, approval: { ...approval, revokedAt: "not-a-date" } }).reason, "APPROVAL_REVOKED");
  assert.equal(evaluate({ proposal, approval: { ...approval, approvalId: "" } }).reason, "APPROVAL_ID_REQUIRED");
});

test("rejects approval for another proposal version or payload hash", () => {
  const { proposal, approval } = fixture();
  assert.equal(evaluate({ proposal, approval: { ...approval, proposalVersion: 2 } }).reason, "APPROVAL_PROPOSAL_MISMATCH");
  assert.equal(evaluate({ proposal, approval: { ...approval, proposalHash: "f".repeat(64) } }).reason, "APPROVAL_HASH_MISMATCH");
});

test("rejects cross-tenant and cross-application execution scopes", () => {
  const { proposal, approval } = fixture();
  assert.equal(evaluate({ proposal, approval, executionScope: { tenantId: "tenant-02", applicationId: proposal.applicationId } }).reason, "TENANT_SCOPE_MISMATCH");
  assert.equal(evaluate({ proposal, approval, executionScope: { tenantId: proposal.tenantId, applicationId: "app-02" } }).reason, "APPLICATION_SCOPE_MISMATCH");
});

test("fails closed for expired proposal, expired approval and unavailable controls", () => {
  const { proposal, approval } = fixture();
  assert.equal(evaluate({ proposal, approval, now: "2026-10-31T12:00:00.000Z" }).reason, "PROPOSAL_EXPIRED");
  assert.equal(evaluate({ proposal, approval: { ...approval, expiresAt: "2026-10-31T10:59:59.000Z" } }).reason, "APPROVAL_EXPIRED");
  assert.equal(evaluate({ proposal, approval, authorizationGranted: false }).reason, "AUTHORIZATION_DENIED");
  assert.equal(evaluate({ proposal, approval, auditAvailable: false }).reason, "AUDIT_UNAVAILABLE");
  assert.equal(evaluate({ proposal, approval, consentAndIndependentControlsAllowed: false }).reason, "INDEPENDENT_CONTROL_DENIED");
});

test("rejects malformed payloads and invalid gate time", () => {
  assert.throws(() => hashActionProposal({ ...baseEnvelope, payload: { bad: undefined } }), /ACTION_PROPOSAL_PAYLOAD_INVALID/);
  const { proposal, approval } = fixture();
  assert.equal(evaluate({ proposal, approval, now: "not-a-date" }).reason, "INVALID_GATE_TIMESTAMP");
});
