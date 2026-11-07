export interface ProviderRuntimeAdapterRegistration<TAdapter> {
  adapterKey: string;
  adapterVersion: string;
  capabilities: readonly string[];
  adapter: TAdapter;
}

export interface ProviderRuntimeAdapterRequest {
  adapterKey: string;
  adapterVersion: string;
  capability: string;
}

export class ProviderRuntimeAdapterRegistryError extends Error {
  constructor(readonly code:
    | "PROVIDER_RUNTIME_REGISTRATION_INVALID"
    | "PROVIDER_RUNTIME_DUPLICATE_REGISTRATION"
    | "PROVIDER_RUNTIME_ADAPTER_NOT_REGISTERED"
    | "PROVIDER_RUNTIME_VERSION_MISMATCH"
    | "PROVIDER_RUNTIME_CAPABILITY_UNSUPPORTED") {
    super(code);
    this.name = "ProviderRuntimeAdapterRegistryError";
  }
}

/**
 * Immutable, exact-version runtime registry. Catalogue metadata is deliberately
 * not accepted here: only executable adapters explicitly supplied by the
 * server composition root can be registered.
 */
export class ProviderRuntimeAdapterRegistry<TAdapter> {
  private readonly registrations = new Map<string, {
    adapterKey: string;
    adapterVersion: string;
    capabilities: ReadonlySet<string>;
    adapter: TAdapter;
  }>();

  constructor(registrations: readonly ProviderRuntimeAdapterRegistration<TAdapter>[]) {
    for (const registration of registrations) this.register(registration);
  }

  private register(registration: ProviderRuntimeAdapterRegistration<TAdapter>): void {
    const validKey = (value: unknown): value is string =>
      typeof value === "string" && /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(value);
    const validVersion = (value: unknown): value is string =>
      typeof value === "string" && /^[0-9][A-Za-z0-9.+-]{0,127}$/.test(value);
    if (!registration || !validKey(registration.adapterKey) ||
        !validVersion(registration.adapterVersion) || !registration.adapter ||
        !Array.isArray(registration.capabilities) || registration.capabilities.length === 0 ||
        registration.capabilities.length > 64 ||
        registration.capabilities.some(capability => !validKey(capability)) ||
        new Set(registration.capabilities).size !== registration.capabilities.length) {
      throw new ProviderRuntimeAdapterRegistryError("PROVIDER_RUNTIME_REGISTRATION_INVALID");
    }
    const key = this.key(registration.adapterKey, registration.adapterVersion);
    if (this.registrations.has(key)) {
      throw new ProviderRuntimeAdapterRegistryError("PROVIDER_RUNTIME_DUPLICATE_REGISTRATION");
    }
    this.registrations.set(key, {
      adapterKey: registration.adapterKey,
      adapterVersion: registration.adapterVersion,
      capabilities: new Set(registration.capabilities),
      adapter: registration.adapter,
    });
  }

  resolve(request: ProviderRuntimeAdapterRequest): TAdapter {
    const validKey = (value: unknown): value is string =>
      typeof value === "string" && /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(value);
    const validVersion = (value: unknown): value is string =>
      typeof value === "string" && /^[0-9][A-Za-z0-9.+-]{0,127}$/.test(value);
    if (!request || !validKey(request.adapterKey) || !validVersion(request.adapterVersion) ||
        !validKey(request.capability)) {
      throw new ProviderRuntimeAdapterRegistryError("PROVIDER_RUNTIME_REGISTRATION_INVALID");
    }
    const exact = this.registrations.get(this.key(request.adapterKey, request.adapterVersion));
    if (!exact) {
      const keyExists = [...this.registrations.values()].some(item => item.adapterKey === request.adapterKey);
      throw new ProviderRuntimeAdapterRegistryError(keyExists
        ? "PROVIDER_RUNTIME_VERSION_MISMATCH"
        : "PROVIDER_RUNTIME_ADAPTER_NOT_REGISTERED");
    }
    if (!exact.capabilities.has(request.capability)) {
      throw new ProviderRuntimeAdapterRegistryError("PROVIDER_RUNTIME_CAPABILITY_UNSUPPORTED");
    }
    return exact.adapter;
  }

  private key(adapterKey: string, adapterVersion: string): string {
    return adapterKey + "\u0000" + adapterVersion;
  }
}
