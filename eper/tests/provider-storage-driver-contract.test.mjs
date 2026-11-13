import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProviderStorageDriver,
  ProviderStorageDriverContractError,
} from "../dist/packages/integrations/provider-storage-driver-contract.js";

const base = {
  dependencyIds: [],
  capabilities: {
    idempotentCreateByUploadSessionId: true,
    lookupByUploadSessionId: true,
    renewByProviderReference: true,
    verifyObject: true,
    downloadGrant: true,
    malwareScan: true,
  },
  async createUploadGrant() { return { kind: "unknown", reason: "transport" }; },
  async lookupUpload() { return { kind: "unknown" }; },
  async renewUploadGrant() { return { kind: "unknown", reason: "transport" }; },
  async verifyObject() { return { kind: "unknown" }; },
  async createDownloadGrant() { return null; },
  async scanObject() { return { kind: "timeout" }; },
};

test("accepts a complete driver whose declared capabilities are implemented", () => {
  assert.equal(assertProviderStorageDriver(base), base);
});

test("rejects missing required capability methods", () => {
  const driver = { ...base, scanObject: undefined };
  assert.throws(() => assertProviderStorageDriver(driver),
    error => error instanceof ProviderStorageDriverContractError &&
      error.code === "PROVIDER_DRIVER_METHOD_MISSING");
});

test("rejects a driver that cannot guarantee durable upload-session idempotency", () => {
  const driver = {
    ...base,
    capabilities: { ...base.capabilities, idempotentCreateByUploadSessionId: false },
  };
  assert.throws(() => assertProviderStorageDriver(driver),
    error => error instanceof ProviderStorageDriverContractError &&
      error.code === "PROVIDER_DRIVER_CAPABILITY_MISMATCH");
});

test("rejects invalid capability declarations", () => {
  const driver = {
    ...base,
    capabilities: { ...base.capabilities, malwareScan: "yes" },
  };
  assert.throws(() => assertProviderStorageDriver(driver),
    error => error instanceof ProviderStorageDriverContractError &&
      error.code === "PROVIDER_DRIVER_INVALID");
});

test("permits omitted optional operations only when capability is explicitly false", () => {
  const driver = {
    ...base,
    capabilities: {
      ...base.capabilities,
      lookupByUploadSessionId: false,
      renewByProviderReference: false,
      verifyObject: false,
      downloadGrant: false,
      malwareScan: false,
    },
    lookupUpload: undefined,
    renewUploadGrant: undefined,
    verifyObject: undefined,
    createDownloadGrant: undefined,
    scanObject: undefined,
  };
  assert.equal(assertProviderStorageDriver(driver), driver);
});


test("rejects malformed or duplicate server-owned dependency declarations", () => {
  assert.throws(() => assertProviderStorageDriver({ ...base, dependencyIds: ["bad id"] }),
    error => error instanceof ProviderStorageDriverContractError &&
      error.code === "PROVIDER_DRIVER_INVALID");
  assert.throws(() => assertProviderStorageDriver({ ...base, dependencyIds: ["sdk", "sdk"] }),
    error => error instanceof ProviderStorageDriverContractError &&
      error.code === "PROVIDER_DRIVER_INVALID");
});
