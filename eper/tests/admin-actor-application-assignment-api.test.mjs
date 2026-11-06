import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("admin actor application assignment API authenticates admins and enforces tenant application scope", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "admin-assignment-test-token-00000000000000000001";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({ [token]: { tenantId: "tenant-a", actorId: "admin-a" } });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const calls = [];
  const store = {
    async listAssignments(tenantId, actorId) { calls.push({ method: "listAssignments", tenantId, actorId }); return [{ applicationId: "app-a", version: 2, status: "revoked" }]; },
    async assign(input) { calls.push({ method: "assign", input }); if (input.expectedVersion === 99) throw new Error("ACTOR_APPLICATION_ASSIGNMENT_VERSION_CONFLICT"); return { ...input, status: "active", version: input.expectedVersion + 1 }; },
    async revoke(input) { calls.push({ method: "revoke", input }); if (input.expectedVersion === 99) throw new Error("ACTOR_APPLICATION_ASSIGNMENT_NOT_FOUND"); return { ...input, status: "revoked", version: input.expectedVersion + 1 }; },
  };
  const tenantApplicationAssignmentStore = {
    async listActive(tenantId) {
      assert.equal(tenantId, "tenant-a");
      return ["app-a"];
    },
  };
  const server = createAppServer({ actorApplicationAssignmentStore: store, tenantApplicationAssignmentStore });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    const url = "http://127.0.0.1:" + address.port + "/admin/actor-application-assignments";
    assert.equal((await fetch(url + "?actorId=actor-a")).status, 401, "unmapped caller must be denied");
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const listed = await fetch(url + "?actorId=actor-a", { headers });
    assert.equal(listed.status, 200);
    const listing = await listed.json();
    assert.equal(listing.assignments[0].applicationId, "app-a");
    assert.equal(listing.assignments[0].status, "revoked");
    assert.equal(listing.assignments[0].version, 2);
    assert.equal((await fetch(url + "?actorId=x", { headers })).status, 400);
    const granted = await fetch(url, { method: "POST", headers, body: JSON.stringify({ actorId: "actor-a", applicationId: "app-a", expectedVersion: 0 }) });
    assert.equal(granted.status, 201);
    assert.equal((await granted.json()).assignment.status, "active");
    const wrongTenantApp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ actorId: "actor-a", applicationId: "app-b", expectedVersion: 0 }) });
    assert.equal(wrongTenantApp.status, 403);
    const revoked = await fetch(url, { method: "DELETE", headers, body: JSON.stringify({ actorId: "actor-a", applicationId: "app-a", expectedVersion: 1 }) });
    assert.equal(revoked.status, 200);
    assert.equal((await revoked.json()).assignment.status, "revoked");
    const regranted = await fetch(url, { method: "POST", headers, body: JSON.stringify({ actorId: "actor-a", applicationId: "app-a", expectedVersion: 2 }) });
    assert.equal(regranted.status, 201);
    const regrantBody = await regranted.json();
    assert.equal(regrantBody.assignment.status, "active");
    assert.equal(regrantBody.assignment.version, 3);
    assert.equal((await fetch(url, { method: "PUT", headers })).status, 405);
    const stale = await fetch(url, { method: "POST", headers, body: JSON.stringify({ actorId: "actor-a", applicationId: "app-a", expectedVersion: 99 }) });
    assert.equal(stale.status, 409);
    const missing = await fetch(url, { method: "DELETE", headers, body: JSON.stringify({ actorId: "actor-a", applicationId: "app-a", expectedVersion: 99 }) });
    assert.equal(missing.status, 404);
    assert.deepEqual(calls.map(call => call.method), ["listAssignments", "assign", "revoke", "assign", "assign", "revoke"]);
    assert.equal(calls[1].input.tenantId, "tenant-a");
    assert.equal(calls[1].input.changedBy, "admin-a");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("actor grants validate ownership against the durable tenant assignment store", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "admin-durable-tenant-ownership-token-0000001";
  process.env.EPER_ADMIN_CONFIG_API_ENABLED = "true";
  process.env.EPER_ADMIN_CONFIG_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "admin-a" },
  });
  // A stale/contradictory environment map must not override the durable ownership source.
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-env-only"] });
  const tenantReads = [];
  const tenantApplicationAssignmentStore = {
    async listActive(tenantId) { tenantReads.push(tenantId); return ["app-db-owned"]; },
  };
  const writes = [];
  const actorApplicationAssignmentStore = {
    async assign(input) { writes.push(input); return { ...input, status: "active", version: 1 }; },
    async revoke(input) { writes.push(input); return { ...input, status: "revoked", version: 2 }; },
    async listAssignments() { return []; },
  };
  const server = createAppServer({ tenantApplicationAssignmentStore, actorApplicationAssignmentStore });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/admin/actor-application-assignments";
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const denied = await fetch(url, { method: "POST", headers,
      body: JSON.stringify({ actorId: "actor-a", applicationId: "app-env-only", expectedVersion: 0 }) });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: "application_not_assigned_to_tenant" });
    const allowed = await fetch(url, { method: "POST", headers,
      body: JSON.stringify({ actorId: "actor-a", applicationId: "app-db-owned", expectedVersion: 0 }) });
    assert.equal(allowed.status, 201);
    assert.deepEqual(tenantReads, ["tenant-a", "tenant-a"]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].tenantId, "tenant-a");
    assert.equal(writes[0].applicationId, "app-db-owned");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
