import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const keys = [
  "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
  "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
  "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const token = "s".repeat(43);
const session = {
  tenantId: "tenant-01", actorId: "actor-01", issuer: "https://idp.example.test",
  subject: "subject-01", createdAt: new Date(0).toISOString(),
  lastSeenAt: new Date(0).toISOString(), idleExpiresAt: new Date(Date.now() + 60000).toISOString(),
  absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
};

test("application session context requires durable browser session and both active assignments", async () => {
  process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    ["b".repeat(48)]: { tenantId: "wrong-tenant", actorId: "wrong-actor", roleKey: "super-admin" },
  });
  const server = createAppServer({
    customerIdentitySessionStore: { async resolveSession(value) { assert.equal(value, token); return session; } },
    tenantApplicationAssignmentStore: { async listActive(tenantId) {
      assert.equal(tenantId, "tenant-01"); return ["application-01"];
    } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, applicationId) {
      assert.deepEqual([tenantId, actorId, applicationId], ["tenant-01", "actor-01", "application-01"]);
      return true;
    } },
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/applications/application-01/session";
    const bearerOnly = await fetch(url, { headers: { authorization: "Bearer " + "b".repeat(48) } });
    assert.equal(bearerOnly.status, 401, "postgres browser mode must not fall back to bearer identity mappings");
    const denied = await fetch(url);
    assert.equal(denied.status, 401);
    const allowed = await fetch(url, { headers: { cookie: "__Host-eper_session=" + token } });
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.tenantId, "tenant-01");
    assert.equal(body.actorId, "actor-01");
    assert.equal(body.applicationId, "application-01");
    assert.equal(body.authentication, "postgres-browser-session");
    assert.equal(body.authorization, "durable-tenant-and-actor-assignments");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
