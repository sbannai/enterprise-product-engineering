import test from "node:test";
import assert from "node:assert/strict";
import { createCustomerAssetUploadExpiryPool } from "../dist/packages/assets/customer-asset-upload-expiry-runtime.js";

test("expiry worker pool requires its dedicated URL and never falls back to payment or default URLs", () => {
  assert.throws(() => createCustomerAssetUploadExpiryPool({
    DATABASE_URL: "postgres://api:secret@localhost/app",
    EPER_PAYMENT_DATABASE_URL: "postgres://payment:secret@localhost/app",
  }), /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED/);
});

test("expiry worker pool rejects invalid and non-PostgreSQL connection URLs", () => {
  assert.throws(() => createCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: "not a url",
  }), /DATABASE_URL_INVALID/);
  assert.throws(() => createCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: "https://example.invalid",
  }), /DATABASE_URL_INVALID/);
});

test("expiry worker pool applies a small bounded connection budget and dedicated application name", async () => {
  const pool = createCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: "postgres://worker:secret@127.0.0.1:5432/eper_test",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX: "3",
  });
  try {
    assert.equal(pool.options.max, 3);
    assert.equal(pool.options.application_name, "eper-customer-asset-upload-expiry-worker");
    assert.equal(pool.options.connectionTimeoutMillis, 5000);
  } finally {
    await pool.end();
  }
});

test("expiry worker pool rejects unsafe pool sizes", () => {
  assert.throws(() => createCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: "postgres://worker:secret@127.0.0.1:5432/eper_test",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX: "6",
  }), /POOL_MAX_OUT_OF_RANGE/);
});
