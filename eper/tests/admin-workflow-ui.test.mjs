import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "eper-workflow-config-test-token-more-than-32-characters";

test("workflow studio, role permissions, access checks and shared toast UI are integrated", async () => {
  const keys = ["EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_API_TOKEN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { EPER_ADMIN_CONFIG_API_ENABLED: "true", EPER_ADMIN_CONFIG_API_TOKEN: TOKEN });
  const server = createAppServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

    const uiResponse = await fetch(`${base}/admin/workflow-ui`);
    assert.equal(uiResponse.status, 200);
    assert.equal(uiResponse.headers.get("x-content-type-options"), "nosniff");
    assert.equal(uiResponse.headers.get("x-frame-options"), "DENY");
    assert.equal(uiResponse.headers.get("referrer-policy"), "no-referrer");
    assert.equal(uiResponse.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    assert.equal(uiResponse.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.match(uiResponse.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.equal(uiResponse.headers.get("cache-control"), "no-store");
    const html = await uiResponse.text();
    assert.match(html, /name="viewport" content="width=device-width,initial-scale=1"/i);
    assert.match(html, /@media\s*\(max-width:\s*850px\)/i, "workflow layout must collapse at tablet widths");
    assert.match(html, /@media\s*\(max-width:\s*540px\)/i, "workflow forms must stack on narrow phones");
    assert.match(html, /Workflow designer/);
    assert.match(html, /Roles &amp; access|Roles & access/);
    assert.match(html, /Generated activities/);
    assert.match(html, /eper-toast-region/);
    assert.match(html, /window\.EPERToast/);
    const scripts = html.split("<script>").slice(1).map((chunk) => chunk.split("</script>")[0]);
    assert.ok(scripts.length >= 2, "shared toast and workflow scripts should be present");
    for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script), "embedded UI JavaScript must parse");

    const noAuth = await fetch(`${base}/admin/config/workflows`);
    assert.equal(noAuth.status, 401);

    const roleSave = await fetch(`${base}/admin/config/roles-access`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ roles: [{
        id: "fee-approver", name: "Fee Approver", description: "Approves fee adjustments",
        members: ["principal-1001"], permissions: ["workflow:view", "workflow:approve"],
      }] }),
    });
    assert.equal(roleSave.status, 200);
    assert.equal((await roleSave.json()).roles.length, 1);

    const workflowSave = await fetch(`${base}/admin/config/workflows`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ workflows: [{
        id: "fee-approval", name: "Fee approval", description: "Review fee adjustment",
        status: "ACTIVE", activities: [{
          id: "manager-review", title: "Manager review", type: "APPROVAL", roleId: "fee-approver",
          permission: "workflow:approve", nextActivityIds: [],
          fields: [{ id: "reason", label: "Reason", type: "textarea", required: true }],
        }],
      }] }),
    });
    assert.equal(workflowSave.status, 200);
    assert.equal((await workflowSave.json()).workflows[0].activities[0].fields[0].id, "reason");

    const allowed = await fetch(`${base}/admin/config/access-check`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ principalId: "principal-1001", permission: "workflow:approve", workflowId: "fee-approval" }),
    });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).allowed, true);

    const denied = await fetch(`${base}/admin/config/access-check`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ principalId: "principal-unknown", permission: "workflow:approve", workflowId: "fee-approval" }),
    });
    assert.equal(denied.status, 200);
    assert.equal((await denied.json()).allowed, false);

    const inactive = await fetch(`${base}/admin/config/access-check`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ principalId: "principal-1001", permission: "workflow:approve", workflowId: "missing-workflow" }),
    });
    assert.equal((await inactive.json()).allowed, false);

    const invalid = await fetch(`${base}/admin/config/roles-access`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ roles: [{ id: "bad", name: "Bad role", members: ["u"], permissions: ["admin:everything"] }] }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
