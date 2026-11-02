import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const PRODUCT_TOKEN = "eper-product-admin-test-token-with-more-than-32-characters";
const CUSTOMER_TOKEN = "eper-customer-admin-test-token-with-more-than-32-characters";

test("commercial tariff API is Product Admin-only and supports audited draft, approval and publication lifecycle", async () => {
  const keys = ["EPER_COMMERCIAL_TARIFF_API_ENABLED", "EPER_ADMIN_CONFIG_API_ENABLED",
    "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_AUDIT_PERSISTENCE", "EPER_ADMIN_CONFIG_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_COMMERCIAL_TARIFF_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_IDENTITIES_JSON: JSON.stringify({
      [PRODUCT_TOKEN]: { tenantId: "platform", actorId: "product-admin", roleKey: "product_admin" },
      [CUSTOMER_TOKEN]: { tenantId: "tenant-a", actorId: "tenant-admin", roleKey: "customer_admin" },
    }),
  });
  const calls = [];
  const store = {
    async list(context) { calls.push(["list", context]); return []; },
    async createDraft(input, context) { calls.push(["createDraft", input, context]); return { ...input, tariffVersion: 1, tariffStatus: "draft", approvalState: input.approvalRequired ? "pending" : "not_required" }; },
    async approve(input, context) { calls.push(["approve", input, context]); return { ...input, approvalState: "approved" }; },
    async publish(input, context) { calls.push(["publish", input, context]); return { ...input, tariffStatus: "active" }; },
  };
  const server = createAppServer({ commercialTariffAdminStore: store });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const admin = { authorization: `Bearer ${PRODUCT_TOKEN}`, "content-type": "application/json" };
    const customer = { authorization: `Bearer ${CUSTOMER_TOKEN}`, "content-type": "application/json" };

    const denied = await fetch(base + "/admin/commercial-tariffs", { headers: customer });
    assert.equal(denied.status, 403);

    const list = await fetch(base + "/admin/commercial-tariffs", { headers: { authorization: admin.authorization } });
    assert.equal(list.status, 200);
    assert.equal(calls[0][0], "list");

    const draft = await fetch(base + "/admin/commercial-tariffs", {
      method: "POST", headers: admin,
      body: JSON.stringify({ tariffKey: "single-app", billingBasis: "single_application", maxApplications: 1,
        amount: "499.00", currency: "INR", billingInterval: "monthly",
        effectiveFrom: "2026-12-01T00:00:00.000Z", changeReason: "Approved catalogue update", approvalRequired: true }),
    });
    assert.equal(draft.status, 201);
    assert.equal(calls[1][0], "createDraft");
    assert.equal(calls[1][1].amount, "499.00");

    const approval = await fetch(base + "/admin/commercial-tariffs/single-app/1/approve", {
      method: "POST", headers: admin, body: JSON.stringify({ approvalReference: "APR-1001" }),
    });
    assert.equal(approval.status, 200);
    assert.equal(calls[2][0], "approve");

    const publish = await fetch(base + "/admin/commercial-tariffs/single-app/1/publish", {
      method: "POST", headers: admin, body: "{}",
    });
    assert.equal(publish.status, 200);
    assert.equal(calls[3][0], "publish");

    const malformed = await fetch(base + "/admin/commercial-tariffs", {
      method: "POST", headers: admin, body: JSON.stringify({ tariffKey: "bad", surprise: true }),
    });
    assert.equal(malformed.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
