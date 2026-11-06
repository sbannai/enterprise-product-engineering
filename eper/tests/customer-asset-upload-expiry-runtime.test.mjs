import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresCustomerAssetUploadExpiryPool } from "../dist/packages/assets/postgres-customer-asset-upload-expiry-runtime.js";

const TEST_URL = "postgres://eper:eper_test_password@127.0.0.1:5432/eper_test";

test("dedicated expiry pool requires its own explicit database URL and has no generic fallback", () => {
  assert.throws(() => createPostgresCustomerAssetUploadExpiryPool({ DATABASE_URL: TEST_URL }),
    /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED/);
  assert.throws(() => createPostgresCustomerAssetUploadExpiryPool({ EPER_PAYMENT_DATABASE_URL: TEST_URL }),
    /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED/);
});

test("dedicated expiry pool rejects invalid PostgreSQL URLs", () => {
  assert.throws(() => createPostgresCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: "https://example.invalid",
  }), /DATABASE_URL_INVALID/);
});

test("dedicated expiry pool uses a small bounded pool and defensive timeouts", async () => {
  const pool = createPostgresCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: TEST_URL,
  });
  try {
    assert.equal(pool.options.max, 2);
    assert.equal(pool.options.connectionTimeoutMillis, 5_000);
    assert.equal(pool.options.idleTimeoutMillis, 30_000);
    assert.equal(pool.options.statement_timeout, 15_000);
    assert.equal(pool.options.query_timeout, 20_000);
    assert.equal(pool.options.lock_timeout, 5_000);
    assert.equal(pool.options.idle_in_transaction_session_timeout, 10_000);
    assert.equal(pool.options.application_name, "eper-customer-asset-upload-expiry-worker");
  } finally { await pool.end(); }
});

test("dedicated expiry pool accepts bounded deployment overrides and rejects unsafe values", async () => {
  const pool = createPostgresCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: TEST_URL,
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX: "4",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_CONNECTION_TIMEOUT_MS: "8000",
  });
  try {
    assert.equal(pool.options.max, 4);
    assert.equal(pool.options.connectionTimeoutMillis, 8_000);
  } finally { await pool.end(); }
  assert.throws(() => createPostgresCustomerAssetUploadExpiryPool({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL: TEST_URL,
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POOL_MAX: "0",
  }), /POOL_MAX_OUT_OF_RANGE/);
});
