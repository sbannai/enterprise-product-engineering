import test from "node:test";
import assert from "node:assert/strict";
import { ApplicationAddonAccessGate } from "../dist/packages/addon-entitlements/application-addon-access-gate.js";
import { ApplicationCapabilityBoundary } from "../dist/packages/addon-entitlements/application-capability-boundary.js";
import {
  EntitledPeripheralCapabilityService,
  EntitledRemoteDesktopCapabilityService,
} from "../dist/packages/addon-entitlements/entitled-application-capability-services.js";

const scope = { tenantId: "tenant-a", applicationId: "application-a" };
const entitlement = addonKey => ({
  ...scope, addonKey, status: "active", priceId: "price-approved",
  acceptedPriceVersion: 1, agreedAmount: "10.0000", agreedCurrency: "INR",
  billingInterval: "monthly", effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveTo: null, usageLimit: {}, version: 1,
});

function setup(allowed) {
  const calls = [];
  const gate = new ApplicationAddonAccessGate(
    { get: async input => allowed.has(input.addonKey) ? entitlement(input.addonKey) : null },
    { getStatus: async () => "active" },
    () => new Date("2026-11-10T00:00:00.000Z"),
  );
  const boundary = new ApplicationCapabilityBoundary(gate);
  const peripheralOps = Object.fromEntries(
    ["register", "configure", "activate", "assign", "invoke", "authorizeCleanup", "deactivate", "disconnect"]
      .map(name => [name, async (trustedScope, input) => { calls.push([name, trustedScope, input]); return name; }]),
  );
  const desktopOps = Object.fromEntries(
    ["request", "accept", "start", "authorizeCleanup", "stop", "revoke"]
      .map(name => [name, async (trustedScope, input) => { calls.push([name, trustedScope, input]); return name; }]),
  );
  return {
    calls,
    peripherals: new EntitledPeripheralCapabilityService(boundary, peripheralOps),
    desktop: new EntitledRemoteDesktopCapabilityService(boundary, desktopOps),
  };
}

test("peripheral mutations and invocation require peripheral add-on before operation", async () => {
  const { calls, peripherals } = setup(new Set());
  for (const name of ["register", "configure", "activate", "assign", "invoke"]) {
    await assert.rejects(peripherals[name](scope, { tenantId: "attacker", applicationId: "other" }),
      /APPLICATION_ADDON_ACCESS_DENIED/);
  }
  assert.equal(calls.length, 0);
});

test("remote desktop request, accept and start require its separate add-on", async () => {
  const { calls, desktop } = setup(new Set(["peripheral_management"]));
  for (const name of ["request", "accept", "start"]) {
    await assert.rejects(desktop[name](scope, {}), /APPLICATION_ADDON_ACCESS_DENIED/);
  }
  assert.equal(calls.length, 0);
});

test("peripheral purchase does not authorize remote desktop", async () => {
  const { desktop } = setup(new Set(["peripheral_management"]));
  await assert.rejects(desktop.start(scope, {}), /APPLICATION_ADDON_ACCESS_DENIED/);
});

test("safety stop, revoke and peripheral disconnect remain callable after entitlement loss", async () => {
  const { calls, peripherals, desktop } = setup(new Set());
  assert.equal(await peripherals.deactivate(scope, { peripheralId: "p1" }), "deactivate");
  assert.equal(await peripherals.disconnect(scope, { peripheralId: "p1" }), "disconnect");
  assert.equal(await desktop.stop(scope, { sessionId: "s1" }), "stop");
  assert.equal(await desktop.revoke(scope, { sessionId: "s1" }), "revoke");
  assert.deepEqual(calls.map(call => call[0]), ["authorizeCleanup", "deactivate", "authorizeCleanup", "disconnect", "authorizeCleanup", "stop", "authorizeCleanup", "revoke"]);
  assert.ok(calls.every(call => call[1] === scope));
  assert.equal(calls.filter(call => call[0] === "authorizeCleanup").length, 4);
});

test("valid add-on entitlement delegates to the matching operation only", async () => {
  const { calls, peripherals, desktop } = setup(new Set(["peripheral_management", "remote_desktop_sharing"]));
  assert.equal(await peripherals.activate(scope, { peripheralId: "p1" }), "activate");
  assert.equal(await desktop.start(scope, { sessionId: "s1" }), "start");
  assert.deepEqual(calls.map(call => call[0]), ["activate", "start"]);
});

test("cleanup rejects missing trusted tenant/application scope before authorization or operation", async () => {
  const { calls, peripherals, desktop } = setup(new Set());
  await assert.rejects(peripherals.disconnect({ tenantId: "", applicationId: "application-a" }, {}),
    /APPLICATION_CAPABILITY_TRUSTED_SCOPE_REQUIRED/);
  await assert.rejects(desktop.stop({ tenantId: "tenant-a", applicationId: "" }, {}),
    /APPLICATION_CAPABILITY_TRUSTED_SCOPE_REQUIRED/);
  assert.equal(calls.length, 0);
});
