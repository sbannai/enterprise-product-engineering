import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const envKeys = [
  "EPER_ACTION_APPROVAL_API_ENABLED",
  "EPER_ACTION_APPROVAL_PERSISTENCE",
  "EPER_ADMIN_CONFIG_API_ENABLED",
  "EPER_ADMIN_CONFIG_PERSISTENCE",
  "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
  "EPER_AUDIT_PERSISTENCE",
  "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
];

function saveEnvironment() {
  return Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
}
function restoreEnvironment(previous) {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}
function configureEnvironment() {
  const token = "action-approval-api-test-token-000000000000000001";
  process.env.EPER_ACTION_APPROVAL_API_ENABLED = "true";
  process.env.EPER_ACTION_APPROVAL_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a" },
  });
  return token;
}
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return "http://127.0.0.1:" + address.port;
}

test("action approval API derives tenant and actor from trusted identity and delegates policy decisions", async () => {
  const previous = saveEnvironment();
  const token = configureEnvironment();
  const proposalExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const approvalExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const proposal = {
    proposalId: "proposal-1", proposalVersion: 1, tenantId: "tenant-a", applicationId: "app-a",
    actionType: "crm.contact.update", sideEffectClass: "crm_mutation",
    targetType: "contact", targetId: "contact-1", requestedBy: "requester-a",
    requesterType: "human", payload: { name: "New name" }, payloadHash: "a".repeat(64),
    idempotencyKey: "approval-api-idempotency-01", createdAt: "2026-10-31T10:00:00.000Z",
    expiresAt: proposalExpiresAt, correlationId: "request-1",
  };
  const calls = { created: [], decisions: [], authorizations: [] };
  const store = {
    async listProposals(scope, limit) { return [{ proposal, status: "pending" }]; },
    async createProposal(value, audit) { calls.created.push({ value, audit }); return { proposal: value, replayed: false }; },
    async getProposal(scope) { return scope.proposalId === proposal.proposalId ? proposal : null; },
    async recordDecision(input) {
      calls.decisions.push(input);
      return { decisionId: "decision-1", approvalId: input.approvalId ?? null, decision: input.decision };
    },
  };
  const authorizer = async request => {
    calls.authorizations.push(request);
    if (request.operation === "create_proposal") {
      return { allowed: true, proposalExpiresAt };
    }
    if (request.operation === "approve_proposal") {
      return { allowed: true, policyVersion: "owner-policy-v1", approvalExpiresAt };
    }
    return { allowed: true, policyVersion: "owner-policy-v1" };
  };
  const server = createAppServer({
    actionApprovalStore: store,
    actionApprovalAuthorizer: authorizer,
    tenantApplicationAssignmentStore: { async listActive(tenantId) { assert.equal(tenantId, "tenant-a"); return ["app-a"]; } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, applicationId) {
      assert.deepEqual([tenantId, actorId, applicationId], ["tenant-a", "admin-a", "app-a"]);
      return true;
    } },
  });
  try {
    const base = await listen(server);
    const path = base + "/admin/applications/app-a/action-proposals";
    const unauthenticated = await fetch(path);
    assert.equal(unauthenticated.status, 401);
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const queue = await fetch(path, { headers });
    assert.equal(queue.status, 200);
    assert.equal((await queue.json()).data.proposals[0].status, "pending");

    const body = {
      actionType: "crm.contact.update", sideEffectClass: "crm_mutation",
      targetType: "contact", targetId: "contact-2", payload: { name: "Approved name" },
      idempotencyKey: "approval-api-idempotency-02",
    };
    const created = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(created.status, 201);
    assert.equal(calls.created.length, 1);
    assert.equal(calls.created[0].value.tenantId, "tenant-a");
    assert.equal(calls.created[0].value.requestedBy, "admin-a");
    assert.equal(calls.created[0].value.applicationId, "app-a");
    assert.ok(calls.created[0].value.payloadHash);

    const detail = await fetch(path + "/proposal-1", { headers });
    assert.equal(detail.status, 200);

    const decision = await fetch(path + "/proposal-1/decisions", {
      method: "POST", headers, body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(decision.status, 201);
    assert.equal(calls.decisions.length, 1);
    assert.equal(calls.decisions[0].decision, "approve");
    assert.equal(calls.decisions[0].actorId, "admin-a");
    assert.equal(calls.decisions[0].policyVersion, "owner-policy-v1");
    assert.equal(calls.decisions[0].expiresAt, approvalExpiresAt);
    assert.equal(typeof calls.decisions[0].approvalId, "string");
    const approvalAuthorization = calls.authorizations.find(item => item.operation === "approve_proposal");
    assert.equal(typeof approvalAuthorization.proposalHash, "string");
    const revoked = await fetch(path + "/proposal-1/decisions", {
      method: "POST", headers, body: JSON.stringify({ decision: "revoke", approvalId: "approval-existing" }),
    });
    assert.equal(revoked.status, 201);
    const revokeAuthorization = calls.authorizations.find(item => item.operation === "revoke_approval");
    assert.equal(revokeAuthorization.approvalId, "approval-existing");
    assert.equal(calls.decisions.length, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
    restoreEnvironment(previous);
  }
});

test("action approval API fails closed when host authorization policy denies a decision", async () => {
  const previous = saveEnvironment();
  const token = configureEnvironment();
  const calls = [];
  const proposal = {
    proposalId: "proposal-2", proposalVersion: 1, tenantId: "tenant-a", applicationId: "app-a",
    actionType: "external.communication.send", sideEffectClass: "external_communication",
    targetType: "recipient", targetId: "recipient-1", requestedBy: "requester",
    requesterType: "human", payload: { message: "hello" }, payloadHash: "b".repeat(64),
    idempotencyKey: "approval-api-idempotency-03", createdAt: "2026-10-31T10:00:00.000Z",
    expiresAt: "2026-11-01T10:00:00.000Z", correlationId: "request-2",
  };
  const server = createAppServer({
    actionApprovalStore: {
      async getProposal() { return proposal; },
      async recordDecision(input) { calls.push(input); return {}; },
    },
    actionApprovalAuthorizer: async () => ({ allowed: false, reasonCode: "OWNER_POLICY_DENIED" }),
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    actorApplicationAssignmentStore: { async isAssigned() { return true; } },
  });
  try {
    const base = await listen(server);
    const response = await fetch(base + "/admin/applications/app-a/action-proposals/proposal-2/decisions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    restoreEnvironment(previous);
  }
});

test("action approval API remains hidden when its feature flag is disabled", async () => {
  const previous = saveEnvironment();
  const token = configureEnvironment();
  delete process.env.EPER_ACTION_APPROVAL_API_ENABLED;
  const server = createAppServer({
    tenantApplicationAssignmentStore: {}, actorApplicationAssignmentStore: {},
  });
  try {
    const base = await listen(server);
    const response = await fetch(base + "/admin/applications/app-a/action-proposals", {
      headers: { authorization: "Bearer " + token },
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    restoreEnvironment(previous);
  }
});

test("action approval API startup requires a host authorizer and durable persistence", () => {
  const previous = saveEnvironment();
  configureEnvironment();
  try {
    assert.throws(() => createAppServer({
      tenantApplicationAssignmentStore: {}, actorApplicationAssignmentStore: {},
    }), /ACTION_APPROVAL_API_REQUIRES_POSTGRES_AUDIT_ASSIGNMENTS_AND_HOST_AUTHORIZER/);
  } finally {
    restoreEnvironment(previous);
  }
});
