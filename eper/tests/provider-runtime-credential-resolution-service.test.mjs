import assert from "node:assert/strict";
import test from "node:test";
import { ProviderRuntimeCredentialResolutionService } from "../dist/packages/integrations/provider-runtime-credential-resolution-service.js";

const runtime = {
  selection: {
    tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "storage.upload",
    connectionId: "connection-a", providerKey: "provider-a", connectionVersion: 7,
  },
  definitionVersion: 3, adapterKey: "adapter-a", adapterVersion: "1.0.0",
  capability: "storage.upload", adapter: { name: "adapter" },
};

test("revalidates selected binding before resolving opaque secret reference", async () => {
  const order = [];
  const credentials = { token: "runtime-secret" };
  const service = new ProviderRuntimeCredentialResolutionService(
    { async resolve(input) { order.push(["runtime", input]); return runtime; } },
    { async getRuntimeSecretReference(input) {
      order.push(["connection", input]);
      return { secretReference: "vault://tenant-a/provider-a", authMode: "API_KEY" };
    } },
    { async resolve(input) { order.push(["secret", input]); return credentials; } },
  );
  const result = await service.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capability: "storage.upload",
  });
  assert.equal(result.runtime, runtime);
  assert.equal(result.credentials, credentials);
  assert.deepEqual(order.map(entry => entry[0]), ["runtime", "connection", "secret"]);
  assert.deepEqual(order[1][1], {
    tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
    expectedVersion: 7, providerKey: "provider-a", capability: "storage.upload",
  });
  assert.equal(order[2][1].context.authMode, "API_KEY");
});

test("does not resolve secret when selected binding/version revalidation fails", async () => {
  let secretCalls = 0;
  const service = new ProviderRuntimeCredentialResolutionService(
    { async resolve() { return runtime; } },
    { async getRuntimeSecretReference() { throw new Error("PROVIDER_RUNTIME_BINDING_STALE"); } },
    { async resolve() { secretCalls += 1; return {}; } },
  );
  await assert.rejects(() => service.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capability: "storage.upload",
  }));
  assert.equal(secretCalls, 0);
});
