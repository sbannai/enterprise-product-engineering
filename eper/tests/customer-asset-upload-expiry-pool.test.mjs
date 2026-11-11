import test from "node:test";
import assert from "node:assert/strict";
import { createCustomerAssetUploadExpiryPool } from "../dist/packages/assets/customer-asset-upload-expiry-pool.js";

const dedicated = "postgresql://expiry_worker:secret@127.0.0.1:5432/eper";

test("expiry pool refuses broader payment/default credentials when dedicated URL is absent", () => {
  assert.throws(
    () => createCustomerAssetUploadExpiryPool({
      EPER_PAYMENT_DATABASE_URL: "postgresql://payment:secret@localhost/eper",
      DATABASE_URL: "postgresql://api:secret@localhost/eper",
    }, class {}),
    { message: "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED" },
  );
});

test("expiry pool rejects malformed or non-PostgreSQL dedicated URLs", () => {
  assert.throws(
    () => createCustomerAssetUploadExpiryPool({ EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: "not-a-url" }, class {}),
    { message: "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID" },
  );
  assert.throws(
    () => createCustomerAssetUploadExpiryPool({ EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: "https://example.invalid" }, class {}),
    { message: "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_INVALID" },
  );
});

test("expiry pool uses only dedicated credentials and bounded worker-specific options", () => {
  let options;
  class FakePool {
    constructor(value) { options = value; }
    async connect() { return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }; }
    async end() {}
  }
  createCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: dedicated,
    EPER_PAYMENT_DATABASE_URL: "postgresql://payment:wrong@localhost/eper",
    DATABASE_URL: "postgresql://api:wrong@localhost/eper",
  }, FakePool);
  assert.equal(options.connectionString, dedicated);
  assert.equal(options.application_name, "eper-customer-asset-upload-expiry-worker");
  assert.equal(options.max, 2);
  assert.ok(options.max <= 5);
  assert.ok(options.connectionTimeoutMillis >= 500);
  assert.ok(options.statement_timeout >= 500);
});

test("expiry pool rejects unsafe pool-size overrides", () => {
  assert.throws(
    () => createCustomerAssetUploadExpiryPool({
      EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: dedicated,
      EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX: "6",
    }, class {}),
    { message: "EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX_OUT_OF_RANGE" },
  );
});
