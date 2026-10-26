import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("customer portal context requires trusted identity and returns server-mapped navigation", async () => {
  const previousEnabled = process.env.EPER_CUSTOMER_PORTAL_API_ENABLED;
  const previousIdentities = process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
  const previousModules = process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
  const token = "customer-portal-test-token-00000000000000000001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-from-server", actorId: "actor-from-server", roleKey: "customer-admin" }
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-from-server": ["help-center", "growth-hub", "my-applications", "settings"]
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/portal/context";
    const denied = await fetch(url);
    assert.equal(denied.status, 401);
    const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.tenantId, "tenant-from-server");
    assert.equal(body.actorId, "actor-from-server");
    assert.equal(body.roleKey, "customer-admin");
    assert.equal(body.status, "identity_resolved_navigation_only");
    assert.deepEqual(body.navigation.map((item) => item.key), ["home", "help-center", "growth-hub", "applications", "settings"]);
    assert.match(body.note, /routes and data must still enforce authorization independently/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousEnabled === undefined) delete process.env.EPER_CUSTOMER_PORTAL_API_ENABLED;
    else process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = previousEnabled;
    if (previousIdentities === undefined) delete process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON;
    else process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = previousIdentities;
    if (previousModules === undefined) delete process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
    else process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = previousModules;
  }
});

test("customer application access check uses only server-mapped tenant and role context", async () => {
  const keys = ["EPER_CUSTOMER_ACCESS_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-access-policy-test-token-00000000000000000001";
  process.env.EPER_CUSTOMER_ACCESS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "trusted-tenant-a", actorId: "trusted-actor-a", roleKey: "customer" },
  });
  let observed;
  const server = createAppServer({
    moduleEntitlementService: {
      checkModule: async (context, moduleKey) => {
        observed = { context, moduleKey };
        return { allowed: false, reason: "application_not_assigned" };
      },
      checkApplicationAddon: async () => ({ allowed: false, reason: "addon_not_selected" }),
    },
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port +
      "/customer/applications/application-from-path/access/modules/records?tenantId=attacker-tenant&permission=capability.execute";
    const denied = await fetch(url);
    assert.equal(denied.status, 401);
    const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      applicationId: "application-from-path",
      itemKey: "records",
      kind: "modules",
      allowed: false,
      reason: "application_not_assigned",
    });
    assert.deepEqual(observed, {
      context: {
        tenantId: "trusted-tenant-a",
        applicationId: "application-from-path",
        roleKey: "customer",
        permissionKey: "capability.execute",
      },
      moduleKey: "records",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("customer help and growth content is tenant-scoped and module-entitlement enforced", async () => {
  const keys = [
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_WORKSPACE_MODULES_JSON",
    "EPER_CUSTOMER_HELP_CONTENT_JSON",
    "EPER_CUSTOMER_GROWTH_CONTENT_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const tokenA = "tenant-content-a-test-token-00000000000000000001";
  const tokenB = "tenant-content-b-test-token-00000000000000000001";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [tokenA]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
    [tokenB]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-a": ["help-center"],
    "tenant-b": ["growth-hub"],
  });
  process.env.EPER_CUSTOMER_HELP_CONTENT_JSON = JSON.stringify({
    "tenant-a": [{ title: "A-only guide", body: "Tenant A private content" }],
    "tenant-b": [{ title: "B-secret guide", body: "Tenant B private content" }],
  });
  process.env.EPER_CUSTOMER_GROWTH_CONTENT_JSON = JSON.stringify({
    "tenant-a": [{ title: "A growth", body: "Tenant A growth content" }],
    "tenant-b": [{ title: "B-only growth", body: "Tenant B growth content" }],
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    const get = (path, token) => fetch(base + path, { headers: { authorization: "Bearer " + token } });

    const aHelp = await get("/customer/help-center/content", tokenA);
    assert.equal(aHelp.status, 200);
    const aHelpBody = await aHelp.json();
    assert.match(JSON.stringify(aHelpBody), /A-only guide/);
    assert.doesNotMatch(JSON.stringify(aHelpBody), /B-secret guide|Tenant B private content/);

    const aGrowth = await get("/customer/growth-hub/content", tokenA);
    assert.equal(aGrowth.status, 403);
    assert.doesNotMatch(await aGrowth.text(), /B-only growth|Tenant B growth content/);

    const bGrowth = await get("/customer/growth-hub/content", tokenB);
    assert.equal(bGrowth.status, 200);
    const bGrowthBody = await bGrowth.json();
    assert.match(JSON.stringify(bGrowthBody), /B-only growth/);
    assert.doesNotMatch(JSON.stringify(bGrowthBody), /A growth|Tenant A growth content/);

    const bHelp = await get("/customer/help-center/content", tokenB);
    assert.equal(bHelp.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("customer workspace modules fail closed for missing and malformed tenant configuration", async () => {
  const keys = ["EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_WORKSPACE_MODULES_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "tenant-modules-fail-closed-test-token-00000000000000000001";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-safe", actorId: "actor-safe", roleKey: "customer" },
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/workspace/modules";
    for (const configuration of [undefined, "{malformed", JSON.stringify({ "other-tenant": ["help-center"] }), JSON.stringify({ "tenant-safe": "help-center" })]) {
      if (configuration === undefined) delete process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON;
      else process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = configuration;
      const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.data?.modules ?? body.modules, []);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
