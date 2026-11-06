import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRuntimeAdapterRegistry } from "../packages/integrations/provider-runtime-adapter-registry.ts";
import {
  resolveStorageAssetRuntimeSelection,
  StorageProviderRuntimeBindingError,
} from "../packages/integrations/provider-runtime-storage-binding.ts";

const catalogue = [
  { providerKey: "aws-s3", adapterKey: "storage.aws-s3", adapterVersion: "1.0.0",
    capabilities: ["storage.upload", "storage.download"], status: "active" },
  { providerKey: "azure-blob", adapterKey: "storage.azure-blob", adapterVersion: "1.0.0",
    capabilities: ["storage.upload", "storage.download"], status: "active" },
  { providerKey: "dropbox", adapterKey: "storage.dropbox", adapterVersion: "1.0.0",
    capabilities: ["storage.upload"], status: "retired" },
];

function registry() {
  const adapters = catalogue.filter(entry => entry.status === "active").map(entry => ({
    ...entry,
    executionClass: "synthetic",
    async dispatch() { return {}; },
  }));
  const allowlist = adapters.map(({ dispatch, ...entry }) => entry);
  return new ProviderRuntimeAdapterRegistry(adapters, allowlist);
}

test("asset binding resolves only the exact canonical provider adapter and version", () => {
  const selection = resolveStorageAssetRuntimeSelection({
    providerKey: "aws-s3", storageAdapterKey: "storage.aws-s3", capabilityKey: "storage.upload",
  }, catalogue, registry());
  assert.deepEqual(selection, {
    providerKey: "aws-s3", adapterKey: "storage.aws-s3",
    adapterVersion: "1.0.0", capabilityKey: "storage.upload",
  });
});

test("cross-provider adapter substitution is rejected", () => {
  assert.throws(() => resolveStorageAssetRuntimeSelection({
    providerKey: "aws-s3", storageAdapterKey: "storage.azure-blob", capabilityKey: "storage.upload",
  }, catalogue, registry()), error =>
    error instanceof StorageProviderRuntimeBindingError
      && error.code === "STORAGE_RUNTIME_ADAPTER_BINDING_MISMATCH");
});

test("unknown providers and retired providers fail closed", () => {
  assert.throws(() => resolveStorageAssetRuntimeSelection({
    providerKey: "unknown", storageAdapterKey: "storage.unknown", capabilityKey: "storage.upload",
  }, catalogue, registry()), /STORAGE_RUNTIME_PROVIDER_UNKNOWN/);
  assert.throws(() => resolveStorageAssetRuntimeSelection({
    providerKey: "dropbox", storageAdapterKey: "storage.dropbox", capabilityKey: "storage.upload",
  }, catalogue, registry()), /STORAGE_RUNTIME_PROVIDER_NOT_ACTIVE/);
});

test("capability not present in the canonical provider entry is rejected", () => {
  assert.throws(() => resolveStorageAssetRuntimeSelection({
    providerKey: "azure-blob", storageAdapterKey: "storage.azure-blob", capabilityKey: "storage.delete",
  }, catalogue, registry()), /STORAGE_RUNTIME_CAPABILITY_UNSUPPORTED/);
});

test("duplicate canonical provider entries are rejected as ambiguous", () => {
  assert.throws(() => resolveStorageAssetRuntimeSelection({
    providerKey: "aws-s3", storageAdapterKey: "storage.aws-s3", capabilityKey: "storage.upload",
  }, [...catalogue, catalogue[0]], registry()), /STORAGE_RUNTIME_CATALOGUE_AMBIGUOUS/);
});
