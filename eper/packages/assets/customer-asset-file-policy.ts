export interface CustomerAssetFilePolicyEntry {
  extension: string;
  mimeType: string;
  maxSizeBytes: number;
}

export interface CustomerAssetUploadPolicyInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Resolve policy from customer-asset platform configuration. No implicit
 * defaults: an absent, malformed, ambiguous or empty policy disables uploads.
 *
 * JSON shape:
 * { "files": [{ "extension": ".xlsx", "mimeType": "...", "maxSizeBytes": 123 }] }
 */
export function validateCustomerAssetUploadPolicy(
  input: CustomerAssetUploadPolicyInput,
  configuredPolicyJson: string | undefined,
): void {
  if (!configuredPolicyJson?.trim()) {
    throw new Error("EPER_CUSTOMER_ASSET_FILE_POLICY_UNAVAILABLE");
  }

  let parsed: unknown;
  try { parsed = JSON.parse(configuredPolicyJson); }
  catch { throw new Error("EPER_CUSTOMER_ASSET_FILE_POLICY_INVALID"); }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      !Array.isArray((parsed as { files?: unknown }).files) ||
      (parsed as { files: unknown[] }).files.length === 0) {
    throw new Error("EPER_CUSTOMER_ASSET_FILE_POLICY_INVALID");
  }

  const entries = (parsed as { files: unknown[] }).files;
  const byExtension = new Map<string, CustomerAssetFilePolicyEntry>();
  const byMime = new Map<string, string>();
  for (const value of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("EPER_CUSTOMER_ASSET_FILE_POLICY_INVALID");
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.extension !== "string" || !/^\.[a-z0-9]{1,12}$/.test(entry.extension) ||
        typeof entry.mimeType !== "string" || !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/.test(entry.mimeType) ||
        !Number.isSafeInteger(entry.maxSizeBytes) || Number(entry.maxSizeBytes) <= 0) {
      throw new Error("EPER_CUSTOMER_ASSET_FILE_POLICY_INVALID");
    }
    const normalizedExtension = entry.extension.toLowerCase();
    const normalizedMime = entry.mimeType.toLowerCase();
    if (byExtension.has(normalizedExtension) || byMime.has(normalizedMime)) {
      throw new Error("EPER_CUSTOMER_ASSET_FILE_POLICY_AMBIGUOUS");
    }
    const normalized = { extension: normalizedExtension, mimeType: normalizedMime, maxSizeBytes: Number(entry.maxSizeBytes) };
    byExtension.set(normalizedExtension, normalized);
    byMime.set(normalizedMime, normalizedExtension);
  }

  const { fileName, mimeType, sizeBytes } = input;
  if (typeof fileName !== "string" || fileName.length === 0 || fileName.length > 255 ||
      fileName !== fileName.normalize("NFC") || fileName.trim() !== fileName ||
      /[\\/\u0000-\u001f\u007f]/.test(fileName) || fileName === "." || fileName === ".." ||
      fileName.startsWith(".") || /\.\./.test(fileName)) {
    throw new Error("EPER_CUSTOMER_ASSET_FILE_NAME_INVALID");
  }
  if (typeof mimeType !== "string" || mimeType !== mimeType.trim() ||
      mimeType !== mimeType.toLowerCase() || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("EPER_CUSTOMER_ASSET_FILE_METADATA_INVALID");
  }

  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  const rule = byExtension.get(extension);
  if (!rule || rule.mimeType !== mimeType || byMime.get(mimeType) !== extension) {
    throw new Error("EPER_CUSTOMER_ASSET_FILE_TYPE_NOT_ALLOWED");
  }
  if (sizeBytes > rule.maxSizeBytes) {
    throw new Error("EPER_CUSTOMER_ASSET_FILE_SIZE_EXCEEDED");
  }
}
