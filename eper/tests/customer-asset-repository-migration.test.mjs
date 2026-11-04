import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../packages/audit/migrations/021_customer_asset_repository.sql", import.meta.url), "utf8");

test("customer asset repository migration separates customer assets from application links", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS eper_customer_assets/);
  assert.match(migration, /repository_scope IN \\('customer_shared', 'application_restricted'\\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS eper_customer_asset_application_links/);
  assert.match(migration, /FOREIGN KEY \\(tenant_id, asset_id\\)[\\s\\S]*ON DELETE RESTRICT/);
  assert.match(migration, /UNIQUE \\(tenant_id, application_id, idempotency_key\\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION eper_guard_customer_asset_application_link/);
  assert.match(migration, /asset_scope IS DISTINCT FROM 'customer_shared'/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF tenant_id, application_id, asset_id/);
});

test("customer asset metadata keeps binary content outside PostgreSQL and records integrity metadata", () => {
  assert.match(migration, /storage_adapter_key/);
  assert.match(migration, /storage_object_reference/);
  assert.match(migration, /checksum_sha256 char\\(64\\)/);
  assert.match(migration, /size_bytes bigint NOT NULL CHECK \\(size_bytes > 0\\)/);
  assert.match(migration, /mime_type varchar\\(128\\)/);
  assert.doesNotMatch(migration, /bytea/i);
});

test("customer asset upload sessions are bounded, expiring and idempotent", () => {
  assert.match(migration, /expected_size_bytes bigint NOT NULL CHECK \\(expected_size_bytes > 0\\)/);
  assert.match(migration, /received_size_bytes bigint NOT NULL DEFAULT 0/);
  assert.match(migration, /received_size_bytes <= expected_size_bytes/);
  assert.match(migration, /expires_at timestamptz NOT NULL/);
  assert.match(migration, /UNIQUE \\(tenant_id, idempotency_key\\)/);
});

test("all customer asset repository tables force tenant row-level security", () => {
  assert.match(migration, /ALTER TABLE %I ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /tenant_id = current_setting\\('eper\\.tenant_id', true\\)/);
  assert.match(migration, /application_id = current_setting\\('eper\\.application_id', true\\)/);
});
