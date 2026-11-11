import type {
  ProviderMalwareScanOutcome,
  ProviderMalwareScanRequest,
  ProviderObjectVerificationOutcome,
  ProviderObjectVerificationRequest,
  ProviderStorageDriver,
  ProviderDriverContext,
} from "./provider-storage-driver-contract.js";
import type { StorageDownloadRequest, StorageDownloadResult } from "../assets/storage-download-adapter.js";
import type { StorageUploadRequest } from "../assets/storage-upload-adapter.js";
import type { StorageUploadLookupOutcome, StorageUploadProviderOutcome } from "../assets/storage-upload-provider-contract.js";

/** Marker credentials issued only by the local synthetic secret resolver. */
export interface SyntheticStorageCredentials {
  readonly synthetic: true;
  readonly marker: "ephemeral-test-only";
}

/**
 * Deterministic, in-memory provider fixture for tests and local demonstrations.
 *
 * It does not transfer bytes, call a network, load an SDK or use credentials.
 * Its successful verification and clean scan outcomes are simulated evidence
 * only. Register it with synthetic: true; production composition must reject it.
 */
export class SyntheticProviderStorageDriver implements ProviderStorageDriver<unknown> {
  readonly synthetic = true;
  readonly synthetic = true;
  readonly capabilities = {
    idempotentCreateByUploadSessionId: true,
    lookupByUploadSessionId: true,
    renewByProviderReference: true,
    verifyObject: true,
    downloadGrant: true,
    malwareScan: true,
  } as const;

  private readonly uploads = new Map<string, {
    providerReference: string;
    tenantId: string;
    applicationId: string;
    assetId: string;
    sizeBytes: number;
    mimeType: string;
  }>();

  constructor(private readonly options: {
    host?: string;
    now?: () => number;
    scanOutcome?: ProviderMalwareScanOutcome;
  } = {}) {
    const host = options.host ?? "storage.example.test";
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes("..")) {
      throw new Error("SYNTHETIC_STORAGE_HOST_INVALID");
    }
  }

  private get host(): string { return this.options.host ?? "storage.example.test"; }
  private get now(): number { return (this.options.now ?? Date.now)(); }
  private expiry(): string { return new Date(this.now + 5 * 60_000).toISOString(); }
  private reference(sessionId: string): string { return `synthetic-object:${sessionId}`; }
  private url(path: string): string { return `https://${this.host}/${path}`; }

  async createUploadGrant(
    context: ProviderDriverContext<unknown>,
    request: StorageUploadRequest,
    _requestId: string,
  ): Promise<StorageUploadProviderOutcome> {
    if (request.tenantId !== context.tenantId || request.applicationId !== context.applicationId) {
      return { kind: "rejected", rejectionCode: "scope_mismatch" };
    }
    const existing = this.uploads.get(request.uploadSessionId);
    if (existing && (existing.tenantId !== context.tenantId ||
        existing.applicationId !== context.applicationId || existing.sizeBytes !== request.sizeBytes ||
        existing.mimeType !== request.mimeType || existing.assetId !== request.assetId)) {
      return { kind: "rejected", rejectionCode: "idempotency_conflict" };
    }
    const providerUploadReference = existing?.providerReference ?? this.reference(request.uploadSessionId);
    this.uploads.set(request.uploadSessionId, {
      providerReference: providerUploadReference,
      tenantId: context.tenantId,
      applicationId: context.applicationId,
      assetId: request.assetId,
      sizeBytes: request.sizeBytes,
      mimeType: request.mimeType,
    });
    return {
      kind: "succeeded",
      providerUploadReference,
      url: this.url(`upload/${encodeURIComponent(request.uploadSessionId)}`),
      method: "PUT",
      expiresAt: this.expiry(),
      headers: { "content-type": request.mimeType },
    };
  }

  async lookupUpload(
    context: ProviderDriverContext<unknown>,
    uploadSessionId: string,
    _requestId: string,
  ): Promise<StorageUploadLookupOutcome> {
    const record = this.uploads.get(uploadSessionId);
    if (!record) return { kind: "not_found" };
    if (record.tenantId !== context.tenantId || record.applicationId !== context.applicationId) {
      return { kind: "unknown" };
    }
    return { kind: "found", providerUploadReference: record.providerReference };
  }

  async renewUploadGrant(
    context: ProviderDriverContext<unknown>,
    request: StorageUploadRequest & { providerUploadReference: string },
    _requestId: string,
  ): Promise<StorageUploadProviderOutcome> {
    const record = this.uploads.get(request.uploadSessionId);
    if (!record || record.providerReference !== request.providerUploadReference ||
        record.tenantId !== context.tenantId || record.applicationId !== context.applicationId) {
      return { kind: "unknown", reason: "malformed_response" };
    }
    return {
      kind: "succeeded",
      providerUploadReference: record.providerReference,
      url: this.url(`upload/${encodeURIComponent(request.uploadSessionId)}`),
      method: "PUT",
      expiresAt: this.expiry(),
      headers: { "content-type": record.mimeType },
    };
  }

  async verifyObject(
    context: ProviderDriverContext<unknown>,
    request: ProviderObjectVerificationRequest,
    _requestId: string,
  ): Promise<ProviderObjectVerificationOutcome> {
    const record = this.uploads.get(request.uploadSessionId);
    if (!record || record.providerReference !== request.providerUploadReference ||
        record.tenantId !== context.tenantId || record.applicationId !== context.applicationId) {
      return { kind: "not_found" };
    }
    if (record.sizeBytes !== request.expectedSizeBytes) return { kind: "mismatch", reason: "size" };
    if (record.mimeType.toLowerCase() !== request.expectedMimeType.toLowerCase()) {
      return { kind: "mismatch", reason: "mime_type" };
    }
    return {
      kind: "verified",
      sizeBytes: record.sizeBytes,
      mimeType: record.mimeType,
      sha256: request.expectedSha256,
    };
  }

  async createDownloadGrant(
    context: ProviderDriverContext<unknown>,
    request: StorageDownloadRequest,
    _requestId: string,
  ): Promise<StorageDownloadResult | null> {
    const record = [...this.uploads.values()].find(item =>
      item.providerReference === request.accessReference &&
      item.tenantId === context.tenantId && item.applicationId === context.applicationId &&
      item.assetId === request.assetId);
    if (!record) return null;
    return {
      url: this.url(`download/${encodeURIComponent(record.providerReference)}`),
      expiresAt: this.expiry(),
    };
  }

  async scanObject(
    context: ProviderDriverContext<unknown>,
    request: ProviderMalwareScanRequest,
    _requestId: string,
  ): Promise<ProviderMalwareScanOutcome> {
    const record = [...this.uploads.values()].find(item =>
      item.providerReference === request.providerObjectReference &&
      item.tenantId === context.tenantId && item.applicationId === context.applicationId &&
      item.assetId === request.assetId);
    if (!record) return { kind: "error", retryable: false };
    // A clean result is a fixture response, not a claim about file bytes.
    return this.options.scanOutcome ?? { kind: "clean", scanReference: "synthetic-scan-only" };
  }
}
