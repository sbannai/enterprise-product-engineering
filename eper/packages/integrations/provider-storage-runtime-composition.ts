import type { PostgresProviderCatalogueRepository } from "./postgres-provider-catalogue-repository.js";
import type { PostgresProviderConnectionRepository } from "./postgres-provider-connection-repository.js";
import type { ProviderDispatchConfigurationService } from "./provider-dispatch-configuration-service.js";
import { ProviderCredentialResolutionService, type ProviderSecretResolverPort } from "./provider-credential-resolution-service.js";
import { ProviderRuntimeCredentialResolutionService } from "./provider-runtime-credential-resolution-service.js";
import { ProviderRuntimeResolutionService } from "./provider-runtime-resolution-service.js";
import { ProviderRuntimeAdapterRegistry, type ProviderRuntimeAdapterRegistration } from "./provider-runtime-adapter-registry.js";
import { assertProviderStorageDriver, type ProviderStorageDriver } from "./provider-storage-driver-contract.js";
import { ProviderStorageDriverDispatchService } from "./provider-storage-driver-dispatch-service.js";

export type ProviderStorageRuntimeEnvironment = "development" | "test" | "uat" | "production";

export type ProviderStorageRuntimeRegistration<TCredentials> =
  ProviderRuntimeAdapterRegistration<ProviderStorageDriver<TCredentials>> & {
    /** Must be explicit so synthetic drivers can never be mistaken for real providers. */
    synthetic: boolean;
  };

export type ProviderStorageRuntimeCompositionInput<TCredentials> = {
  enabled: boolean;
  environment?: ProviderStorageRuntimeEnvironment;
  registrations?: readonly ProviderStorageRuntimeRegistration<TCredentials>[];
  dispatch?: Pick<ProviderDispatchConfigurationService, "resolve">;
  catalogue?: Pick<PostgresProviderCatalogueRepository, "get">;
  connections?: Pick<PostgresProviderConnectionRepository, "getRuntimeSecretReference">;
  secretResolver?: ProviderSecretResolverPort<TCredentials>;
  scannerIdentity?: string;
  allowedHosts?: readonly string[];
};

export type ProviderStorageRuntimeComposition<TCredentials> = {
  enabled: boolean;
  dispatch?: ProviderStorageDriverDispatchService<TCredentials>;
  scannerIdentity?: string;
  allowedHosts: readonly string[];
};

export class ProviderStorageRuntimeCompositionError extends Error {
  constructor(readonly code:
    | "PROVIDER_STORAGE_RUNTIME_DEPENDENCIES_REQUIRED"
    | "PROVIDER_STORAGE_RUNTIME_REGISTRATIONS_REQUIRED"
    | "PROVIDER_STORAGE_RUNTIME_SYNTHETIC_DRIVER_FORBIDDEN"
    | "PROVIDER_STORAGE_RUNTIME_SCANNER_IDENTITY_REQUIRED"
    | "PROVIDER_STORAGE_RUNTIME_ALLOWED_HOSTS_INVALID"
    | "PROVIDER_STORAGE_RUNTIME_DRIVER_INVALID") {
    super(code);
    this.name = "ProviderStorageRuntimeCompositionError";
  }
}

function validHost(host: unknown): host is string {
  return typeof host === "string" && host.length <= 253 &&
    host === host.trim() && host === host.toLowerCase() &&
    !host.includes("://") && !host.includes("/") && !host.includes(":") &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) &&
    !host.includes("..");
}

/**
 * Explicit composition boundary. Disabled means no executable dispatch service
 * is created. Enabling requires real dependencies, a scanner identity and an
 * exact HTTPS-host allowlist. Production refuses synthetic drivers.
 */
export function createProviderStorageRuntimeComposition<TCredentials>(
  input: ProviderStorageRuntimeCompositionInput<TCredentials>,
): ProviderStorageRuntimeComposition<TCredentials> {
  if (!input || input.enabled !== true) return { enabled: false, allowedHosts: [] };

  if (input.environment !== "development" && input.environment !== "test" &&
      input.environment !== "uat" && input.environment !== "production") {
    throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_DEPENDENCIES_REQUIRED");
  }
  if (!input.dispatch || !input.catalogue || !input.connections || !input.secretResolver) {
    throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_DEPENDENCIES_REQUIRED");
  }
  if (!Array.isArray(input.registrations) || input.registrations.length === 0) {
    throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_REGISTRATIONS_REQUIRED");
  }
  if (typeof input.scannerIdentity !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.scannerIdentity)) {
    throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_SCANNER_IDENTITY_REQUIRED");
  }
  if (!Array.isArray(input.allowedHosts) || input.allowedHosts.length === 0 ||
      input.allowedHosts.length > 100 || input.allowedHosts.some(host => !validHost(host)) ||
      new Set(input.allowedHosts).size !== input.allowedHosts.length) {
    throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_ALLOWED_HOSTS_INVALID");
  }

  const registrations = input.registrations.map(registration => {
    if (!registration || typeof registration.synthetic !== "boolean") {
      throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_DRIVER_INVALID");
    }
    if (input.environment === "production" && registration.synthetic) {
      throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_SYNTHETIC_DRIVER_FORBIDDEN");
    }
    try {
      assertProviderStorageDriver(registration.adapter);
    } catch {
      throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_DRIVER_INVALID");
    }
    if (!registration.adapter.capabilities.malwareScan) {
      throw new ProviderStorageRuntimeCompositionError("PROVIDER_STORAGE_RUNTIME_DRIVER_INVALID");
    }
    return {
      adapterKey: registration.adapterKey,
      adapterVersion: registration.adapterVersion,
      capabilities: registration.capabilities,
      adapter: registration.adapter,
    };
  });

  const adapters = new ProviderRuntimeAdapterRegistry(registrations);
  const runtime = new ProviderRuntimeResolutionService(input.dispatch, input.catalogue, adapters);
  const credentials = new ProviderCredentialResolutionService(input.secretResolver);
  const runtimeWithCredentials = new ProviderRuntimeCredentialResolutionService(
    runtime, input.connections, credentials,
  );

  return {
    enabled: true,
    dispatch: new ProviderStorageDriverDispatchService(runtimeWithCredentials),
    scannerIdentity: input.scannerIdentity,
    allowedHosts: [...input.allowedHosts],
  };
}
