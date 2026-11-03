import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeProviderConnectionRequest,
  PostgresProviderRoleAuthorizer,
} from "../dist/packages/integrations/provider-connection-authorization.js";

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

const actor = { tenantId: "tenant-a", actorId: "actor-a" };

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


test("PostgreSQL role adapter maps application actions to explicit provider grants", async () => {
  const calls = [];
  const adapter = new PostgresProviderRoleAuthorizer({
    async listActiveRoleIds(...args) { calls.push(["roles", ...args]); return ["workflow-operator", "customer-admin"]; },
    async hasPermission(...args) { calls.push(["permission", ...args]); return args[3] === "customer-admin"; },
  });
  assert.equal(await adapter.authorize({
    tenantId: "tenant-a", actorId: "actor-a",
    action: "provider.connection.rotate", applicationId: "app-a",
  }), true);
  assert.deepEqual(calls, [
    ["roles", "tenant-a", "app-a", "actor-a"],
    ["permission", "tenant-a", "app-a", "actor-a", "workflow-operator", "provider.connection.rotate"],
    ["permission", "tenant-a", "app-a", "actor-a", "customer-admin", "provider.connection.rotate"],
  ]);
});

test("PostgreSQL role adapter denies tenant-level create without a tenant admin grant model", async () => {
  let called = false;
  const adapter = new PostgresProviderRoleAuthorizer({
    async listActiveRoleIds() { called = true; return ["customer-admin"]; },
    async hasPermission() { called = true; return true; },
  });
  assert.equal(await adapter.authorize({
    tenantId: "tenant-a", actorId: "actor-a",
    action: "provider.connection.create", applicationId: null,
  }), false);
  assert.equal(called, false);
});


test("PostgreSQL role adapter denies actors with no active durable role assignments", async () => {
  const calls = [];
  const adapter = new PostgresProviderRoleAuthorizer({
    async listActiveRoleIds(...args) { calls.push(args); return []; },
    async hasPermission() { throw new Error("must not check an unassigned role"); },
  });
  assert.equal(await adapter.authorize({
    tenantId: "tenant-a", actorId: "actor-a",
    action: "provider.connection.read", applicationId: "app-a",
  }), false);
  assert.deepEqual(calls, [["tenant-a", "app-a", "actor-a"]]);
});
