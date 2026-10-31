import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const adminToken = "workflow-admin-test-token-with-at-least-32-characters";
const customerToken = "workflow-customer-test-token-with-at-least-32-characters";
const appId = "app-a";

async function withServer(t, overrides = {}) {
  const keys = [
    "EPER_WORKFLOW_EXECUTION_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "environment";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [adminToken]: { tenantId: "tenant-a", actorId: "admin-a" },
  });
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [customerToken]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "employee" },
  });

  const calls = [];
  const options = {
    tenantApplicationAssignmentStore: {
      async listActive(tenantId) { calls.push({ method: "tenant.listActive", tenantId }); return ["app-a"]; },
    },
    workflowRoleDefinitionStore: {
      async list(tenantId, applicationId) {
        calls.push({ method: "role.list", tenantId, applicationId });
        return [{ roleId: "employee", status: "active" }];
      },
      async replace(input) { calls.push({ method: "role.replace", input }); return { ...input, version: input.expectedVersion + 1 }; },
    },
    workflowActorRoleAssignmentStore: {
      async listActiveRoleIds(tenantId, applicationId, actorId) {
        calls.push({ method: "assignment.list", tenantId, applicationId, actorId }); return ["employee"];
      },
      async assign(input) { calls.push({ method: "assignment.assign", input }); return { ...input, status: "active", version: input.expectedVersion + 1 }; },
      async revoke(input) { calls.push({ method: "assignment.revoke", input }); return { ...input, status: "revoked", version: input.expectedVersion + 1 }; },
    },
    workflowDefinitionPublisher: {
      async publish(context, definition) {
        calls.push({ method: "publish", context, definition });
        return { workflowId: definition.id, definitionVersion: 1, definitionDigest: "a".repeat(64) };
      },
    },
    workflowExecutionService: {
      async start(input) {
        calls.push({ method: "start", input });
        return { instanceId: "11111111-1111-4111-8111-111111111111", status: "running", version: 1 };
      },
      async transition(input) {
        calls.push({ method: "transition", input });
        return { instanceId: input.instanceId, status: "completed", version: 2 };
      },
    },
    ...overrides,
  };
  const server = createAppServer(options);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  });
  const address = server.address();
  return { base: "http://127.0.0.1:" + address.port, calls };
}

const headers = token => ({
  authorization: "Bearer " + token,
  "content-type": "application/json",
  accept: "application/vnd.eper.v1+json",
});

test("workflow start derives tenant and actor from trusted identity, not request JSON", async t => {
  const { base, calls } = await withServer(t);
  const unauthenticated = await fetch(base + "/customer/applications/app-a/workflows/wf-a/instances", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: "start-key-00000001" }),
  });
  assert.equal(unauthenticated.status, 401);

  const rejectedBody = await fetch(base + "/customer/applications/app-a/workflows/wf-a/instances", {
    method: "POST", headers: headers(customerToken),
    body: JSON.stringify({ idempotencyKey: "start-key-00000001", tenantId: "tenant-b", actorId: "actor-b" }),
  });
  assert.equal(rejectedBody.status, 400);

  const response = await fetch(base + "/customer/applications/app-a/workflows/wf-a/instances", {
    method: "POST", headers: headers(customerToken),
    body: JSON.stringify({ idempotencyKey: "start-key-00000002", businessReference: "REF-1", data: { amount: 10 } }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.instance.status, "running");
  const call = calls.find(item => item.method === "start");
  assert.equal(call.input.tenantId, "tenant-a");
  assert.equal(call.input.actorId, "actor-a");
  assert.equal(call.input.applicationId, "app-a");
  assert.equal(call.input.workflowId, "wf-a");
  assert.equal(call.input.data.amount, 10);
});

test("workflow transition derives application and actor from trusted route and identity", async t => {
  const { base, calls } = await withServer(t);
  const instanceId = "11111111-1111-4111-8111-111111111111";
  const response = await fetch(base + "/customer/applications/app-a/workflow-instances/" + instanceId + "/transitions", {
    method: "POST", headers: headers(customerToken),
    body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "transition-key-000001", action: "submit", payload: {} }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.instance.status, "completed");
  const call = calls.find(item => item.method === "transition");
  assert.equal(call.input.tenantId, "tenant-a");
  assert.equal(call.input.actorId, "actor-a");
  assert.equal(call.input.applicationId, "app-a");
  assert.equal(call.input.instanceId, instanceId);
});

test("workflow administration lists and replaces application-scoped roles", async t => {
  const { base, calls } = await withServer(t);
  const list = await fetch(base + "/admin/applications/app-a/workflow-roles", { headers: headers(adminToken) });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).data.roles[0].roleId, "employee");

  const update = await fetch(base + "/admin/applications/app-a/workflow-roles/employee", {
    method: "PUT", headers: headers(adminToken),
    body: JSON.stringify({ name: "Employee", permissions: ["workflow:act"], status: "active", expectedVersion: 0 }),
  });
  assert.equal(update.status, 200);
  const call = calls.find(item => item.method === "role.replace");
  assert.equal(call.input.tenantId, "tenant-a");
  assert.equal(call.input.applicationId, "app-a");
  assert.equal(call.input.changedBy, "admin-a");
});

test("workflow administration assigns and revokes application roles", async t => {
  const { base, calls } = await withServer(t);
  const url = base + "/admin/applications/app-a/workflow-role-assignments";
  const grant = await fetch(url, {
    method: "POST", headers: headers(adminToken),
    body: JSON.stringify({ actorId: "actor-a", roleId: "employee", expectedVersion: 0 }),
  });
  assert.equal(grant.status, 201);
  assert.equal((await grant.json()).data.assignment.status, "active");
  const revoke = await fetch(url, {
    method: "DELETE", headers: headers(adminToken),
    body: JSON.stringify({ actorId: "actor-a", roleId: "employee", expectedVersion: 1 }),
  });
  assert.equal(revoke.status, 200);
  assert.equal((await revoke.json()).data.assignment.status, "revoked");
  assert.deepEqual(calls.filter(item => item.method.startsWith("assignment.")).map(item => item.method),
    ["assignment.assign", "assignment.revoke"]);
});

test("workflow publication requires trusted admin identity and tenant application ownership", async t => {
  const { base, calls } = await withServer(t);
  const denied = await fetch(base + "/admin/applications/app-b/workflows/wf-a/publish", {
    method: "POST", headers: headers(adminToken),
    body: JSON.stringify({ definition: { id: "wf-a" } }),
  });
  assert.equal(denied.status, 404);
  assert.equal(calls.some(item => item.method === "publish"), false);

  const response = await fetch(base + "/admin/applications/app-a/workflows/wf-a/publish", {
    method: "POST", headers: headers(adminToken),
    body: JSON.stringify({ definition: { id: "wf-a", status: "ACTIVE" } }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.published.definitionVersion, 1);
  const call = calls.find(item => item.method === "publish");
  assert.equal(call.context.tenantId, "tenant-a");
  assert.equal(call.context.applicationId, "app-a");
  assert.equal(call.context.principalId, "admin-a");
});

test("workflow execution API remains hidden when its feature flag is off", async t => {
  const { base } = await withServer(t);
  process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED = "false";
  const response = await fetch(base + "/customer/applications/app-a/workflows/wf-a/instances", {
    method: "POST", headers: headers(customerToken),
    body: JSON.stringify({ idempotencyKey: "start-key-00000003" }),
  });
  assert.equal(response.status, 404);
});
