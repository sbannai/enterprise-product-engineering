import {
  ProviderRuntimeRegistryError,
  type ProviderRuntimeAdapterRegistry,
  type ProviderRuntimeSelection,
} from "./provider-runtime-adapter-registry.js";

/**
 * Structural view of the canonical storage catalogue. The application layer
 * supplies STORAGE_PROVIDER_CATALOGUE directly; this module never maintains a
 * second provider-to-adapter mapping.
 */
export type StorageProviderCatalogueEntry = {
  providerKey: string;
  adapterKey: string;
  adapterVersion: string;
  capabilities: readonly string[];
  status?: "active" | "inactive" | "retired";
};

export class StorageProviderRuntimeBindingError extends Error {
  constructor(readonly code:
    | "STORAGE_RUNTIME_PROVIDER_UNKNOWN"
    | "STORAGE_RUNTIME_PROVIDER_NOT_ACTIVE"
    | "STORAGE_RUNTIME_ADAPTER_BINDING_MISMATCH"
    | "STORAGE_RUNTIME_CAPABILITY_UNSUPPORTED"
    | "STORAGE_RUNTIME_CATALOGUE_AMBIGUOUS") {
    super(code);
    this.name = "StorageProviderRuntimeBindingError";
  }
}

/**
 * Resolve a persisted asset adapter binding against the canonical catalogue,
 * then against the executable registry. providerKey must come from the
 * server-side connection binding; storageAdapterKey must come from the
 * persisted asset row. Neither value may be accepted from browser request data.
 */
export function resolveStorageAssetRuntimeSelection(input: {
  providerKey: string;
  storageAdapterKey: string;
  capabilityKey: string;
}, catalogue: readonly StorageProviderCatalogueEntry[],
registry: Pick<ProviderRuntimeAdapterRegistry, "resolve">): ProviderRuntimeSelection {
  if (!input || typeof input.providerKey !== "string" || !input.providerKey.trim()
    || typeof input.storageAdapterKey !== "string" || !input.storageAdapterKey.trim()
    || typeof input.capabilityKey !== "string" || !input.capabilityKey.trim()
    || !Array.isArray(catalogue) || !registry || typeof registry.resolve !== "function") {
    throw new StorageProviderRuntimeBindingError("STORAGE_RUNTIME_PROVIDER_UNKNOWN");
  }

  const matches = catalogue.filter(entry => entry?.providerKey === input.providerKey);
  if (matches.length === 0) {
    throw new StorageProviderRuntimeBindingError("STORAGE_RUNTIME_PROVIDER_UNKNOWN");
  }
  if (matches.length !== 1) {
    throw new StorageProviderRuntimeBindingError("STORAGE_RUNTIME_CATALOGUE_AMBIGUOUS");
  }
  const entry = matches[0];
  if (entry.status !== undefined && entry.status !== "active") {
    throw new StorageProviderRuntimeBindingError("STORAGE_RUNTIME_PROVIDER_NOT_ACTIVE");
  }
  if (entry.adapterKey !== input.storageAdapterKey
    || typeof entry.adapterVersion !== "string"
    || !/^\d+\.\d+\.\d+$/.test(entry.adapterVersion)) {
    throw new StorageProviderRuntimeBindingError("STORAGE_RUNTIME_ADAPTER_BINDING_MISMATCH");
  }
  if (!Array.isArray(entry.capabilities) || !entry.capabilities.includes(input.capabilityKey)) {
    throw new StorageProviderRuntimeBindingError("STORAGE_RUNTIME_CAPABILITY_UNSUPPORTED");
  }

  const selection: ProviderRuntimeSelection = {
    providerKey: entry.providerKey,
    adapterKey: entry.adapterKey,
    adapterVersion: entry.adapterVersion,
    capabilityKey: input.capabilityKey,
  };
  try {
    registry.resolve(selection);
  } catch (error) {
    if (error instanceof ProviderRuntimeRegistryError) throw error;
    throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_ADAPTER_UNAVAILABLE");
  }
  return selection;
}
