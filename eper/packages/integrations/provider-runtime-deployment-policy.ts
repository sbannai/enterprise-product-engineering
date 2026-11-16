import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
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
    | "PROVIDER_RUNTIME_ENDPOINT_TLS_REQUIRED"
    | "PROVIDER_RUNTIME_CONFIG_SOURCE_INVALID"
    | "PROVIDER_RUNTIME_CONFIG_VERSION_UNSUPPORTED") {
    super(code);
    this.name = "ProviderRuntimeDeploymentPolicyError";
  }
}

const keyPattern = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const versionPattern = /^[0-9][A-Za-z0-9.+-]{0,127}$/;

/**
 * Deployment configuration is a versioned file. The environment JSON path is
 * retained only for local/test compatibility; production must use the file.
 * The file contains policy and adapter metadata only, never customer secrets.
 */
function readDeploymentConfigText(env: Record<string, string | undefined>): string {
  const filePath = env.EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_FILE?.trim();
  const inline = env.EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON;
  if (filePath) {
    if (inline !== undefined || !isAbsolute(filePath)) {
      throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_CONFIG_SOURCE_INVALID");
    }
    let descriptor: number | undefined;
    try {
      // Open the exact file without following a final-component symlink, then
      // validate and read through the same descriptor to avoid lstat/read TOCTOU.
      descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const metadata = fstatSync(descriptor);
      if (!metadata.isFile() || metadata.size < 2 ||
          metadata.size > 65_536 || (metadata.mode & 0o022) !== 0) {
        throw new Error("unsafe config file");
      }
      return readFileSync(descriptor, "utf8");
    } catch {
      throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_CONFIG_SOURCE_INVALID");
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }
  if (env.NODE_ENV === "production" || env.EPER_ENVIRONMENT === "production" ||
      typeof inline !== "string" || inline.length < 2 || inline.length > 65_536) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_CONFIG_SOURCE_INVALID");
  }
  return inline;
}

/**
 * Adds deployment-owned trust and resource ceilings to the existing provider
 * storage configuration. Database rows may select only values admitted here;
 * they cannot add provider keys, adapter versions, endpoints or capabilities.
 * Secret-manager selection is provider-neutral: no vendor is assumed.
 */
export function readProviderRuntimeDeploymentPolicy(
  env: Record<string, string | undefined>,
): ProviderRuntimeDeploymentPolicy {
  const enabled = env.EPER_PROVIDER_STORAGE_RUNTIME_ENABLED === "true";
  const configText = enabled ? readDeploymentConfigText(env) : undefined;
  const base = readProviderStorageRuntimeConfiguration(configText === undefined
    ? env
    : { ...env, EPER_PROVIDER_STORAGE_RUNTIME_CONFIG_JSON: configText });
  if (!base.enabled) {
    return {
      ...base,
      allowedProviderKeys: [],
      secretManager: { adapterKey: "", adapterVersion: "" },
      tlsMode: "verify-full",
      runtimeLimits: { requestTimeoutMs: 0, maxObjectBytes: 0, maxConcurrentOperations: 0 },
    };
  }

  let parsed: unknown;
  try { parsed = JSON.parse(configText ?? ""); }
  catch { throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_CONFIG_SOURCE_INVALID"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_CONFIG_SOURCE_INVALID");
  }
  const raw = parsed as Record<string, unknown>;
  const allowedFields = ["schemaVersion", "scannerIdentity", "allowedHosts", "adapters",
    "allowedProviderKeys", "secretManager", "tlsMode", "runtimeLimits"];
  if (Object.keys(raw).some(key => !allowedFields.includes(key))) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_CONFIG_SOURCE_INVALID");
  }
  if (raw.schemaVersion !== 1) {
    throw new ProviderRuntimeDeploymentPolicyError("PROVIDER_RUNTIME_CONFIG_VERSION_UNSUPPORTED");
  }
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
