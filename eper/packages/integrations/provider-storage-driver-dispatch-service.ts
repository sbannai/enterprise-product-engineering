import type {
  ProviderMalwareScanOutcome,
  ProviderMalwareScanRequest,
  ProviderInternalObjectReadRequest,
  ProviderObjectVerificationOutcome,
  ProviderObjectVerificationRequest,
  ProviderStorageDriver,
} from "./provider-storage-driver-contract.js";
import { assertProviderStorageDriver } from "./provider-storage-driver-contract.js";
import { verifiedProviderInternalObjectChunks } from "./provider-internal-object-read.js";
import type { ProviderRuntimeCredentialResolutionService } from "./provider-runtime-credential-resolution-service.js";
import type { StorageDownloadRequest, StorageDownloadResult } from "../assets/storage-download-adapter.js";
import type { StorageUploadRequest } from "../assets/storage-upload-adapter.js";
import type { StorageUploadLookupOutcome, StorageUploadLookupRequest, StorageUploadProviderOutcome } from "../assets/storage-upload-provider-contract.js";

export type ProviderStorageOperation =
  | { kind: "create_upload"; request: StorageUploadRequest }
  | { kind: "lookup_upload"; request: StorageUploadLookupRequest }
  | { kind: "renew_upload"; request: StorageUploadRequest & { providerUploadReference: string } }
  | { kind: "verify_object"; request: ProviderObjectVerificationRequest }
  | { kind: "create_download"; request: StorageDownloadRequest }
  | { kind: "scan_object"; request: ProviderMalwareScanRequest }
  | { kind: "read_object_internal"; request: ProviderInternalObjectReadRequest };

export type ProviderStorageOperationResult =
  | StorageUploadProviderOutcome
  | StorageUploadLookupOutcome
  | ProviderObjectVerificationOutcome
  | StorageDownloadResult | null
  | ProviderMalwareScanOutcome
  | AsyncIterable<Uint8Array>;

const CAPABILITY_BY_OPERATION: Record<ProviderStorageOperation["kind"], string> = {
  create_upload: "storage.upload.grant",
  lookup_upload: "storage.upload.lookup",
  renew_upload: "storage.upload.renew",
  verify_object: "storage.object.verify",
  create_download: "storage.download.grant",
  scan_object: "storage.object.scan",
  read_object_internal: "storage.object.read.internal",
};

function validText(value: unknown, max = 2048): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function validOperationRequest(operation: ProviderStorageOperation): boolean {
  if (!operation || typeof operation !== "object" || !operation.request ||
      typeof operation.request !== "object" || Array.isArray(operation.request)) return false;
  const request = operation.request as unknown as Record<string, unknown>;
  switch (operation.kind) {
    case "create_upload":
      return validText(request.tenantId, 128) && validText(request.applicationId, 128) &&
        validText(request.actorId, 128) && validText(request.assetId, 128) &&
        validText(request.uploadSessionId, 128) && validText(request.fileName, 512) &&
        validText(request.mimeType, 256) && Number.isSafeInteger(request.sizeBytes) &&
        (request.sizeBytes as number) > 0;
    case "lookup_upload":
      return validText(request.tenantId, 128) && validText(request.applicationId, 128) &&
        validText(request.uploadSessionId, 128);
    case "renew_upload":
      return validText(request.tenantId, 128) && validText(request.applicationId, 128) &&
        validText(request.actorId, 128) && validText(request.assetId, 128) &&
        validText(request.uploadSessionId, 128) && validText(request.fileName, 512) &&
        validText(request.mimeType, 256) && Number.isSafeInteger(request.sizeBytes) &&
        (request.sizeBytes as number) > 0 && validText(request.providerUploadReference, 2048);
    case "verify_object":
      return validText(request.uploadSessionId, 128) &&
        validText(request.providerUploadReference, 2048) &&
        Number.isSafeInteger(request.expectedSizeBytes) && (request.expectedSizeBytes as number) > 0 &&
        validText(request.expectedMimeType, 256) && validSha256(request.expectedSha256);
    case "create_download":
      return validText(request.tenantId, 128) && validText(request.applicationId, 128) &&
        validText(request.actorId, 128) && validText(request.assetId, 128) &&
        validText(request.accessReference, 2048) && validText(request.fileName, 512) &&
        (request.mimeType === undefined || validText(request.mimeType, 256));
    case "scan_object":
      return validText(request.assetId, 128) &&
        validText(request.providerObjectReference, 2048) && validSha256(request.expectedSha256);
    case "read_object_internal":
      return validText(request.assetId, 128) &&
        validText(request.providerObjectReference, 2048) &&
        Number.isSafeInteger(request.expectedSizeBytes) &&
        (request.expectedSizeBytes as number) > 0 &&
        validSha256(request.expectedSha256);
  }
}

export class ProviderStorageDispatchError extends Error {
  constructor(readonly code:
    | "PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH"
    | "PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING"
    | "PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID"
    | "PROVIDER_STORAGE_DISPATCH_ABORTED") {
    super(code);
    this.name = "ProviderStorageDispatchError";
  }
}

/**
 * Last-mile, fail-closed invocation boundary for storage provider drivers.
 * Runtime selection and connection-version revalidation happen immediately
 * before secret resolution. Credentials remain local to this call and are
 * never returned, persisted, or logged by this service.
 */
export class ProviderStorageDriverDispatchService<TCredentials> {
  constructor(
    private readonly runtime: Pick<
      ProviderRuntimeCredentialResolutionService<ProviderStorageDriver<TCredentials>, TCredentials>,
      "resolve"
    >,
  ) {}

  async dispatch(input: {
    tenantId: string;
    applicationId: string;
    requestId: string;
    operation: ProviderStorageOperation;
    signal?: AbortSignal;
    expectedConnectionId?: string;
  }): Promise<ProviderStorageOperationResult> {
    if (!input || !input.operation || typeof input.requestId !== "string" ||
        !input.requestId.trim() || input.requestId.length > 128) {
      throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
    }
    if (input.signal?.aborted) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_ABORTED");
    const capability = CAPABILITY_BY_OPERATION[input.operation.kind];
    if (!capability || !validText(input.tenantId, 128) || !validText(input.applicationId, 128) ||
        !validOperationRequest(input.operation)) {
      throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
    }

    const resolved = await this.runtime.resolve({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      capability,
      ...(input.expectedConnectionId !== undefined ? { expectedConnectionId: input.expectedConnectionId } : {}),
    });
    if (input.signal?.aborted) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_ABORTED");
    const selection = resolved.runtime.selection;
    if (selection.tenantId !== input.tenantId || selection.applicationId !== input.applicationId ||
        selection.capabilityKey !== capability || resolved.runtime.capability !== capability ||
        (input.expectedConnectionId !== undefined && selection.connectionId !== input.expectedConnectionId)) {
      throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
    }

    const driver = assertProviderStorageDriver(resolved.runtime.adapter);
    const context = {
      tenantId: selection.tenantId,
      applicationId: selection.applicationId,
      connectionId: selection.connectionId,
      providerKey: selection.providerKey,
      credentials: resolved.credentials,
    };

    switch (input.operation.kind) {
      case "create_upload":
        if (input.operation.request.tenantId !== input.tenantId ||
            input.operation.request.applicationId !== input.applicationId) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
        }
        return driver.createUploadGrant(context, input.operation.request, input.requestId, input.signal);
      case "lookup_upload":
        if (input.operation.request.tenantId !== input.tenantId ||
            input.operation.request.applicationId !== input.applicationId) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
        }
        if (!driver.capabilities.lookupByUploadSessionId) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        return driver.lookupUpload(context, input.operation.request.uploadSessionId, input.requestId, input.signal);
      case "renew_upload":
        if (input.operation.request.tenantId !== input.tenantId ||
            input.operation.request.applicationId !== input.applicationId) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
        }
        if (!driver.capabilities.renewByProviderReference) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        }
        return driver.renewUploadGrant(context, input.operation.request, input.requestId, input.signal);
      case "verify_object":
        if (!driver.capabilities.verifyObject) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        return driver.verifyObject(context, input.operation.request, input.requestId, input.signal);
      case "create_download":
        if (input.operation.request.tenantId !== input.tenantId ||
            input.operation.request.applicationId !== input.applicationId) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH");
        }
        if (!driver.capabilities.downloadGrant) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        }
        return driver.createDownloadGrant(context, input.operation.request, input.requestId, input.signal);
      case "scan_object":
        if (!driver.capabilities.malwareScan) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        return driver.scanObject(context, input.operation.request, input.requestId, input.signal);
      case "read_object_internal": {
        if (!driver.capabilities.internalObjectRead || typeof driver.readObjectInternal !== "function") {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        }
        const stream = await driver.readObjectInternal(context, input.operation.request, input.requestId, input.signal);
        if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
        }
        return verifiedProviderInternalObjectChunks({
          source: stream,
          expectedSizeBytes: input.operation.request.expectedSizeBytes,
          expectedSha256: input.operation.request.expectedSha256,
          signal: input.signal,
        });
      }
    }
  }
}
