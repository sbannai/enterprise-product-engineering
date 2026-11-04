import { randomUUID } from "node:crypto";
import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { PostgresCustomerAssetRepository } from "./postgres-customer-asset-repository.js";
import type { StorageUploadRequest } from "./storage-upload-adapter.js";

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
  repository: Pick<PostgresCustomerAssetRepository, "reserveUpload" | "finalizeUploadGrant" | "failUploadReservation">;
  issueGrant: (request: StorageUploadRequest, requestId: string) => Promise<{
    providerUploadReference: string;
    url: string;
    method: "PUT" | "POST";
    expiresAt: string;
    headers: Record<string, string>;
  } | null>;
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

  const uploadSessionId = randomUUID();
  const reservation = {
    tenantId: input.tenantId,
    applicationId: input.applicationId,
    actorId: input.actorId,
    environment: input.environment,
    correlationId: input.correlationId,
    assetId: input.assetId,
    expectedSizeBytes: input.expectedSizeBytes,
    idempotencyKey: input.idempotencyKey,
    uploadSessionId,
  };

  // Claim the idempotency key durably before asking a provider to mint a
  // capability. The repository serializes concurrent claims in PostgreSQL.
  const reservedSessionId = await dependencies.repository.reserveUpload(reservation);
  if (reservedSessionId !== uploadSessionId) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_IDEMPOTENCY_REPLAY_CONFLICT");
  }

  const request: StorageUploadRequest = {
    tenantId: input.tenantId,
    actorId: input.actorId,
    applicationId: input.applicationId,
    assetId: input.assetId,
    uploadSessionId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.expectedSizeBytes,
  };

  let grant: Awaited<ReturnType<CustomerAssetUploadStartDependencies["issueGrant"]>>;
  try {
    grant = await dependencies.issueGrant(request, input.correlationId);
  } catch (error) {
    await dependencies.repository.failUploadReservation({
      tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
      environment: input.environment, correlationId: input.correlationId, uploadSessionId,
      reason: "provider_error",
    });
    throw error;
  }
  if (!grant) {
    await dependencies.repository.failUploadReservation({
      tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
      environment: input.environment, correlationId: input.correlationId, uploadSessionId,
      reason: "provider_unavailable",
    });
    return null;
  }

  const expiry = Date.parse(grant.expiresAt);
  const now = (dependencies.now ?? Date.now)();
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > 15 * 60_000 ||
      !grant.providerUploadReference?.trim() || grant.providerUploadReference.length > 2048) {
    await dependencies.repository.failUploadReservation({
      tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
      environment: input.environment, correlationId: input.correlationId, uploadSessionId,
      reason: "invalid_provider_grant",
    });
    return null;
  }

  try {
    await dependencies.repository.finalizeUploadGrant({
      tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
      environment: input.environment, correlationId: input.correlationId, uploadSessionId,
      providerUploadReference: grant.providerUploadReference, expiresAt: grant.expiresAt,
    });
  } catch (error) {
    await dependencies.repository.failUploadReservation({
      tenantId: input.tenantId, applicationId: input.applicationId, actorId: input.actorId,
      environment: input.environment, correlationId: input.correlationId, uploadSessionId,
      reason: "grant_persistence_failed",
    });
    throw error;
  }

  return {
    uploadSessionId,
    url: grant.url,
    method: grant.method,
    expiresAt: grant.expiresAt,
    headers: grant.headers,
  };
}
