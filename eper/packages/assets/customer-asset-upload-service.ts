import { createHash, randomUUID } from "node:crypto";
import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { PostgresCustomerAssetRepository } from "./postgres-customer-asset-repository.js";
import type { StorageUploadRequest } from "./storage-upload-adapter.js";
import type { StorageUploadProviderOutcome } from "./storage-upload-provider-contract.js";

export interface CustomerAssetUploadGrant {
  uploadSessionId: string;
  url: string;
  method: "PUT" | "POST";
  expiresAt: string;
  headers: Record<string, string>;
}
export interface CustomerAssetUploadStartInput {
  tenantId: string; applicationId: string; actorId: string; environment: AuditEnvironment;
  correlationId: string; assetId: string; expectedSizeBytes: number; idempotencyKey: string;
  fileName: string; mimeType: string;
}
type UploadReservation = {
  disposition: "created" | "replayed";
  uploadSessionId: string; providerUploadReference: string | null;
  uploadStatus: "initiated" | "in_progress" | "completed" | "aborted" | "expired" | "failed";
  expiresAt: string; providerGrantExpiresAt: string | null;
};
export interface CustomerAssetUploadStartDependencies {
  repository: Pick<PostgresCustomerAssetRepository, "reserveUpload" | "recordUploadGrant" | "recordUploadProviderRejection">;
  issueGrant: (request: StorageUploadRequest, requestId: string) => Promise<StorageUploadProviderOutcome>;
  now?: () => number;
}
function fingerprint(input: CustomerAssetUploadStartInput): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
    assetId: input.assetId, fileName: input.fileName.normalize("NFC"),
    mimeType: input.mimeType.trim().toLowerCase(), expectedSizeBytes: input.expectedSizeBytes,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
export async function startCustomerAssetUpload(
  input: CustomerAssetUploadStartInput,
  dependencies: CustomerAssetUploadStartDependencies,
): Promise<CustomerAssetUploadGrant | null> {
  if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes <= 0) {
    throw new Error("EPER_CUSTOMER_ASSET_EXPECTED_SIZE_INVALID");
  }
  if (!input.correlationId?.trim()) throw new Error("EPER_CUSTOMER_ASSET_CORRELATION_ID_REQUIRED");
  if (!/^[a-zA-Z0-9._:-]{16,128}$/.test(input.idempotencyKey)) {
    throw new Error("EPER_CUSTOMER_ASSET_IDEMPOTENCY_KEY_INVALID");
  }
  if (!input.fileName?.trim() || input.fileName.length > 255 ||
      !input.mimeType?.trim() || input.mimeType.length > 128) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_METADATA_INVALID");
  }
  const requestFingerprint = fingerprint(input);
  const reservation: UploadReservation = await dependencies.repository.reserveUpload({
    tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
    environment: input.environment, correlationId: input.correlationId, assetId: input.assetId,
    expectedSizeBytes: input.expectedSizeBytes, idempotencyKey: input.idempotencyKey,
    requestFingerprint, uploadSessionId: randomUUID(),
  });
  if (!["initiated", "in_progress"].includes(reservation.uploadStatus)) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_" + reservation.uploadStatus.toUpperCase());
  }
  // A replay without a persisted provider reference is ambiguous: the first
  // provider create may have succeeded even if its response was lost. Never
  // issue another create until authoritative lookup/reconciliation is available.
  if (reservation.disposition === "replayed" && !reservation.providerUploadReference) return null;
  if (Date.parse(reservation.expiresAt) <= (dependencies.now ?? Date.now)()) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_EXPIRED");
  }
  const request: StorageUploadRequest = {
    tenantId: input.tenantId, actorId: input.actorId, applicationId: input.applicationId,
    assetId: input.assetId, uploadSessionId: reservation.uploadSessionId,
    fileName: input.fileName.normalize("NFC"), mimeType: input.mimeType.trim().toLowerCase(),
    sizeBytes: input.expectedSizeBytes,
    ...(reservation.providerUploadReference
      ? { providerUploadReference: reservation.providerUploadReference } : {}),
  };
  // Keep request tracing separate from the client key. The durable provider
  // operation identity is request.uploadSessionId; adapters receive the API
  // correlation ID in IntegrationPort's correlation slot.
  const outcome = await dependencies.issueGrant(request, input.correlationId);
  if (outcome.kind === "rejected") {
    await dependencies.repository.recordUploadProviderRejection({
      tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
      environment: input.environment, correlationId: input.correlationId, assetId: input.assetId,
      uploadSessionId: reservation.uploadSessionId, rejectionCode: outcome.rejectionCode,
    });
    return null;
  }
  if (outcome.kind !== "succeeded") return null;
  const grant = outcome;
  const now = (dependencies.now ?? Date.now)();
  const expiry = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > 15 * 60_000) return null;
  if (reservation.providerUploadReference &&
      reservation.providerUploadReference !== grant.providerUploadReference) {
    throw new Error("EPER_CUSTOMER_ASSET_PROVIDER_REFERENCE_CONFLICT");
  }
  await dependencies.repository.recordUploadGrant({
    tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
    environment: input.environment, correlationId: input.correlationId, assetId: input.assetId,
    uploadSessionId: reservation.uploadSessionId, requestFingerprint,
    providerUploadReference: grant.providerUploadReference, grantExpiresAt: grant.expiresAt,
  });
  return {
    uploadSessionId: reservation.uploadSessionId, url: grant.url, method: grant.method,
    expiresAt: grant.expiresAt, headers: grant.headers,
  };
}
