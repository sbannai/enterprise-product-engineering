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
        customer_tariff_assignment: "eper_customer_tariff_assignment",
        tenant_application_assignment: "eper_tenant_application_assignment",
        module_catalog: "eper_module_catalog",
        module_price: "eper_module_price",
        module_entitlement: "eper_customer_module_entitlement",
        module_permission: "eper_customer_module_permission",
        addon_entitlement: "eper_application_addon_entitlement",
      }], rowCount: 1 };
      return { rows: [{
        customer_status: "active",
        tariff_assignment_status: "active",
        tariff_starts_at: "2026-10-01T00:00:00Z",
        tariff_ends_at: null,
        tariff_max_applications: 1,
        active_application_count: 1,
        ...row,
      }], rowCount: 1 };
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
  assert.match(query.sql, /eper_customer_tariff_assignment/);
  assert.match(query.sql, /eper_tenant_application_assignment/);
  assert.match(query.sql, /LEFT JOIN LATERAL/);
  assert.equal(
    calls.filter((call) => call.sql.includes("eper_customer_module_entitlement")).length,
    1,
    "tariff, active-application count and entitlement must share one access-decision statement",
  );
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

test("add-on access is denied when active application assignments exceed the accepted tariff", async () => {
  const { pool, calls } = makePool({
    max_applications: 1,
    active_application_count: 2,
  });
  const service = new PostgresModuleEntitlementService(pool, {
    async isAssignedToTenant() { return true; },
  });
  assert.deepEqual(await service.checkApplicationAddon(context, "marketing"), {
    allowed: false,
    reason: "tariff_overage",
  });
  assert.equal(
    calls.some((call) => call.sql.includes("eper_application_addon_entitlement")),
    false,
    "must deny overage before reading or granting application add-on entitlements",
  );
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



test("module access denies suspended, not-yet-effective and expired customer tariffs", async () => {
  for (const row of [
    { tariff_assignment_status: "suspended" },
    { tariff_starts_at: "2026-10-27T00:00:00Z" },
    { tariff_ends_at: "2026-10-26T02:59:59Z" },
  ]) {
    const { pool } = makePool({
      customer_status: "active", module_status: "active", entitlement_status: "active",
      starts_at: null, ends_at: null, grace_until: null, permission_allowed: true, ...row,
    });
    const service = new PostgresModuleEntitlementService(pool, { async isAssignedToTenant() { return true; } });
    const decision = await service.checkModule(context, "billing");
    assert.equal(decision.allowed, false);
    assert.ok(["tariff_inactive", "tariff_not_started", "tariff_expired"].includes(decision.reason));
  }
});

test("module access denies every application when active assignments exceed the single-app tariff", async () => {
  const { pool } = makePool({
    customer_status: "active", module_status: "active", entitlement_status: "active",
    starts_at: null, ends_at: null, grace_until: null, permission_allowed: true,
    active_application_count: 2,
  });
  const service = new PostgresModuleEntitlementService(pool, { async isAssignedToTenant() { return true; } });
  assert.deepEqual(await service.checkModule(context, "billing"), {
    allowed: false, reason: "tariff_overage",
  });
});

test("application add-on access is denied during tariff overage as well", async () => {
  const { pool } = makePool({
    customer_status: "active", addon_status: "active", entitlement_status: "active",
    effective_from: null, effective_to: null, permission_allowed: true,
    active_application_count: 2,
  });
  const service = new PostgresModuleEntitlementService(pool, { async isAssignedToTenant() { return true; } });
  assert.deepEqual(await service.checkApplicationAddon(context, "marketing"), {
    allowed: false, reason: "tariff_overage",
  });
});

test("module access fails closed when a customer has no active tariff assignment", async () => {
  const { pool } = makePool({
    customer_status: "active", module_status: "active", entitlement_status: "active",
    starts_at: null, ends_at: null, grace_until: null, permission_allowed: true,
    tariff_assignment_status: null,
  });
  const service = new PostgresModuleEntitlementService(pool, { async isAssignedToTenant() { return true; } });
  assert.deepEqual(await service.checkModule(context, "billing"), {
    allowed: false, reason: "tariff_inactive",
  });
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
