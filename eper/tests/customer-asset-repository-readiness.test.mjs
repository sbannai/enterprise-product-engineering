import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

function makePool(row) {
  const calls = [];
  let released = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      return { rows: [row], rowCount: 1 };
    },
    release() { released += 1; },
  };
  return { pool: { async connect() { return client; } }, calls, get released() { return released; } };
}

const readySchema = {
  assets: "eper_customer_assets",
  links: "eper_customer_asset_application_links",
  sessions: "eper_customer_asset_upload_sessions",
  scanJobs: "eper_customer_asset_scan_jobs",
  metadataOperations: "eper_customer_asset_metadata_operations",
  uploadRecoveryColumns: true,
  uploadRecoveryIndex: "eper_customer_asset_upload_recovery_idx",
};

test("repository readiness requires all four upload recovery columns and the recovery index", async () => {
  const fake = makePool(readySchema);
  await new PostgresCustomerAssetRepository(fake.pool).assertReady();
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].values, [[
    "request_fingerprint", "request_file_name", "request_mime_type", "provider_outcome",
  ]]);
  assert.match(fake.calls[0].sql, /information_schema\.columns/);
  assert.match(fake.calls[0].sql, /eper_customer_asset_upload_recovery_idx/);
  assert.equal(fake.released, 1);
});

test("repository readiness fails closed when a recovery column is missing", async () => {
  const fake = makePool({ ...readySchema, uploadRecoveryColumns: false });
  await assert.rejects(
    () => new PostgresCustomerAssetRepository(fake.pool).assertReady(),
    /EPER_CUSTOMER_ASSET_SCHEMA_NOT_APPLIED/,
  );
  assert.equal(fake.released, 1);
});

test("repository readiness fails closed when the recovery index is missing", async () => {
  const fake = makePool({ ...readySchema, uploadRecoveryIndex: null });
  await assert.rejects(
    () => new PostgresCustomerAssetRepository(fake.pool).assertReady(),
    /EPER_CUSTOMER_ASSET_SCHEMA_NOT_APPLIED/,
  );
  assert.equal(fake.released, 1);
});
