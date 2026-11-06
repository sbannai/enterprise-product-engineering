import type { StorageUploadGrant, StorageUploadRequest } from "./storage-upload-adapter.js";

export interface StorageUploadProviderCapabilities {
  /** Provider guarantees one object per uploadSessionId for repeated create calls. */
  idempotentCreateByUploadSessionId: boolean;
  /** Provider can look up an already-created object using the persisted uploadSessionId. */
  lookupByUploadSessionId: boolean;
  /** Provider can mint a new short-lived grant for the exact existing object reference. */
  renewGrantForExistingReference: boolean;
}

export type StorageUploadProviderOutcome =
  | { status: "succeeded"; providerUploadReference: string; grant: StorageUploadGrant }
  | { status: "rejected"; code: string }
  | { status: "unknown"; code: "provider_outcome_unknown" }
  | { status: "not_found" }
  | { status: "unavailable"; code: "provider_recovery_unsupported" };

export interface StorageUploadExistingSession {
  uploadSessionId: string;
  providerUploadReference: string;
}

export interface StorageUploadProvider {
  capabilities: Readonly<StorageUploadProviderCapabilities>;
  /** Must use request.uploadSessionId as the provider's idempotency identity. */
  create(request: StorageUploadRequest, correlationId: string): Promise<StorageUploadProviderOutcome>;
  /** Must return only the object already associated with this persisted session identity. */
  lookupByUploadSessionId(uploadSessionId: string, correlationId: string): Promise<StorageUploadProviderOutcome>;
  /** Must renew a grant for this exact reference; it must never create or select another object. */
  renewGrantForExistingReference(
    input: StorageUploadExistingSession,
    correlationId: string,
  ): Promise<StorageUploadProviderOutcome>;
}

function validProviderReference(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2048;
}

/**
 * Dispatches only provider operations backed by explicitly declared capabilities.
 * Unknown outcomes are preserved verbatim for durable reconciliation; this helper
 * never converts them to a definitive rejection or initiates a second create.
 */
export async function issueOrRecoverStorageUploadGrant(
  provider: StorageUploadProvider,
  request: StorageUploadRequest,
  correlationId: string,
  existingSession?: StorageUploadExistingSession,
): Promise<StorageUploadProviderOutcome> {
  if (!request.uploadSessionId?.trim() || !correlationId?.trim()) {
    throw new Error("ASSET_STORAGE_SESSION_IDENTITY_REQUIRED");
  }

  if (existingSession) {
    if (existingSession.uploadSessionId !== request.uploadSessionId ||
        !validProviderReference(existingSession.providerUploadReference)) {
      throw new Error("ASSET_STORAGE_EXISTING_SESSION_IDENTITY_MISMATCH");
    }
    if (!provider.capabilities.renewGrantForExistingReference) {
      return { status: "unavailable", code: "provider_recovery_unsupported" };
    }
    const outcome = await provider.renewGrantForExistingReference(existingSession, correlationId);
    if (outcome.status === "succeeded" &&
        outcome.providerUploadReference !== existingSession.providerUploadReference) {
      return { status: "unknown", code: "provider_outcome_unknown" };
    }
    return outcome;
  }

  if (provider.capabilities.idempotentCreateByUploadSessionId) {
    return provider.create(request, correlationId);
  }

  if (provider.capabilities.lookupByUploadSessionId) {
    const recovered = await provider.lookupByUploadSessionId(request.uploadSessionId, correlationId);
    if (recovered.status !== "not_found") return recovered;
    // A lookup miss is not permission to create a new provider object.
    return { status: "unavailable", code: "provider_recovery_unsupported" };
  }

  return { status: "unavailable", code: "provider_recovery_unsupported" };
}
