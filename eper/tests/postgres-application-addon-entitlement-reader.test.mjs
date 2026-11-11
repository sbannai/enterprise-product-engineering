import test from "node:test";
import assert from "node:assert/strict";
import { PostgresApplicationAddonEntitlementReader } from "../dist/packages/addon-entitlements/postgres-application-addon-entitlement-reader.js";
import { ApplicationAddonAccessGate, ApplicationAddonAccessDeniedError } from "../dist/packages/addon-entitlements/application-addon-access-gate.js";

function fixtureRow(overrides = {}) {
  return {
    tenant_id: "tenant-a", application_id: "app-a", addon_key: "peripheral_management",
    entitlement_status: "active", price_id: "price-1", accepted_price_version: "2",
    agreed_amount: "125.0000", agreed_currency: "INR ", billing_interval: "monthly",
    effective_from: "2026-11-01T00:00:00.000Z", effective_to: null,
    usage_limit: { devices: 5 }, version: "3", ...overrides,
  };
}
function fakePool({ entitlementRows = [fixtureRow()], catalogueStatus = "active" } = {}) {
  const calls = [];
  let released = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("FROM eper_application_addon_entitlement")) return { rows: entitlementRows, rowCount: entitlementRows.length };
      if (sql.includes("FROM eper_module_catalog")) return { rows: catalogueStatus ? [{ status: catalogueStatus }] : [], rowCount: catalogueStatus ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    },
    release() { released++; },
  };
  return { pool: { async connect() { return client; } }, calls, released: () => released };
}

test("reader sets transaction-local tenant and application RLS context and maps row", async () => {
  const fake = fakePool();
  const reader = new PostgresApplicationAddonEntitlementReader(fake.pool);
  const row = await reader.get({ tenantId: "tenant-a", applicationId: "app-a", addonKey: "peripheral_management" });
  assert.equal(row.tenantId, "tenant-a");
  assert.equal(row.applicationId, "app-a");
  assert.equal(row.agreedAmount, "125.0000");
  assert.equal(row.agreedCurrency, "INR");
  assert.equal(row.acceptedPriceVersion, 2);
  assert.deepEqual(row.usageLimit, { devices: 5 });
  assert.ok(fake.calls.some(c => c.sql.includes("set_config('eper.tenant_id'") && c.values[0] === "tenant-a"));
  assert.ok(fake.calls.some(c => c.sql.includes("set_config('eper.application_id'") && c.values[0] === "app-a"));
  assert.ok(fake.calls.some(c => c.sql.includes("WHERE tenant_id = $1 AND application_id = $2 AND addon_key = $3") &&
    c.values.join("|") === "tenant-a|app-a|peripheral_management"));
  assert.ok(fake.calls.some(c => c.sql === "COMMIT"));
  assert.equal(fake.released(), 1);
});

test("reader returns null when the scoped application has no entitlement", async () => {
  const fake = fakePool({ entitlementRows: [] });
  const reader = new PostgresApplicationAddonEntitlementReader(fake.pool);
  assert.equal(await reader.get({ tenantId: "tenant-b", applicationId: "app-b", addonKey: "peripheral_management" }), null);
  assert.ok(fake.calls.some(c => c.sql.includes("WHERE tenant_id = $1 AND application_id = $2 AND addon_key = $3") &&
    c.values.join("|") === "tenant-b|app-b|peripheral_management"));
});

test("reader rolls back and releases pooled client after query failure", async () => {
  const calls = [];
  let released = 0;
  const pool = { async connect() { return {
    async query(sql) { calls.push(sql); if (sql.includes("FROM eper_application_addon_entitlement")) throw new Error("db_failure"); return { rows: [], rowCount: 0 }; },
    release() { released++; },
  }; } };
  const reader = new PostgresApplicationAddonEntitlementReader(pool);
  await assert.rejects(reader.get({ tenantId: "tenant-a", applicationId: "app-a", addonKey: "peripheral_management" }), /db_failure/);
  assert.ok(calls.includes("ROLLBACK"));
  assert.equal(released, 1);
});

test("combined reader and access gate deny another application's entitlement", async () => {
  const fake = fakePool({ entitlementRows: [] });
  const reader = new PostgresApplicationAddonEntitlementReader(fake.pool);
  const gate = new ApplicationAddonAccessGate(reader, reader, () => new Date("2026-11-10T04:00:00.000Z"));
  await assert.rejects(
    gate.assertAllowed({ tenantId: "tenant-b", applicationId: "app-b", addonKey: "peripheral_management" }),
    error => error instanceof ApplicationAddonAccessDeniedError && error.decision.reason === "ENTITLEMENT_NOT_FOUND",
  );
  assert.ok(fake.calls.some(c => c.sql.includes("set_config('eper.tenant_id'") && c.values[0] === "tenant-b"));
  assert.ok(fake.calls.some(c => c.sql.includes("set_config('eper.application_id'") && c.values[0] === "app-b"));
});

test("gate grants only when the scoped entitlement and published catalogue both allow it", async () => {
  const fake = fakePool();
  const reader = new PostgresApplicationAddonEntitlementReader(fake.pool);
  const gate = new ApplicationAddonAccessGate(reader, reader, () => new Date("2026-11-10T04:00:00.000Z"));
  const granted = await gate.assertAllowed({ tenantId: "tenant-a", applicationId: "app-a", addonKey: "peripheral_management" });
  assert.equal(granted.addonKey, "peripheral_management");
  assert.ok(fake.calls.some(c => c.sql.includes("FROM eper_module_catalog")));
});

test("draft catalogue blocks otherwise active entitlement", async () => {
  const fake = fakePool({ catalogueStatus: "draft" });
  const reader = new PostgresApplicationAddonEntitlementReader(fake.pool);
  const gate = new ApplicationAddonAccessGate(reader, reader, () => new Date("2026-11-10T04:00:00.000Z"));
  await assert.rejects(gate.assertAllowed({ tenantId: "tenant-a", applicationId: "app-a", addonKey: "peripheral_management" }),
    error => error instanceof ApplicationAddonAccessDeniedError && error.decision.reason === "CATALOGUE_NOT_PUBLISHED");
});

test("malformed persisted amounts and timestamps fail closed", async () => {
  for (const overrides of [
    { agreed_amount: "-1.00" },
    { agreed_amount: "12.12345" },
    { effective_from: "not-a-date" },
    { accepted_price_version: "0" },
    { version: "9007199254740993" },
  ]) {
    const fake = fakePool({ entitlementRows: [fixtureRow(overrides)] });
    const reader = new PostgresApplicationAddonEntitlementReader(fake.pool);
    await assert.rejects(
      reader.get({ tenantId: "tenant-a", applicationId: "app-a", addonKey: "peripheral_management" }),
    );
    assert.ok(fake.calls.some(c => c.sql === "ROLLBACK"));
    assert.equal(fake.released(), 1);
  }
});


test("unknown persisted catalogue status fails closed", async () => {
  const fake = fakePool({ catalogueStatus: "published-ish" });
  const reader = new PostgresApplicationAddonEntitlementReader(fake.pool);
  await assert.rejects(reader.getStatus("peripheral_management"), /APPLICATION_ADDON_CATALOGUE_STATUS_INVALID/);
  assert.equal(fake.released(), 1);
});
