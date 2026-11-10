import test from "node:test";
import assert from "node:assert/strict";
import {
  ApplicationAddonAccessGate,
} from "../dist/packages/addon-entitlements/application-addon-access-gate.js";
import {
  ApplicationCapabilityBoundary,
  APPLICATION_CAPABILITY_ADDONS,
} from "../dist/packages/addon-entitlements/application-capability-boundary.js";

const scope = { tenantId: "tenant-a", applicationId: "application-a" };
const entitlement = (addonKey) => ({
  tenantId: scope.tenantId,
  applicationId: scope.applicationId,
  addonKey,
  status: "active",
  priceId: "price-approved",
  acceptedPriceVersion: 3,
  agreedAmount: "125.0000",
  agreedCurrency: "INR",
  billingInterval: "monthly",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveTo: null,
  usageLimit: {},
  version: 1,
});

function boundaryFor(allowedKeys) {
  const reads = [];
  const gate = new ApplicationAddonAccessGate(
    { get: async input => { reads.push(input); return allowedKeys.has(input.addonKey) ? entitlement(input.addonKey) : null; } },
    { getStatus: async () => "active" },
    () => new Date("2026-11-10T00:00:00.000Z"),
  );
  return { boundary: new ApplicationCapabilityBoundary(gate), reads };
}

test("peripheral operation requires its own persisted application add-on entitlement", async () => {
  const { boundary, reads } = boundaryFor(new Set([APPLICATION_CAPABILITY_ADDONS.peripherals]));
  const result = await boundary.withPeripheralManagement(scope, async value => value.addonKey);
  assert.equal(result, "peripheral_management");
  assert.deepEqual(reads, [{ ...scope, addonKey: "peripheral_management" }]);
});

test("remote desktop operation requires its own persisted application add-on entitlement", async () => {
  const { boundary, reads } = boundaryFor(new Set([APPLICATION_CAPABILITY_ADDONS.remoteDesktop]));
  const result = await boundary.withRemoteDesktopSharing(scope, async value => value.addonKey);
  assert.equal(result, "remote_desktop_sharing");
  assert.deepEqual(reads, [{ ...scope, addonKey: "remote_desktop_sharing" }]);
});

test("missing peripheral entitlement fails closed before peripheral operation executes", async () => {
  const { boundary } = boundaryFor(new Set());
  let invoked = false;
  await assert.rejects(
    boundary.withPeripheralManagement(scope, async () => { invoked = true; }),
    /APPLICATION_ADDON_ACCESS_DENIED:ENTITLEMENT_NOT_FOUND/,
  );
  assert.equal(invoked, false);
});

test("peripheral purchase does not grant remote desktop sharing", async () => {
  const { boundary } = boundaryFor(new Set([APPLICATION_CAPABILITY_ADDONS.peripherals]));
  let invoked = false;
  await assert.rejects(
    boundary.withRemoteDesktopSharing(scope, async () => { invoked = true; }),
    /APPLICATION_ADDON_ACCESS_DENIED:ENTITLEMENT_NOT_FOUND/,
  );
  assert.equal(invoked, false);
});

test("scope is passed to the trusted entitlement gate, not accepted from operation payload", async () => {
  const { boundary, reads } = boundaryFor(new Set([APPLICATION_CAPABILITY_ADDONS.peripherals]));
  await boundary.withPeripheralManagement(scope, async () => "ok");
  assert.equal(reads[0].tenantId, "tenant-a");
  assert.equal(reads[0].applicationId, "application-a");
  assert.equal(reads[0].addonKey, "peripheral_management");
});
