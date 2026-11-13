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
    dependencyIds: [],
    capabilities,
    async createUploadGrant() { return { kind: "unknown", reason: "transport" }; },
    async lookupUpload() { return { kind: "not_found" }; },
    async renewUploadGrant() { return { kind: "unknown", reason: "transport" }; },
    async verifyObject() { return { kind: "unknown" }; },
    async createDownloadGrant() { return null; },
    async scanObject() { return { kind: "timeout" }; },
  };
}
const deploymentPolicy = {
  enabled: true, environment: "test", scannerIdentity: "scanner-test",
  allowedHosts: ["storage.example.com"], allowedProviderKeys: ["provider-test"],
  secretManager: { adapterKey: "secret-port", adapterVersion: "1.0.0" },
  tlsMode: "verify-full", runtimeLimits: { requestTimeoutMs: 30000, maxObjectBytes: 1048576, maxConcurrentOperations: 4 },
  adapters: [{ adapterKey: "storage-test", adapterVersion: "1.0.0", capabilities: [
    "storage.upload.grant", "storage.upload.lookup", "storage.upload.renew",
    "storage.object.verify", "storage.download.grant", "storage.object.scan",
  ], synthetic: false }],
};

function input(overrides = {}) {
  return {
    enabled: true,
    deploymentPolicy,
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
    connections: { async getRuntimeSecretReference() { throw new Error("not invoked"); }, async assertDispatchAuthorization() { throw new Error("not invoked"); } },
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

test("enabled composition creates a dispatcher from explicit dependencies and a deployment policy", () => {
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


test("production rejects a driver that self-identifies as synthetic even if registration mislabels it", () => {
  const configured = input({ environment: "production" });
  configured.registrations[0].adapter.synthetic = true;
  configured.registrations[0].synthetic = false;
  assert.throws(
    () => createProviderStorageRuntimeComposition(configured),
    error => error instanceof ProviderStorageRuntimeCompositionError &&
      error.code === "PROVIDER_STORAGE_RUNTIME_SYNTHETIC_DRIVER_FORBIDDEN",
  );
});

test("non-production composition requires synthetic driver provenance to be declared accurately", () => {
  const configured = input();
  configured.registrations[0].adapter.synthetic = true;
  configured.registrations[0].synthetic = false;
  assert.throws(
    () => createProviderStorageRuntimeComposition(configured),
    error => error instanceof ProviderStorageRuntimeCompositionError &&
      error.code === "PROVIDER_STORAGE_RUNTIME_DRIVER_INVALID",
  );
});


test("enabled composition refuses dependency-bearing drivers without durable inventory", () => {
  const configured = input();
  configured.registrations[0].adapter.dependencyIds = ["storage-sdk"];
  assert.throws(
    () => createProviderStorageRuntimeComposition(configured),
    error => error instanceof ProviderStorageRuntimeCompositionError &&
      error.code === "PROVIDER_STORAGE_RUNTIME_DEPENDENCY_INVENTORY_REQUIRED",
  );
});

test("enabled composition refuses a missing or disabled deployment policy", () => {
  assert.throws(() => createProviderStorageRuntimeComposition(input({ deploymentPolicy: undefined })),
    error => error instanceof ProviderStorageRuntimeCompositionError &&
      error.code === "PROVIDER_STORAGE_RUNTIME_DEPLOYMENT_POLICY_REQUIRED");
  assert.throws(() => createProviderStorageRuntimeComposition(input({ deploymentPolicy: { ...deploymentPolicy, enabled: false } })),
    error => error instanceof ProviderStorageRuntimeCompositionError &&
      error.code === "PROVIDER_STORAGE_RUNTIME_DEPLOYMENT_POLICY_REQUIRED");
});
