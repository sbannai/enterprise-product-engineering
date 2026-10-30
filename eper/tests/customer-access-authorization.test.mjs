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
