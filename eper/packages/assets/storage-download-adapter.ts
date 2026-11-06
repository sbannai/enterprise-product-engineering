import type { IntegrationPort } from "../integration/index.js";

export interface StorageDownloadRequest {
  tenantId: string;
  actorId: string;
  applicationId: string;
  assetId: string;
  accessReference: string;
  fileName: string;
  mimeType?: string;
}

export interface StorageDownloadGrant {
  url: string;
  expiresAt: string;
}

export interface StorageDownloadResult {
  url: string;
  expiresAt: string;
}

export interface StorageDownloadAdapterOptions {
  /** Exact provider hostnames approved by deployment configuration. */
  allowedHosts: readonly string[];
  /** Short-lived links are capped at 15 minutes even if a provider returns more. */
  maxTtlMs?: number;
  /** Injectable clock makes expiry validation deterministic in tests. */
  now?: () => number;
}

/**
 * Provider-neutral adapter for short-lived asset downloads.
 *
 * The provider implementation is injected via IntegrationPort; this module does
 * not select a cloud vendor, fetch remote URLs, or provision infrastructure.
 * It rejects unapproved hosts and malformed/overlong grants before the API can
 * expose a link. The API must still authorize the tenant and persist its audit
 * event before returning the validated grant.
 */
export function createStorageDownloadAdapter(
  port: IntegrationPort<StorageDownloadRequest, StorageDownloadGrant>,
  options: StorageDownloadAdapterOptions,
): (request: StorageDownloadRequest, requestId: string) => Promise<StorageDownloadResult | null> {
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
      outcome = await port.invoke(request, requestId);
    } catch {
      return null;
    }
    if (!outcome.success || !outcome.value) return null;

    const grant = outcome.value;
    if (typeof grant.url !== "string" || typeof grant.expiresAt !== "string") return null;

    let url: URL;
    try {
      url = new URL(grant.url);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.hostname.toLowerCase())) {
      return null;
    }

    const expiry = Date.parse(grant.expiresAt);
    const remaining = expiry - now();
    if (!Number.isFinite(expiry) || remaining <= 0 || remaining > maxTtlMs) return null;

    return { url: url.toString(), expiresAt: new Date(expiry).toISOString() };
  };
}
