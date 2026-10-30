import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("tenant application assignment admin API authenticates and scopes mutations to admin tenant", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "tenant-assignment-admin-token-00000000000000001";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({ [token]: { tenantId: "tenant-a", actorId: "admin-a" } });
  const calls = [];
  const store = {
    async listAssignments(tenantId) { calls.push(["list", tenantId]); return [{ tenantId, applicationId: "app-a", status: "active", version: 1 }]; },
    async listActive(tenantId) { calls.push(["listActive", tenantId]); return ["app-a"]; },
    async assign(input) { calls.push(["assign", input]); return { ...input, status: "active", version: input.expectedVersion + 1 }; },
    async revoke(input) { calls.push(["revoke", input]); return { ...input, status: "revoked", version: input.expectedVersion + 1 }; },
  };
  const actorApplicationAssignmentStore = {};
  const server = createAppServer({ tenantApplicationAssignmentStore: store, actorApplicationAssignmentStore });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    const url = "http://127.0.0.1:" + address.port + "/admin/tenant-application-assignments";
    assert.equal((await fetch(url)).status, 401);
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const list = await fetch(url, { headers });
    assert.equal(list.status, 200);
    assert.equal((await list.json()).assignments[0].applicationId, "app-a");
    const grant = await fetch(url, { method: "POST", headers, body: JSON.stringify({ applicationId: "app-b", expectedVersion: 0 }) });
    assert.equal(grant.status, 201);
    const revoke = await fetch(url, { method: "DELETE", headers, body: JSON.stringify({ applicationId: "app-b", expectedVersion: 1 }) });
    assert.equal(revoke.status, 200);
    assert.deepEqual(calls.map(call => call[0]), ["list", "assign", "revoke"]);
    assert.equal(calls[1][1].tenantId, "tenant-a");
    assert.equal(calls[1][1].changedBy, "admin-a");
    assert.equal((await fetch(url, { method: "PUT", headers })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("customer application list uses durable tenant and actor assignments without environment allowlists", async () => {
  const keys = ["EPER_CUSTOMER_PORTAL_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "tenant-assignment-customer-token-00000000000001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" } });
  delete process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON;
  const observed = [];
  const tenantStore = { async listActive(tenantId) { observed.push(["tenant", tenantId]); return ["app-a", "app-b"]; } };
  const actorStore = { async listActive(tenantId, actorId) { observed.push(["actor", tenantId, actorId]); return ["app-b", "app-foreign"]; } };
  const server = createAppServer({ tenantApplicationAssignmentStore: tenantStore, actorApplicationAssignmentStore: actorStore });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/applications", { headers: { authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { applications: [{ applicationId: "app-b" }] });
    assert.deepEqual(observed, [["tenant", "tenant-a"], ["actor", "tenant-a", "actor-a"]]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
