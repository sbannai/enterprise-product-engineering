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
    const versioned = await fetch(url, { headers: { authorization: "Bearer " + token, accept: "application/vnd.eper.v1+json", "x-tenant-id": "attacker-tenant", "x-actor-id": "attacker-actor", "x-role-key": "super-admin" } });
    assert.equal(versioned.status, 200);
    const versionedBody = await versioned.json();
    assert.equal(versionedBody.success, true);
    assert.equal(versionedBody.data.tenantId, "tenant-from-server");
    assert.equal(versionedBody.data.actorId, "actor-from-server", "caller headers must not override the mapped actor");
    assert.equal(versionedBody.data.roleKey, "customer-admin", "caller headers must not override the mapped role");
    assert.deepEqual(versionedBody.data.navigation.map((item) => item.key), ["home", "help-center", "growth-hub", "applications", "settings"]);
    assert.ok(versionedBody.meta.requestId);
    assert.equal(versioned.headers.get("x-request-id"), versionedBody.meta.requestId);
    const versionedDenied = await fetch(url, { headers: { accept: "application/vnd.eper.v1+json" } });
    assert.equal(versionedDenied.status, 401);
    const deniedBody = await versionedDenied.json();
    assert.equal(deniedBody.success, false);
    assert.equal(deniedBody.error.code, "UNAUTHORIZED", "portal-context legacy auth errors retain their existing code in the versioned envelope");
    assert.ok(deniedBody.meta.requestId);
    assert.equal(versionedDenied.headers.get("x-request-id"), deniedBody.meta.requestId);
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
    const response = await fetch(url, { headers: {
      authorization: "Bearer " + token,
      "x-tenant-id": "attacker-tenant",
      "x-actor-id": "attacker-actor",
      "x-role-key": "super-admin",
    } });
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
    const versioned = await fetch(url, { headers: {
      authorization: "Bearer " + token,
      accept: "application/vnd.eper.v1+json",
      "x-tenant-id": "attacker-tenant",
      "x-role-key": "super-admin",
    } });
    assert.equal(versioned.status, 200);
    const versionedBody = await versioned.json();
    assert.equal(versionedBody.success, true);
    assert.equal(versionedBody.data.tenantId, undefined, "access decision must not expose or accept caller-supplied tenant identity");
    assert.equal(versionedBody.data.applicationId, "application-from-path");
    assert.equal(versionedBody.data.allowed, false);
    assert.ok(versionedBody.meta.requestId);
    assert.equal(versioned.headers.get("x-request-id"), versionedBody.meta.requestId);
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


test("customer identity mapping rejects non-canonical tenant, actor, and role identifiers", async () => {
  const keys = ["EPER_CUSTOMER_PORTAL_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-identity-canonical-test-token-000000000001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/portal/context";
    for (const identity of [
      { tenantId: " tenant-a", actorId: "actor-a", roleKey: "customer" },
      { tenantId: "tenant-a", actorId: "actor-a ", roleKey: "customer" },
      { tenantId: "tenant-a", actorId: "actor-a", roleKey: " customer" },
    ]) {
      process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({ [token]: identity });
      const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "unauthorized" });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("customer application list returns only server-assigned applications for the authenticated tenant", async () => {
  const keys = [
    "EPER_CUSTOMER_PORTAL_API_ENABLED",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const tokenA = "customer-app-list-a-token-00000000000000000001";
  const tokenB = "customer-app-list-b-token-00000000000000000001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [tokenA]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
    [tokenB]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({
    "tenant-a": ["app-a", "app-a", "app-a-2"],
    "tenant-b": ["app-b"],
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/applications?tenantId=tenant-b";
    const anonymous = await fetch(url);
    assert.equal(anonymous.status, 401);
    const responseA = await fetch(url, { headers: { authorization: "Bearer " + tokenA, "x-tenant-id": "tenant-b" } });
    assert.equal(responseA.status, 200);
    assert.deepEqual(await responseA.json(), { applications: [{ applicationId: "app-a" }, { applicationId: "app-a-2" }] });
    const versionedA = await fetch(url, { headers: {
      authorization: "Bearer " + tokenA,
      accept: "application/vnd.eper.v1+json",
      "x-tenant-id": "tenant-b",
      "x-actor-id": "attacker-actor",
      "x-role-key": "super-admin",
    } });
    assert.equal(versionedA.status, 200);
    const versionedBody = await versionedA.json();
    assert.equal(versionedBody.success, true);
    assert.deepEqual(versionedBody.data.applications, [{ applicationId: "app-a" }, { applicationId: "app-a-2" }]);
    assert.ok(versionedBody.meta.requestId);
    assert.equal(versionedA.headers.get("x-request-id"), versionedBody.meta.requestId);
    const responseB = await fetch(url, { headers: { authorization: "Bearer " + tokenB } });
    assert.equal(responseB.status, 200);
    assert.deepEqual(await responseB.json(), { applications: [{ applicationId: "app-b" }] });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("customer application list fails closed for malformed or non-canonical assignment configuration", async () => {
  const keys = [
    "EPER_CUSTOMER_PORTAL_API_ENABLED",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-app-list-invalid-config-token-0000000001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/applications";
    for (const invalidConfig of [
      "{malformed",
      JSON.stringify({ "tenant-a": "app-a" }),
      JSON.stringify({ "tenant-a": ["app-a", " app-b"] }),
      JSON.stringify({ "tenant-a": ["app-a", 42] }),
    ]) {
      process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = invalidConfig;
      const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "customer_applications_unavailable" });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("customer application list is unavailable unless explicitly enabled and configured", async () => {
  const keys = [
    "EPER_CUSTOMER_PORTAL_API_ENABLED",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-app-list-gate-token-00000000000000000001";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/applications";
    process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "false";
    const disabled = await fetch(url, { headers: { authorization: "Bearer " + token } });
    assert.equal(disabled.status, 404);
    assert.deepEqual(await disabled.json(), { error: "not_found" });
    process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
    delete process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON;
    const unconfigured = await fetch(url, { headers: { authorization: "Bearer " + token } });
    assert.equal(unconfigured.status, 503);
    assert.deepEqual(await unconfigured.json(), { error: "customer_applications_unavailable" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("customer application settings expose only safe preferences for assigned applications", async () => {
  const keys = [
    "EPER_CUSTOMER_PORTAL_API_ENABLED",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_WORKSPACE_MODULES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON",
    "EPER_CUSTOMER_APPLICATION_SETTINGS_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const tokenA = "customer-settings-tenant-a-token-000000000001";
  const tokenB = "customer-settings-tenant-b-token-000000000001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [tokenA]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
    [tokenB]: { tenantId: "tenant-b", actorId: "actor-b", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({
    "tenant-a": ["settings"], "tenant-b": ["settings"],
  });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({
    "tenant-a": ["app-a"], "tenant-b": ["app-b"],
  });
  process.env.EPER_CUSTOMER_APPLICATION_SETTINGS_JSON = JSON.stringify({
    "tenant-a": { "app-a": { displayName: "Admissions", locale: "en-IN", currency: "INR", timeZone: "Asia/Kolkata", theme: "light", apiSecret: "never-expose-this" }, "app-invalid": { displayName: " ", locale: "not_a_locale", currency: "usd", timeZone: "Mars/Olympus", theme: "auto", apiSecret: "never-expose-this" } },
    "tenant-b": { "app-b": { displayName: "Billing", currency: "USD", apiSecret: "tenant-b-secret" } },
  });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/settings?applicationId=";
    const own = await fetch(url + "app-a", { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(own.status, 200);
    assert.deepEqual(await own.json(), { applicationId: "app-a", settings: { displayName: "Admissions", locale: "en-IN", currency: "INR", timeZone: "Asia/Kolkata", theme: "light" } });
    const foreign = await fetch(url + "app-b", { headers: {
      authorization: "Bearer " + tokenA,
      "x-tenant-id": "tenant-b",
      "x-actor-id": "actor-b",
      "x-role-key": "super-admin",
    } });
    assert.equal(foreign.status, 403, "caller-supplied identity headers must not grant access to another tenant's application");
    assert.deepEqual(await foreign.json(), { error: "application_not_assigned_to_tenant" });
    const tenantB = await fetch(url + "app-b", { headers: { authorization: "Bearer " + tokenB } });
    assert.equal(tenantB.status, 200);
    assert.deepEqual(await tenantB.json(), { applicationId: "app-b", settings: { displayName: "Billing", currency: "USD" } });
    const standardized = await fetch(url + "app-a", {
      headers: { authorization: "Bearer " + tokenA, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(standardized.status, 200);
    const standardizedBody = await standardized.json();
    assert.equal(standardizedBody.success, true);
    assert.deepEqual(standardizedBody.data, { applicationId: "app-a", settings: { displayName: "Admissions", locale: "en-IN", currency: "INR", timeZone: "Asia/Kolkata", theme: "light" } });
    assert.ok(standardized.headers.get("x-request-id"));
    const standardizedForbidden = await fetch(url + "app-b", {
      headers: { authorization: "Bearer " + tokenA, accept: "application/vnd.eper.v1+json" },
    });
    assert.equal(standardizedForbidden.status, 403);
    const standardizedError = await standardizedForbidden.json();
    assert.equal(standardizedError.success, false);
    assert.equal(standardizedError.error.code, "APPLICATION_NOT_ASSIGNED_TO_TENANT");
    assert.ok(standardizedForbidden.headers.get("x-request-id"));
    const anonymous = await fetch(url + "app-a");
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { error: "unauthorized" });
    const invalidApplication = await fetch(url + "%20bad", { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(invalidApplication.status, 400);
    assert.deepEqual(await invalidApplication.json(), { error: "invalid_application_id" });
    process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": [], "tenant-b": ["settings"] });
    const disabledForTenant = await fetch(url + "app-a", { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(disabledForTenant.status, 403);
    assert.deepEqual(await disabledForTenant.json(), { error: "customer_settings_not_enabled" });
    process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["settings"], "tenant-b": ["settings"] });
    process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a", "app-invalid"], "tenant-b": ["app-b"] });
    const invalidPreferences = await fetch(url + "app-invalid", { headers: { authorization: "Bearer " + tokenA } });
    assert.equal(invalidPreferences.status, 200);
    assert.deepEqual(await invalidPreferences.json(), { applicationId: "app-invalid", settings: {} });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("customer application settings fail closed when settings configuration is missing or malformed", async () => {
  const keys = [
    "EPER_CUSTOMER_PORTAL_API_ENABLED",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_WORKSPACE_MODULES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON",
    "EPER_CUSTOMER_APPLICATION_SETTINGS_JSON",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const token = "customer-settings-config-fail-closed-token-0001";
  process.env.EPER_CUSTOMER_PORTAL_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON = JSON.stringify({ "tenant-a": ["settings"] });
  process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON = JSON.stringify({ "tenant-a": ["app-a"] });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/customer/settings?applicationId=app-a";
    for (const config of [undefined, "{malformed", JSON.stringify({ "tenant-a": "not-an-object" })]) {
      if (config === undefined) delete process.env.EPER_CUSTOMER_APPLICATION_SETTINGS_JSON;
      else process.env.EPER_CUSTOMER_APPLICATION_SETTINGS_JSON = config;
      const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "customer_settings_unavailable" });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
