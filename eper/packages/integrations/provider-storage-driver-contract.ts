import type {
  StorageUploadLookupOutcome,
  StorageUploadProviderCapabilities,
  StorageUploadProviderOutcome,
} from "../assets/storage-upload-provider-contract.js";
import type { StorageDownloadRequest, StorageDownloadResult } from "../assets/storage-download-adapter.js";
import type { StorageUploadGrant, StorageUploadRequest } from "../assets/storage-upload-adapter.js";

export type ProviderObjectVerificationOutcome =
  | { kind: "verified"; sizeBytes: number; mimeType: string; sha256: string }
  | { kind: "not_found" }
  | { kind: "mismatch"; reason: "size" | "mime_type" | "sha256" }
  | { kind: "unknown" }
  | { kind: "unavailable" };

export type ProviderMalwareScanOutcome =
  | { kind: "clean"; scanReference: string }
  | { kind: "infected"; detectionCode: string }
  | { kind: "error"; retryable: boolean }
  | { kind: "timeout" }
  | { kind: "malformed" };

export interface ProviderDriverContext<TCredentials> {
  tenantId: string;
  applicationId: string;
  connectionId: string;
  providerKey: string;
  credentials: TCredentials;
}

export interface ProviderObjectVerificationRequest {
  uploadSessionId: string;
  providerUploadReference: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
  expectedSha256: string;
}

export interface ProviderMalwareScanRequest {
  assetId: string;
  providerObjectReference: string;
  expectedSha256: string;
}

export interface ProviderStorageDriver<TCredentials> {
  /** Immutable server-owned dependency declarations for this driver build. */
  readonly dependencyIds: readonly string[];
  readonly capabilities: StorageUploadProviderCapabilities & {
    verifyObject: boolean;
    downloadGrant: boolean;
    malwareScan: boolean;
  };
  createUploadGrant(
    context: ProviderDriverContext<TCredentials>,
    request: StorageUploadRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageUploadProviderOutcome>;
  lookupUpload(
    context: ProviderDriverContext<TCredentials>,
    uploadSessionId: string,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageUploadLookupOutcome>;
  renewUploadGrant(
    context: ProviderDriverContext<TCredentials>,
    request: StorageUploadRequest & { providerUploadReference: string },
    requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageUploadProviderOutcome>;
  verifyObject(
    context: ProviderDriverContext<TCredentials>,
    request: ProviderObjectVerificationRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<ProviderObjectVerificationOutcome>;
  createDownloadGrant(
    context: ProviderDriverContext<TCredentials>,
    request: StorageDownloadRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<StorageDownloadResult | null>;
  scanObject(
    context: ProviderDriverContext<TCredentials>,
    request: ProviderMalwareScanRequest,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<ProviderMalwareScanOutcome>;
}

export class ProviderStorageDriverContractError extends Error {
  constructor(readonly code:
    | "PROVIDER_DRIVER_INVALID"
    | "PROVIDER_DRIVER_CAPABILITY_MISMATCH"
    | "PROVIDER_DRIVER_METHOD_MISSING") {
    super(code);
    this.name = "ProviderStorageDriverContractError";
  }
}

/**
 * Validates that an executable driver implements every operation it declares.
 * It intentionally does not inspect, serialize or persist credential material.
 */
export function assertProviderStorageDriver<TCredentials>(
  driver: ProviderStorageDriver<TCredentials>,
): ProviderStorageDriver<TCredentials> {
  if (!driver || typeof driver !== "object" || !Array.isArray(driver.dependencyIds) ||
      driver.dependencyIds.some(id => typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) ||
      new Set(driver.dependencyIds).size !== driver.dependencyIds.length ||
      !driver.capabilities || typeof driver.capabilities !== "object") {
    throw new ProviderStorageDriverContractError("PROVIDER_DRIVER_INVALID");
  }
  const requirements: Array<[keyof ProviderStorageDriver<TCredentials>, boolean]> = [
    ["createUploadGrant", true],
    ["lookupUpload", driver.capabilities.lookupByUploadSessionId],
    ["renewUploadGrant", driver.capabilities.renewByProviderReference],
    ["verifyObject", driver.capabilities.verifyObject],
    ["createDownloadGrant", driver.capabilities.downloadGrant],
    ["scanObject", driver.capabilities.malwareScan],
  ];
  if (typeof driver.createUploadGrant !== "function" ||
      typeof driver.capabilities.idempotentCreateByUploadSessionId !== "boolean" ||
      typeof driver.capabilities.lookupByUploadSessionId !== "boolean" ||
      typeof driver.capabilities.renewByProviderReference !== "boolean" ||
      typeof driver.capabilities.verifyObject !== "boolean" ||
      typeof driver.capabilities.downloadGrant !== "boolean" ||
      typeof driver.capabilities.malwareScan !== "boolean") {
    throw new ProviderStorageDriverContractError("PROVIDER_DRIVER_INVALID");
  }
  for (const [method, required] of requirements) {
    if (required && typeof driver[method] !== "function") {
      throw new ProviderStorageDriverContractError("PROVIDER_DRIVER_METHOD_MISSING");
    }
  }
  if (driver.capabilities.idempotentCreateByUploadSessionId !== true) {
    throw new ProviderStorageDriverContractError("PROVIDER_DRIVER_CAPABILITY_MISMATCH");
  }
  return driver;
}
