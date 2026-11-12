/**
 * Versioned, allowlisted IPC contract for one customer-asset scanner child.
 * Excludes credentials, database handles/URLs, secret references, upload references,
 * upload-session identifiers, process environments and customer file bytes.
 */
export const CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_VERSION = 3 as const;

export interface CustomerAssetScanChildInput {
  tenantId: string;
  applicationId: string;
  assetId: string;
  checksumSha256: string;
  sizeBytes: number;
  mimeType: string;
}
export interface CustomerAssetScanChildStart {
  version: typeof CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_VERSION; type: "start";
  jobToken: string; claimGeneration: number; requestId: string; workerId: string; scannerServiceId: string;
  input: CustomerAssetScanChildInput;
}
export interface CustomerAssetScanChildResult {
  version: typeof CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_VERSION; type: "result";
  jobToken: string; claimGeneration: number; scannerServiceId: string;
  scanStatus: "clean" | "infected" | "error";
}
export interface CustomerAssetScanChildFailure {
  version: typeof CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_VERSION; type: "failure";
  jobToken: string; claimGeneration: number;
  code: "SCANNER_BOOTSTRAP_FAILED" | "SCANNER_EXECUTION_FAILED" | "SCANNER_RESULT_INVALID";
}
export type CustomerAssetScanChildMessage =
  | CustomerAssetScanChildStart | CustomerAssetScanChildResult | CustomerAssetScanChildFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
function validJobIdentity(value: Record<string, unknown>): boolean {
  return value.version === CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_VERSION &&
    boundedString(value.jobToken, 128) && /^[a-f0-9]{32,128}$/i.test(value.jobToken) &&
    Number.isSafeInteger(value.claimGeneration) && (value.claimGeneration as number) > 0;
}
export function isCustomerAssetScanChildStart(value: unknown): value is CustomerAssetScanChildStart {
  if (!isRecord(value) || !hasExactKeys(value, [
    "version", "type", "jobToken", "claimGeneration", "requestId", "workerId", "scannerServiceId", "input",
  ]) || !validJobIdentity(value) || value.type !== "start" ||
      !boundedString(value.requestId, 128) || !boundedString(value.workerId, 128) ||
      !/^[a-zA-Z0-9._:-]{2,128}$/.test(value.workerId) || !boundedString(value.scannerServiceId, 128) ||
      !/^[a-zA-Z0-9._:-]{2,128}$/.test(value.scannerServiceId) ||
      !isRecord(value.input) || !hasExactKeys(value.input, [
        "tenantId", "applicationId", "assetId", "checksumSha256", "sizeBytes", "mimeType",
      ])) return false;
  const input = value.input;
  return boundedString(input.tenantId, 128) && boundedString(input.applicationId, 128) &&
    boundedString(input.assetId, 128) &&
    typeof input.checksumSha256 === "string" && /^[a-f0-9]{64}$/i.test(input.checksumSha256) &&
    Number.isSafeInteger(input.sizeBytes) && (input.sizeBytes as number) > 0 &&
    boundedString(input.mimeType, 128) &&
    /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/.test(input.mimeType);
}
export function isCustomerAssetScanChildResult(value: unknown): value is CustomerAssetScanChildResult {
  return isRecord(value) && hasExactKeys(value, [
    "version", "type", "jobToken", "claimGeneration", "scannerServiceId", "scanStatus",
  ]) && validJobIdentity(value) && value.type === "result" &&
    boundedString(value.scannerServiceId, 128) &&
    /^[a-zA-Z0-9._:-]{2,128}$/.test(value.scannerServiceId) &&
    ["clean", "infected", "error"].includes(String(value.scanStatus));
}
export function isCustomerAssetScanChildFailure(value: unknown): value is CustomerAssetScanChildFailure {
  return isRecord(value) && hasExactKeys(value, [
    "version", "type", "jobToken", "claimGeneration", "code",
  ]) && validJobIdentity(value) && value.type === "failure" &&
    ["SCANNER_BOOTSTRAP_FAILED", "SCANNER_EXECUTION_FAILED", "SCANNER_RESULT_INVALID"].includes(String(value.code));
}
