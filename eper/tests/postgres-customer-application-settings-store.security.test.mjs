import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCustomerApplicationSettingsStore } from "../packages/workflows/postgres-customer-application-settings-store.js";

function storeThatMustNotConnect() {
  let connections = 0;
  const store = new PostgresCustomerApplicationSettingsStore({
    async connect() {
      connections += 1;
      throw new Error("database should not be reached for invalid config");
    },
  });
  return { store, connections: () => connections };
}

const base = {
  tenantId: "tenant-a",
  actorId: "actor-a",
  settingKey: "marketing",
  expectedVersion: 0,
  environment: "uat",
  correlationId: "settings-test-001",
};

test("customer settings reject raw secret fields before database access", async () => {
  const { store, connections } = storeThatMustNotConnect();
  const cases = [
    { apiKey: "sk_live_not-a-real-key" },
    { nested: { client_secret: "not-a-real-secret" } },
    { integrations: [{ authorization: "Bearer example" }] },
    { payment: { cardNumber: "4111111111111111" } },
  ];
  for (const config of cases) {
    await assert.rejects(
      store.replaceCustomerSetting({ ...base, config }),
      { message: "CUSTOMER_APPLICATION_SETTING_SECRET_FIELD_FORBIDDEN" },
    );
  }
  assert.equal(connections(), 0, "invalid secret-bearing config must be rejected before DB access");
});

test("customer settings reject excessively deep configuration before database access", async () => {
  const { store, connections } = storeThatMustNotConnect();
  let config = "value";
  for (let i = 0; i < 10; i += 1) config = { nested: config };
  await assert.rejects(
    store.replaceCustomerSetting({ ...base, config }),
    { message: "CUSTOMER_APPLICATION_SETTING_CONFIG_TOO_DEEP" },
  );
  assert.equal(connections(), 0);
});

test("customer settings allow ordinary non-secret configuration fields", async () => {
  const { store, connections } = storeThatMustNotConnect();
  await assert.rejects(
    store.replaceCustomerSetting({
      ...base,
      config: { locale: "en-IN", currency: "INR", helpCenterEnabled: true, growthHubEnabled: true },
    }),
    { message: "database should not be reached for invalid config" },
  );
  assert.equal(connections(), 1, "ordinary configuration should proceed to persistence");
});
