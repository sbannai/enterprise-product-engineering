import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "eper-workflow-config-test-token-more-than-32-characters";

test("Customer Admin workflow studio, application roles, draft publishing and shared toast UI are integrated", async () => {
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
    assert.match(html, /Customer Admin/);
    assert.match(html, /Business Rule Engine/);
    assert.match(html, /Visual workflow map/);
    assert.match(html, /Routing rule IDs/);
    assert.match(html, /data-k="routingRuleIds"/);
    assert.match(html, /Application roles/);
    assert.match(html, /customer\.asset\.upload/, "role editor must expose the durable customer asset upload permission");
    assert.match(html, /Application ID/);
    assert.match(html, /workflow-definitions/);
    assert.match(html, /publishWorkflow/);
    assert.match(html, /Publish workflow/);
    assert.doesNotMatch(html, /draft v|published v|Publish version/i, "workflow definition history must remain internal to Customer Admin");
    assert.match(html, /roleIds\.includes\(role\.id\)/);
    assert.match(html, /Generated activities/);
    assert.match(html, /requiredPermission==='workflow:act'.*assignedRolePermissions\.includes\('workflow:admin'\)/);
    assert.match(html, /assignedRolePermissions\.includes\(requiredPermission\)/, "preview must honor permissions on the activity's assigned role");
    assert.match(html, /eper-toast-region/);
    assert.match(html, /window\.EPERToast/);
    const scripts = html.split("<script>").slice(1).map((chunk) => chunk.split("</script>")[0]);
    assert.ok(scripts.length >= 2, "shared toast and workflow scripts should be present");
    for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script), "embedded UI JavaScript must parse");

    const customerUiResponse = await fetch(`${base}/customer/workflow-studio`);
    assert.equal(customerUiResponse.status, 200, "Customer Admin route should serve the shared workflow studio");

    const noAuth = await fetch(`${base}/admin/config/workflows`);
    assert.equal(noAuth.status, 401);

    const roleSave = await fetch(`${base}/admin/config/roles-access`, {
      method: "PUT", headers: auth,
      body: JSON.stringify({ roles: [{
        id: "fee-approver", name: "Fee Approver", description: "Approves fee adjustments",
        members: ["principal-1001"], permissions: ["workflow:view", "workflow:approve", "customer.asset.upload"],
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


test("durable workflow configuration is reserved for mapped Customer Admin identities", async () => {
  const keys = [
    "EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE",
    "EPER_ADMIN_CONFIG_IDENTITIES_JSON", "EPER_ADMIN_CONFIG_API_TOKEN",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const token = "customer-admin-workflow-test-token-with-more-than-32-chars";
  Object.assign(process.env, {
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({
      [token]: { tenantId: "tenant-workflow-01", actorId: "actor-workflow-01", roleKey: "product_admin" },
    }),
  });
  const adminConfigurationStore = {
    async get() { return null; },
    async replace() { throw new Error("write_not_expected"); },
  };
  const server = createAppServer({ adminConfigurationStore });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { authorization: `Bearer ${token}` };
    const productAdmin = await fetch(`${base}/admin/config/workflows`, { headers });
    assert.equal(productAdmin.status, 403);
    assert.equal((await productAdmin.json()).error.code, "CUSTOMER_ADMIN_ROLE_REQUIRED");

    process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON = JSON.stringify({
      [token]: { tenantId: "tenant-workflow-01", actorId: "actor-workflow-01", roleKey: "customer_admin" },
    });
    const customerAdmin = await fetch(`${base}/admin/config/workflows`, { headers });
    assert.equal(customerAdmin.status, 200);
    assert.deepEqual((await customerAdmin.json()).workflows, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
