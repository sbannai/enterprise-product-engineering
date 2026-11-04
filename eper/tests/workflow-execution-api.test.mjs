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
  const server = createAppServer({
    workflowExecutionService,
    workflowRoleDefinitionStore: {}, workflowActorRoleAssignmentStore: {},
    workflowDefinitionPublisher: {},
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    actorApplicationAssignmentStore: {
      async isAssigned(_tenantId, _actorId, applicationId) { return applicationId === "app-a"; },
    },
  });
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
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});


test("workflow role catalogue requires explicit role:assign authority and explicit delegability", async () => {
  const keys = ["EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-admin-api-test-token-00000000000000001";
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a", roleKey: "customer_admin" },
  });
  let assigned = false;
  let activeRoleIds = [];
  let listCalls = 0;
  let savedRole;
  const server = createAppServer({
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, applicationId) {
      assert.deepEqual([tenantId, actorId, applicationId], ["tenant-a", "admin-a", "app-a"]);
      return assigned;
    } },
    workflowRoleDefinitionStore: {
      async list() {
        listCalls++;
        return [{ roleId: "product-admin", status: "active", permissions: ["role:assign"] }];
      },
      async replace(input) { savedRole = input; return { roleId: input.roleId, delegable: input.delegable }; },
    },
    workflowActorRoleAssignmentStore: {
      async listActiveRoleIds(tenantId, applicationId, actorId) {
        assert.deepEqual([tenantId, applicationId, actorId], ["tenant-a", "app-a", "admin-a"]);
        return activeRoleIds;
      },
    },
    workflowDefinitionPublisher: {},
    workflowExecutionService: { async start() { return {}; }, async transition() { return {}; } },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/admin/applications/app-a/workflow-roles";
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    assert.equal((await fetch(url, { headers })).status, 403);
    assert.equal(listCalls, 0);
    assigned = true;
    assert.equal((await fetch(url, { headers })).status, 403, "application assignment alone is not role-catalogue authority");
    assert.equal(listCalls, 1);
    activeRoleIds = ["product-admin"];
    assert.equal((await fetch(url, { headers })).status, 200);
    assert.equal(listCalls, 2);
    const roleUrl = url + "/finance-approver";
    const missingDelegable = await fetch(roleUrl, { method: "PUT", headers, body: JSON.stringify({
      name: "Finance approver", permissions: ["workflow:view"], status: "active", expectedVersion: 0,
    }) });
    assert.equal(missingDelegable.status, 400);
    assert.equal(savedRole, undefined);
    const saved = await fetch(roleUrl, { method: "PUT", headers, body: JSON.stringify({
      name: "Finance approver", permissions: ["workflow:view"], status: "active",
      expectedVersion: 0, delegable: true,
    }) });
    assert.equal(saved.status, 200);
    assert.equal(savedRole.delegable, true);
    assert.equal(savedRole.changedBy, "admin-a");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});




test("workflow execution routes are hidden when the feature flag is disabled", async () => {
  const previous = process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED;
  delete process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED;
  const server = createAppServer({ workflowExecutionService: { async start() { throw new Error("must not execute"); } } });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/applications/app-a/workflows/onboarding/instances", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED;
    else process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = previous;
  }
});


test("customer workflow work queue GET derives tenant and actor from trusted credentials", async () => {
  const keys = ["EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "workflow-queue-api-test-token-0000000000000001";
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "operator", applicationIds: ["app-a"] },
  });
  const calls = [];
  const workflowExecutionService = {
    async start() { throw new Error("not used"); },
    async transition() { throw new Error("not used"); },
    async listVisibleInstances(input) {
      calls.push(input);
      return {
        items: [{
          instanceId: "instance-a", workflowId: "onboarding", status: "running",
          currentActivityId: "review", businessReference: "APP-100",
          version: 1, createdAt: "2026-11-04T00:00:00.000Z",
          updatedAt: "2026-11-04T00:00:00.000Z", completedAt: null,
        }],
        total: 1, limit: input.limit, offset: input.offset,
      };
    },
  };
  const server = createAppServer({
    workflowExecutionService,
    workflowRoleDefinitionStore: {}, workflowActorRoleAssignmentStore: {},
    workflowDefinitionPublisher: {},
    tenantApplicationAssignmentStore: { async listActive() { return ["app-a", "app-b"]; } },
    actorApplicationAssignmentStore: {
      async isAssigned(_tenantId, _actorId, applicationId) { return applicationId === "app-a"; },
    },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/applications/app-a/workflow-instances?limit=15&offset=30";
    assert.equal((await fetch(url)).status, 401);
    const unauthorizedApplication = await fetch(
      "http://127.0.0.1:" + address.port + "/customer/applications/app-b/workflow-instances",
      { headers: { authorization: "Bearer " + token } },
    );
    assert.equal(unauthorizedApplication.status, 403);
    const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.total, 0);
    assert.equal(body.data.limit, 15);
    assert.equal(body.data.offset, 30);
    assert.equal(body.data.items.length, 1);
    assert.equal(Object.hasOwn(body.data.items[0], "data"), false);
    assert.equal(Object.hasOwn(body.data.items[0], "tenantId"), false);
    assert.equal(Object.hasOwn(body.data.items[0], "applicationId"), false);
    assert.equal(Object.hasOwn(body.data.items[0], "createdBy"), false);
    assert.equal(Object.hasOwn(body.data.items[0], "definitionDigest"), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tenantId, "tenant-a");
    assert.equal(calls[0].actorId, "actor-a");
    assert.equal(calls[0].applicationId, "app-a");
    assert.equal(calls[0].limit, 15);
    assert.equal(calls[0].offset, 30);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
