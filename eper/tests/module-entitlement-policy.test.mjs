import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateModuleAccess,
  evaluateApplicationAddonAccess,
  validateAcceptedPriceSnapshot,
} from "../dist/packages/workflows/module-entitlement-policy.js";

const now = new Date("2026-10-26T03:00:00.000Z");

test("module access requires active module, entitlement, assignment, and role permission", () => {
  const base = {
    moduleStatus: "active",
    entitlementStatus: "active",
    rolePermissionAllowed: true,
    applicationAssignedToTenant: true,
    now,
  };
  assert.deepEqual(evaluateModuleAccess(base), { allowed: true, reason: "allowed" });
  assert.equal(evaluateModuleAccess({ ...base, moduleStatus: "disabled" }).reason, "module_disabled");
  assert.equal(evaluateModuleAccess({ ...base, entitlementStatus: null }).reason, "entitlement_missing");
  assert.equal(evaluateModuleAccess({ ...base, entitlementStatus: "suspended" }).reason, "entitlement_inactive");
  assert.equal(evaluateModuleAccess({ ...base, applicationAssignedToTenant: false }).reason, "application_not_assigned");
  assert.equal(evaluateModuleAccess({ ...base, rolePermissionAllowed: false }).reason, "role_permission_denied");
});

test("module access observes start, expiry, and grace windows", () => {
  const base = {
    moduleStatus: "active",
    entitlementStatus: "active",
    rolePermissionAllowed: true,
    applicationAssignedToTenant: true,
    now,
  };
  assert.equal(evaluateModuleAccess({ ...base, startsAt: "2026-10-27T00:00:00Z" }).reason, "not_started");
  assert.equal(evaluateModuleAccess({ ...base, endsAt: "2026-10-25T00:00:00Z" }).reason, "expired");
  assert.equal(evaluateModuleAccess({
    ...base,
    endsAt: "2026-10-25T00:00:00Z",
    graceUntil: "2026-10-27T00:00:00Z",
  }).allowed, true);
});

test("application add-ons are independent and default to denied until explicitly active", () => {
  const base = {
    addonStatus: "active",
    entitlementStatus: "active",
    rolePermissionAllowed: true,
    applicationAssignedToTenant: true,
    now,
  };
  assert.equal(evaluateApplicationAddonAccess(base).allowed, true);
  assert.equal(evaluateApplicationAddonAccess({ ...base, entitlementStatus: "not_selected" }).reason, "addon_not_selected");
  assert.equal(evaluateApplicationAddonAccess({ ...base, entitlementStatus: "requested" }).reason, "addon_not_active");
  assert.equal(evaluateApplicationAddonAccess({ ...base, entitlementStatus: "pending_payment" }).allowed, false);
  assert.equal(evaluateApplicationAddonAccess({ ...base, addonStatus: "disabled" }).reason, "module_disabled");
  assert.equal(evaluateApplicationAddonAccess({ ...base, applicationAssignedToTenant: false }).reason, "application_not_assigned");
  assert.equal(evaluateApplicationAddonAccess({ ...base, rolePermissionAllowed: false }).reason, "role_permission_denied");
  assert.equal(evaluateApplicationAddonAccess({ ...base, effectiveFrom: "2026-10-27T00:00:00Z" }).reason, "not_started");
  assert.equal(evaluateApplicationAddonAccess({ ...base, effectiveTo: "2026-10-25T00:00:00Z" }).reason, "expired");
});

test("accepted price snapshots validate without floating-point conversion", () => {
  const valid = {
    priceId: "price-uuid",
    priceVersion: 2,
    amount: "1299.9900",
    currency: "INR",
    billingInterval: "monthly",
  };
  assert.equal(validateAcceptedPriceSnapshot(valid).allowed, true);
  assert.equal(validateAcceptedPriceSnapshot(null).reason, "entitlement_missing");
  assert.equal(validateAcceptedPriceSnapshot({ ...valid, currency: "inr" }).allowed, false);
  assert.equal(validateAcceptedPriceSnapshot({ ...valid, amount: "1e3" }).allowed, false);
  assert.equal(validateAcceptedPriceSnapshot({ ...valid, amount: "-1" }).allowed, false);
  assert.equal(validateAcceptedPriceSnapshot({ ...valid, priceVersion: 0 }).allowed, false);
});
