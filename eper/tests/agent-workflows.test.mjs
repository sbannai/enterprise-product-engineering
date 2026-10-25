import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const original = {
  enabled: process.env.EPER_AGENTS_API_ENABLED,
  token: process.env.EPER_AGENTS_API_TOKEN,
  tenant: process.env.EPER_AGENTS_TENANT_ID,
  principals: process.env.EPER_AGENTS_ALLOWED_PRINCIPALS,
};
const token = "agents-test-token-with-at-least-32-characters";
let server;
let baseUrl;

test("governed CRM, sales and marketing agent draft workflow", async (t) => {
  process.env.EPER_AGENTS_API_ENABLED = "true";
  process.env.EPER_AGENTS_API_TOKEN = token;
  process.env.EPER_AGENTS_TENANT_ID = "tenant-test";
  process.env.EPER_AGENTS_ALLOWED_PRINCIPALS = "maker-test,reviewer-test";
  server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { method = "GET", principal = "maker-test", body } = {}) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "x-eper-principal-id": principal,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, json: await response.json() };
  }

  await t.test("creates draft-only outputs for each agent", async () => {
    const cases = [
      ["crm", "lead-qualification", { context: "School lead requested a demo" }],
      ["sales", "follow-up", { objective: "school ERP demo", audience: "the admissions team" }],
      ["marketing", "campaign-brief", { objective: "admissions open day", audience: "school administrators" }],
    ];
    for (const [agent, intent, input] of cases) {
      const result = await request(`/v1/agents/${agent}/drafts`, { method: "POST", body: { intent, input } });
      assert.equal(result.status, 201);
      assert.equal(result.json.draft.agent, agent);
      assert.equal(result.json.draft.status, "PENDING_APPROVAL");
      assert.equal(result.json.controls.externalActionsExecuted, false);
      assert.equal(result.json.controls.crmWritesExecuted, false);
    }
  });

  await t.test("requires a different principal to approve and never executes side effects", async () => {
    const created = await request("/v1/agents/sales/drafts", {
      method: "POST", body: { intent: "proposal-outline", input: { objective: "admissions workflow improvement" } },
    });
    assert.equal(created.status, 201);
    const id = created.json.draft.id;
    const selfApproval = await request(`/v1/agents/drafts/${id}/approve`, { method: "POST", body: {} });
    assert.equal(selfApproval.status, 403);
    assert.equal(selfApproval.json.error, "maker_checker_separation_required");
    const approval = await request(`/v1/agents/drafts/${id}/approve`, { method: "POST", principal: "reviewer-test", body: { note: "Reviewed in test" } });
    assert.equal(approval.status, 200);
    assert.equal(approval.json.draft.status, "APPROVED");
    assert.equal(approval.json.execution, "NOT_EXECUTED");
  });

  await t.test("rejects unsupported intent and denies unknown principals", async () => {
    const unsupported = await request("/v1/agents/crm/drafts", { method: "POST", body: { intent: "delete-all", input: {} } });
    assert.equal(unsupported.status, 400);
    const denied = await fetch(baseUrl + "/v1/agents/drafts", {
      headers: { authorization: `Bearer ${token}`, "x-eper-principal-id": "intruder" },
    });
    assert.equal(denied.status, 403);
  });

  await t.test("lists tenant-scoped drafts", async () => {
    const listed = await request("/v1/agents/drafts");
    assert.equal(listed.status, 200);
    assert.ok(listed.json.total >= 4);
    assert.ok(listed.json.drafts.every((draft) => draft.tenantId === "tenant-test"));
  });
});

test.after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  for (const [key, value] of Object.entries({
    EPER_AGENTS_API_ENABLED: original.enabled,
    EPER_AGENTS_API_TOKEN: original.token,
    EPER_AGENTS_TENANT_ID: original.tenant,
    EPER_AGENTS_ALLOWED_PRINCIPALS: original.principals,
  })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
