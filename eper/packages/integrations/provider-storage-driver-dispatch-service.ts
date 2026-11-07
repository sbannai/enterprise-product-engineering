import type {
  ProviderMalwareScanOutcome,
  ProviderMalwareScanRequest,
  ProviderObjectVerificationOutcome,
  ProviderObjectVerificationRequest,
  ProviderStorageDriver,
} from "./provider-storage-driver-contract.js";
import { assertProviderStorageDriver, ProviderStorageDriverContractError } from "./provider-storage-driver-contract.js";
import type { ProviderRuntimeCredentialResolutionService } from "./provider-runtime-credential-resolution-service.js";
import type { StorageDownloadRequest, StorageDownloadResult, StorageUploadRequest } from "../assets/storage-download-adapter.js";
import type { StorageUploadLookupOutcome, StorageUploadProviderOutcome } from "../assets/storage-upload-provider-contract.js";

export type ProviderStorageOperation =
  | { kind: "create_upload"; request: StorageUploadRequest }
  | { kind: "lookup_upload"; request: { uploadSessionId: string } }
  | { kind: "renew_upload"; request: StorageUploadRequest & { providerUploadReference: string } }
  | { kind: "verify_object"; request: ProviderObjectVerificationRequest }
  | { kind: "create_download"; request: StorageDownloadRequest }
  | { kind: "scan_object"; request: ProviderMalwareScanRequest };

export type ProviderStorageOperationResult =
  | StorageUploadProviderOutcome
  | StorageUploadLookupOutcome
  | ProviderObjectVerificationOutcome
  | StorageDownloadResult | null
  | ProviderMalwareScanOutcome;

const CAPABILITY_BY_OPERATION: Record<ProviderStorageOperation["kind"], string> = {
  create_upload: "storage.upload.grant",
  lookup_upload: "storage.upload.lookup",
  renew_upload: "storage.upload.renew",
  verify_object: "storage.object.verify",
  create_download: "storage.download.grant",
  scan_object: "storage.object.scan",
};

export class ProviderStorageDispatchError extends Error {
  constructor(readonly code:
    | "PROVIDER_STORAGE_DISPATCH_SCOPE_MISMATCH"
    | "PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING"
    | "PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID") {
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
  }): Promise<ProviderStorageOperationResult> {
    if (!input || !input.operation || typeof input.requestId !== "string" ||
        !input.requestId.trim() || input.requestId.length > 128) {
      throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");
    }
    const capability = CAPABILITY_BY_OPERATION[input.operation.kind];
    if (!capability) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_REQUEST_INVALID");

    const resolved = await this.runtime.resolve({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      capability,
    });
    const selection = resolved.runtime.selection;
    if (selection.tenantId !== input.tenantId || selection.applicationId !== input.applicationId ||
        selection.capabilityKey !== capability || resolved.runtime.capability !== capability) {
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
        return driver.createUploadGrant(context, input.operation.request, input.requestId);
      case "lookup_upload":
        if (!driver.capabilities.lookupByUploadSessionId) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        return driver.lookupUpload(context, input.operation.request.uploadSessionId, input.requestId);
      case "renew_upload":
        if (!driver.capabilities.renewByProviderReference ||
            input.operation.request.tenantId !== input.tenantId ||
            input.operation.request.applicationId !== input.applicationId ||
            !input.operation.request.providerUploadReference.trim()) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        }
        return driver.renewUploadGrant(context, input.operation.request, input.requestId);
      case "verify_object":
        if (!driver.capabilities.verifyObject) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        return driver.verifyObject(context, input.operation.request, input.requestId);
      case "create_download":
        if (!driver.capabilities.downloadGrant ||
            input.operation.request.tenantId !== input.tenantId ||
            input.operation.request.applicationId !== input.applicationId) {
          throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        }
        return driver.createDownloadGrant(context, input.operation.request, input.requestId);
      case "scan_object":
        if (!driver.capabilities.malwareScan) throw new ProviderStorageDispatchError("PROVIDER_STORAGE_DISPATCH_CAPABILITY_MISSING");
        return driver.scanObject(context, input.operation.request, input.requestId);
    }
  }
}
