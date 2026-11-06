import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../packages/audit/migrations/021_customer_asset_repository.sql", import.meta.url), "utf8");
const scanDispatchMigration = await readFile(new URL("../packages/audit/migrations/022_customer_asset_scan_dispatch.sql", import.meta.url), "utf8");
const uploadReservationMigration = await readFile(new URL("../packages/audit/migrations/023_customer_asset_upload_reservation.sql", import.meta.url), "utf8");
const metadataIdempotencyMigration = await readFile(new URL("../packages/audit/migrations/025_customer_asset_metadata_idempotency.sql", import.meta.url), "utf8");
const uploadRecoveryMigration = await readFile(new URL("../packages/audit/migrations/026_customer_asset_upload_recovery.sql", import.meta.url), "utf8");

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


test("customer asset metadata idempotency is scoped to tenant, application and actor with an immutable fingerprint", () => {
  assert.ok(metadataIdempotencyMigration.includes("CREATE TABLE IF NOT EXISTS eper_customer_asset_metadata_operations"));
  assert.ok(metadataIdempotencyMigration.includes("PRIMARY KEY (tenant_id, application_id, actor_id, client_operation_id)"));
  assert.ok(metadataIdempotencyMigration.includes("request_fingerprint char(64)"));
  assert.ok(metadataIdempotencyMigration.includes("FOREIGN KEY (tenant_id, asset_id)"));
  assert.ok(metadataIdempotencyMigration.includes("FORCE ROW LEVEL SECURITY"));
  assert.ok(metadataIdempotencyMigration.includes("application_id = current_setting('eper.application_id', true)"));
  assert.ok(metadataIdempotencyMigration.includes("GRANT SELECT, INSERT ON eper_customer_asset_metadata_operations"));
});


test("upload recovery migration is additive and binds retries to durable request identity", () => {
  assert.ok(migration.includes("updated_at timestamptz NOT NULL DEFAULT now()"));
  assert.ok(migration.includes("application_id varchar(128) NOT NULL"));
  assert.ok(uploadReservationMigration.includes("ADD CONSTRAINT eper_customer_asset_upload_sessions_upload_status_check"));
  assert.ok(uploadRecoveryMigration.includes("ADD COLUMN IF NOT EXISTS request_fingerprint varchar(64)"));
  assert.ok(uploadRecoveryMigration.includes("request_file_name varchar(255)"));
  assert.ok(uploadRecoveryMigration.includes("request_mime_type varchar(128)"));
  assert.ok(uploadRecoveryMigration.includes("provider_outcome varchar(16) NOT NULL DEFAULT 'unknown'"));
  assert.ok(uploadRecoveryMigration.includes("provider_outcome IN ('unknown', 'succeeded', 'rejected')"));
  assert.ok(uploadRecoveryMigration.includes("request_fingerprint IS NULL"));
  assert.ok(uploadRecoveryMigration.includes("WHERE upload_status = 'reserved' AND provider_outcome = 'unknown'"));
  assert.doesNotMatch(uploadRecoveryMigration, /DROP POLICY|CREATE POLICY|ALTER TABLE .* (ENABLE|FORCE) ROW LEVEL SECURITY/i);
});
