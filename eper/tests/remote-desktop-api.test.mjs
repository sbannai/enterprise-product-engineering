import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("Remote Desktop Sharing API is disabled by default", async () => {
  const previous = process.env.EPER_REMOTE_DESKTOP_API_ENABLED;
  delete process.env.EPER_REMOTE_DESKTOP_API_ENABLED;
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      "http://127.0.0.1:" + address.port +
      "/customer/applications/application-01/remote-desktop/sessions",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_REMOTE_DESKTOP_API_ENABLED;
    else process.env.EPER_REMOTE_DESKTOP_API_ENABLED = previous;
  }
});

test("enabled Remote Desktop Sharing API rejects missing browser identity before service invocation", async () => {
  const keys = [
    "EPER_REMOTE_DESKTOP_API_ENABLED", "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE", "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_OIDC_ENABLED",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_REMOTE_DESKTOP_API_ENABLED: "true",
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_OIDC_ENABLED: "true",
  });
  let serviceCalls = 0;
  const server = createAppServer({
    customerIdentitySessionStore: { async resolveSession() { return null; } },
    tenantApplicationAssignmentStore: { async listActive() { return ["application-01"]; } },
    actorApplicationAssignmentStore: { async isAssigned() { return true; } },
    workflowActorRoleAssignmentStore: {},
    remoteDesktopService: { async requestSession() { serviceCalls++; return {}; } },
    customerOidcPublicOrigin: "https://customer.example.test",
    customerCsrfSecret: "c".repeat(48),
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      "http://127.0.0.1:" + address.port +
      "/customer/applications/application-01/remote-desktop/sessions",
      { method: "POST", headers: { "content-type": "application/json",
        cookie: "__Host-eper_session=" + "t".repeat(43) }, body: JSON.stringify({
          endpointId: "endpoint-01", expiresAt: "2027-01-01T00:00:00.000Z",
        }) },
    );
    assert.equal(response.status, 401);
    assert.equal(serviceCalls, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
