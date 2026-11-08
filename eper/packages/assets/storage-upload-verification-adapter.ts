import type { IntegrationPort } from "../integration/index.js";

export interface StorageUploadVerificationRequest {
  tenantId: string;
  applicationId: string;
  assetId: string;
  uploadSessionId: string;
  providerUploadReference: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
  expectedSha256: string;
}

export interface StorageUploadVerificationResult {
  objectExists: boolean;
  sizeBytes: number;
  detectedMimeType: string;
  checksumSha256: string;
}

export interface VerifiedStorageObject {
  sizeBytes: number;
  detectedMimeType: string;
  checksumSha256: string;
}

/**
 * Server-to-server object inspection. Provider references never leave the API.
 * This adapter does not scan files; a separate trusted scanner owns that gate.
 */
export function createStorageUploadVerificationAdapter(
  port: IntegrationPort<StorageUploadVerificationRequest, StorageUploadVerificationResult>,
): (request: StorageUploadVerificationRequest, requestId: string) => Promise<VerifiedStorageObject | null> {
  return async (request, requestId) => {
    let outcome;
    try { outcome = await port.invoke(request, requestId); }
    catch { return null; }
    if (!outcome.success || !outcome.value || outcome.value.objectExists !== true) return null;
    const value = outcome.value;
    if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0 ||
        typeof value.detectedMimeType !== "string" || !value.detectedMimeType.trim() ||
        value.detectedMimeType.length > 128 ||
        !/^[a-f0-9]{64}$/.test(value.checksumSha256) ||
        !/^[a-f0-9]{64}$/.test(request.expectedSha256)) return null;
    if (value.sizeBytes !== request.expectedSizeBytes ||
        value.detectedMimeType.toLowerCase() !== request.expectedMimeType.toLowerCase() ||
        value.checksumSha256 !== request.expectedSha256) return null;
    return {
      sizeBytes: value.sizeBytes,
      detectedMimeType: value.detectedMimeType,
      checksumSha256: value.checksumSha256,
    };
  };
}
