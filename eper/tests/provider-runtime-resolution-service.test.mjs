import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderRuntimeResolutionError,
  ProviderRuntimeResolutionService,
} from "../dist/packages/integrations/provider-runtime-resolution-service.js";

const selection = {
  tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "storage.upload.grant",
  connectionId: "connection-a", providerKey: "storage-provider", connectionVersion: 4,
  policy: { maxBytes: 1024 }, policySource: "APPLICATION_OVERRIDE", tenantDefaultVersion: 2,
};
const definition = (overrides = {}) => ({
  providerKey: "storage-provider", displayName: "Storage", adapterKey: "storage.local",
  adapterVersion: "1.2.0", capabilities: ["storage.upload.grant"], authModes: ["API_KEY"],
  configurationSchema: {}, status: "ACTIVE", version: 8, createdAt: "2026-11-07T00:00:00Z",
  updatedAt: "2026-11-07T00:00:00Z", updatedBy: "admin", ...overrides,
});
function fixture({ provider = definition(), adapter = {}, dispatchError = null, registryError = null } = {}) {
  const calls = [];
  return {
    calls,
    service: new ProviderRuntimeResolutionService(
      { async resolve(input) { calls.push(["dispatch", input]); if (dispatchError) throw dispatchError; return selection; } },
      { async get(key) { calls.push(["catalogue", key]); return provider; } },
      { resolve(input) { calls.push(["registry", input]); if (registryError) throw registryError; return adapter; } },
    ),
  };
}

test("resolves only after current binding/policy, active catalogue definition and exact adapter lookup", async () => {
  const adapter = { execute() {} };
  const f = fixture({ adapter });
  const result = await f.service.resolve({ tenantId: "tenant-a", applicationId: "app-a", capability: "storage.upload.grant" });
  assert.equal(result.adapter, adapter);
  assert.equal(result.adapterVersion, "1.2.0");
  assert.equal(result.definitionVersion, 8);
  assert.deepEqual(f.calls.map(x => x[0]), ["dispatch", "catalogue", "registry"]);
  assert.deepEqual(f.calls[2][1], {
    adapterKey: "storage.local", adapterVersion: "1.2.0", capability: "storage.upload.grant",
  });
});

test("does not resolve catalogue or adapter when tenant/application dispatch fails", async () => {
  const f = fixture({ dispatchError: new Error("binding denied") });
  await assert.rejects(() => f.service.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capability: "storage.upload.grant",
  }), /binding denied/);
  assert.deepEqual(f.calls.map(x => x[0]), ["dispatch"]);
});

test("fails closed when provider definition is missing or inactive", async () => {
  for (const [provider, code] of [
    [null, "PROVIDER_RUNTIME_DEFINITION_NOT_FOUND"],
    [definition({ status: "SUSPENDED" }), "PROVIDER_RUNTIME_DEFINITION_INACTIVE"],
  ]) {
    const f = fixture({ provider });
    await assert.rejects(() => f.service.resolve({
      tenantId: "tenant-a", applicationId: "app-a", capability: "storage.upload.grant",
    }), error => error instanceof ProviderRuntimeResolutionError && error.code === code);
    assert.equal(f.calls.some(x => x[0] === "registry"), false);
  }
});

test("requires catalogue capability declaration before executable adapter lookup", async () => {
  const f = fixture({ provider: definition({ capabilities: ["storage.download.grant"] }) });
  await assert.rejects(() => f.service.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capability: "storage.upload.grant",
  }), error => error instanceof ProviderRuntimeResolutionError &&
    error.code === "PROVIDER_RUNTIME_CATALOGUE_CAPABILITY_MISMATCH");
  assert.equal(f.calls.some(x => x[0] === "registry"), false);
});

test("propagates exact-version registry rejection without fallback", async () => {
  const f = fixture({ registryError: new Error("PROVIDER_RUNTIME_VERSION_MISMATCH") });
  await assert.rejects(() => f.service.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capability: "storage.upload.grant",
  }), /PROVIDER_RUNTIME_VERSION_MISMATCH/);
});
