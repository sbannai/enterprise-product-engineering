import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../packages/audit/migrations/057_peripheral_type_catalogue.sql", import.meta.url), "utf8");

test("F-023 migration creates a platform-owned type catalogue and immutable schema versions", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS eper_peripheral_type_definitions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS eper_peripheral_type_schema_versions/);
  assert.match(migration, /PRIMARY KEY \(type_key, schema_version\)/);
  assert.match(migration, /configuration_schema JSONB NOT NULL/);
  assert.match(migration, /version_status IN \('DRAFT', 'PUBLISHED', 'DEPRECATED'\)/);
  assert.match(migration, /EPER_PERIPHERAL_TYPE_SCHEMA_VERSION_IMMUTABLE/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON eper_peripheral_type_schema_versions/);
});

test("F-023 migration makes catalogue events append-only and restricts private rows to platform admins", () => {
  assert.match(migration, /eper_peripheral_type_catalogue_events/);
  assert.match(migration, /EPER_PERIPHERAL_TYPE_CATALOGUE_EVENT_APPEND_ONLY/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /current_setting\('eper\.platform_admin', true\) = 'true'/);
  assert.match(migration, /version_status = 'PUBLISHED'/);
});
