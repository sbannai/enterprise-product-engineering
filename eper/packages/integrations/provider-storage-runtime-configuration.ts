export type ProviderStorageRuntimeEnvironment = "development" | "test" | "uat" | "production";
export interface ProviderStorageRuntimeConfiguration {
  enabled: boolean;
  environment: ProviderStorageRuntimeEnvironment;
  scannerIdentity?: string;
  allowedHosts: readonly string[];
  adapters: readonly {
    adapterKey: string;
    adapterVersion: string;
    capabilities: readonly string[];
    synthetic: boolean;
  }[];
}
export class ProviderStorageRuntimeConfigurationError extends Error {
  constructor(readonly code:
    | "PROVIDER_STORAGE_RUNTIME_FLAG_INVALID"
    | "PROVIDER_STORAGE_RUNTIME_ENVIRONMENT_INVALID"
    | "PROVIDER_STORAGE_RUNTIME_CONFIG_REQUIRED"
    | "PROVIDER_STORAGE_RUNTIME_CONFIG_INVALID"
    | "PROVIDER_STORAGE_RUNTIME_SCANNER_IDENTITY_REQUIRED"
    | "PROVIDER_STORAGE_RUNTIME_HOST_ALLOWLIST_INVALID"
    | "PROVIDER_STORAGE_RUNTIME_ADAPTERS_REQUIRED"
    | "PROVIDER_STORAGE_RUNTIME_SYNTHETIC_PRODUCTION_FORBIDDEN") {
    super(code);
    this.name = "ProviderStorageRuntimeConfigurationError";
  }
}
function hostValid(host: unknown): host is string {
  return typeof host === "string" && host.length <= 253 && host === host.trim() &&
    host === host.toLowerCase() && !host.includes("://") && !host.includes("/") &&
    !host.includes(":") && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) &&
    !host.includes("..");
}
function environmentValid(value: unknown): value is ProviderStorageRuntimeEnvironment {
  return value === "development" || value === "test" || value === "uat" || value === "production";
}
/** Parse and validate the opt-in configuration without resolving secrets or loading SDKs. */
export function readProviderStorageRuntimeConfiguration(env: Record<string, string | undefined>): ProviderStorageRuntimeConfiguration {
  const flag = env.EPER_PROVIDER_STORAGE_RUNTIME_ENABLED ?? "false";
  if (flag !== "true" && flag !== "false") throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_FLAG_INVALID");
  const nodeEnvironment = env.NODE_ENV;
  const deploymentEnvironment = env.EPER_ENVIRONMENT;
  if ((nodeEnvironment !== undefined && nodeEnvironment !== "production" && nodeEnvironment !== "test" && nodeEnvironment !== "development") ||
      (deploymentEnvironment !== undefined && !environmentValid(deploymentEnvironment))) {
    throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_ENVIRONMENT_INVALID");
  }
  // A production deployment declaration always wins over NODE_ENV. This prevents
  // a mis-set NODE_ENV=test/development from enabling synthetic drivers in prod.
  const environment: ProviderStorageRuntimeEnvironment =
    nodeEnvironment === "production" || deploymentEnvironment === "production" ? "production"
      : deploymentEnvironment === "uat" ? "uat"
      : nodeEnvironment === "test" || deploymentEnvironment === "test" ? "test"
      : "development";
  if (flag === "false") return { enabled: false, environment, allowedHosts: [], adapters: [] };
  let raw: unknown;
  try { raw = JSON.parse(env.EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON ?? ""); }
  catch { throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_CONFIG_REQUIRED"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_CONFIG_INVALID");
  const value = raw as Record<string, unknown>;
  if (typeof value.scannerIdentity !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.scannerIdentity)) {
    throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_SCANNER_IDENTITY_REQUIRED");
  }
  if (!Array.isArray(value.allowedHosts) || value.allowedHosts.length < 1 || value.allowedHosts.length > 100 ||
      value.allowedHosts.some(host => !hostValid(host)) || new Set(value.allowedHosts).size !== value.allowedHosts.length) {
    throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_HOST_ALLOWLIST_INVALID");
  }
  if (!Array.isArray(value.adapters) || value.adapters.length < 1 || value.adapters.length > 64) {
    throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_ADAPTERS_REQUIRED");
  }
  const requiredCapabilities = [
    "storage.upload.grant",
    "storage.upload.lookup",
    "storage.upload.renew",
    "storage.object.verify",
    "storage.download.grant",
    "storage.object.scan",
  ] as const;
  const seenCapabilities = new Set<string>();
  const seen = new Set<string>();
  const adapters = value.adapters.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_CONFIG_INVALID");
    const adapter = item as Record<string, unknown>;
    if (typeof adapter.adapterKey !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(adapter.adapterKey) ||
        typeof adapter.adapterVersion !== "string" || !/^[0-9][A-Za-z0-9.+-]{0,127}$/.test(adapter.adapterVersion) ||
        !Array.isArray(adapter.capabilities) || adapter.capabilities.length < 1 || adapter.capabilities.length > 6 ||
        adapter.capabilities.some(cap => typeof cap !== "string" || !/^storage\.(?:upload\.(?:grant|lookup|renew)|object\.(?:verify|scan)|download\.grant)$/.test(cap)) ||
        new Set(adapter.capabilities).size !== adapter.capabilities.length || typeof adapter.synthetic !== "boolean") {
      throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_CONFIG_INVALID");
    }
    const key = adapter.adapterKey + "\u0000" + adapter.adapterVersion;
    if (seen.has(key)) throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_CONFIG_INVALID");
    seen.add(key);
    for (const capability of adapter.capabilities as string[]) seenCapabilities.add(capability);
    if (environment === "production" && adapter.synthetic) {
      throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_SYNTHETIC_PRODUCTION_FORBIDDEN");
    }
    return { adapterKey: adapter.adapterKey, adapterVersion: adapter.adapterVersion,
      capabilities: adapter.capabilities as string[], synthetic: adapter.synthetic };
  });
  if (requiredCapabilities.some(capability => !seenCapabilities.has(capability))) {
    throw new ProviderStorageRuntimeConfigurationError("PROVIDER_STORAGE_RUNTIME_CONFIG_INVALID");
  }
  return { enabled: true, environment, scannerIdentity: value.scannerIdentity,
    allowedHosts: value.allowedHosts as string[], adapters };
}
