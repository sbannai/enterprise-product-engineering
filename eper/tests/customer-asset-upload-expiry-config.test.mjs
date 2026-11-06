import test from "node:test";
import assert from "node:assert/strict";
import { parseCustomerAssetUploadExpiryScopes } from "../dist/packages/assets/customer-asset-upload-expiry-config.js";

test("expiry scope registry accepts bounded unique tenant/application pairs", () => {
  const scopes = parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" },
    { tenantId: "tenant-b", applicationId: "app-b", environment: "sandbox" },
  ]));
  assert.equal(scopes.length, 2);
  assert.equal(scopes[0].tenantId, "tenant-a");
  assert.equal(scopes[1].environment, "sandbox");
});

test("expiry scope registry fails closed for missing, malformed or excessive entries", () => {
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(undefined), /SCOPES_REQUIRED/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes("{"), /INVALID_JSON/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes("[]"), /SCOPES_OUT_OF_RANGE/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify(
    Array.from({ length: 11 }, (_, i) => ({
      tenantId: "tenant-" + i, applicationId: "app-" + i, environment: "uat",
    })),
  )), /SCOPES_OUT_OF_RANGE/);
});

test("expiry scope registry rejects duplicate tenants and unknown fields", () => {
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" },
    { tenantId: "tenant-a", applicationId: "app-b", environment: "uat" },
  ])), /DUPLICATE_TENANT/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "uat", secret: "not-allowed" },
  ])), /SCOPE_FIELDS_INVALID/);
});

test("expiry scope registry validates tenant, application and environment values", () => {
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "bad tenant", applicationId: "app-a", environment: "uat" },
  ])), /SCOPE_ID_INVALID/);
  assert.throws(() => parseCustomerAssetUploadExpiryScopes(JSON.stringify([
    { tenantId: "tenant-a", applicationId: "app-a", environment: "dev" },
  ])), /SCOPE_ENVIRONMENT_INVALID/);
});
