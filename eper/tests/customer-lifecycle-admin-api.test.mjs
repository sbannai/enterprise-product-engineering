import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const PRODUCT_TOKEN = "eper-product-admin-lifecycle-test-token-more-than-32-characters";
const CUSTOMER_TOKEN = "eper-customer-lifecycle-test-token-more-than-32-characters";

test("customer lifecycle API is Product Admin-only and uses versioned status changes", async () => {
  const keys = ["EPER_CUSTOMER_LIFECYCLE_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_AUDIT_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_CUSTOMER_LIFECYCLE_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({
      [PRODUCT_TOKEN]: { tenantId: "platform", actorId: "product-admin", roleKey: "product_admin" },
      [CUSTOMER_TOKEN]: { tenantId: "tenant-a", actorId: "customer-admin", roleKey: "customer_admin" },
    }),
  });
  const calls = [];
  const customer = { tenantId: "tenant-a", status: "active", reason: "Onboarded",
    effectiveAt: "2026-11-01T00:00:00.000Z", version: 1,
    updatedAt: "2026-11-01T00:00:00.000Z", updatedBy: "product-admin" };
  const store = {
    async list() { calls.push(["list"]); return [customer]; },
    async get(tenantId) { calls.push(["get", tenantId]); return tenantId === customer.tenantId ? customer : null; },
    async changeStatus(input) { calls.push(["changeStatus", input]); return { ...customer, status: input.status,
      reason: input.reason, effectiveAt: new Date(input.effectiveAt).toISOString(), version: input.expectedVersion + 1 }; },
  };
  const server = createAppServer({ customerLifecycleStore: store });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const admin = { authorization: `Bearer ${PRODUCT_TOKEN}`, "content-type": "application/json" };
    const customerAdmin = { authorization: `Bearer ${CUSTOMER_TOKEN}` };

    const denied = await fetch(base + "/admin/customers", { headers: customerAdmin });
    assert.equal(denied.status, 403);

    const list = await fetch(base + "/admin/customers", { headers: { authorization: admin.authorization } });
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data.customers[0].tenantId, "tenant-a");

    const get = await fetch(base + "/admin/customers/tenant-a", { headers: { authorization: admin.authorization } });
    assert.equal(get.status, 200);
    assert.equal((await get.json()).data.customer.version, 1);

    const changed = await fetch(base + "/admin/customers/tenant-a/status", {
      method: "PATCH", headers: admin,
      body: JSON.stringify({ status: "suspended", reason: "Commercial policy breach",
        effectiveAt: "2026-11-02T03:00:00Z", expectedVersion: 1 }),
    });
    assert.equal(changed.status, 200);
    const changedBody = await changed.json();
    assert.equal(changedBody.data.customer.status, "suspended");
    assert.equal(calls.find(call => call[0] === "changeStatus")[1].changedBy, "product-admin");
    assert.equal(calls.find(call => call[0] === "changeStatus")[1].expectedVersion, 1);

    const malformed = await fetch(base + "/admin/customers/tenant-a/status", {
      method: "PATCH", headers: admin,
      body: JSON.stringify({ status: "disabled", reason: "x", effectiveAt: "2026-11-02T00:00:00Z",
        expectedVersion: 2, unexpected: true }),
    });
    assert.equal(malformed.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
