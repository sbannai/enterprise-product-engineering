import type { StorageDownloadRequest, StorageDownloadResult } from "../assets/storage-download-adapter.js";
import type { StorageUploadRequest } from "../assets/storage-upload-adapter.js";
import type { StorageUploadLookupOutcome, StorageUploadProviderOutcome } from "../assets/storage-upload-provider-contract.js";
import type {
  ProviderDriverContext, ProviderMalwareScanOutcome, ProviderObjectVerificationOutcome,
  ProviderObjectVerificationRequest, ProviderMalwareScanRequest, ProviderStorageDriver,
} from "./provider-storage-driver-contract.js";

/** Credentials accepted by the synthetic-only resolver and driver. */
export interface SyntheticStorageCredentials {
  readonly synthetic: true;
  readonly marker: "ephemeral-test-only";
}

export interface SyntheticStorageDriverOptions {
  /** Test clock; never reads wall time when supplied. */
  now?: () => number;
  /** Explicit simulated outcomes. These are fixtures, never evidence about real bytes. */
  verificationOutcome?: ProviderObjectVerificationOutcome;
  scanOutcome?: ProviderMalwareScanOutcome;
}

type StoredObject = {
  tenantId: string;
  applicationId: string;
  uploadSessionId: string;
  assetId: string;
  providerReference: string;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
};

/**
 * In-memory, network-free provider simulator.
 *
 * It stores metadata only: it never accepts, reads, uploads, downloads, hashes,
 * or scans customer bytes. The default verification and scan outcomes are
 * deliberately inconclusive. Tests may inject simulated outcomes explicitly.
 */
export class SyntheticProviderStorageDriver
implements ProviderStorageDriver<SyntheticStorageCredentials> {
  readonly synthetic = true;
  /** This metadata-only simulator has no vendor-managed runtime dependency. */
  readonly dependencyIds: readonly string[] = Object.freeze([]);
  readonly capabilities = Object.freeze({
    idempotentCreateByUploadSessionId: true,
    lookupByUploadSessionId: true,
    renewByProviderReference: true,
    verifyObject: true,
    downloadGrant: true,
    malwareScan: true,
  });

  private readonly bySession = new Map<string, StoredObject>();
  private readonly byReference = new Map<string, StoredObject>();
  private readonly now: () => number;
  private readonly verificationOutcome: ProviderObjectVerificationOutcome;
  private readonly scanOutcome: ProviderMalwareScanOutcome;

  constructor(options: SyntheticStorageDriverOptions = {}) {
    this.now = options.now ?? Date.now;
    this.verificationOutcome = options.verificationOutcome ?? { kind: "unknown" };
    this.scanOutcome = options.scanOutcome ?? { kind: "timeout" };
  }

  private assertSynthetic(context: ProviderDriverContext<SyntheticStorageCredentials>): void {
    if (!context || context.credentials?.synthetic !== true ||
        context.credentials.marker !== "ephemeral-test-only") {
      throw new Error("SYNTHETIC_STORAGE_CREDENTIALS_REQUIRED");
    }
  }

  async createUploadGrant(
    context: ProviderDriverContext<SyntheticStorageCredentials>,
    request: StorageUploadRequest,
    _requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageUploadProviderOutcome> {
    this.assertSynthetic(context);
    if (signal?.aborted) return { kind: "unknown", reason: "transport" };
    if (context.tenantId !== request.tenantId || context.applicationId !== request.applicationId) {
      return { kind: "unknown", reason: "malformed_response" };
    }
    let object = this.bySession.get(request.uploadSessionId);
    if (!object) {
      const providerReference = "synthetic-object:" + encodeURIComponent(request.uploadSessionId);
      object = {
        tenantId: request.tenantId, applicationId: request.applicationId,
        uploadSessionId: request.uploadSessionId, assetId: request.assetId, providerReference,
        sizeBytes: request.sizeBytes, mimeType: request.mimeType, fileName: request.fileName,
      };
      this.bySession.set(request.uploadSessionId, object);
      this.byReference.set(providerReference, object);
    } else if (object.tenantId !== request.tenantId || object.applicationId !== request.applicationId ||
      object.assetId !== request.assetId || object.sizeBytes !== request.sizeBytes || object.mimeType !== request.mimeType ||
      object.fileName !== request.fileName) {
      return { kind: "unknown", reason: "malformed_response" };
    }
    const expiresAt = new Date(this.now() + 5 * 60_000).toISOString();
    return {
      kind: "succeeded", providerUploadReference: object.providerReference,
      url: "https://uploads.synthetic.invalid/" + encodeURIComponent(request.uploadSessionId),
      method: "PUT", expiresAt, headers: { "x-eper-synthetic": "true" },
    };
  }

  async lookupUpload(
    context: ProviderDriverContext<SyntheticStorageCredentials>,
    uploadSessionId: string,
    _requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageUploadLookupOutcome> {
    this.assertSynthetic(context);
    if (signal?.aborted) return { kind: "unavailable" };
    const object = this.bySession.get(uploadSessionId);
    if (!object) return { kind: "not_found" };
    if (object.tenantId !== context.tenantId || object.applicationId !== context.applicationId) {
      return { kind: "unknown" };
    }
    return { kind: "found", providerUploadReference: object.providerReference };
  }

  async renewUploadGrant(
    context: ProviderDriverContext<SyntheticStorageCredentials>,
    request: StorageUploadRequest & { providerUploadReference: string },
    requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageUploadProviderOutcome> {
    this.assertSynthetic(context);
    if (signal?.aborted) return { kind: "unknown", reason: "transport" };
    const object = this.byReference.get(request.providerUploadReference);
    if (!object || object.uploadSessionId !== request.uploadSessionId ||
        object.tenantId !== context.tenantId || object.applicationId !== context.applicationId) {
      return { kind: "unknown", reason: "malformed_response" };
    }
    return this.createUploadGrant(context, request, requestId, signal);
  }

  async verifyObject(
    context: ProviderDriverContext<SyntheticStorageCredentials>,
    request: ProviderObjectVerificationRequest,
    _requestId: string,
    signal?: AbortSignal,
  ): Promise<ProviderObjectVerificationOutcome> {
    this.assertSynthetic(context);
    if (signal?.aborted) return { kind: "unavailable" };
    const object = this.byReference.get(request.providerUploadReference);
    if (!object || object.uploadSessionId !== request.uploadSessionId ||
        object.tenantId !== context.tenantId || object.applicationId !== context.applicationId) {
      return { kind: "not_found" };
    }
    if (object.sizeBytes !== request.expectedSizeBytes) return { kind: "mismatch", reason: "size" };
    if (object.mimeType !== request.expectedMimeType) return { kind: "mismatch", reason: "mime_type" };
    // The configured result is an explicit test fixture; this simulator has no
    // observed object bytes and therefore never computes or attests a SHA-256.
    // Even fixtures must agree with the caller's expected metadata and digest.
    if (this.verificationOutcome.kind === "verified") {
      if (this.verificationOutcome.sizeBytes !== request.expectedSizeBytes) return { kind: "mismatch", reason: "size" };
      if (this.verificationOutcome.mimeType !== request.expectedMimeType) return { kind: "mismatch", reason: "mime_type" };
      if (this.verificationOutcome.sha256.toLowerCase() !== request.expectedSha256.toLowerCase()) return { kind: "mismatch", reason: "sha256" };
    }
    return this.verificationOutcome;
  }

  async createDownloadGrant(
    context: ProviderDriverContext<SyntheticStorageCredentials>,
    request: StorageDownloadRequest,
    _requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageDownloadResult | null> {
    this.assertSynthetic(context);
    if (signal?.aborted) return null;
    const object = this.byReference.get(request.accessReference);
    if (!object || object.tenantId !== context.tenantId || object.applicationId !== context.applicationId ||
        object.assetId !== request.assetId || object.fileName !== request.fileName) return null;
    return {
      url: "https://downloads.synthetic.invalid/" + encodeURIComponent(object.uploadSessionId),
      expiresAt: new Date(this.now() + 5 * 60_000).toISOString(),
    };
  }

  async scanObject(
    context: ProviderDriverContext<SyntheticStorageCredentials>,
    request: ProviderMalwareScanRequest,
    _requestId: string,
    signal?: AbortSignal,
  ): Promise<ProviderMalwareScanOutcome> {
    this.assertSynthetic(context);
    if (signal?.aborted) return { kind: "timeout" };
    const object = this.byReference.get(request.providerObjectReference);
    if (!object || object.tenantId !== context.tenantId || object.applicationId !== context.applicationId ||
        object.assetId !== request.assetId) {
      return { kind: "malformed" };
    }
    // Default is timeout; "clean"/"infected" can only be explicitly injected by
    // tests and must never be interpreted as a real malware-scan attestation.
    return this.scanOutcome;
  }
}
