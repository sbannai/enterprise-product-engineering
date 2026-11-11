import test from "node:test";
import assert from "node:assert/strict";
import { parseCustomerAssetUploadExpiryScopes } from "../dist/packages/assets/customer-asset-upload-expiry-config.js";

test("expiry scope registry accepts up to ten unique tenant/application scopes", () => {
  const scopes = parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" },
    { tenantId: "tenant-b", applicationId: "app-b", environment: "sandbox" },
  ]));
  assert.equal(scopes.length, 2);
  assert.equal(scopes[0].tenantId, "tenant-a");
  assert.equal(scopes[1].environment, "sandbox");
});
test("expiry scope registry rejects missing, malformed, oversized and duplicate entries", () => {
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(undefined), /SCOPES_REQUIRED/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes("{"), /INVALID_JSON/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes("[]"), /SCOPES_OUT_OF_RANGE/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes("x".repeat(16_385)), /SCOPES_TOO_LARGE/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" },
    { tenantId: "tenant-a", applicationId: "app-b", environment: "uat" },
  ])), /DUPLICATE_TENANT/);
});
test("expiry scope registry rejects unknown fields and invalid identity/environment values", () => {
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "uat", password: "x" },
  ])), /SCOPE_FIELDS_INVALID/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "bad tenant", applicationId: "app-a", environment: "uat" },
  ])), /SCOPE_ID_INVALID/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "dev" },
  ])), /SCOPE_ENVIRONMENT_INVALID/);
});
