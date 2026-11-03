import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createCustomerCsrfToken } from "../dist/packages/identity/customer-browser-security.js";
import { createAppServer } from "../dist/apps/api/server.js";

const sessionToken = "a".repeat(43);
const csrfSecret = "customer-provider-test-secret-with-more-than-32-bytes";
const csrfToken = createCustomerCsrfToken(sessionToken, csrfSecret);
const previousConnectionFlag = process.env.EPER_PROVIDER_CONNECTION_API_ENABLED;
const session = {
  tenantId: "tenant-customer-a", actorId: "customer-admin-a",
  issuer: "https://identity.example.test", subject: "customer-admin-subject",
  createdAt: "2026-11-03T00:00:00.000Z", lastSeenAt: "2026-11-03T00:00:00.000Z",
  idleExpiresAt: "2026-11-04T00:00:00.000Z", absoluteExpiresAt: "2026-11-10T00:00:00.000Z",
};
const provider = {
  providerKey: "mail-primary", displayName: "Primary Mail", adapterKey: "synthetic",
  adapterVersion: "1.0.0", capabilities: ["email.send", "email.template"],
  authModes: ["synthetic"], configurationSchema: { type: "object" }, status: "ACTIVE",
  version: 1, createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z",
  updatedBy: "product-admin",
};

function fixture() {
  const calls = [];
  const dependencies = {
    customerOidcPublicOrigin: "http://127.0.0.1",
    customerCsrfSecret: csrfSecret,
    customerIdentitySessionStore: { async resolveSession(token) { return token === sessionToken ? session : null; } },
    tenantApplicationAssignmentStore: { async listActive(tenantId) { return tenantId === session.tenantId ? ["app-a"] : []; } },
    actorApplicationAssignmentStore: { async isAssigned(tenantId, actorId, applicationId) {
      return tenantId === session.tenantId && actorId === session.actorId && applicationId === "app-a";
    } },
    workflowActorRoleAssignmentStore: {
      async listActiveRoleIds() { return ["customer-admin-role"]; },
      async hasPermission(tenantId, applicationId, actorId, roleId, permission) {
        calls.push(["permission", permission]);
        return permission === "provider.connection.read" || permission === "provider.connection.create";
      },
    },
    providerCatalogueRepository: { async list(limit) { calls.push(["catalogue-list", limit]); return [provider, { ...provider, providerKey: "old-mail", status: "SUSPENDED" }]; } },
    providerConnectionRepository: {
      async listForApplication(tenantId, applicationId) {
        calls.push(["connection-list", tenantId, applicationId]);
        return [{ tenantId, applicationId, connectionId: "00000000-0000-4000-8000-000000000001",
          providerKey: "mail-primary", displayName: "Primary Mail", authMode: "synthetic",
          status: "PENDING_VALIDATION", bindingStatus: "PENDING_VALIDATION",
          environment: "sandbox", safeMetadata: {}, version: 1,
          allowedCapabilities: ["email.send"], createdAt: "2026-11-03T00:00:00.000Z",
          updatedAt: "2026-11-03T00:00:00.000Z" }];
      },
      async createAndBindApplication(input) {
        calls.push(["create-and-bind", input]);
        return { connection: {
          tenantId: input.tenantId, applicationId: input.applicationId,
          connectionId: "00000000-0000-4000-8000-000000000002", providerKey: input.providerKey,
          displayName: input.displayName, authMode: input.authMode, status: "PENDING_VALIDATION",
          environment: input.environment, safeMetadata: {}, version: 1,
          createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z",
        }, bindingStatus: "PENDING_VALIDATION" };
      },
    },
    adminConfigEnvironment: "sandbox",
  };
  return { calls, dependencies };
}

test("Customer Admin provider connection UI is served with restrictive headers", async () => {
  process.env.EPER_PROVIDER_CONNECTION_API_ENABLED = "true";
  const { dependencies } = fixture();
  const server = createAppServer(dependencies);
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/provider-connections/ui");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    const html = await response.text();
    assert.match(html, /Customer Admin · Provider connections/);
    assert.match(html, /Create &amp; bind to application/);
    assert.match(html, /Bind existing connection here/);
    assert.match(html, /Validate/);
    assert.match(html, /synthetic credential references only/);
    const scripts = html.split("<script>").slice(1).map(chunk => chunk.split("</script>")[0]);
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new vm.Script(scripts[0]));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousConnectionFlag === undefined) delete process.env.EPER_PROVIDER_CONNECTION_API_ENABLED;
    else process.env.EPER_PROVIDER_CONNECTION_API_ENABLED = previousConnectionFlag;
  }
});

test("Customer Admin sees only active provider metadata and can create an application-bound synthetic connection", async () => {
  process.env.EPER_PROVIDER_CONNECTION_API_ENABLED = "true";
  const { calls, dependencies } = fixture();
  const server = createAppServer(dependencies);
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    dependencies.customerOidcPublicOrigin = base;
    const cookie = "__Host-eper_session=" + sessionToken + "; __Host-eper_csrf=" + csrfToken;
    const unauthenticated = await fetch(base + "/customer/applications/app-a/provider-catalogue", {
      headers: { accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(unauthenticated.status, 401);
    const read = await fetch(base + "/customer/applications/app-a/provider-catalogue", {
      headers: { cookie, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(read.status, 200);
    const catalogue = (await read.json()).data.providers;
    assert.deepEqual(catalogue, [{ providerKey: "mail-primary", displayName: "Primary Mail",
      capabilities: ["email.send", "email.template"], authModes: ["synthetic"] }]);
    assert.ok(!JSON.stringify(catalogue).includes("configurationSchema"));
    assert.ok(!JSON.stringify(catalogue).includes("SUSPENDED"));

    const mutationBody = JSON.stringify({ providerKey: "mail-primary", displayName: "App Mail",
      authMode: "synthetic", secretReference: "synthetic://customer/test",
      environment: "sandbox", allowedCapabilities: ["email.send"] });
    const noCsrf = await fetch(base + "/customer/applications/app-a/provider-connections", {
      method: "POST", headers: { cookie, origin: base,
        accept: "application/vnd.eper.v1+json", "content-type": "application/json" },
      body: mutationBody,
    });
    assert.equal(noCsrf.status, 403);
    assert.equal(calls.some(entry => entry[0] === "create-and-bind"), false);
    const created = await fetch(base + "/customer/applications/app-a/provider-connections", {
      method: "POST",
      headers: { cookie, origin: base, "x-csrf-token": csrfToken,
        accept: "application/vnd.eper.v1+json", "content-type": "application/json" },
      body: mutationBody,
    });
    assert.equal(created.status, 201);
    const call = calls.find(entry => entry[0] === "create-and-bind")[1];
    assert.equal(call.tenantId, session.tenantId);
    assert.equal(call.applicationId, "app-a");
    assert.equal(call.actorId, session.actorId);
    assert.equal(call.safeMetadata && Object.keys(call.safeMetadata).length, 0);
    assert.equal(call.secretReference, "synthetic://customer/test");
    assert.ok(calls.some(entry => entry[0] === "permission" && entry[1] === "provider.connection.create"));
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete process.env.EPER_PROVIDER_CONNECTION_API_ENABLED;
  }
});
