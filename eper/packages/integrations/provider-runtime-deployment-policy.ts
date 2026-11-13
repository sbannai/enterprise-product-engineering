import {
  readProviderStorageRuntimeConfiguration,
  type ProviderStorageRuntimeConfiguration,
} from "./provider-storage-runtime-configuration.js";

export interface ProviderRuntimeDeploymentPolicy extends ProviderStorageRuntimeConfiguration {
  allowedProviderKeys: readonly string[];
  secretManager: { adapterKey: string; adapterVersion: string };
  tlsMode: "verify-full";
  runtimeLimits: {
    requestTimeoutMs: number;
    maxObjectBytes: number;
    maxConcurrentOperations: number;
  };
}

export class ProviderRuntimeDeploymentPolicyError extends Error {
  constructor(readonly code:
    | "PROVIDER_RUNTIME_PROVIDER_ALLOWLIST_INVALID"
    | "PROVIDER_RUNTIME_SECRET_MANAGER_CONFIG_INVALID"
    | "PROVIDER_RUNTIME_TLS_POLICY_INVALID"
    | "PROVIDER_RUNTIME_LIMITS_INVALID"
    | "PROVIDER_RUNTIME_PROVIDER_NOT_ALLOWED"
    | "PROVIDER_RUNTIME_ADAPTER_NOT_ALLOWED"
    | "PROVIDER_RUNTIME_ENDPOINT_NOT_ALLOWED"
    | "PROVIDER_RUNTIME_ENDPOINT_TLS_REQUIRED") {
    super(code);
    this.name = "ProviderRuntimeDeploymentPolicyError";
  }
}

const keyPattern = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const versionPattern = /^[0-9][A-Za-z0-9.+-]{0,127}$/;

/**
 * Adds deployment-owned trust and resource ceilings to the existing provider
 * storage configuration. Database rows may select only values admitted here;
 * they cannot add provider keys, adapter versions, endpoints or capabilities.
 * Secret-manager selection is provider-neutral: no vendor is assumed.
 */
export function readProviderRuntimeDeploymentPolicy(
  env: Record<string, string | undefined>,
): ProviderRuntimeDeploymentPolicy {
  const base = readProviderStorageRuntimeConfiguration(env);
  if (!base.enabled) {
    return {
      ...base,
      allowedProviderKeys: [],
      secretManager: { adapterKey: "", adapterVersion: "" },
      tlsMode: "verify-full",
      runtimeLimits: { requestTimeoutMs: 0, maxObjectBytes: 0, maxConcurrentOperations: 0 },
    };
  }

  const raw = JSON.parse(env.EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON ?? "") as Record<string, unknown>;
  if (!Array.isArray(raw.allowedProviderKeys) ||
      raw.allowedProviderKeys.length < 1 || raw.allowedProviderKeys.length > 64 ||
      raw.allowedProviderKeys.some(key => typeof key !== "string" || !keyPattern.test(key)) ||
      new Set(raw.allowedProviderKeys).size !== raw.allowedProviderKeys.length) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_PROVIDER_ALLOWLIST_INVALID");
  }

  const secretManager = raw.secretManager as Record<string, unknown> | undefined;
  if (!secretManager || typeof secretManager !== "object" ||
      typeof secretManager.adapterKey !== "string" || !keyPattern.test(secretManager.adapterKey) ||
      typeof secretManager.adapterVersion !== "string" || !versionPattern.test(secretManager.adapterVersion)) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_SECRET_MANAGER_CONFIG_INVALID");
  }

  if (raw.tlsMode !== "verify-full") {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_TLS_POLICY_INVALID");
  }

  const limits = raw.runtimeLimits as Record<string, unknown> | undefined;
  const bounded = (value: unknown, min: number, max: number): value is number =>
    Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
  if (!limits || typeof limits !== "object" ||
      !bounded(limits.requestTimeoutMs, 1_000, 300_000) ||
      !bounded(limits.maxObjectBytes, 1, 10_737_418_240) ||
      !bounded(limits.maxConcurrentOperations, 1, 100)) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_LIMITS_INVALID");
  }

  return {
    ...base,
    allowedProviderKeys: raw.allowedProviderKeys as string[],
    secretManager: {
      adapterKey: secretManager.adapterKey as string,
      adapterVersion: secretManager.adapterVersion as string,
    },
    tlsMode: "verify-full",
    runtimeLimits: {
      requestTimeoutMs: limits.requestTimeoutMs as number,
      maxObjectBytes: limits.maxObjectBytes as number,
      maxConcurrentOperations: limits.maxConcurrentOperations as number,
    },
  };
}

/** Call immediately before constructing/dispatching a provider adapter. */
export function assertProviderRuntimeDeploymentAllowed(
  policy: ProviderRuntimeDeploymentPolicy,
  input: {
    providerKey: string;
    adapterKey: string;
    adapterVersion: string;
    capability: string;
    endpoint: string;
    tlsMode: string;
    synthetic: boolean;
  },
): void {
  if (!policy.enabled || !policy.allowedProviderKeys.includes(input.providerKey)) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_PROVIDER_NOT_ALLOWED");
  }
  const adapter = policy.adapters.find(item =>
    item.adapterKey === input.adapterKey && item.adapterVersion === input.adapterVersion &&
    item.capabilities.includes(input.capability) && item.synthetic === input.synthetic);
  if (!adapter || (policy.environment === "production" && input.synthetic)) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_ADAPTER_NOT_ALLOWED");
  }
  let url: URL;
  try { url = new URL(input.endpoint); }
  catch { throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_ENDPOINT_NOT_ALLOWED"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      !policy.allowedHosts.includes(url.hostname.toLowerCase()) ||
      (url.port !== "" && url.port !== "443")) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_ENDPOINT_NOT_ALLOWED");
  }
  if (input.tlsMode !== policy.tlsMode) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_ENDPOINT_TLS_REQUIRED");
  }
}
