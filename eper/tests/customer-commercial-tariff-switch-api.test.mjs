import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "eper-customer-commercial-switch-test-token-with-32-chars";

test("customer tariff switch rejects legacy bearer identity in durable OIDC mode", async () => {
  const keys = ["EPER_CUSTOMER_IDENTITY_PERSISTENCE", "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_ADMIN_CONFIG_API_ENABLED", "EPER_ADMIN_CONFIG_PERSISTENCE", "EPER_AUDIT_PERSISTENCE",
    "EPER_CUSTOMER_ACCESS_IDENTITIES_JSON"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    EPER_CUSTOMER_IDENTITY_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE: "postgres",
    EPER_ADMIN_CONFIG_API_ENABLED: "true",
    EPER_ADMIN_CONFIG_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ACCESS_IDENTITIES_JSON: JSON.stringify({
      [TOKEN]: { tenantId: "tenant-customer", actorId: "customer-owner", roleKey: "customer-admin" },
    }),
  });
  let switchCalls = 0;
  const store = {
    async getCustomerTariffAssignment(tenantId) { return { tenantId, version: 3, billingBasis: "single_application", acceptedAmount: "599.00" }; },
    async listAssignments() { return [{applicationId:"app-a",status:"active",version:2}]; },
    async switchCustomerTariff() { switchCalls++; throw new Error("legacy bearer identity must never reach tariff switching"); },
  };
  const server = createAppServer({
    tenantApplicationAssignmentStore: store,
    customerIdentitySessionStore: { async resolveSession() { return null; } },
    actorApplicationAssignmentStore: { async listActive() { return ["app-a"]; } },
    commercialTariffAdminStore: { async list() { return []; } },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/customer/commercial-tariff`;
    const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    const catalogue = await fetch(url, { headers });
    assert.equal(catalogue.status, 401, "durable OIDC mode must not accept legacy bearer identity");
    const denied = await fetch(url, { method: "POST", headers, body: JSON.stringify({
      tariffKey: "multi-app", tariffVersion: 2, expectedVersion: 1,
      accepted: true, acceptanceReference: "CONTRACT-2026-01",
    }) });
    assert.equal(denied.status, 401);
    assert.equal(switchCalls, 0, "unauthenticated bearer identity must not invoke the tariff store");
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
