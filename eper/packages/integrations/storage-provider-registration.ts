/**
 * Provider-neutral storage catalogue contract.
 *
 * This module describes provider metadata only. It deliberately contains no
 * credential fields, secret values, SDK clients, network calls, or dispatch.
 * Runtime implementations must be separately registered behind IntegrationPort.
 */
export const STORAGE_CAPABILITIES = [
  "storage.upload",
  "storage.upload.verify",
  "storage.download",
  "storage.delete",
] as const;

export type StorageCapability = typeof STORAGE_CAPABILITIES[number];

export const STORAGE_AUTH_MODES = [
  "workload_identity",
  "oauth2",
  "service_principal",
] as const;

export type StorageAuthMode = typeof STORAGE_AUTH_MODES[number];

export interface StorageProviderRegistration {
  providerKey: "aws-s3" | "azure-blob" | "google-cloud-storage" | "dropbox";
  displayName: string;
  adapterKey: string;
  adapterVersion: string;
  capabilities: readonly StorageCapability[];
  authModes: readonly StorageAuthMode[];
  /** Non-secret configuration schema suitable for provider catalogue metadata. */
  configurationSchema: Record<string, unknown>;
}

/**
 * Rejects provider registrations that exceed the existing catalogue registries.
 * This keeps this contract composable with ProviderCatalogueRegistries rather
 * than introducing a second mutable registry.
 */
export function validateStorageProviderRegistration(
  registration: StorageProviderRegistration,
  registries: {
    adapterKeys: readonly string[];
    capabilityKeys: readonly string[];
    authModes: readonly string[];
  },
): void {
  if (!registration || typeof registration !== "object") {
    throw new Error("STORAGE_PROVIDER_REGISTRATION_INVALID");
  }
  if (typeof registration.providerKey !== "string" ||
      !/^[a-z][a-z0-9-]{1,63}$/.test(registration.providerKey) ||
      typeof registration.displayName !== "string" ||
      !registration.displayName.trim() || registration.displayName.length > 160 ||
      typeof registration.adapterKey !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(registration.adapterKey) ||
      typeof registration.adapterVersion !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(registration.adapterVersion)) {
    throw new Error("STORAGE_PROVIDER_IDENTITY_INVALID");
  }
  if (!Array.isArray(registration.capabilities) || !registration.capabilities.length ||
      registration.capabilities.some(value => typeof value !== "string") ||
      new Set(registration.capabilities).size !== registration.capabilities.length ||
      registration.capabilities.some(value =>
        !(STORAGE_CAPABILITIES as readonly string[]).includes(value) ||
        !Array.isArray(registries.capabilityKeys) || !registries.capabilityKeys.includes(value))) {
    throw new Error("STORAGE_PROVIDER_CAPABILITIES_INVALID");
  }
  if (!Array.isArray(registration.authModes) || !registration.authModes.length ||
      registration.authModes.some(value => typeof value !== "string") ||
      new Set(registration.authModes).size !== registration.authModes.length ||
      registration.authModes.some(value =>
        !(STORAGE_AUTH_MODES as readonly string[]).includes(value) ||
        !Array.isArray(registries.authModes) || !registries.authModes.includes(value))) {
    throw new Error("STORAGE_PROVIDER_AUTH_MODES_INVALID");
  }
  if (!Array.isArray(registries.adapterKeys) ||
      !registries.adapterKeys.includes(registration.adapterKey)) {
    throw new Error("STORAGE_PROVIDER_ADAPTER_NOT_REGISTERED");
  }
  const schema = registration.configurationSchema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("STORAGE_PROVIDER_SECRET_METADATA_FORBIDDEN");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(schema);
  } catch {
    throw new Error("STORAGE_PROVIDER_SECRET_METADATA_FORBIDDEN");
  }
  if (typeof serialized !== "string" || serialized.length > 16_384 ||
      /(?:secret|password|token|private.?key|client.?secret|access.?key)/i.test(serialized)) {
    throw new Error("STORAGE_PROVIDER_SECRET_METADATA_FORBIDDEN");
  }
}

const commonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    region: { type: "string", maxLength: 128 },
    bucketOrContainer: { type: "string", maxLength: 256 },
    pathPrefix: { type: "string", maxLength: 512 },
  },
  required: ["bucketOrContainer"],
};

export const STORAGE_PROVIDER_CATALOGUE: readonly StorageProviderRegistration[] = [
  {
    providerKey: "aws-s3",
    displayName: "Amazon S3",
    adapterKey: "storage.aws-s3",
    adapterVersion: "1.0.0",
    capabilities: ["storage.upload", "storage.upload.verify", "storage.download", "storage.delete"],
    authModes: ["workload_identity"],
    configurationSchema: commonSchema,
  },
  {
    providerKey: "azure-blob",
    displayName: "Azure Blob Storage",
    adapterKey: "storage.azure-blob",
    adapterVersion: "1.0.0",
    capabilities: ["storage.upload", "storage.upload.verify", "storage.download", "storage.delete"],
    authModes: ["workload_identity", "service_principal"],
    configurationSchema: commonSchema,
  },
  {
    providerKey: "google-cloud-storage",
    displayName: "Google Cloud Storage",
    adapterKey: "storage.google-cloud-storage",
    adapterVersion: "1.0.0",
    capabilities: ["storage.upload", "storage.upload.verify", "storage.download", "storage.delete"],
    authModes: ["workload_identity"],
    configurationSchema: commonSchema,
  },
  {
    providerKey: "dropbox",
    displayName: "Dropbox",
    adapterKey: "storage.dropbox",
    adapterVersion: "1.0.0",
    capabilities: ["storage.upload", "storage.upload.verify", "storage.download", "storage.delete"],
    authModes: ["oauth2"],
    configurationSchema: {
      type: "object",
      additionalProperties: false,
      properties: { namespace: { type: "string", maxLength: 256 }, pathPrefix: { type: "string", maxLength: 512 } },
      required: ["namespace"],
    },
  },
];
