/**
 * Versioned least-privilege IPC contract. Provider references, credentials,
 * DB URLs, secret references and file bytes are intentionally excluded.
 */
export const CUSTOMER_ASSET_SCAN_PROTOCOL_VERSION = 1 as const;
export interface CustomerAssetScanChildRequestV1 {
  protocolVersion: typeof CUSTOMER_ASSET_SCAN_PROTOCOL_VERSION;
  correlationId: string; tenantId: string; applicationId: string; assetId: string;
  uploadSessionId: string; claimGeneration: number; checksumSha256: string;
  sizeBytes: number; mimeType: string;
}
export interface CustomerAssetScanChildResultV1 {
  protocolVersion: typeof CUSTOMER_ASSET_SCAN_PROTOCOL_VERSION;
  correlationId: string; assetId: string; claimGeneration: number;
  scanStatus: "clean" | "infected" | "error";
  engine?: string; signatureVersion?: string;
}
const REQUEST_KEYS = ["protocolVersion","correlationId","tenantId","applicationId","assetId","uploadSessionId","claimGeneration","checksumSha256","sizeBytes","mimeType"] as const;
const RESULT_KEYS = ["protocolVersion","correlationId","assetId","claimGeneration","scanStatus","engine","signatureVersion"] as const;
function record(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
function exact(v: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(v).every(k => (keys as readonly string[]).includes(k)) &&
    keys.filter(k => k !== "engine" && k !== "signatureVersion").every(k => k in v);
}
function bounded(v: unknown, max=256): v is string { return typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v; }
export function validateCustomerAssetScanChildRequestV1(v: unknown): v is CustomerAssetScanChildRequestV1 {
  if (!record(v) || !exact(v, REQUEST_KEYS)) return false;
  return v.protocolVersion === 1 && bounded(v.correlationId,128) && bounded(v.tenantId) &&
    bounded(v.applicationId) && bounded(v.assetId) && bounded(v.uploadSessionId) &&
    Number.isSafeInteger(v.claimGeneration) && (v.claimGeneration as number)>0 &&
    typeof v.checksumSha256==="string" && /^[a-f0-9]{64}$/.test(v.checksumSha256) &&
    Number.isSafeInteger(v.sizeBytes) && (v.sizeBytes as number)>0 && bounded(v.mimeType,256);
}
export function validateCustomerAssetScanChildResultV1(v: unknown): v is CustomerAssetScanChildResultV1 {
  if (!record(v) || !exact(v, RESULT_KEYS)) return false;
  return v.protocolVersion===1 && bounded(v.correlationId,128) && bounded(v.assetId) &&
    Number.isSafeInteger(v.claimGeneration) && (v.claimGeneration as number)>0 &&
    ["clean","infected","error"].includes(String(v.scanStatus)) &&
    (v.engine===undefined || bounded(v.engine,128)) &&
    (v.signatureVersion===undefined || bounded(v.signatureVersion,128));
}
export function isCustomerAssetScanChildResultForRequest(r: CustomerAssetScanChildRequestV1, v: CustomerAssetScanChildResultV1): boolean {
  return v.protocolVersion===r.protocolVersion && v.correlationId===r.correlationId &&
    v.assetId===r.assetId && v.claimGeneration===r.claimGeneration;
}
