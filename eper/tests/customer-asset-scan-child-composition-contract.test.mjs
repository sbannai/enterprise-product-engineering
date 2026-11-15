import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCustomerAssetScanChildRuntimeComposition,
} from "../dist/packages/assets/customer-asset-scan-child-composition-contract.js";

function valid() {
  return {
    identity: { async verifyCurrentProcessIdentity() { return {}; } },
    input: { async resolve() { return {}; } },
    provider: { async dispatch() { return {}; } },
    scanner: { async scan() { return { scanStatus: "clean" }; } },
  };
}

test("deployment composition requires every callable runtime port", () => {
  assert.doesNotThrow(() => assertCustomerAssetScanChildRuntimeComposition(valid()));
  for (const key of ["identity", "input", "provider", "scanner"]) {
    const value = valid();
    delete value[key];
    assert.throws(() => assertCustomerAssetScanChildRuntimeComposition(value),
      error => error.code === undefined && error.message === "CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_INVALID");
  }
});

test("deployment composition rejects non-callable ports and malformed cleanup", () => {
  const value = valid();
  value.provider.dispatch = {};
  assert.throws(() => assertCustomerAssetScanChildRuntimeComposition(value),
    /CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_INVALID/);
  const cleanup = valid();
  cleanup.close = true;
  assert.throws(() => assertCustomerAssetScanChildRuntimeComposition(cleanup),
    /CUSTOMER_ASSET_SCAN_CHILD_COMPOSITION_INVALID/);
});

test("deployment composition accepts an explicit asynchronous cleanup hook", () => {
  const value = valid();
  value.close = async () => {};
  assert.doesNotThrow(() => assertCustomerAssetScanChildRuntimeComposition(value));
});
