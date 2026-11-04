import { randomUUID } from "node:crypto";
import type { AuditEnvironment } from "../audit/audit-event-store.js";
import type { PostgresCustomerAssetRepository } from "./postgres-customer-asset-repository.js";
import type { StorageUploadAdapterOptions, StorageUploadRequest } from "./storage-upload-adapter.js";

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
  repository: Pick<PostgresCustomerAssetRepository, "reserveUpload">;
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
  const grant = await dependencies.issueGrant(request, input.correlationId);
  if (!grant) return null;

  const expiry = Date.parse(grant.expiresAt);
  const now = (dependencies.now ?? Date.now)();
  if (!Number.isFinite(expiry) || expiry <= now || expiry - now > 15 * 60_000) return null;

  // Persist the opaque provider reference and audit event before returning the
  // capability to the browser. If persistence fails, the grant remains undisclosed
  // and expires naturally at the provider.
  await dependencies.repository.reserveUpload({
    tenantId: input.tenantId,
    applicationId: input.applicationId,
    actorId: input.actorId,
    environment: input.environment,
    correlationId: input.correlationId,
    assetId: input.assetId,
    expectedSizeBytes: input.expectedSizeBytes,
    idempotencyKey: input.idempotencyKey,
    providerUploadReference: grant.providerUploadReference,
    expiresAt: grant.expiresAt,
    uploadSessionId,
  });

  return {
    uploadSessionId,
    url: grant.url,
    method: grant.method,
    expiresAt: grant.expiresAt,
    headers: grant.headers,
  };
}
