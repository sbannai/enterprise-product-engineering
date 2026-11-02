import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "eper-customer-commercial-switch-test-token-with-32-chars";

test("customer tariff switch requires explicit acceptance and trusted customer-admin identity", async () => {
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
  const calls = [];
  const store = {
    async getCustomerTariffAssignment(tenantId) { return { tenantId, version: 3, billingBasis: "single_application", acceptedAmount: "599.00" }; },
    async listAssignments() { return [{applicationId:"app-a",status:"active",version:2},{applicationId:"app-b",status:"active",version:4}]; },
    async switchCustomerTariff(input) {
      calls.push(input);
      return { tenantId: input.tenantId, tariffKey: input.tariffKey, tariffVersion: input.tariffVersion,
        version: input.expectedVersion + 1, acceptedAmount: "499.00", acceptedCurrency: "INR" };
    },
  };
  const server = createAppServer({ tenantApplicationAssignmentStore: store, customerIdentitySessionStore: {}, actorApplicationAssignmentStore: {}, commercialTariffAdminStore: { async list() { return [{ tariffKey: "multi-app", tariffVersion: 2, billingBasis: "multi_application", maxApplications: 3, amount: "499.00", currency: "INR", billingInterval: "monthly", effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null, tariffStatus: "active" }]; } } });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/customer/commercial-tariff`;
    const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    const catalogue = await fetch(url, { headers });
    assert.equal(catalogue.status, 200);
    const catalogueBody = await catalogue.json();
    assert.deepEqual(catalogueBody.applicationAssignments,[{applicationId:"app-a",status:"active",version:2},{applicationId:"app-b",status:"active",version:4}]);
    assert.equal(catalogueBody.assignment.version, 3);
    assert.equal(catalogueBody.tariffs.length, 1);
    assert.equal(catalogueBody.tariffs[0].tariffKey, "multi-app");
    const unaccepted = await fetch(url, { method: "POST", headers, body: JSON.stringify({
      tariffKey: "multi-app", tariffVersion: 2, expectedVersion: 1,
      accepted: false, acceptanceReference: "CONTRACT-2026-01",
    }) });
    assert.equal(unaccepted.status, 400);
    assert.equal(calls.length, 0);
    const accepted = await fetch(url, { method: "POST", headers, body: JSON.stringify({
      tariffKey: "multi-app", tariffVersion: 2, expectedVersion: 1,
      accepted: true, acceptanceReference: "CONTRACT-2026-01",
      revokeApplications:[{applicationId:"app-b",expectedVersion:4}],
    }) });
    assert.equal(accepted.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tenantId, "tenant-customer");
    assert.equal(calls[0].changedBy, "customer-owner");
    assert.equal(calls[0].acceptanceReference, "CONTRACT-2026-01");
    assert.deepEqual(calls[0].revokeApplications,[{applicationId:"app-b",expectedVersion:4}]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
