import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const requiredFlags = [
  "EPER_APPLICATION_PERIPHERAL_API_ENABLED",
  "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
  "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
  "EPER_AUDIT_PERSISTENCE",
  "EPER_CUSTOMER_OIDC_ENABLED",
];
const withPeripheralUi = async (callback) => {
  const previous = Object.fromEntries(requiredFlags.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_APPLICATION_PERIPHERAL_API_ENABLED: "true",
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_OIDC_ENABLED: "true",
  });
  // Static UI tests do not exercise persistence; provide dependency sentinels
  // so the server's production fail-closed startup contract remains intact.
  const server = createAppServer({
    customerIdentitySessionStore: {},
    tenantApplicationAssignmentStore: {},
    actorApplicationAssignmentStore: {},
    workflowActorRoleAssignmentStore: {},
    peripheralService: {},
    customerOidcPublicOrigin: "https://eper.test",
    customerCsrfSecret: "test-only-csrf-secret",
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await callback(address.port);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of requiredFlags) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
};

test("peripheral management UI is hidden when the optional capability is disabled", async () => {
  const previous = process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
  delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch("http://127.0.0.1:" + address.port + "/customer/peripherals/ui");
    assert.equal(response.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED;
    else process.env.EPER_APPLICATION_PERIPHERAL_API_ENABLED = previous;
  }
});

test("peripheral management UI is served behind the explicit capability flag with restrictive headers", async () => {
  await withPeripheralUi(async port => {
    const response = await fetch("http://127.0.0.1:" + port + "/customer/peripherals/ui");
    assert.equal(response.status, 200);
    assert.ok((response.headers.get("content-type") || "").includes("text/html"));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy") || "", /default-src 'none'/);
    const html = await response.text();
    assert.match(html, /Peripheral Management/);
    assert.match(html, /Save configuration/);
    assert.match(html, /explicit Activate action/);
  });
});
