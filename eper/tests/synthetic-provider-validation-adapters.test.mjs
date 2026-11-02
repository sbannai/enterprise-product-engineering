import assert from "node:assert/strict";
import test from "node:test";
import {
  SyntheticProviderSecretResolver,
  SyntheticProviderValidationAdapterRegistry,
} from "../dist/packages/integrations/synthetic-provider-validation-adapters.js";

test("synthetic resolver accepts only explicit synthetic references", async () => {
  const resolver = new SyntheticProviderSecretResolver();
  assert.deepEqual(await resolver.resolve("synthetic://tenant-a/mail"), { synthetic: true });
  await assert.rejects(() => resolver.resolve("vault://tenant-a/mail"), /SYNTHETIC_SECRET_REFERENCE_REQUIRED/);
  await assert.rejects(() => resolver.resolve("https://provider.example/token"), /SYNTHETIC_SECRET_REFERENCE_REQUIRED/);
});

test("synthetic adapter is version-pinned and never performs provider network calls", async () => {
  const registry = new SyntheticProviderValidationAdapterRegistry();
  assert.equal(registry.get("real-provider", "1.0.0"), null);
  assert.equal(registry.get("synthetic", "2.0.0"), null);
  const adapter = registry.get("synthetic", "1.0.0");
  assert.ok(adapter);
  assert.deepEqual(await adapter.validateCredentials({
    authMode: "synthetic",
    credentials: { synthetic: true },
    environment: "sandbox",
    safeMetadata: {},
  }), { ok: true, errorCode: "SYNTHETIC_CREDENTIALS_INVALID" });
  assert.equal((await adapter.validateCredentials({
    authMode: "synthetic",
    credentials: { accessToken: "not-a-real-token" },
    environment: "sandbox",
    safeMetadata: {},
  })).ok, false);
});
