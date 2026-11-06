import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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


const workerEntrypoint = fileURLToPath(new URL("../dist/apps/worker/customer-asset-upload-expiry-main.js", import.meta.url));

function runEntrypoint(extraEnv = {}) {
  return spawnSync(process.execPath, [workerEntrypoint], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...extraEnv },
    timeout: 10_000,
  });
}

test("expiry worker entrypoint is disabled by default", () => {
  const result = runEntrypoint();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_DISABLED/);
});

test("expiry worker entrypoint rejects non-PostgreSQL persistence before connecting", () => {
  const result = runEntrypoint({ EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_REQUIRES_POSTGRES/);
});

test("expiry worker entrypoint rejects missing tenant assignment before connecting", () => {
  const result = runEntrypoint({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_TENANT_ID_REQUIRED/);
});

test("expiry worker entrypoint requires the dedicated database URL", () => {
  const result = runEntrypoint({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_TENANT_ID: "tenant-test",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_APPLICATION_ID: "app-test",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_DATABASE_URL_REQUIRED/);
});

test("expiry worker entrypoint validates poll and alert configuration before database connection", () => {
  const result = runEntrypoint({
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_ENABLED: "true",
    EPER_CUSTOMER_ASSET_PERSISTENCE: "postgres",
    EPER_AUDIT_PERSISTENCE: "postgres",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_TENANT_ID: "tenant-test",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_APPLICATION_ID: "app-test",
    EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS: "0",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_POLL_INTERVAL_MS_OUT_OF_RANGE/);
});
