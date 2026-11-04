import assert from "node:assert/strict";
import test from "node:test";
import {
  STORAGE_CAPABILITIES,
  STORAGE_PROVIDER_CATALOGUE,
  validateStorageProviderRegistration,
} from "../dist/packages/integrations/storage-provider-registration.js";

const registries = {
  adapterKeys: STORAGE_PROVIDER_CATALOGUE.map(provider => provider.adapterKey),
  capabilityKeys: [...STORAGE_CAPABILITIES],
  authModes: ["workload_identity", "oauth2", "service_principal"],
};

test("storage catalogue defines the four provider families without credential fields", () => {
  assert.deepEqual(
    STORAGE_PROVIDER_CATALOGUE.map(provider => provider.providerKey),
    ["aws-s3", "azure-blob", "google-cloud-storage", "dropbox"],
  );
  for (const provider of STORAGE_PROVIDER_CATALOGUE) {
    validateStorageProviderRegistration(provider, registries);
    const metadata = JSON.stringify(provider.configurationSchema);
    assert.doesNotMatch(metadata, /secret|password|token|private.?key|client.?secret|access.?key/i);
  }
});

test("storage registration must use already registered adapter, capability and auth keys", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  assert.throws(
    () => validateStorageProviderRegistration(provider, { ...registries, adapterKeys: [] }),
    /STORAGE_PROVIDER_ADAPTER_NOT_REGISTERED/,
  );
  assert.throws(
    () => validateStorageProviderRegistration(provider, { ...registries, capabilityKeys: [] }),
    /STORAGE_PROVIDER_CAPABILITIES_INVALID/,
  );
  assert.throws(
    () => validateStorageProviderRegistration(provider, { ...registries, authModes: [] }),
    /STORAGE_PROVIDER_AUTH_MODES_INVALID/,
  );
});

test("storage registration rejects secret-bearing catalogue metadata", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      configurationSchema: {
        type: "object",
        properties: { clientSecret: { type: "string" } },
      },
    }, registries),
    /STORAGE_PROVIDER_SECRET_METADATA_FORBIDDEN/,
  );
});

test("storage registration rejects duplicate capabilities and unsupported adapter versions", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      capabilities: ["storage.upload", "storage.upload"],
    }, registries),
    /STORAGE_PROVIDER_CAPABILITIES_INVALID/,
  );
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      adapterVersion: "latest",
    }, registries),
    /STORAGE_PROVIDER_IDENTITY_INVALID/,
  );
});
