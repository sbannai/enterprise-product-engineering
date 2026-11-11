import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderCredentialResolutionError,
  ProviderCredentialResolutionService,
} from "../dist/packages/integrations/provider-credential-resolution-service.js";

const context = {
  tenantId: "tenant-a", applicationId: "app-a", connectionId: "connection-a",
  providerKey: "storage-provider", authMode: "API_KEY",
};

test("resolves an opaque reference through the explicit server-side port", async () => {
  const calls = [];
  const credentials = { apiKey: "runtime-only-secret" };
  const service = new ProviderCredentialResolutionService({
    async resolve(input) { calls.push(input); return credentials; },
  });
  const result = await service.resolve({ secretReference: "vault://tenant-a/storage/primary", context });
  assert.equal(result, credentials);
  assert.deepEqual(calls, [{ secretReference: "vault://tenant-a/storage/primary", context }]);
});

test("rejects missing or malformed opaque reference and identity before resolver call", async () => {
  let calls = 0;
  const service = new ProviderCredentialResolutionService({
    async resolve() { calls += 1; return { token: "secret" }; },
  });
  for (const input of [
    { secretReference: "", context },
    { secretReference: "ref", context: { ...context, tenantId: " " } },
    { secretReference: "ref", context: { ...context, applicationId: "" } },
    { secretReference: "ref", context: { ...context, connectionId: "" } },
  ]) {
    await assert.rejects(() => service.resolve(input),
      error => error instanceof ProviderCredentialResolutionError &&
        error.code === "PROVIDER_SECRET_REFERENCE_INVALID");
  }
  assert.equal(calls, 0);
});

test("normalizes resolver failure without leaking provider secret-manager error text", async () => {
  const service = new ProviderCredentialResolutionService({
    async resolve() { throw new Error("secret-value=do-not-leak"); },
  });
  await assert.rejects(() => service.resolve({
    secretReference: "vault://tenant-a/storage/primary", context,
  }), error => error instanceof ProviderCredentialResolutionError &&
    error.code === "PROVIDER_SECRET_RESOLVER_UNAVAILABLE" &&
    !error.message.includes("do-not-leak"));
});

test("rejects empty resolver result", async () => {
  const service = new ProviderCredentialResolutionService({ async resolve() { return null; } });
  await assert.rejects(() => service.resolve({
    secretReference: "vault://tenant-a/storage/primary", context,
  }), error => error instanceof ProviderCredentialResolutionError &&
    error.code === "PROVIDER_SECRET_RESOLUTION_EMPTY");
});
