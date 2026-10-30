import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("customer entitlement checks require tenant ownership and actor application membership", async () => {
  const keys = ["EPER_CUSTOMER_ACCESS_API_ENABLED", "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON",
    "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "customer-access-authorization-token-000000001";
  process.env.EPER_CUSTOMER_ACCESS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  delete process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON;
  const entitlementCalls = [];
  const tenantStore = { async listActive(tenantId) { assert.equal(tenantId, "tenant-a"); return ["app-a"]; } };
  let actorAllowed = true;
  const actorStore = { async isAssigned(tenantId, actorId, applicationId) {
    assert.deepEqual([tenantId, actorId, applicationId], ["tenant-a", "actor-a", "app-a"]);
    return actorAllowed;
  } };
  const moduleEntitlementService = {
    async checkModule(context, moduleKey) {
      entitlementCalls.push({ context, moduleKey });
      return { allowed: true, reason: "allowed" };
    },
    async checkApplicationAddon(context, addonKey) {
      entitlementCalls.push({ context, addonKey });
      return { allowed: true, reason: "allowed" };
    },
  };
  const server = createAppServer({ tenantApplicationAssignmentStore: tenantStore,
    actorApplicationAssignmentStore: actorStore, moduleEntitlementService });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = "http://127.0.0.1:" + address.port;
    const headers = { authorization: "Bearer " + token };
    const allowed = await fetch(base + "/customer/applications/app-a/access/modules/billing", { headers });
    assert.equal(allowed.status, 200);
    assert.equal(entitlementCalls.length, 1);
    assert.equal(entitlementCalls[0].context.applicationId, "app-a");
    const wrongTenant = await fetch(base + "/customer/applications/app-b/access/modules/billing", { headers });
    assert.equal(wrongTenant.status, 403);
    assert.deepEqual(await wrongTenant.json(), { error: "application_not_assigned_to_tenant" });
    actorAllowed = false;
    const wrongActor = await fetch(base + "/customer/applications/app-a/access/addons/marketing", { headers });
    assert.equal(wrongActor.status, 403);
    assert.deepEqual(await wrongActor.json(), { error: "actor_not_assigned_to_application" });
    assert.equal(entitlementCalls.length, 1, "entitlement policy must not run for an unauthorized actor or tenant");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});


test("agent job reads enforce durable tenant ownership and actor membership without environment applicationIds", async () => {
  const keys = ["EPER_AGENTS_API_ENABLED", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON", "EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "agent-job-durable-access-token-000000000001";
  process.env.EPER_AGENTS_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON = JSON.stringify({
    [token]: { tenantId: "tenant-a", actorId: "actor-a", roleKey: "customer" },
  });
  delete process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON;
  const observed = [];
  let tenantApplications = ["app-a"];
  let actorAllowed = false;
  const tenantStore = { async listActive(tenantId) {
    observed.push(["tenant", tenantId]);
    return tenantApplications;
  } };
  const actorStore = { async isAssigned(tenantId, actorId, applicationId) {
    observed.push(["actor", tenantId, actorId, applicationId]);
    return actorAllowed;
  } };
  // The request should be rejected before the job store is queried for denied identities.
  const pool = { async query() { observed.push(["job-store-query"]); return { rows: [] }; } };
  const server = createAppServer({ capabilityPool: pool, tenantApplicationAssignmentStore: tenantStore,
    actorApplicationAssignmentStore: actorStore });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port +
      "/v1/agent-jobs/123e4567-e89b-12d3-a456-426614174000?applicationId=app-a";
    const headers = { authorization: "Bearer " + token };

    tenantApplications = [];
    const wrongTenant = await fetch(url, { headers });
    assert.equal(wrongTenant.status, 403);
    assert.deepEqual(observed, [["tenant", "tenant-a"]], "tenant denial must happen before actor or job-store lookup");

    observed.length = 0;
    tenantApplications = ["app-a"];
    const wrongActor = await fetch(url, { headers });
    assert.equal(wrongActor.status, 403);
    assert.deepEqual(observed, [["tenant", "tenant-a"], ["actor", "tenant-a", "actor-a", "app-a"]],
      "actor denial must happen before job-store lookup");

    observed.length = 0;
    actorAllowed = true;
    const allowed = await fetch(url, { headers });
    assert.equal(allowed.status, 404, "authorized request reaches the job store; no matching job exists");
    assert.deepEqual(observed.slice(0, 2), [["tenant", "tenant-a"], ["actor", "tenant-a", "actor-a", "app-a"]]);
    assert.ok(observed.some(call => call[0] === "job-store-query"));
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});


test("AI draft routes enforce durable tenant and actor assignments before draft creation", async () => {
  const values = {
    EPER_AGENTS_API_ENABLED: "true",
    EPER_AGENTS_PRINCIPAL_TOKENS: "maker=" + "agent-draft-durable-token-000000000000000000",
    EPER_AGENTS_PRINCIPAL_TENANTS_JSON: JSON.stringify({ maker: "tenant-a" }),
    EPER_AGENTS_REVIEWER_PRINCIPALS: "reviewer",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
  };
  const keys = Object.keys(values);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  let tenantApplications = ["app-a"];
  let actorAllowed = false;
  const calls = [];
  const tenantStore = { async listActive(tenantId) {
    calls.push(["tenant", tenantId]);
    return tenantApplications;
  } };
  const actorStore = { async isAssigned(tenantId, actorId, applicationId) {
    calls.push(["actor", tenantId, actorId, applicationId]);
    return actorAllowed;
  } };
  const adminConfigurationStore = { async get(tenantId, resource) {
    assert.equal(tenantId, "tenant-a");
    assert.equal(resource, "ai-integrations");
    return { config: { applications: { "app-a": { enabled: true, provider: "openai" } } } };
  } };
  const server = createAppServer({ tenantApplicationAssignmentStore: tenantStore,
    actorApplicationAssignmentStore: actorStore, adminConfigurationStore });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const endpoint = "http://127.0.0.1:" + address.port + "/v1/agents/sales/drafts?applicationId=app-a";
    const headers = { authorization: "Bearer agent-draft-durable-token-000000000000000000",
      "content-type": "application/json" };
    const body = JSON.stringify({ intent: "follow-up", input: { objective: "authorization regression" } });

    tenantApplications = [];
    let response = await fetch(endpoint, { method: "POST", headers, body });
    assert.equal(response.status, 403);
    assert.deepEqual(calls, [["tenant", "tenant-a"]]);

    calls.length = 0;
    tenantApplications = ["app-a"];
    response = await fetch(endpoint, { method: "POST", headers, body });
    assert.equal(response.status, 403);
    assert.deepEqual(calls, [["tenant", "tenant-a"], ["actor", "tenant-a", "maker", "app-a"]]);

    calls.length = 0;
    actorAllowed = true;
    response = await fetch(endpoint, { method: "POST", headers, body });
    assert.equal(response.status, 201);
    assert.deepEqual(calls, [["tenant", "tenant-a"], ["actor", "tenant-a", "maker", "app-a"]]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
