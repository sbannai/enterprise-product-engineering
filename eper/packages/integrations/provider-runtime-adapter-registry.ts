/**
 * Explicit runtime adapter registry.
 *
 * Catalogue metadata is descriptive only. This registry is the executable
 * allowlist: an adapter can be invoked only when its provider key, adapter
 * version and requested capability match an explicitly supplied registration.
 * It performs no credential resolution, SDK loading, network access or logging.
 */
export type ProviderRuntimeSelection = {
  providerKey: string;
  capabilityKey: string;
};

export type ProviderRuntimeDispatchInput = {
  selection: ProviderRuntimeSelection;
  payload: unknown;
  idempotencyKey: string;
  correlationId: string;
  signal: AbortSignal;
};

export type ProviderRuntimeDispatchResult = {
  providerReference?: string;
};

export type ProviderRuntimeAdapter = {
  providerKey: string;
  adapterKey: string;
  adapterVersion: string;
  capabilities: readonly string[];
  dispatch(input: ProviderRuntimeDispatchInput): Promise<ProviderRuntimeDispatchResult>;
};

export type ProviderRuntimeAllowlistEntry = {
  providerKey: string;
  adapterKey: string;
  adapterVersion: string;
  capabilities: readonly string[];
};

export class ProviderRuntimeRegistryError extends Error {
  constructor(readonly code:
    | "PROVIDER_RUNTIME_REGISTRATION_INVALID"
    | "PROVIDER_RUNTIME_DUPLICATE_REGISTRATION"
    | "PROVIDER_RUNTIME_NOT_ALLOWLISTED"
    | "PROVIDER_RUNTIME_ADAPTER_UNAVAILABLE"
    | "PROVIDER_RUNTIME_CAPABILITY_UNSUPPORTED") {
    super(code);
    this.name = "ProviderRuntimeRegistryError";
  }
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && value.trim() === value
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function registrationKey(providerKey: string, adapterVersion: string): string {
  return providerKey + "::" + adapterVersion;
}

/**
 * Immutable, process-local dispatch registry. Registrations and deployment
 * allowlist are supplied by the composition root; nothing is discovered or
 * loaded dynamically. An empty registry is safe and denies all dispatch.
 */
export class ProviderRuntimeAdapterRegistry {
  private readonly adapters: ReadonlyMap<string, ProviderRuntimeAdapter>;

  constructor(
    registrations: readonly ProviderRuntimeAdapter[],
    allowlist: readonly ProviderRuntimeAllowlistEntry[],
  ) {
    if (!Array.isArray(registrations) || !Array.isArray(allowlist)) {
      throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_REGISTRATION_INVALID");
    }

    const permitted = new Map<string, ProviderRuntimeAllowlistEntry>();
    for (const entry of allowlist) {
      if (!entry || !validIdentity(entry.providerKey) || !validIdentity(entry.adapterKey)
        || !/^\\d+\\.\\d+\\.\\d+$/.test(entry.adapterVersion)
        || !Array.isArray(entry.capabilities) || entry.capabilities.length === 0
        || entry.capabilities.some(capability => !validIdentity(capability))
        || new Set(entry.capabilities).size !== entry.capabilities.length) {
        throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_REGISTRATION_INVALID");
      }
      const key = registrationKey(entry.providerKey, entry.adapterVersion);
      if (permitted.has(key)) {
        throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_DUPLICATE_REGISTRATION");
      }
      permitted.set(key, Object.freeze({ ...entry, capabilities: Object.freeze([...entry.capabilities]) }));
    }

    const resolved = new Map<string, ProviderRuntimeAdapter>();
    for (const adapter of registrations) {
      if (!adapter || !validIdentity(adapter.providerKey) || !validIdentity(adapter.adapterKey)
        || !/^\\d+\\.\\d+\\.\\d+$/.test(adapter.adapterVersion)
        || !Array.isArray(adapter.capabilities) || adapter.capabilities.length === 0
        || adapter.capabilities.some(capability => !validIdentity(capability))
        || new Set(adapter.capabilities).size !== adapter.capabilities.length
        || typeof adapter.dispatch !== "function") {
        throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_REGISTRATION_INVALID");
      }
      const key = registrationKey(adapter.providerKey, adapter.adapterVersion);
      if (resolved.has(key)) {
        throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_DUPLICATE_REGISTRATION");
      }
      const permittedEntry = permitted.get(key);
      if (!permittedEntry || permittedEntry.adapterKey !== adapter.adapterKey
        || adapter.capabilities.some(capability => !permittedEntry.capabilities.includes(capability))
        || permittedEntry.capabilities.some(capability => !adapter.capabilities.includes(capability))) {
        throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_NOT_ALLOWLISTED");
      }
      resolved.set(key, Object.freeze({
        ...adapter,
        capabilities: Object.freeze([...adapter.capabilities]),
      }));
    }
    this.adapters = resolved;
  }

  resolve(selection: ProviderRuntimeSelection): ProviderRuntimeAdapter {
    if (!selection || !validIdentity(selection.providerKey)
      || !validIdentity(selection.capabilityKey)) {
      throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_REGISTRATION_INVALID");
    }
    const matches = [...this.adapters.values()].filter(adapter =>
      adapter.providerKey === selection.providerKey);
    if (matches.length === 0) {
      throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_ADAPTER_UNAVAILABLE");
    }
    if (matches.length !== 1) {
      // Multiple installed versions are intentionally ambiguous until the
      // dispatch selection carries an explicit, policy-approved version.
      throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_ADAPTER_UNAVAILABLE");
    }
    const adapter = matches[0];
    if (!adapter.capabilities.includes(selection.capabilityKey)) {
      throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_CAPABILITY_UNSUPPORTED");
    }
    return adapter;
  }

  async dispatch(input: ProviderRuntimeDispatchInput): Promise<ProviderRuntimeDispatchResult> {
    if (!input || !input.selection || typeof input.idempotencyKey !== "string"
      || !input.idempotencyKey.trim() || typeof input.correlationId !== "string"
      || !input.correlationId.trim() || !input.signal) {
      throw new ProviderRuntimeRegistryError("PROVIDER_RUNTIME_REGISTRATION_INVALID");
    }
    const adapter = this.resolve(input.selection);
    return adapter.dispatch(input);
  }
}
