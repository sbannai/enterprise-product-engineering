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
    async assign(input) { calls.push({ method: "assign", input }); return { ...input, status: "active", version: 1 }; },
    async revoke(input) { calls.push({ method: "revoke", input }); return { ...input, status: "revoked", version: 2 }; },
  };
  const server = createAppServer({ actorApplicationAssignmentStore: store });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    const url = "http://127.0.0.1:" + address.port + "/admin/actor-application-assignments";
    assert.equal((await fetch(url + "?actorId=actor-a")).status, 401, "unmapped caller must be denied");
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const listed = await fetch(url + "?actorId=actor-a", { headers });
    assert.equal(listed.status, 200);
    const listing = await listed.json();\n    assert.equal(listing.assignments[0].applicationId, "app-a");\n    assert.equal(listing.assignments[0].status, "revoked");\n    assert.equal(listing.assignments[0].version, 2);\n    assert.equal((await fetch(url + "?actorId=x", { headers })).status, 400);
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
    assert.equal((await regranted.json()).assignment.status, "active");\n    assert.equal((await fetch(url, { method: "PUT", headers })).status, 405);
    assert.deepEqual(calls.map(call => call.method), ["listAssignments", "assign", "revoke", "assign"]);
    assert.equal(calls[1].input.tenantId, "tenant-a");
    assert.equal(calls[1].input.changedBy, "admin-a");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});