import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";
import { createCustomerCsrfToken } from "../dist/packages/identity/customer-browser-security.js";

const keys = [
  "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
  "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
  "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
  "EPER_TICKETING_API_ENABLED",
  "EPER_CUSTOMER_WORKSPACE_MODULES_JSON",
  "EPER_CUSTOMER_BROWSER_ORIGIN",
  "EPER_CUSTOMER_CSRF_SECRET",
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
    const envelope = await allowed.json();
    assert.equal(envelope.success, true);
    assert.equal(typeof envelope.meta?.requestId, "string");
    const body = envelope.data;
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


test("customer ticket reads use durable browser identity in PostgreSQL mode", async () => {
  process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-01": ["tickets-feedback"],
  });
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    ["b".repeat(48)]: { tenantId: "wrong-tenant", actorId: "wrong-actor", roleKey: "super-admin" },
  });
  let listScope;
  const server = createAppServer({
    customerIdentitySessionStore: { async resolveSession(value) { assert.equal(value, token); return session; } },
    tenantApplicationAssignmentStore: { async listActive(tenantId) {
      assert.equal(tenantId, "tenant-01"); return ["application-01"];
    } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, applicationId) {
      assert.deepEqual([tenantId, actorId, applicationId], ["tenant-01", "actor-01", "application-01"]);
      return true;
    } },
    ticketStore: { async list(scope, filters) { listScope = { scope, filters }; return []; } },
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/applications/application-01/tickets";
    const bearerOnly = await fetch(url, { headers: { authorization: "Bearer " + "b".repeat(48) } });
    assert.equal(bearerOnly.status, 401, "PostgreSQL browser mode must ignore bearer identity maps");
    const allowed = await fetch(url, { headers: { cookie: "__Host-eper_session=" + token } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(listScope.scope, { tenantId: "tenant-01" });
    assert.equal(listScope.filters.applicationId, "application-01");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});


test("customer ticket mutations use the configured OIDC origin and CSRF secret", async () => {
  process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_TICKETING_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-01": ["tickets-feedback"],
  });
  delete process.env.EPER_CUSTOMER_BROWSER_ORIGIN;
  delete process.env.EPER_CUSTOMER_CSRF_SECRET;
  const secret = "c".repeat(48);
  const expectedOrigin = "https://customer.example.test";
  const csrf = createCustomerCsrfToken(token, secret);
  let created;
  const server = createAppServer({
    customerIdentitySessionStore: { async resolveSession(value) { assert.equal(value, token); return session; } },
    customerOidcPublicOrigin: expectedOrigin,
    customerCsrfSecret: secret,
    tenantApplicationAssignmentStore: { async listActive(tenantId) {
      assert.equal(tenantId, "tenant-01"); return ["application-01"];
    } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, applicationId) {
      assert.deepEqual([tenantId, actorId, applicationId], ["tenant-01", "actor-01", "application-01"]);
      return true;
    } },
    ticketStore: { async create(scope, input) {
      created = { scope, input };
      return { id: "ticket-01", ...scope, ...input };
    } },
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/applications/application-01/tickets";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        origin: expectedOrigin,
        cookie: "__Host-eper_session=" + token + "; __Host-eper_csrf=" + csrf,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "question", title: "Login assistance", description: "Please help with account access.",
        businessImpact: "Customer workspace access is blocked.",
      }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(created.scope, {
      tenantId: "tenant-01", applicationId: "application-01", actorId: "actor-01",
      correlationId: created.scope.correlationId,
    });
    assert.equal(created.input.title, "Login assistance");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
