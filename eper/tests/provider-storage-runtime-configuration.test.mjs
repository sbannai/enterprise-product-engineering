import assert from "node:assert/strict";
import test from "node:test";
import {
  readProviderStorageRuntimeConfiguration,
  ProviderStorageRuntimeConfigurationError,
} from "../dist/packages/integrations/provider-storage-runtime-configuration.js";
const valid = {
  EPER_PROVIDER_STORAGE_RUNTIME_ENABLED: "true",
  NODE_ENV: "test",
  EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({
    scannerIdentity: "scanner-v1",
    allowedHosts: ["storage.example.com"],
    adapters: [{ adapterKey: "storage-test", adapterVersion: "1.0.0",
      capabilities: ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew",
        "storage.object.verify", "storage.download.grant", "storage.object.scan"], synthetic: false }],
  }),
};
test("runtime is disabled by default and ignores provider configuration", () => {
  assert.deepEqual(readProviderStorageRuntimeConfiguration({}), {
    enabled: false, environment: "development", allowedHosts: [], adapters: [],
  });
});
test("runtime opt-in validates complete configuration and numeric versions", () => {
  const result = readProviderStorageRuntimeConfiguration(valid);
  assert.equal(result.enabled, true);
  assert.equal(result.adapters[0].adapterVersion, "1.0.0");
});
test("invalid flags and missing opt-in config fail closed", () => {
  assert.throws(() => readProviderStorageRuntimeConfiguration({ EPER_PROVIDER_STORAGE_RUNTIME_ENABLED: "yes" }),
    e => e.code === "PROVIDER_STORAGE_RUNTIME_FLAG_INVALID");
  assert.throws(() => readProviderStorageRuntimeConfiguration({ EPER_PROVIDER_STORAGE_RUNTIME_ENABLED: "true" }),
    e => e.code === "PROVIDER_STORAGE_RUNTIME_CONFIG_REQUIRED");
});
test("host allowlist, scanner identity and adapter declarations are validated", () => {
  for (const config of [
    { ...valid, EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({ scannerIdentity: "x", allowedHosts: ["https://bad"], adapters: [{ adapterKey: "a", adapterVersion: "1", capabilities: ["storage.upload.grant"], synthetic: false }] }) },
    { ...valid, EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({ scannerIdentity: "", allowedHosts: ["storage.example.com"], adapters: [{ adapterKey: "a", adapterVersion: "1", capabilities: ["storage.upload.grant"], synthetic: false }] }) },
    { ...valid, EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({ scannerIdentity: "x", allowedHosts: ["storage.example.com"], adapters: [] }) },
  ]) assert.throws(() => readProviderStorageRuntimeConfiguration(config));
});
test("production refuses synthetic adapter registrations", () => {
  const config = { ...valid, NODE_ENV: "production",
    EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({ scannerIdentity: "scanner", allowedHosts: ["storage.example.com"],
      adapters: [{ adapterKey: "synthetic", adapterVersion: "1.0.0", capabilities: ["storage.upload.grant"], synthetic: true }] }) };
  assert.throws(() => readProviderStorageRuntimeConfiguration(config),
    e => e.code === "PROVIDER_STORAGE_RUNTIME_SYNTHETIC_PRODUCTION_FORBIDDEN");
});
test("production deployment declaration dominates NODE_ENV and forbids synthetic adapters", () => {
  const config = { ...valid, NODE_ENV: "test", EPER_ENVIRONMENT: "production",
    EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({ scannerIdentity: "scanner", allowedHosts: ["storage.example.com"],
      adapters: [{ adapterKey: "synthetic", adapterVersion: "1.0.0", capabilities: ["storage.upload.grant"], synthetic: true }] }) };
  assert.throws(() => readProviderStorageRuntimeConfiguration(config),
    e => e.code === "PROVIDER_STORAGE_RUNTIME_SYNTHETIC_PRODUCTION_FORBIDDEN");
});
test("invalid explicit deployment environment fails closed", () => {
  assert.throws(() => readProviderStorageRuntimeConfiguration({ ...valid, EPER_ENVIRONMENT: "staging" }),
    e => e.code === "PROVIDER_STORAGE_RUNTIME_ENVIRONMENT_INVALID");
});

test("runtime opt-in rejects adapter sets missing any required storage operation", () => {
  const capabilities = ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew",
    "storage.object.verify", "storage.download.grant"];
  const config = { ...valid, EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({
    scannerIdentity: "scanner-v1", allowedHosts: ["storage.example.com"],
    adapters: [{ adapterKey: "storage-test", adapterVersion: "1.0.0", capabilities, synthetic: false }],
  }) };
  assert.throws(() => readProviderStorageRuntimeConfiguration(config),
    e => e.code === "PROVIDER_STORAGE_RUNTIME_CONFIG_INVALID");
});
test("runtime opt-in accepts complete six-operation coverage split across adapter registrations", () => {
  const capabilities = [
    ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew"],
    ["storage.object.verify", "storage.download.grant", "storage.object.scan"],
  ];
  const config = { ...valid, EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: JSON.stringify({
    scannerIdentity: "scanner-v1", allowedHosts: ["storage.example.com"],
    adapters: capabilities.map((items, index) => ({ adapterKey: "adapter-" + index,
      adapterVersion: "1.0.0", capabilities: items, synthetic: false })),
  }) };
  assert.equal(readProviderStorageRuntimeConfiguration(config).adapters.length, 2);
});
