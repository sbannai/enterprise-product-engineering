import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../packages/audit/migrations/021_customer_asset_repository.sql", import.meta.url), "utf8");

test("customer asset repository migration separates customer assets from application links", () => {
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS eper_customer_assets"));
  assert.ok(migration.includes("repository_scope IN ('customer_shared', 'application_restricted')"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS eper_customer_asset_application_links"));
  assert.ok(migration.includes("FOREIGN KEY (tenant_id, asset_id)"));
  assert.ok(migration.includes("ON DELETE RESTRICT"));
  assert.ok(migration.includes("UNIQUE (tenant_id, application_id, idempotency_key)"));
  assert.ok(migration.includes("CREATE OR REPLACE FUNCTION eper_guard_customer_asset_application_link"));
  assert.ok(migration.includes("asset_scope IS DISTINCT FROM 'customer_shared'"));
  assert.ok(migration.includes("BEFORE INSERT OR UPDATE OF tenant_id, application_id, asset_id"));
});

test("customer asset metadata keeps binary content outside PostgreSQL and records integrity metadata", () => {
  assert.ok(migration.includes("storage_adapter_key"));
  assert.ok(migration.includes("storage_object_reference"));
  assert.ok(migration.includes("checksum_sha256 char(64)"));
  assert.ok(migration.includes("size_bytes bigint NOT NULL CHECK (size_bytes > 0)"));
  assert.ok(migration.includes("mime_type varchar(128)"));
  assert.doesNotMatch(migration, /bytea/i);
});

test("customer asset upload sessions are bounded, expiring and idempotent", () => {
  assert.ok(migration.includes("expected_size_bytes bigint NOT NULL CHECK (expected_size_bytes > 0)"));
  assert.ok(migration.includes("received_size_bytes bigint NOT NULL DEFAULT 0"));
  assert.ok(migration.includes("received_size_bytes <= expected_size_bytes"));
  assert.ok(migration.includes("expires_at timestamptz NOT NULL"));
  assert.ok(migration.includes("UNIQUE (tenant_id, idempotency_key)"));
});

test("all customer asset repository tables force tenant row-level security", () => {
  assert.ok(migration.includes("ALTER TABLE %I ENABLE ROW LEVEL SECURITY"));
  assert.ok(migration.includes("ALTER TABLE %I FORCE ROW LEVEL SECURITY"));
  assert.ok(migration.includes("tenant_id = current_setting('eper.tenant_id', true)"));
  assert.ok(migration.includes("application_id = current_setting('eper.application_id', true)"));
});
