import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../packages/audit/migrations/021_customer_asset_repository.sql", import.meta.url), "utf8");
const scanDispatchMigration = await readFile(new URL("../packages/audit/migrations/022_customer_asset_scan_dispatch.sql", import.meta.url), "utf8");
const uploadReservationMigration = await readFile(new URL("../packages/audit/migrations/023_customer_asset_upload_reservation.sql", import.meta.url), "utf8");
const uploadRetryMigration = await readFile(new URL("../packages/audit/migrations/024_customer_asset_upload_retry_lifecycle.sql", import.meta.url), "utf8");

test("customer asset repository migration separates customer assets from application links", () => {
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS eper_customer_assets"));
  assert.ok(migration.includes("repository_scope IN ('customer_shared', 'application_restricted')"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS eper_customer_asset_application_links"));
  assert.ok(migration.includes("FOREIGN KEY (tenant_id, asset_id, repository_scope)"));
  assert.ok(migration.includes("CHECK (repository_scope = 'customer_shared')"));
  assert.ok(migration.includes("ON DELETE RESTRICT"));
  assert.ok(migration.includes("UNIQUE (tenant_id, application_id, idempotency_key)"));
  assert.ok(migration.includes("UNIQUE (tenant_id, asset_id, repository_scope)"));
  assert.ok(migration.includes("CREATE POLICY customer_asset_application_read"));
  assert.ok(migration.includes("owner_application_id = current_setting('eper.application_id', true)"));
  assert.ok(migration.includes("l.application_id = current_setting('eper.application_id', true)"));
  assert.ok(migration.includes("CREATE ROLE eper_customer_asset_access NOLOGIN NOSUPERUSER"));
  assert.ok(migration.includes("GRANT SELECT, INSERT, UPDATE ON eper_customer_assets TO eper_customer_asset_access"));
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

test("customer asset RLS enforces tenant and application isolation with a dedicated least-privilege role", () => {
  assert.ok(migration.includes("ALTER TABLE %I ENABLE ROW LEVEL SECURITY"));
  assert.ok(migration.includes("ALTER TABLE %I FORCE ROW LEVEL SECURITY"));
  assert.ok(migration.includes("tenant_id = current_setting('eper.tenant_id', true)"));
  assert.ok(migration.includes("application_id = current_setting('eper.application_id', true)"));
});

test("scan dispatch migration creates a tenant/application-isolated transactional outbox", () => {
  assert.ok(scanDispatchMigration.includes("CREATE TABLE IF NOT EXISTS eper_customer_asset_scan_jobs"));
  assert.ok(scanDispatchMigration.includes("UNIQUE") || scanDispatchMigration.includes("PRIMARY KEY (tenant_id, upload_session_id)"));
  assert.ok(scanDispatchMigration.includes("attempt_count integer NOT NULL DEFAULT 0"));
  assert.ok(scanDispatchMigration.includes("max_attempts integer NOT NULL DEFAULT 5"));
  assert.ok(scanDispatchMigration.includes("lease_expires_at timestamptz"));
  assert.ok(scanDispatchMigration.includes("FORCE ROW LEVEL SECURITY"));
  assert.ok(scanDispatchMigration.includes("application_id = current_setting('eper.application_id', true)"));
  assert.ok(scanDispatchMigration.includes("GRANT SELECT, INSERT, UPDATE ON eper_customer_asset_scan_jobs TO eper_customer_asset_access"));
});


test("upload reservation migration supports provider-free reservations and a guarded finalization state", () => {
  assert.ok(uploadReservationMigration.includes("'reserved'"));
  assert.ok(uploadReservationMigration.includes("'initiated'"));
  assert.ok(uploadReservationMigration.includes("provider_upload_reference is already nullable"));
  assert.ok(uploadReservationMigration.includes("WHERE upload_status = 'reserved'"));
});


test("upload retry migration preserves terminal history and scopes active sessions and idempotency by application", () => {
  assert.ok(uploadRetryMigration.includes("DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_tenant_id_asset_id_key"));
  assert.ok(uploadRetryMigration.includes("DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_tenant_id_idempotency_key_key"));
  assert.ok(uploadRetryMigration.includes("(tenant_id, application_id, idempotency_key)"));
  assert.ok(uploadRetryMigration.includes("(tenant_id, application_id, asset_id)"));
  assert.ok(uploadRetryMigration.includes("WHERE upload_status IN ('reserved', 'initiated', 'in_progress')"));
  assert.ok(uploadRetryMigration.includes("ON eper_customer_asset_upload_sessions (expires_at, tenant_id, application_id)"));
});
