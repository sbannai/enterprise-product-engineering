import assert from "node:assert/strict";
import test from "node:test";
import {
  STORAGE_PROVIDER_CATALOGUE,
  validateStorageProviderRegistration,
} from "../dist/packages/integrations/storage-provider-registration.js";

// These are explicit test allowlists, not values derived from the catalogue.
// Production allowlists remain deployment-owned environment configuration.
const explicitProviderAllowlist = {
  providers: {
    "aws-s3": {
      adapterKey: "storage.aws-s3",
      adapterVersion: "1.0.0",
      capabilities: ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew", "storage.object.verify", "storage.download.grant", "storage.object.scan"],
      authModes: ["workload_identity"],
    },
    "azure-blob": {
      adapterKey: "storage.azure-blob",
      adapterVersion: "1.0.0",
      capabilities: ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew", "storage.object.verify", "storage.download.grant", "storage.object.scan"],
      authModes: ["workload_identity", "service_principal"],
    },
    "google-cloud-storage": {
      adapterKey: "storage.google-cloud-storage",
      adapterVersion: "1.0.0",
      capabilities: ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew", "storage.object.verify", "storage.download.grant", "storage.object.scan"],
      authModes: ["workload_identity"],
    },
    dropbox: {
      adapterKey: "storage.dropbox",
      adapterVersion: "1.0.0",
      capabilities: ["storage.upload.grant", "storage.upload.lookup", "storage.upload.renew", "storage.object.verify", "storage.download.grant", "storage.object.scan"],
      authModes: ["oauth2"],
    },
  },
};

const closedRegistries = { providers: {} };

test("storage catalogue defines the four provider families without credential fields", () => {
  assert.deepEqual(
    STORAGE_PROVIDER_CATALOGUE.map(provider => provider.providerKey),
    ["aws-s3", "azure-blob", "google-cloud-storage", "dropbox"],
  );
  for (const provider of STORAGE_PROVIDER_CATALOGUE) {
    const metadata = JSON.stringify(provider.configurationSchema);
    assert.doesNotMatch(metadata, /secret|password|token|private.?key|client.?secret|access.?key/i);
  }
});

test("storage providers fail closed when runtime registries have not opted in", () => {
  for (const provider of STORAGE_PROVIDER_CATALOGUE) {
    assert.throws(
      () => validateStorageProviderRegistration(provider, closedRegistries),
      /STORAGE_PROVIDER_PROVIDER_NOT_REGISTERED/,
      provider.providerKey,
    );
  }
});

test("each storage provider passes only with its explicit provider-specific allowlist", () => {
  for (const provider of STORAGE_PROVIDER_CATALOGUE) {
    const registries = explicitProviderAllowlist;
    assert.ok(registries, `missing explicit test allowlist for ${provider.providerKey}`);
    validateStorageProviderRegistration(provider, registries);
  }
});

test("storage registration rejects unknown provider keys at runtime", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  assert.throws(
    () => validateStorageProviderRegistration({ ...provider, providerKey: "unknown-provider" }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_PROVIDER_NOT_REGISTERED/,
  );
});

test("storage registration rejects cross-provider adapter and version pairings", () => {
  for (let index = 0; index < STORAGE_PROVIDER_CATALOGUE.length; index += 1) {
    const provider = STORAGE_PROVIDER_CATALOGUE[index];
    const other = STORAGE_PROVIDER_CATALOGUE[(index + 1) % STORAGE_PROVIDER_CATALOGUE.length];
    assert.throws(
      () => validateStorageProviderRegistration({
        ...provider,
        adapterKey: other.adapterKey,
      }, explicitProviderAllowlist),
      /STORAGE_PROVIDER_PROVIDER_BINDING_MISMATCH/,
      provider.providerKey,
    );
    assert.throws(
      () => validateStorageProviderRegistration({
        ...provider,
        adapterVersion: "9.9.9",
      }, explicitProviderAllowlist),
      /STORAGE_PROVIDER_PROVIDER_BINDING_MISMATCH/,
      provider.providerKey,
    );
  }
});

test("storage registration rejects capabilities outside the provider binding", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE.find(item => item.providerKey === "aws-s3");
  const registries = {
    providers: {
      ...explicitProviderAllowlist.providers,
      "aws-s3": {
        ...explicitProviderAllowlist.providers["aws-s3"],
        capabilities: ["storage.upload"],
      },
    },
  };
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      capabilities: ["storage.delete"],
    }, registries),
    /STORAGE_PROVIDER_CAPABILITIES_INVALID/,
  );
});

test("storage registration rejects authentication modes outside the provider binding", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE.find(item => item.providerKey === "aws-s3");
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      authModes: ["oauth2"],
    }, explicitProviderAllowlist),
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
    }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_SECRET_METADATA_FORBIDDEN/,
  );
});

test("storage registration rejects duplicate capabilities and unsupported adapter versions", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      capabilities: ["storage.upload", "storage.upload"],
    }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_CAPABILITIES_INVALID/,
  );
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      adapterVersion: "latest",
    }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_IDENTITY_INVALID/,
  );
});

test("storage registration rejects malformed runtime values with stable errors", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  assert.throws(
    () => validateStorageProviderRegistration({ ...provider, displayName: null }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_IDENTITY_INVALID/,
  );
  assert.throws(
    () => validateStorageProviderRegistration({ ...provider, capabilities: null }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_CAPABILITIES_INVALID/,
  );
  assert.throws(
    () => validateStorageProviderRegistration({ ...provider, authModes: [null] }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_AUTH_MODES_INVALID/,
  );
  assert.throws(
    () => validateStorageProviderRegistration({ ...provider, configurationSchema: null }, explicitProviderAllowlist),
    /STORAGE_PROVIDER_SECRET_METADATA_FORBIDDEN/,
  );
});


test("storage registration rejects unsupported schema keywords and invalid required fields", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  const registries = explicitProviderAllowlist;
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      configurationSchema: { type: "object", properties: {}, patternProperties: {} },
    }, registries),
    /STORAGE_PROVIDER_CONFIGURATION_SCHEMA_INVALID/,
  );
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      configurationSchema: {
        type: "object",
        properties: { bucket: { type: "string" } },
        required: ["missing"],
      },
    }, registries),
    /STORAGE_PROVIDER_CONFIGURATION_SCHEMA_INVALID/,
  );
});

test("storage registration rejects over-deep configuration schemas", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  const registries = explicitProviderAllowlist;
  let nested = { type: "string" };
  for (let depth = 0; depth < 10; depth += 1) {
    nested = { type: "object", properties: { nested } };
  }
  assert.throws(
    () => validateStorageProviderRegistration({
      ...provider,
      configurationSchema: nested,
    }, registries),
    /STORAGE_PROVIDER_CONFIGURATION_SCHEMA_INVALID/,
  );
});

test("storage registration rejects non-finite numeric enum values", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  const registries = explicitProviderAllowlist;
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.throws(
      () => validateStorageProviderRegistration({
        ...provider,
        configurationSchema: { type: "string", enum: ["valid", invalid] },
      }, registries),
      /STORAGE_PROVIDER_CONFIGURATION_SCHEMA_INVALID/,
    );
  }
  validateStorageProviderRegistration({
    ...provider,
    configurationSchema: { type: "number", enum: [-10, 0, 1.5, 42] },
  }, registries);
});


test("storage catalogue capabilities match the executable provider runtime operations", () => {
  const required = [
    "storage.upload.grant",
    "storage.upload.lookup",
    "storage.upload.renew",
    "storage.object.verify",
    "storage.download.grant",
    "storage.object.scan",
  ];
  for (const provider of STORAGE_PROVIDER_CATALOGUE) {
    assert.deepEqual([...provider.capabilities].sort(), [...required].sort(), provider.providerKey);
    assert.ok(!provider.capabilities.includes("storage.delete"), provider.providerKey);
  }
});

test("storage registration rejects enum values that contradict declared scalar types", () => {
  const provider = STORAGE_PROVIDER_CATALOGUE[0];
  const invalidSchemas = [
    { type: "string", enum: ["valid", 42] },
    { type: "integer", enum: [1, 1.5] },
    { type: "boolean", enum: [true, null] },
    { type: "number", enum: [1, "2"] },
    { type: "array", enum: [[], "not-an-array"] },
    { type: "object", enum: [{ valid: true }, null] },
  ];
  for (const configurationSchema of invalidSchemas) {
    assert.throws(
      () => validateStorageProviderRegistration({ ...provider, configurationSchema }, explicitProviderAllowlist),
      /STORAGE_PROVIDER_CONFIGURATION_SCHEMA_INVALID/,
      JSON.stringify(configurationSchema),
    );
  }
  for (const configurationSchema of [
    { type: "string", enum: ["one", "two"] },
    { type: "integer", enum: [1, 2] },
    { type: "number", enum: [1, 1.5] },
    { type: "boolean", enum: [true, false] },
    { type: "array", enum: [[], [1]] },
    { type: "object", enum: [{ valid: true }] },
  ]) {
    validateStorageProviderRegistration({ ...provider, configurationSchema }, explicitProviderAllowlist);
  }
});
