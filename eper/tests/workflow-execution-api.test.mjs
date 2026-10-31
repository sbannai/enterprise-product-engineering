import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("workflow execution API is opt-in and derives identity from trusted credentials", async () => {
  const keys = ["EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-customer-api-test-token-00000000000001";
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "operator", applicationIds: ["app-a"] },
  });
  const calls = [];
  const workflowExecutionService = {
    async start(input) {
      calls.push(input);
      return { instanceId: "11111111-1111-4111-8111-111111111111", tenantId: input.tenantId, applicationId: input.applicationId };
    },
    async transition(input) { calls.push(input); return { instanceId: input.instanceId }; },
  };
  const server = createAppServer({ workflowExecutionService });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port;
    const path = "/customer/applications/app-a/workflows/onboarding/instances";
    assert.equal((await fetch(url + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const spoofed = await fetch(url + path, { method: "POST", headers,
      body: JSON.stringify({ idempotencyKey: "start-1", tenantId: "tenant-b", actorId: "actor-b" }) });
    assert.equal(spoofed.status, 400);
    assert.equal(calls.length, 0);
    const started = await fetch(url + path, { method: "POST", headers,
      body: JSON.stringify({ idempotencyKey: "start-1", businessReference: "CASE-1", data: { title: "New case" } }) });
    assert.equal(started.status, 200);
    assert.equal(calls[0].tenantId, "tenant-a");
    assert.equal(calls[0].actorId, "actor-a");
    assert.equal(calls[0].applicationId, "app-a");
    assert.equal(calls[0].workflowId, "onboarding");
    const disabled = await fetch(url + "/customer/applications/app-a/workflows/onboarding/instances", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(disabled.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});


test("workflow administration requires both tenant ownership and active administrator application assignment", async () => {
  const keys = ["EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-admin-api-test-token-00000000000000001";
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a" },
  });
  let assigned = false;
  let listCalls = 0;
  const server = createAppServer({
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, applicationId) {
      assert.deepEqual([tenantId, actorId, applicationId], ["tenant-a", "admin-a", "app-a"]);
      return assigned;
    } },
    workflowRoleDefinitionStore: { async list() { listCalls++; return []; } },
    workflowActorRoleAssignmentStore: {},
    workflowDefinitionPublisher: {},
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/admin/applications/app-a/workflow-roles";
    const headers = { authorization: "Bearer " + token };
    assert.equal((await fetch(url, { headers })).status, 403);
    assert.equal(listCalls, 0);
    assigned = true;
    assert.equal((await fetch(url, { headers })).status, 200);
    assert.equal(listCalls, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
