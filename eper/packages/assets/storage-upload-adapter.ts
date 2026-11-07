import type { IntegrationPort } from "../integration/index.js";
import type { StorageUploadProviderOutcome } from "./storage-upload-provider-contract.js";

export interface StorageUploadRequest {
  tenantId: string;
  actorId: string;
  applicationId: string;
  assetId: string;
  uploadSessionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Existing provider object reference on a replay; renewal must target this exact object. */
  providerUploadReference?: string;
}

export interface StorageUploadGrant {
  url: string;
  method: "PUT" | "POST";
  expiresAt: string;
  headers?: Record<string, string>;
}

export interface StorageUploadResult {
  /** Opaque provider-side upload reference; persist server-side and never return to clients. */
  providerUploadReference: string;
  url: string;
  method: "PUT" | "POST";
  expiresAt: string;
  headers: Record<string, string>;
}

export interface StorageUploadAdapterOptions {
  /** Exact provider hostnames approved by deployment configuration. */
  allowedHosts: readonly string[];
  /** Upload capabilities are capped at 15 minutes by default and absolutely. */
  maxTtlMs?: number;
  /** Injectable clock makes expiry validation deterministic in tests. */
  now?: () => number;
}

/**
 * Provider-neutral adapter for short-lived direct-upload capabilities.
 *
 * Provider selection and credentials stay behind IntegrationPort. The adapter
 * never performs network I/O or provisions storage. Callers must authorize the
 * actor and reserve a durable upload session before invoking this adapter.
 * The returned capability is intentionally client-visible; never log it.
 */
export function createStorageUploadAdapter(
  port: IntegrationPort<StorageUploadRequest, StorageUploadGrant>,
  options: StorageUploadAdapterOptions,
): (request: StorageUploadRequest, requestId: string) => Promise<StorageUploadProviderOutcome> {
  const allowedHosts = new Set(options.allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  const maxTtlMs = options.maxTtlMs ?? 15 * 60_000;
  const now = options.now ?? Date.now;

  if (allowedHosts.size === 0) throw new Error("ASSET_STORAGE_ALLOWED_HOSTS_REQUIRED");
  if (!Number.isSafeInteger(maxTtlMs) || maxTtlMs < 1 || maxTtlMs > 15 * 60_000) {
    throw new Error("ASSET_STORAGE_MAX_TTL_INVALID");
  }

  return async (request, requestId) => {
    let outcome;
    try {
      // Correlation remains the request trace; operationId is the durable provider idempotency key.
      outcome = await port.invoke(request, requestId, request.uploadSessionId);
    } catch {
      return { kind: "unknown", reason: "transport" };
    }
    if (!outcome.success) {
      return outcome.definitiveRejection === true
        ? { kind: "rejected", rejectionCode: typeof outcome.rejectionCode === "string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(outcome.rejectionCode) ? outcome.rejectionCode : "provider_rejected" }
        : { kind: "unknown", reason: "transport" };
    }
    if (!outcome.value || typeof outcome.externalReference !== "string" || !outcome.externalReference.trim() || outcome.externalReference.length > 2048) {
      return { kind: "unknown", reason: "malformed_response" };
    }
    if (request.providerUploadReference && outcome.externalReference !== request.providerUploadReference) {
      return { kind: "unknown", reason: "malformed_response" };
    }

    const grant = outcome.value;
    if (typeof grant.url !== "string" || typeof grant.expiresAt !== "string" ||
        (grant.method !== "PUT" && grant.method !== "POST")) return { kind: "unknown", reason: "malformed_response" };

    let url: URL;
    try {
      url = new URL(grant.url);
    } catch {
      return { kind: "unknown", reason: "malformed_response" };
    }
    if (url.protocol !== "https:" || url.username || url.password ||
        !allowedHosts.has(url.hostname.toLowerCase())) return { kind: "unknown", reason: "malformed_response" };

    const expiry = Date.parse(grant.expiresAt);
    const remaining = expiry - now();
    if (!Number.isFinite(expiry) || remaining <= 0 || remaining > maxTtlMs) return { kind: "unknown", reason: "malformed_response" };

    const headers: Record<string, string> = {};
    if (grant.headers !== undefined) {
      if (!grant.headers || typeof grant.headers !== "object" || Array.isArray(grant.headers)) return { kind: "unknown", reason: "malformed_response" };
      for (const [name, value] of Object.entries(grant.headers)) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) ||
            typeof value !== "string" || value.length > 4096 || /[\r\n]/.test(value)) return { kind: "unknown", reason: "malformed_response" };
        headers[name] = value;
      }
    }

    return {
      kind: "succeeded",
      providerUploadReference: outcome.externalReference,
      url: url.toString(), method: grant.method,
      expiresAt: new Date(expiry).toISOString(), headers,
    };
  };
}
