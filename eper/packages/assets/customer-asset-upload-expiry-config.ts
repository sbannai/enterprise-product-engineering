import type { AuditEnvironment } from "../audit/audit-event-store.js";

export interface CustomerAssetUploadExpiryScope {
  tenantId: string;
  applicationId: string;
  environment: AuditEnvironment;
}

/** Parses a bounded, operator-managed registry; one seed application per tenant. */
export function parseCustomerAssetUploadExpiryScopes(raw: string | undefined): CustomerAssetUploadExpiryScope[] {
  if (!raw?.trim()) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_REQUIRED");
  if (raw.length > 16_384) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_TOO_LARGE");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_INVALID_JSON");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPES_OUT_OF_RANGE");
  }
  const tenants = new Set<string>();
  return parsed.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPE_INVALID");
    }
    const item = value as Record<string, unknown>;
    if (Object.keys(item).sort().join(",") !== "applicationId,environment,tenantId") {
      throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPE_FIELDS_INVALID");
    }
    const { tenantId, applicationId, environment } = item;
    if (typeof tenantId !== "string" || !/^[a-zA-Z0-9._:-]{2,128}$/.test(tenantId) ||
        typeof applicationId !== "string" || !/^[a-zA-Z0-9._:-]{2,128}$/.test(applicationId)) {
      throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPE_ID_INVALID");
    }
    if (environment !== "production" && environment !== "uat" && environment !== "sandbox") {
      throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_SCOPE_ENVIRONMENT_INVALID");
    }
    if (tenants.has(tenantId)) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DUPLICATE_TENANT");
    tenants.add(tenantId);
    return { tenantId, applicationId, environment };
  });
}
