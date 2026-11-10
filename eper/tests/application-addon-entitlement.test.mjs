import test from "node:test";
import assert from "node:assert/strict";
import { evaluateApplicationAddonAccess } from "../dist/packages/addon-entitlements/index.js";

const active = (overrides = {}) => ({
  tenantId: "tenant-a", applicationId: "app-a", addonKey: "peripheral_management",
  status: "active", priceId: "price-1", acceptedPriceVersion: 2,
  agreedAmount: "125.00", agreedCurrency: "INR", billingInterval: "monthly",
  effectiveFrom: "2026-11-01T00:00:00.000Z", effectiveTo: null,
  usageLimit: {}, version: 1, ...overrides,
});
const evaluate = (entitlement, overrides = {}) => evaluateApplicationAddonAccess({
  entitlement, tenantId: "tenant-a", applicationId: "app-a",
  addonKey: "peripheral_management", catalogueStatus: "active",
  now: new Date("2026-11-10T04:00:00.000Z"), ...overrides,
});

test("only a published, paid, effective active entitlement grants access", () => {
  assert.deepEqual(evaluate(active()), { allowed: true, reason: "ENTITLEMENT_ACTIVE" });
  assert.equal(evaluate(active(), { catalogueStatus: "draft" }).reason, "CATALOGUE_NOT_PUBLISHED");
});

test("pending, suspended, cancelled and expired statuses fail closed", () => {
  for (const status of ["requested", "pending_approval", "pending_payment", "suspended", "cancelled", "expired"]) {
    assert.equal(evaluate(active({ status })).allowed, false, status);
  }
});

test("tenant, application and add-on mismatch is denied", () => {
  assert.equal(evaluate(active({ tenantId: "tenant-b" })).reason, "SCOPE_MISMATCH");
  assert.equal(evaluate(active({ applicationId: "app-b" })).reason, "SCOPE_MISMATCH");
  assert.equal(evaluate(active({ addonKey: "remote_desktop_sharing" })).reason, "SCOPE_MISMATCH");
});

test("missing price acceptance and invalid currency are denied", () => {
  assert.equal(evaluate(active({ priceId: null })).reason, "PRICE_ACCEPTANCE_INCOMPLETE");
  assert.equal(evaluate(active({ acceptedPriceVersion: null })).reason, "PRICE_ACCEPTANCE_INCOMPLETE");
  assert.equal(evaluate(active({ agreedCurrency: "INR " })).reason, "PRICE_ACCEPTANCE_INCOMPLETE");
});

test("future and ended entitlement windows are denied", () => {
  assert.equal(evaluate(active({ effectiveFrom: "2026-12-01T00:00:00.000Z" })).reason, "ENTITLEMENT_NOT_YET_EFFECTIVE");
  assert.equal(evaluate(active({ effectiveTo: "2026-11-09T00:00:00.000Z" })).reason, "ENTITLEMENT_EXPIRED");
});

test("missing entitlement is denied", () => {
  assert.equal(evaluate(null).reason, "ENTITLEMENT_NOT_FOUND");
});
