import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";
import { createCustomerCsrfToken } from "../dist/packages/identity/customer-browser-security.js";

const SESSION = "a".repeat(43);
const SECRET = "customer-role-delegation-test-secret-which-is-long-enough";
const ORIGIN = "https://eper.example.test";
const CSRF = createCustomerCsrfToken(SESSION, SECRET);
const cookie = `__Host-eper_session=${SESSION}; __Host-eper_csrf=${CSRF}`;

const envKeys = [
  "EPER_WORKFLOW_ROLE_DELEGATION_API_ENABLED",
  "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
  "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
  "EPER_AUDIT_PERSISTENCE",
  "EPER_CUSTOMER_BROWSER_ORIGIN",
  "EPER_CUSTOMER_CSRF_SECRET",
];

function configure() {
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_WORKFLOW_ROLE_DELEGATION_API_ENABLED: "true",
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_BROWSER_ORIGIN: ORIGIN,
    EPER_CUSTOMER_CSRF_SECRET: SECRET,
  });
  return () => envKeys.forEach(key => previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key]);
}

function dependencies(permissions = ["access:manage", "workflow:view"]) {
  const calls = [];
  return {
    calls,
    customerIdentitySessionStore: { async resolveSession(token) {
      assert.equal(token, SESSION);
      return { tenantId: "tenant-01", actorId: "admin-01", issuer: "https://issuer.test",
        subject: "subject-01", createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
        idleExpiresAt: new Date(Date.now()+60000).toISOString(), absoluteExpiresAt: new Date(Date.now()+60000).toISOString() };
    } },
    tenantApplicationAssignmentStore: { async listActive(tenantId) { assert.equal(tenantId, "tenant-01"); return ["app-01"]; } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, appId) {
      return tenantId === "tenant-01" && actorId === "admin-01" && appId === "app-01";
    } },
    actorRoleAssignmentStore: {
      async listActiveRoleIds() { return ["customer-admin"]; },
      async listAssignments() { return [{ tenantId: "tenant-01", applicationId: "app-01", actorId: "user-02",
        roleId: "workflow-reader", status: "active", version: 1, assignedAt: "2026-11-02T00:00:00.000Z",
        assignedBy: "admin-01", revokedAt: null, revokedBy: null, updatedAt: "2026-11-02T00:00:00.000Z",
        updatedBy: "admin-01" }]; },
    },
    roleDefinitionStore: { async list() { return [
      { roleId: "customer-admin", name: "Customer Admin", description: "Administrative role",
        status: "active", permissions },
      { roleId: "workflow-reader", name: "Workflow Reader", description: "Read-only workflow access",
        status: "active", delegable: true, permissions: ["workflow:view"] },
      { roleId: "internal-reader", name: "Internal Reader", description: "Not approved for delegation",
        status: "active", delegable: false, permissions: ["workflow:view"] },
    ]; } },
    delegationStore: {
      async grant(input) {
        calls.push({ action: "grant", ...input });
        return { tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.targetActorId,
          roleId: input.targetRoleId, grantorActorId: input.grantorActorId, status: "active", version: 1,
          assignedAt: new Date().toISOString(), assignedBy: input.grantorActorId };
      },
      async revoke(input) {
        calls.push({ action: "revoke", ...input });
        return { tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.targetActorId,
          roleId: input.targetRoleId, status: "revoked", version: input.expectedVersion + 1,
          revokedBy: input.grantorActorId };
      },
    },
  };
}

async function withServer(options, fn) {
  const server = createAppServer(options);
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    await fn(`http://127.0.0.1:${address.port}`);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("customer admin can delegate a lower-privilege role through an OIDC browser session", async () => {
  const restore = configure();
  const deps = dependencies();
  try {
    await withServer({
      customerIdentitySessionStore: deps.customerIdentitySessionStore,
      tenantApplicationAssignmentStore: deps.tenantApplicationAssignmentStore,
      actorApplicationAssignmentStore: deps.actorApplicationAssignmentStore,
      workflowRoleDefinitionStore: deps.roleDefinitionStore,
      workflowActorRoleAssignmentStore: deps.actorRoleAssignmentStore,
      workflowRoleDelegationStore: deps.delegationStore,
      customerOidcPublicOrigin: ORIGIN, customerCsrfSecret: SECRET,
    }, async base => {
      const response = await fetch(base + "/customer/applications/app-01/workflow-role-delegations", {
        method: "POST", headers: { cookie, origin: ORIGIN, "x-csrf-token": CSRF, "content-type": "application/json" },
        body: JSON.stringify({ actorId: "user-02", roleId: "workflow-reader", expectedVersion: 0 }),
      });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.data.assignment.actorId, "user-02");
      assert.equal(deps.calls.length, 1);
      assert.equal(deps.calls[0].grantorActorId, "admin-01");
      assert.equal(deps.calls[0].grantorRoleId, "customer-admin");
    });
  } finally { restore(); }
});

test("customer user without access:manage cannot delegate roles", async () => {
  const restore = configure();
  const deps = dependencies(["workflow:view"]);
  try {
    await withServer({
      customerIdentitySessionStore: deps.customerIdentitySessionStore,
      tenantApplicationAssignmentStore: deps.tenantApplicationAssignmentStore,
      actorApplicationAssignmentStore: deps.actorApplicationAssignmentStore,
      workflowRoleDefinitionStore: deps.roleDefinitionStore,
      workflowActorRoleAssignmentStore: deps.actorRoleAssignmentStore,
      workflowRoleDelegationStore: deps.delegationStore,
      customerOidcPublicOrigin: ORIGIN, customerCsrfSecret: SECRET,
    }, async base => {
      const response = await fetch(base + "/customer/applications/app-01/workflow-role-delegations", {
        method: "POST", headers: { cookie, origin: ORIGIN, "x-csrf-token": CSRF, "content-type": "application/json" },
        body: JSON.stringify({ actorId: "user-02", roleId: "workflow-reader", expectedVersion: 0 }),
      });
      assert.equal(response.status, 403);
      assert.equal(deps.calls.length, 0);
    });
  } finally { restore(); }
});

test("role delegation rejects missing CSRF proof and cross-tenant application membership", async () => {
  const restore = configure();
  const deps = dependencies();
  try {
    await withServer({
      customerIdentitySessionStore: deps.customerIdentitySessionStore,
      tenantApplicationAssignmentStore: deps.tenantApplicationAssignmentStore,
      actorApplicationAssignmentStore: { async isAssigned() { return false; } },
      workflowRoleDefinitionStore: deps.roleDefinitionStore,
      workflowActorRoleAssignmentStore: deps.actorRoleAssignmentStore,
      workflowRoleDelegationStore: deps.delegationStore,
      customerOidcPublicOrigin: ORIGIN, customerCsrfSecret: SECRET,
    }, async base => {
      const noCsrf = await fetch(base + "/customer/applications/app-01/workflow-role-delegations", {
        method: "POST", headers: { cookie: "__Host-eper_session=" + SESSION, origin: ORIGIN,
          "content-type": "application/json" },
        body: JSON.stringify({ actorId: "user-02", roleId: "workflow-reader", expectedVersion: 0 }),
      });
      assert.equal(noCsrf.status, 401);
      assert.equal(deps.calls.length, 0);
    });
  } finally { restore(); }
});


test("customer admin can revoke a role assignment with CSRF proof and expected version", async () => {
  const restore = configure();
  const deps = dependencies();
  try {
    await withServer({
      customerIdentitySessionStore: deps.customerIdentitySessionStore,
      tenantApplicationAssignmentStore: deps.tenantApplicationAssignmentStore,
      actorApplicationAssignmentStore: deps.actorApplicationAssignmentStore,
      workflowRoleDefinitionStore: deps.roleDefinitionStore,
      workflowActorRoleAssignmentStore: deps.actorRoleAssignmentStore,
      workflowRoleDelegationStore: deps.delegationStore,
      customerOidcPublicOrigin: ORIGIN, customerCsrfSecret: SECRET,
    }, async base => {
      const response = await fetch(base + "/customer/applications/app-01/workflow-role-delegations", {
        method: "DELETE", headers: { cookie, origin: ORIGIN, "x-csrf-token": CSRF, "content-type": "application/json" },
        body: JSON.stringify({ actorId: "user-02", roleId: "workflow-reader", expectedVersion: 1 }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.assignment.status, "revoked");
      assert.equal(deps.calls.length, 1);
      assert.equal(deps.calls[0].action, "revoke");
      assert.equal(deps.calls[0].grantorActorId, "admin-01");
    });
  } finally { restore(); }
});


test("customer admin can load the scoped role directory and assignment history", async () => {
  const restore = configure();
  const deps = dependencies();
  try {
    await withServer({
      customerIdentitySessionStore: deps.customerIdentitySessionStore,
      tenantApplicationAssignmentStore: deps.tenantApplicationAssignmentStore,
      actorApplicationAssignmentStore: deps.actorApplicationAssignmentStore,
      workflowRoleDefinitionStore: deps.roleDefinitionStore,
      workflowActorRoleAssignmentStore: deps.actorRoleAssignmentStore,
      workflowRoleDelegationStore: deps.delegationStore,
      customerOidcPublicOrigin: ORIGIN, customerCsrfSecret: SECRET,
    }, async base => {
      const response = await fetch(base + "/customer/applications/app-01/workflow-role-delegations", {
        method: "GET", headers: { cookie },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.assignments[0].actorId, "user-02");
      assert.deepEqual(body.data.roles.map(role => role.roleId), ["workflow-reader"]);
      assert.equal(body.data.roles.some(role => role.permissions.includes("access:manage")), false);
    });
  } finally { restore(); }
});
