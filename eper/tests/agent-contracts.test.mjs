import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateAgentJobRequest,
  requiresHumanApproval,
  assertApprovalAllowed,
} from "../dist/packages/agents/agent-contracts.js";

const validRequest = () => ({
  applicationId: "growth-hub",
  agentId: "crm",
  intent: "lead-qualification",
  input: { objective: "Review lead fit" },
  idempotencyKey: "agent-job-key-0001",
});

test("agent job request accepts valid scoped transport contract", () => {
  const parsed = validateCreateAgentJobRequest(validRequest());
  assert.equal(parsed.applicationId, "growth-hub");
  assert.equal(parsed.agentId, "crm");
  assert.equal(parsed.deadlineSeconds, 120);
});

test("agent job request rejects unsupported agent, invalid idempotency key and oversized deadline", () => {
  assert.throws(() => validateCreateAgentJobRequest({ ...validRequest(), agentId: "finance" }), /INVALID_AGENT_ID/);
  assert.throws(() => validateCreateAgentJobRequest({ ...validRequest(), idempotencyKey: "short" }), /INVALID_IDEMPOTENCY_KEY/);
  assert.throws(() => validateCreateAgentJobRequest({ ...validRequest(), deadlineSeconds: 901 }), /INVALID_DEADLINE/);
});

test("agent job request rejects caller-supplied non-object input", () => {
  assert.throws(() => validateCreateAgentJobRequest({ ...validRequest(), input: [] }), /INVALID_INPUT/);
});

test("side-effect tools require human approval while read-only tools do not", () => {
  assert.equal(requiresHumanApproval("none"), false);
  assert.equal(requiresHumanApproval("crm_mutation"), true);
  assert.equal(requiresHumanApproval("external_send"), true);
  assert.equal(requiresHumanApproval("publish"), true);
});

test("approval requires a different reviewer and exact current draft version/hash", () => {
  const base = {
    createdBy: "maker-1",
    reviewerId: "reviewer-2",
    currentVersion: 3,
    requestedVersion: 3,
    currentContentHash: "sha256:current",
    requestedContentHash: "sha256:current",
  };
  assert.doesNotThrow(() => assertApprovalAllowed(base));
  assert.throws(() => assertApprovalAllowed({ ...base, reviewerId: "maker-1" }), /MAKER_CHECKER_SEPARATION_REQUIRED/);
  assert.throws(() => assertApprovalAllowed({ ...base, requestedVersion: 2 }), /STALE_DRAFT_VERSION/);
  assert.throws(() => assertApprovalAllowed({ ...base, requestedContentHash: "sha256:old" }), /STALE_DRAFT_HASH/);
});
