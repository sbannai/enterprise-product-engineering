import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderStorageRuntimeComposition,
  ProviderStorageRuntimeCompositionError,
} from "../dist/packages/integrations/provider-storage-runtime-composition.js";

const capabilities = {
  idempotentCreateByUploadSessionId: true,
  lookupByUploadSessionId: true,
  renewByProviderReference: true,
  verifyObject: true,
  downloadGrant: true,
  malwareScan: true,
};
function driver() {
  return {
    capabilities,
    async createUploadGrant() { return { kind: "unknown", reason: "transport" }; },
    async lookupUpload() { return { kind: "not_found" }; },
    async renewUploadGrant() { return { kind: "unknown", reason: "transport" }; },
    async verifyObject() { return { kind: "unknown" }; },
    async createDownloadGrant() { return null; },
    async scanObject() { return { kind: "timeout" }; },
  };
}
function input(overrides = {}) {
  return {
    enabled: true,
    environment: "test",
    registrations: [{
      adapterKey: "storage-test",
      adapterVersion: "1.0.0",
      capabilities: [
        "storage.upload.grant", "storage.upload.lookup", "storage.upload.renew",
        "storage.object.verify", "storage.download.grant", "storage.object.scan",
      ],
      adapter: driver(),
      synthetic: false,
    }],
    dispatch: { async resolve() { throw new Error("not invoked in composition test"); } },
    catalogue: { async get() { return null; } },
    connections: { async getRuntimeSecretReference() { throw new Error("not invoked"); } },
    secretResolver: { async resolve() { return { token: "test" }; } },
    scannerIdentity: "scanner-v1",
    allowedHosts: ["storage.example.com"],
    ...overrides,
  };
}

test("disabled composition creates no executable dispatcher and needs no provider config", () => {
  assert.deepEqual(createProviderStorageRuntimeComposition({ enabled: false }), {
    enabled: false, allowedHosts: [],
  });
});

test("enabled composition creates a dispatcher from explicit dependencies", () => {
  const result = createProviderStorageRuntimeComposition(input());
  assert.equal(result.enabled, true);
  assert.equal(typeof result.dispatch?.dispatch, "function");
  assert.equal(result.scannerIdentity, "scanner-v1");
  assert.deepEqual(result.allowedHosts, ["storage.example.com"]);
});

test("production rejects synthetic storage drivers", () => {
  assert.throws(
    () => createProviderStorageRuntimeComposition(input({
      environment: "production",
      registrations: [{ ...input().registrations[0], synthetic: true }],
    })),
    error => error instanceof ProviderStorageRuntimeCompositionError &&
      error.code === "PROVIDER_STORAGE_RUNTIME_SYNTHETIC_DRIVER_FORBIDDEN",
  );
});

test("enabled composition requires a scanner identity and host allowlist", () => {
  assert.throws(() => createProviderStorageRuntimeComposition(input({ scannerIdentity: "" })),
    error => error.code === "PROVIDER_STORAGE_RUNTIME_SCANNER_IDENTITY_REQUIRED");
  assert.throws(() => createProviderStorageRuntimeComposition(input({ allowedHosts: ["https://storage.example.com"] })),
    error => error.code === "PROVIDER_STORAGE_RUNTIME_ALLOWED_HOSTS_INVALID");
});

test("enabled composition fails closed without a complete provider registration", () => {
  assert.throws(() => createProviderStorageRuntimeComposition(input({ registrations: [] })),
    error => error.code === "PROVIDER_STORAGE_RUNTIME_REGISTRATIONS_REQUIRED");
  assert.throws(() => createProviderStorageRuntimeComposition(input({ secretResolver: undefined })),
    error => error.code === "PROVIDER_STORAGE_RUNTIME_DEPENDENCIES_REQUIRED");
});
