import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_SESSION_COOKIE } from "../dist/packages/identity/customer-browser-security.js";
import { resolveCustomerBrowserIdentity } from "../dist/packages/identity/customer-browser-session-authorization.js";

const token = "s".repeat(43);
const cookieHeader = CUSTOMER_SESSION_COOKIE + "=" + token;
const session = {
  tenantId: "tenant-01", actorId: "actor-01", issuer: "https://idp.example.test",
  subject: "subject-01", createdAt: new Date(0).toISOString(),
  lastSeenAt: new Date(0).toISOString(), idleExpiresAt: new Date(Date.now()+60000).toISOString(),
  absoluteExpiresAt: new Date(Date.now()+3600000).toISOString(),
};
function dependencies(overrides = {}) {
  const calls = { session: 0, tenant: 0, actor: 0 };
  return {
    calls,
    sessionStore: { async resolveSession(value) { calls.session++; assert.equal(value, token); return session; } },
    tenantAssignments: { async listActive(tenantId) { calls.tenant++; assert.equal(tenantId, session.tenantId); return ["app-01"]; } },
    actorAssignments: { async isAssigned(tenantId, actorId, appId) { calls.actor++; assert.equal(tenantId, session.tenantId); assert.equal(actorId, session.actorId); return appId === "app-01"; } },
    ...overrides,
  };
}

test("resolves only when session and both durable application assignments are active", async () => {
  const deps = dependencies();
  const result = await resolveCustomerBrowserIdentity({
    cookieHeader, applicationId: "app-01", sessionStore: deps.sessionStore,
    tenantAssignments: deps.tenantAssignments, actorAssignments: deps.actorAssignments,
  });
  assert.equal(result?.tenantId, "tenant-01");
  assert.equal(result?.actorId, "actor-01");
  assert.equal(result?.applicationId, "app-01");
  assert.deepEqual(deps.calls, { session: 1, tenant: 1, actor: 1 });
});

test("denies missing, malformed and duplicate session cookies", async () => {
  const deps = dependencies();
  for (const header of [undefined, "other=value", CUSTOMER_SESSION_COOKIE + "=bad",
    cookieHeader + "; " + cookieHeader]) {
    const result = await resolveCustomerBrowserIdentity({
      cookieHeader: header, applicationId: "app-01", sessionStore: deps.sessionStore,
      tenantAssignments: deps.tenantAssignments, actorAssignments: deps.actorAssignments,
    });
    assert.equal(result, null);
  }
  assert.equal(deps.calls.session, 0);
});

test("denies revoked or expired sessions", async () => {
  const deps = dependencies({ sessionStore: { async resolveSession() { return null; } } });
  const result = await resolveCustomerBrowserIdentity({
    cookieHeader, applicationId: "app-01", sessionStore: deps.sessionStore,
    tenantAssignments: deps.tenantAssignments, actorAssignments: deps.actorAssignments,
  });
  assert.equal(result, null);
  assert.equal(deps.calls.tenant, 0);
  assert.equal(deps.calls.actor, 0);
});

test("denies applications not owned by the tenant", async () => {
  const deps = dependencies();
  const result = await resolveCustomerBrowserIdentity({
    cookieHeader, applicationId: "app-02", sessionStore: deps.sessionStore,
    tenantAssignments: deps.tenantAssignments, actorAssignments: deps.actorAssignments,
  });
  assert.equal(result, null);
});

test("denies applications not assigned to the actor", async () => {
  const deps = dependencies({
    actorAssignments: { async isAssigned() { return false; } },
  });
  const result = await resolveCustomerBrowserIdentity({
    cookieHeader, applicationId: "app-01", sessionStore: deps.sessionStore,
    tenantAssignments: deps.tenantAssignments, actorAssignments: deps.actorAssignments,
  });
  assert.equal(result, null);
});

test("fails closed when a durable authorization store is unavailable", async () => {
  const deps = dependencies({
    tenantAssignments: { async listActive() { throw new Error("database unavailable"); } },
  });
  const result = await resolveCustomerBrowserIdentity({
    cookieHeader, applicationId: "app-01", sessionStore: deps.sessionStore,
    tenantAssignments: deps.tenantAssignments, actorAssignments: deps.actorAssignments,
  });
  assert.equal(result, null);
});

test("rejects malformed application identifiers before querying stores", async () => {
  const deps = dependencies();
  const result = await resolveCustomerBrowserIdentity({
    cookieHeader, applicationId: "../tenant-02", sessionStore: deps.sessionStore,
    tenantAssignments: deps.tenantAssignments, actorAssignments: deps.actorAssignments,
  });
  assert.equal(result, null);
  assert.deepEqual(deps.calls, { session: 0, tenant: 0, actor: 0 });
});
