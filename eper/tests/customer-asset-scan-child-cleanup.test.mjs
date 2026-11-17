import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerAssetScanChildCleanupRegistry } from "../dist/packages/assets/customer-asset-scan-child-cleanup.js";

test("child cleanup runs registered resource disposers in reverse acquisition order", async () => {
  const registry = createCustomerAssetScanChildCleanupRegistry();
  const closed = [];
  registry.register(async () => { closed.push("sdk"); });
  registry.register(async () => { closed.push("provider"); });
  registry.register(async () => { closed.push("issuer"); });
  assert.deepEqual(await registry.close(), []);
  assert.deepEqual(closed, ["issuer", "provider", "sdk"]);
});

test("child cleanup continues after a disposer fails and reports the failure", async () => {
  const registry = createCustomerAssetScanChildCleanupRegistry();
  const closed = [];
  registry.register(async () => { closed.push("first"); });
  registry.register(async () => { throw new Error("injected cleanup failure"); });
  registry.register(async () => { closed.push("last"); });
  const errors = await registry.close();
  assert.deepEqual(closed, ["last", "first"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /injected cleanup failure/);
});

test("child cleanup is idempotent and rejects registration after closing begins", async () => {
  const registry = createCustomerAssetScanChildCleanupRegistry();
  let calls = 0;
  registry.register(async () => { calls += 1; });
  const first = registry.close();
  const second = registry.close();
  assert.equal(first, second);
  assert.deepEqual(await first, []);
  assert.equal(calls, 1);
  assert.throws(() => registry.register(() => {}), /CLEANUP_REGISTRATION_INVALID/);
});

test("child cleanup rejects a non-callable disposer", () => {
  const registry = createCustomerAssetScanChildCleanupRegistry();
  assert.throws(() => registry.register(null), /CLEANUP_REGISTRATION_INVALID/);
});
