import test from "node:test";
import assert from "node:assert/strict";
import { PostgresModuleEntitlementService } from "../dist/packages/workflows/postgres-module-entitlement-service.js";

function makePool(row) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("to_regclass")) return { rows: [{
        customer_account: "eper_customer_account",
        module_catalog: "eper_module_catalog",
        module_price: "eper_module_price",
        module_entitlement: "eper_customer_module_entitlement",
        module_permission: "eper_customer_module_permission",
        addon_entitlement: "eper_application_addon_entitlement",
      }], rowCount: 1 };
      return { rows: [row], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

const context = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  roleKey: "customer-admin",
  permissionKey: "module.use",
  now: new Date("2026-10-26T03:00:00Z"),
};

test("module access queries tenant entitlement and role permission using bound parameters", async () => {
  const { pool, calls } = makePool({
    customer_status: "active",
    module_status: "active",
    entitlement_status: "active",
    starts_at: "2026-10-01T00:00:00Z",
    ends_at: null,
    grace_until: null,
    permission_allowed: true,
  });
  const service = new PostgresModuleEntitlementService(pool, {
    async isAssignedToTenant(tenantId, applicationId) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(applicationId, "app-a");
      return true;
    },
  });
  assert.equal((await service.checkModule(context, "billing")).allowed, true);
  const query = calls.find((call) => call.sql.includes("eper_customer_module_entitlement"));
  assert.deepEqual(query.values, ["billing", "tenant-a", "customer-admin", "module.use"]);
});

test("module access blocks existing application when customer is inactive", async () => {
  const { pool } = makePool({
    customer_status: "suspended", module_status: "active", entitlement_status: "active",
    starts_at: null, ends_at: null, grace_until: null, permission_allowed: true,
  });
  const service = new PostgresModuleEntitlementService(pool, { async isAssignedToTenant() { return true; } });
  assert.deepEqual(await service.checkModule(context, "billing"), { allowed: false, reason: "customer_inactive" });
});

test("module access fails closed when application is not assigned to tenant", async () => {
  const { pool, calls } = makePool({});
  const service = new PostgresModuleEntitlementService(pool, {
    async isAssignedToTenant() { return false; },
  });
  assert.deepEqual(await service.checkModule(context, "billing"), {
    allowed: false,
    reason: "application_not_assigned",
  });
  assert.equal(calls.length, 0, "must not query entitlement data for an unassigned application");
});

test("module access fails closed when role permission is absent", async () => {
  const { pool } = makePool({
    customer_status: "active",
    module_status: "active",
    entitlement_status: "active",
    starts_at: null,
    ends_at: null,
    grace_until: null,
    permission_allowed: null,
  });
  const service = new PostgresModuleEntitlementService(pool, {
    async isAssignedToTenant() { return true; },
  });
  assert.deepEqual(await service.checkModule(context, "billing"), {
    allowed: false,
    reason: "role_permission_denied",
  });
});

test("add-on access is application-scoped and pending payment is denied", async () => {
  const { pool, calls } = makePool({
    customer_status: "active",
    addon_status: "active",
    entitlement_status: "pending_payment",
    effective_from: null,
    effective_to: null,
    permission_allowed: true,
  });
  const service = new PostgresModuleEntitlementService(pool, {
    async isAssignedToTenant() { return true; },
  });
  assert.deepEqual(await service.checkApplicationAddon(context, "marketing"), {
    allowed: false,
    reason: "addon_not_active",
  });
  const query = calls.find((call) => call.sql.includes("eper_application_addon_entitlement"));
  assert.deepEqual(query.values, ["marketing", "tenant-a", "app-a", "customer-admin", "module.use"]);
});

test("add-on access fails closed when no entitlement row exists", async () => {
  const { pool } = makePool({
    customer_status: "active",
    addon_status: "active",
    entitlement_status: null,
    effective_from: null,
    effective_to: null,
    permission_allowed: true,
  });
  const service = new PostgresModuleEntitlementService(pool, {
    async isAssignedToTenant() { return true; },
  });
  assert.deepEqual(await service.checkApplicationAddon(context, "ai"), {
    allowed: false,
    reason: "addon_not_selected",
  });
});

test("service readiness requires every entitlement schema table", async () => {
  const { pool } = makePool({});
  await assert.doesNotReject(() => new PostgresModuleEntitlementService(pool, {
    async isAssignedToTenant() { return true; },
  }).assertReady());
});


test("add-on access blocks existing application when customer is inactive", async () => {
  const { pool } = makePool({
    customer_status: "disabled", addon_status: "active", entitlement_status: "active",
    effective_from: null, effective_to: null, permission_allowed: true,
  });
  const service = new PostgresModuleEntitlementService(pool, { async isAssignedToTenant() { return true; } });
  assert.deepEqual(await service.checkApplicationAddon(context, "marketing"), {
    allowed: false, reason: "customer_inactive",
  });
});
