import assert from "node:assert/strict";
import test from "node:test";
import { authorizeProviderConnectionRequest } from "../dist/packages/integrations/provider-connection-authorization.js";

function fixture({ tenantActive = true, actorAssigned = true, roleAllowed = true, roleError = null } = {}) {
  const calls = [];
  return {
    calls,
    assignments: {
      async isTenantApplicationActive(tenantId, applicationId) {
        calls.push(["tenant-assignment", tenantId, applicationId]);
        return tenantActive;
      },
      async isActorAssigned(tenantId, actorId, applicationId) {
        calls.push(["actor-assignment", tenantId, actorId, applicationId]);
        return actorAssigned;
      },
    },
    roles: {
      async authorize(input) {
        calls.push(["role-policy", input]);
        if (roleError) throw roleError;
        return roleAllowed;
      },
    },
  };
}

const actor = { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer-admin" };

test("authorizes only after current tenant membership, actor assignment and role policy pass", async () => {
  const f = fixture();
  const scope = await authorizeProviderConnectionRequest({
    actor, action: "provider.connection.bind", applicationId: "app-a",
    assignments: f.assignments, roles: f.roles,
  });
  assert.deepEqual(scope, {
    tenantId: "tenant-a", actorId: "actor-a", applicationId: "app-a",
    action: "provider.connection.bind",
  });
  assert.deepEqual(f.calls.map(call => call[0]), [
    "tenant-assignment", "actor-assignment", "role-policy",
  ]);
});

test("rejects missing trusted identity before consulting authorization stores", async () => {
  const f = fixture();
  await assert.rejects(() => authorizeProviderConnectionRequest({
    actor: null, action: "provider.connection.create",
    assignments: f.assignments, roles: f.roles,
  }), /PROVIDER_UNAUTHENTICATED/);
  assert.equal(f.calls.length, 0);
});

test("rejects inactive tenant application even when actor assignment exists", async () => {
  const f = fixture({ tenantActive: false });
  await assert.rejects(() => authorizeProviderConnectionRequest({
    actor, action: "provider.connection.read", applicationId: "app-a",
    assignments: f.assignments, roles: f.roles,
  }), /PROVIDER_APPLICATION_ACCESS_DENIED/);
  assert.equal(f.calls.some(call => call[0] === "role-policy"), false);
});

test("rejects actor not assigned to the requested application", async () => {
  const f = fixture({ actorAssigned: false });
  await assert.rejects(() => authorizeProviderConnectionRequest({
    actor, action: "provider.connection.validate", applicationId: "app-a",
    assignments: f.assignments, roles: f.roles,
  }), /PROVIDER_APPLICATION_ACCESS_DENIED/);
  assert.equal(f.calls.some(call => call[0] === "role-policy"), false);
});

test("denies roles that do not hold the requested provider permission", async () => {
  const f = fixture({ roleAllowed: false });
  await assert.rejects(() => authorizeProviderConnectionRequest({
    actor, action: "provider.connection.revoke", applicationId: "app-a",
    assignments: f.assignments, roles: f.roles,
  }), /PROVIDER_ACTION_FORBIDDEN/);
});

test("authorization-store outage fails closed", async () => {
  const f = fixture({ roleError: new Error("database unavailable") });
  await assert.rejects(() => authorizeProviderConnectionRequest({
    actor, action: "provider.connection.create",
    assignments: f.assignments, roles: f.roles,
  }), /PROVIDER_AUTHORIZATION_UNAVAILABLE/);
});

test("requires application scope for every application-level provider operation", async () => {
  const f = fixture();
  await assert.rejects(() => authorizeProviderConnectionRequest({
    actor, action: "provider.connection.rotate",
    assignments: f.assignments, roles: f.roles,
  }), /PROVIDER_APPLICATION_SCOPE_REQUIRED/);
});

test("tenant-level connection creation still requires explicit role authorization", async () => {
  const f = fixture();
  const scope = await authorizeProviderConnectionRequest({
    actor, action: "provider.connection.create",
    assignments: f.assignments, roles: f.roles,
  });
  assert.equal(scope.applicationId, null);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], "role-policy");
});
