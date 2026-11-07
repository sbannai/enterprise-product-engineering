import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderRuntimeAdapterRegistry,
  ProviderRuntimeAdapterRegistryError,
} from "../dist/packages/integrations/provider-runtime-adapter-registry.js";

const upload = { async createGrant() { return "grant"; } };

test("resolves only an exact registered adapter version and declared capability", () => {
  const registry = new ProviderRuntimeAdapterRegistry([{
    adapterKey: "storage.local",
    adapterVersion: "1.0.0",
    capabilities: ["storage.upload.grant", "storage.object.lookup"],
    adapter: upload,
  }]);
  assert.equal(registry.resolve({
    adapterKey: "storage.local", adapterVersion: "1.0.0", capability: "storage.upload.grant",
  }), upload);
});

test("rejects an adapter version mismatch instead of falling back", () => {
  const registry = new ProviderRuntimeAdapterRegistry([{
    adapterKey: "storage.local", adapterVersion: "1.0.0",
    capabilities: ["storage.upload.grant"], adapter: upload,
  }]);
  assert.throws(() => registry.resolve({
    adapterKey: "storage.local", adapterVersion: "2.0.0", capability: "storage.upload.grant",
  }), error => error instanceof ProviderRuntimeAdapterRegistryError &&
    error.code === "PROVIDER_RUNTIME_VERSION_MISMATCH");
});

test("rejects a capability not declared by the selected adapter", () => {
  const registry = new ProviderRuntimeAdapterRegistry([{
    adapterKey: "storage.local", adapterVersion: "1.0.0",
    capabilities: ["storage.upload.grant"], adapter: upload,
  }]);
  assert.throws(() => registry.resolve({
    adapterKey: "storage.local", adapterVersion: "1.0.0", capability: "storage.download.grant",
  }), error => error instanceof ProviderRuntimeAdapterRegistryError &&
    error.code === "PROVIDER_RUNTIME_CAPABILITY_UNSUPPORTED");
});

test("rejects unknown adapter keys", () => {
  const registry = new ProviderRuntimeAdapterRegistry([]);
  assert.throws(() => registry.resolve({
    adapterKey: "storage.remote", adapterVersion: "1.0.0", capability: "storage.upload.grant",
  }), error => error instanceof ProviderRuntimeAdapterRegistryError &&
    error.code === "PROVIDER_RUNTIME_ADAPTER_NOT_REGISTERED");
});

test("rejects duplicate adapter key and version registrations", () => {
  assert.throws(() => new ProviderRuntimeAdapterRegistry([
    { adapterKey: "storage.local", adapterVersion: "1.0.0", capabilities: ["storage.upload.grant"], adapter: upload },
    { adapterKey: "storage.local", adapterVersion: "1.0.0", capabilities: ["storage.upload.grant"], adapter: upload },
  ]), error => error instanceof ProviderRuntimeAdapterRegistryError &&
    error.code === "PROVIDER_RUNTIME_DUPLICATE_REGISTRATION");
});

test("rejects empty, duplicate and malformed capability declarations", () => {
  for (const capabilities of [[], ["storage.upload.grant", "storage.upload.grant"], ["bad capability"]]) {
    assert.throws(() => new ProviderRuntimeAdapterRegistry([{
      adapterKey: "storage.local", adapterVersion: "1.0.0", capabilities, adapter: upload,
    }]), error => error instanceof ProviderRuntimeAdapterRegistryError &&
      error.code === "PROVIDER_RUNTIME_REGISTRATION_INVALID");
  }
});
