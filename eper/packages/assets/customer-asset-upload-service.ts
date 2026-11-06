import { createHash } from "node:crypto";
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
  tenantId: string;
  applicationId: string;
  actorId: string;
  environment: AuditEnvironment;
  correlationId: string;
  assetId: string;
  expectedSizeBytes: number;
  idempotencyKey: string;
  fileName: string;
  mimeType: string;
}

export interface CustomerAssetUploadStartDependencies {
  repository: Pick<PostgresCustomerAssetRepository, "reserveUpload" | "finalizeUploadGrant"> &
    Partial<Pick<PostgresCustomerAssetRepository, "rejectUploadReservation">>;
  /** Legacy adapter boundary; prefer issueProviderOutcome for typed recovery semantics. */
  issueGrant?: (request: StorageUploadRequest, requestId: string) => Promise<{
    providerUploadReference: string;
    url: string;
    method: "PUT" | "POST";
    expiresAt: string;
    headers: Record<string, string>;
  } | null>;
  issueProviderOutcome?: (
    request: StorageUploadRequest, correlationId: string,
  ) => Promise<StorageUploadProviderOutcome>;
  now?: () => number;
}

/**
 * Starts a direct upload without exposing provider references.
 * The short-lived provider capability is not returned until the upload-session
 * reservation and its audit record commit successfully.
 */
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

  const normalizedFileName = input.fileName.normalize("NFC").trim();
  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  if (!normalizedFileName || normalizedFileName.length > 255 ||
      !normalizedMimeType || normalizedMimeType.length > 128) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_METADATA_INVALID");
  }
  const providerPolicy = "direct-upload-v1";
  const requestFingerprint = createHash("sha256").update(JSON.stringify({
    tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
    assetId: input.assetId, expectedSizeBytes: input.expectedSizeBytes,
    fileName: normalizedFileName, mimeType: normalizedMimeType, providerPolicy,
  })).digest("hex");
  const reservation = {
    tenantId: input.tenantId,
    applicationId: input.applicationId,
    actorId: input.actorId,
    environment: input.environment,
    correlationId: input.correlationId,
    assetId: input.assetId,
    expectedSizeBytes: input.expectedSizeBytes,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    requestFileName: normalizedFileName,
    requestMimeType: normalizedMimeType,
  };

  // The durable tenant/key lock returns the canonical session. Matching
  // existing sessions are not sent to the provider until a recovery-capable
  // provider contract can prove idempotent lookup/renewal.
  const reservationResult = await dependencies.repository.reserveUpload(reservation);
  const uploadSessionId = reservationResult.uploadSessionId;
  if (reservationResult.disposition === "existing") {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_RECOVERY_PENDING");
  }

  const request: StorageUploadRequest = {
    tenantId: input.tenantId,
    actorId: input.actorId,
    applicationId: input.applicationId,
    assetId: input.assetId,
    uploadSessionId,
    fileName: normalizedFileName,
    mimeType: normalizedMimeType,
    sizeBytes: input.expectedSizeBytes,
  };

  if (Boolean(dependencies.issueProviderOutcome) === Boolean(dependencies.issueGrant)) {
    throw new Error("EPER_CUSTOMER_ASSET_PROVIDER_OPERATION_REQUIRED");
  }

  // Typed outcomes distinguish definitive rejection from uncertain side effects.
  // Only a definitive rejection may transition the durable reservation to failed.
  let grant: {
    providerUploadReference: string; url: string; method: "PUT" | "POST";
    expiresAt: string; headers: Record<string, string>;
  } | null;
  if (dependencies.issueProviderOutcome) {
    const outcome = await dependencies.issueProviderOutcome(request, input.correlationId);
    if (outcome.status === "rejected") {
      if (!dependencies.repository.rejectUploadReservation) {
        throw new Error("EPER_CUSTOMER_ASSET_PROVIDER_REJECTION_PERSISTENCE_REQUIRED");
      }
      await dependencies.repository.rejectUploadReservation({
        tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
        environment: input.environment, correlationId: input.correlationId, uploadSessionId,
        rejectionCode: outcome.code,
      });
      return null;
    }
    if (outcome.status !== "succeeded") {
      // unknown, not_found and unavailable are not terminal; retain reservation.
      return null;
    }
    grant = { ...outcome.grant, headers: outcome.grant.headers ?? {}, providerUploadReference: outcome.providerUploadReference };
  } else {
    // Legacy adapters retain conservative behavior: null/throw never marks a
    // reservation failed because the provider may have created an object.
    grant = await dependencies.issueGrant!(request, uploadSessionId);
  }
  if (!grant) return null;

  const expiry = Date.parse(grant.expiresAt);
  const now = (dependencies.now ?? Date.now)();
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > 15 * 60_000 ||
      !grant.providerUploadReference?.trim() || grant.providerUploadReference.length > 2048) {
    return null;
  }

  await dependencies.repository.finalizeUploadGrant({
    tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
    environment: input.environment, correlationId: input.correlationId, uploadSessionId,
    providerUploadReference: grant.providerUploadReference, expiresAt: grant.expiresAt,
  });

  return {
    uploadSessionId,
    url: grant.url,
    method: grant.method,
    expiresAt: grant.expiresAt,
    headers: grant.headers,
  };
}
