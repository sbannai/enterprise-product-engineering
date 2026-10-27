import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const ADMIN_TOKEN = "ai-integration-admin-token-with-more-than-32-characters";
const AGENT_TOKEN_A = "ai-agent-maker-token-with-more-than-32-characters";
const AGENT_TOKEN_B = "ai-agent-reviewer-token-with-more-than-32-characters";

function fakeStore() {
  let config = { applications: { "app-off": { enabled: false, provider: "none" }, "app-on": { enabled: true, provider: "openai" } } };
  let version = 1;
  const calls = [];
  return {
    calls,
    async assertReady() {},
    async get(tenantId, resourceType) {
      calls.push({ method: "get", tenantId, resourceType });
      if (resourceType !== "ai-integrations") return null;
      return { tenantId, resourceType, config, version, updatedAt: new Date().toISOString(), updatedBy: "admin-a" };
    },
    async replace(input) {
      calls.push({ method: "replace", input });
      if (input.expectedVersion !== version) {
        const error = new Error("ADMIN_CONFIGURATION_VERSION_CONFLICT");
        error.currentVersion = version;
        throw error;
      }
      config = input.config;
      version += 1;
      return { tenantId: input.tenantId, resourceType: input.resourceType, config, version, updatedAt: new Date().toISOString(), updatedBy: input.actorId };
    },
  };
}

async function withServer(t, store, extraEnv = {}) {
  const keys = [
    "EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON",
    "EPER_ADMIN_CONFIG_API_TOKEN", "EPER_ADMIN_CONFIG_API_ENABLED", "EPER_AI_INTEGRATION_ENFORCEMENT",
    "EPER_AGENTS_API_ENABLED", "EPER_AGENTS_TENANT_ID", "EPER_AGENTS_PRINCIPAL_TOKENS",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({ [ADMIN_TOKEN]: { tenantId: "tenant-a", actorId: "admin-a" } }),
    EPER_AI_INTEGRATION_ENFORCEMENT: "true",
    EPER_AGENTS_API_ENABLED: "true",
    EPER_AGENTS_TENANT_ID: "tenant-a",
    EPER_AGENTS_PRINCIPAL_TOKENS: `maker-a=${AGENT_TOKEN_A};reviewer-b=${AGENT_TOKEN_B}`,
    ...extraEnv,
  });
  const server = createAppServer({ adminConfigurationStore: store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  return { base };
}

test("AI integration admin UI is responsive page served on same origin", async (t) => {
  const { base } = await withServer(t, fakeStore());
  const response = await fetch(base + "/admin/ai-integrations");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /AI Integration Controls/);
  assert.match(html, /Switch OFF/);
  assert.match(html, /Application ID/);
  assert.match(html, /Configuration version/);
});

test("AI integration config requires mapped admin identity and saves versioned tenant config", async (t) => {
  const store = fakeStore();
  const { base } = await withServer(t, store);
  const unauthorized = await fetch(base + "/admin/config/ai-integrations");
  assert.equal(unauthorized.status, 401);

  const headers = { authorization: "Bearer " + ADMIN_TOKEN, "content-type": "application/json" };
  const loaded = await fetch(base + "/admin/config/ai-integrations", { headers });
  assert.equal(loaded.status, 200);
  const current = await loaded.json();
  assert.equal(current.config.applications["app-off"].enabled, false);

  const saved = await fetch(base + "/admin/config/ai-integrations", {
    method: "PUT", headers,
    body: JSON.stringify({ expectedVersion: current.version, config: { applications: {
      "app-off": { enabled: true, provider: "openai" },
    } } }),
  });
  assert.equal(saved.status, 200);
  const result = await saved.json();
  assert.equal(result.config.applications["app-off"].enabled, true);
  assert.equal(result.version, current.version + 1);
  assert.equal(store.calls.at(-1).input.resourceType, "ai-integrations");
  assert.equal(store.calls.at(-1).input.tenantId, "tenant-a");
});

test("AI agent requests enforce per-application OFF/ON after authentication", async (t) => {
  const store = fakeStore();
  const { base } = await withServer(t, store);
  const url = (applicationId) => base + "/v1/agents/sales/drafts?applicationId=" + applicationId;
  const unauthorized = await fetch(url("app-off"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intent: "campaign-brief", input: {} }) });
  assert.equal(unauthorized.status, 401);

  const off = await fetch(url("app-off"), {
    method: "POST", headers: { authorization: "Bearer " + AGENT_TOKEN_A, "content-type": "application/json" },
    body: JSON.stringify({ intent: "campaign-brief", input: {} }),
  });
  assert.equal(off.status, 403);
  assert.equal((await off.json()).error, "ai_integration_disabled_for_application");

  const missingApp = await fetch(base + "/v1/agents/sales/drafts", {
    method: "POST", headers: { authorization: "Bearer " + AGENT_TOKEN_A, "content-type": "application/json" },
    body: JSON.stringify({ intent: "campaign-brief", input: {} }),
  });
  assert.equal(missingApp.status, 400);

  const on = await fetch(base + "/v1/agents/marketing/drafts?applicationId=app-on", {
    method: "POST", headers: { authorization: "Bearer " + AGENT_TOKEN_A, "content-type": "application/json" },
    body: JSON.stringify({ intent: "campaign-brief", input: {} }),
  });
  assert.equal(on.status, 201);
  assert.equal((await on.json()).controls.externalActionsExecuted, false);
});

test("AI integration settings reject unsupported providers and malformed applications", async (t) => {
  const { base } = await withServer(t, fakeStore());
  const headers = { authorization: "Bearer " + ADMIN_TOKEN, "content-type": "application/json" };
  const badProvider = await fetch(base + "/admin/config/ai-integrations", {
    method: "PUT", headers,
    body: JSON.stringify({ expectedVersion: 1, config: { applications: { "app-a": { enabled: true, provider: "unknown" } } } }),
  });
  assert.equal(badProvider.status, 400);
  const badId = await fetch(base + "/admin/config/ai-integrations", {
    method: "PUT", headers,
    body: JSON.stringify({ expectedVersion: 1, config: { applications: { "../app": { enabled: false, provider: "none" } } } }),
  });
  assert.equal(badId.status, 400);
});
