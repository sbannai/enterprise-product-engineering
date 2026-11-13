import assert from "node:assert/strict";
import test from "node:test";
import {
  readProviderRuntimeDeploymentPolicy,
  assertProviderRuntimeDeploymentAllowed,
  ProviderRuntimeDeploymentPolicyError,
} from "../dist/packages/integrations/provider-runtime-deployment-policy.js";

const fullCapabilities = [
  "storage.upload.grant", "storage.upload.lookup", "storage.upload.renew",
  "storage.object.verify", "storage.download.grant", "storage.object.scan",
];
const configuration = {
  scannerIdentity: "scanner-v1",
  allowedHosts: ["storage.example.com"],
  allowedProviderKeys: ["customer-storage"],
  secretManager: { adapterKey: "vault-port", adapterVersion: "1.0.0" },
  tlsMode: "verify-full",
  runtimeLimits: {
    requestTimeoutMs: 30_000,
    maxObjectBytes: 1_073_741_824,
    maxConcurrentOperations: 8,
  },
  adapters: [{
    adapterKey: "storage-driver",
    adapterVersion: "2.1.0",
    capabilities: fullCapabilities,
    synthetic: false,
  }],
};
const env = {
  EPER_PROVIDER_STORAGE_RUNTIME_ENABLED: "true",
  NODE_ENV: "test",
  EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify(configuration),
};
const candidate = {
  providerKey: "customer-storage",
  adapterKey: "storage-driver",
  adapterVersion: "2.1.0",
  capability: "storage.object.verify",
  endpoint: "https://storage.example.com/v1/objects",
  tlsMode: "verify-full",
  synthetic: false,
};

test("deployment policy parses provider allowlist, secret-manager port and bounded limits", () => {
  const policy = readProviderRuntimeDeploymentPolicy(env);
  assert.deepEqual(policy.allowedProviderKeys, ["customer-storage"]);
  assert.deepEqual(policy.secretManager, { adapterKey: "vault-port", adapterVersion: "1.0.0" });
  assert.equal(policy.runtimeLimits.maxConcurrentOperations, 8);
});

test("deployment policy rejects missing provider allowlist, secret resolver or TLS verification", () => {
  for (const invalid of [
    { ...configuration, allowedProviderKeys: [] },
    { ...configuration, secretManager: null },
    { ...configuration, tlsMode: "verify-ca" },
    { ...configuration, runtimeLimits: { ...configuration.runtimeLimits, maxConcurrentOperations: 0 } },
    { ...configuration, runtimeLimits: { ...configuration.runtimeLimits, maxObjectBytes: 99_999_999_999 } },
  ]) {
    assert.throws(
      () => readProviderRuntimeDeploymentPolicy({
        ...env, EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify(invalid),
      }),
    );
  }
});

test("database-selected provider, exact adapter version, capability and endpoint must fit deployment allowlists", () => {
  const policy = readProviderRuntimeDeploymentPolicy(env);
  assert.doesNotThrow(() => assertProviderRuntimeDeploymentAllowed(policy, candidate));
  const rejected = [
    { ...candidate, providerKey: "unlisted-provider" },
    { ...candidate, adapterVersion: "2.2.0" },
    { ...candidate, capability: "storage.admin" },
    { ...candidate, endpoint: "https://evil.example.net/" },
    { ...candidate, endpoint: "http://storage.example.com/" },
    { ...candidate, endpoint: "https://user:pass@storage.example.com/" },
    { ...candidate, endpoint: "https://storage.example.com:8443/" },
    { ...candidate, tlsMode: "disabled" },
  ];
  for (const item of rejected) {
    assert.throws(() => assertProviderRuntimeDeploymentAllowed(policy, item));
  }
});

test("production refuses synthetic drivers even if a malformed caller requests one", () => {
  const production = {
    ...configuration,
    adapters: [{ ...configuration.adapters[0], synthetic: false }],
  };
  const policy = readProviderRuntimeDeploymentPolicy({
    ...env,
    NODE_ENV: "production",
    EPER_ENVIRONMENT: "production",
    EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify(production),
  });
  assert.throws(
    () => assertProviderRuntimeDeploymentAllowed(policy, {
      ...candidate, synthetic: true,
    }),
    error => error.code === "PROVIDER_RUNTIME_ADAPTER_NOT_ALLOWED",
  );
});

test("disabled runtime remains disabled and cannot authorize a provider", () => {
  const policy = readProviderRuntimeDeploymentPolicy({});
  assert.throws(
    () => assertProviderRuntimeDeploymentAllowed(policy, candidate),
    error => error.code === "PROVIDER_RUNTIME_PROVIDER_NOT_ALLOWED",
  );
});
