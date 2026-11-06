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
 * Enforces the same bounded JSON-schema vocabulary accepted by the durable
 * provider catalogue. This prevents metadata that passes registration checks
 * but later fails when persisted.
 */
function validateConfigurationSchema(value: Record<string, unknown>, depth = 0): void {
  const invalid = (): never => { throw new Error("STORAGE_PROVIDER_CONFIGURATION_SCHEMA_INVALID"); };
  if (depth > 8 || !value || typeof value !== "object" || Array.isArray(value)) invalid();
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("STORAGE_PROVIDER_CONFIGURATION_SCHEMA_INVALID");
  }
  if (typeof serialized !== "string" || serialized.length > 16_384) invalid();
  const allowed = new Set([
    "type", "title", "description", "properties", "required",
    "additionalProperties", "enum", "items", "minLength", "maxLength",
    "minimum", "maximum",
  ]);
  const keys = Object.keys(value);
  if (keys.length > 64 || keys.some(key => !allowed.has(key))) invalid();
  const validTypes = ["object", "array", "string", "number", "integer", "boolean"];
  if (value.type !== undefined &&
      (typeof value.type !== "string" || !validTypes.includes(value.type))) invalid();
  if (value.title !== undefined &&
      (typeof value.title !== "string" || value.title.length > 160)) invalid();
  if (value.description !== undefined &&
      (typeof value.description !== "string" || value.description.length > 512)) invalid();

  let propertyNames = new Set<string>();
  if (value.properties !== undefined) {
    if ((value.type !== undefined && value.type !== "object") ||
        !value.properties || typeof value.properties !== "object" ||
        Array.isArray(value.properties)) invalid();
    const properties = value.properties as Record<string, unknown>;
    const entries = Object.entries(properties);
    if (entries.length > 64) invalid();
    for (const [key, child] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) ||
          !child || typeof child !== "object" || Array.isArray(child)) invalid();
      validateConfigurationSchema(child as Record<string, unknown>, depth + 1);
    }
    propertyNames = new Set(Object.keys(properties));
  }
  if (value.required !== undefined) {
    if (!Array.isArray(value.required) || value.required.length > 64 ||
        new Set(value.required).size !== value.required.length ||
        value.required.some(key => typeof key !== "string" ||
          !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) || !propertyNames.has(key))) invalid();
  }
  if (value.additionalProperties !== undefined &&
      typeof value.additionalProperties !== "boolean") {
    const nested = value.additionalProperties;
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) invalid();
    validateConfigurationSchema(nested as Record<string, unknown>, depth + 1);
  }
  if (value.items !== undefined) {
    if ((value.type !== undefined && value.type !== "array") ||
        !value.items || typeof value.items !== "object" || Array.isArray(value.items)) invalid();
    validateConfigurationSchema(value.items as Record<string, unknown>, depth + 1);
  }
  if (value.enum !== undefined &&
      (!Array.isArray(value.enum) || value.enum.length < 1 || value.enum.length > 100 ||
       value.enum.some(item => item !== null &&
         (!["string", "number", "boolean"].includes(typeof item) ||
          (typeof item === "number" && !Number.isFinite(item)))) ||
       new Set(value.enum.map(item => JSON.stringify(item))).size !== value.enum.length)) invalid();

  for (const key of ["minLength", "maxLength"] as const) {
    const bound = value[key];
    if (bound !== undefined &&
        (!Number.isInteger(bound) || Number(bound) < 0 || Number(bound) > 4096)) invalid();
  }
  if ((value.minLength !== undefined || value.maxLength !== undefined) &&
      (value.type !== undefined && value.type !== "string")) invalid();
  if (value.minLength !== undefined && value.maxLength !== undefined &&
      Number(value.minLength) > Number(value.maxLength)) invalid();
  for (const key of ["minimum", "maximum"] as const) {
    const bound = value[key];
    if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound))) invalid();
  }
  if ((value.minimum !== undefined || value.maximum !== undefined) &&
      (value.type !== undefined && value.type !== "number" && value.type !== "integer")) invalid();
  if (value.minimum !== undefined && value.maximum !== undefined &&
      Number(value.minimum) > Number(value.maximum)) invalid();
}

/**
 * Rejects provider registrations that exceed the existing catalogue registries.
 * This keeps this contract composable with ProviderCatalogueRegistries rather
 * than introducing a second mutable registry.
 */
export function validateStorageProviderRegistration(
  registration: StorageProviderRegistration,
  registries: {
    /** Provider-keyed allowlist binds each provider to one exact adapter/version. */
    providers: Readonly<Record<string, {
      adapterKey: string;
      adapterVersion: string;
      capabilities: readonly string[];
      authModes: readonly string[];
    }>>;
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
      !/^\\d+\\.\\d+\\.\\d+$/.test(registration.adapterVersion)) {
    throw new Error("STORAGE_PROVIDER_IDENTITY_INVALID");
  }
  const providerAllowlist = registries && registries.providers;
  if (!providerAllowlist || typeof providerAllowlist !== "object" ||
      !Object.prototype.hasOwnProperty.call(providerAllowlist, registration.providerKey)) {
    throw new Error("STORAGE_PROVIDER_PROVIDER_NOT_REGISTERED");
  }
  const allowedProvider = providerAllowlist[registration.providerKey];
  if (!allowedProvider || typeof allowedProvider !== "object" ||
      allowedProvider.adapterKey !== registration.adapterKey ||
      allowedProvider.adapterVersion !== registration.adapterVersion ||
      !Array.isArray(allowedProvider.capabilities) ||
      !Array.isArray(allowedProvider.authModes)) {
    throw new Error("STORAGE_PROVIDER_PROVIDER_BINDING_MISMATCH");
  }
  if (!Array.isArray(registration.capabilities) || !registration.capabilities.length ||
      registration.capabilities.some(value => typeof value !== "string") ||
      new Set(registration.capabilities).size !== registration.capabilities.length ||
      registration.capabilities.some(value =>
        !(STORAGE_CAPABILITIES as readonly string[]).includes(value) ||
        !allowedProvider.capabilities.includes(value))) {
    throw new Error("STORAGE_PROVIDER_CAPABILITIES_INVALID");
  }
  if (!Array.isArray(registration.authModes) || !registration.authModes.length ||
      registration.authModes.some(value => typeof value !== "string") ||
      new Set(registration.authModes).size !== registration.authModes.length ||
      registration.authModes.some(value =>
        !(STORAGE_AUTH_MODES as readonly string[]).includes(value) ||
        !allowedProvider.authModes.includes(value))) {
    throw new Error("STORAGE_PROVIDER_AUTH_MODES_INVALID");
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
  validateConfigurationSchema(schema);
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
