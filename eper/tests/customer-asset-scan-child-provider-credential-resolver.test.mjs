import assert from "node:assert/strict";
import test from "node:test";
import {
  CustomerAssetScanChildProviderCredentialResolver,
  CustomerAssetScanChildProviderCredentialResolverError,
} from "../dist/packages/assets/customer-asset-scan-child-provider-credential-resolver.js";

const input = {
  tenantId: "tenant-a",
  applicationId: "app-a",
  connectionId: "connection-a",
  scannerServiceId: "asset-scanner",
  capability: "storage.object.scan",
};

function resolved(overrides = {}) {
  return {
    runtime: {
      selection: {
        tenantId: "tenant-a",
        applicationId: "app-a",
        connectionId: "connection-a",
        capabilityKey: "storage.object.scan",
      },
      capability: "storage.object.scan",
    },
    credentials: Object.freeze({ synthetic: true, marker: "ephemeral-test-only" }),
    ...overrides,
  };
}

test("child provider credential resolver reuses the existing runtime chain for the exact scan scope", async () => {
  const calls = [];
  const credentials = Object.freeze({ synthetic: true, marker: "ephemeral-test-only" });
  const resolver = new CustomerAssetScanChildProviderCredentialResolver({
    async resolve(value) {
      calls.push(value);
      return resolved({ credentials });
    },
  }, "asset-scanner");

  assert.equal(await resolver.resolveScanCredentials(input), credentials);
  assert.deepEqual(calls, [{
    tenantId: "tenant-a",
    applicationId: "app-a",
    capability: "storage.object.scan",
  }]);
});

test("child provider credential resolver rejects wrong scanner or capability before provider resolution", async () => {
  let calls = 0;
  const resolver = new CustomerAssetScanChildProviderCredentialResolver({
    async resolve() { calls += 1; return resolved(); },
  }, "asset-scanner");

  await assert.rejects(
    () => resolver.resolveScanCredentials({ ...input, scannerServiceId: "other-scanner" }),
    error => error instanceof CustomerAssetScanChildProviderCredentialResolverError &&
      error.code === "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH",
  );
  await assert.rejects(
    () => resolver.resolveScanCredentials({ ...input, capability: "storage.upload.grant" }),
    /CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH/,
  );
  assert.equal(calls, 0);
});

test("child provider credential resolver rejects a runtime connection or tenant/application scope drift", async () => {
  for (const selection of [
    { connectionId: "different-connection" },
    { tenantId: "different-tenant" },
    { applicationId: "different-application" },
    { capabilityKey: "storage.upload.grant" },
  ]) {
    const resolver = new CustomerAssetScanChildProviderCredentialResolver({
      async resolve() {
        const value = resolved();
        value.runtime.selection = { ...value.runtime.selection, ...selection };
        return value;
      },
    }, "asset-scanner");
    await assert.rejects(
      () => resolver.resolveScanCredentials(input),
      /CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH/,
    );
  }
});

test("child provider credential resolver normalizes runtime and secret-resolution failures", async () => {
  const resolver = new CustomerAssetScanChildProviderCredentialResolver({
    async resolve() { throw new Error("secret=must-not-escape"); },
  }, "asset-scanner");

  await assert.rejects(
    () => resolver.resolveScanCredentials(input),
    error => error instanceof CustomerAssetScanChildProviderCredentialResolverError &&
      error.message === "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_UNAVAILABLE" &&
      !error.message.includes("must-not-escape"),
  );
});

test("child provider credential resolver rejects empty credentials", async () => {
  const resolver = new CustomerAssetScanChildProviderCredentialResolver({
    async resolve() { return resolved({ credentials: undefined }); },
  }, "asset-scanner");
  await assert.rejects(
    () => resolver.resolveScanCredentials(input),
    /CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_SCOPE_MISMATCH/,
  );
});
