import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../packages/audit/migrations/021_customer_asset_repository.sql", import.meta.url), "utf8");
const scanDispatchMigration = await readFile(new URL("../packages/audit/migrations/022_customer_asset_scan_dispatch.sql", import.meta.url), "utf8");
const uploadReservationMigration = await readFile(new URL("../packages/audit/migrations/023_customer_asset_upload_reservation.sql", import.meta.url), "utf8");
const uploadRetryMigration = await readFile(new URL("../packages/audit/migrations/026_customer_asset_upload_retry_lifecycle.sql", import.meta.url), "utf8");

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
  assert.ok(uploadRetryMigration.includes("DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessio_tenant_id_idempotency_key_key"));
  assert.ok(uploadRetryMigration.includes("DROP INDEX IF EXISTS eper_customer_asset_upload_reservations_idx"));
  assert.ok(uploadRetryMigration.includes("(tenant_id, application_id, idempotency_key)"));
  assert.ok(uploadRetryMigration.includes("(tenant_id, asset_id)"));
  assert.ok(uploadRetryMigration.includes("WHERE upload_status IN ('reserved', 'initiated', 'in_progress')"));
  assert.ok(uploadRetryMigration.includes("ON eper_customer_asset_upload_sessions (tenant_id, application_id, expires_at)"));
});

const crossApplicationExpiryMigration = await readFile(new URL("../packages/audit/migrations/027_customer_asset_cross_application_expiry.sql", import.meta.url), "utf8");

test("cross-application upload expiry uses a tenant-bound definer role without bypassing RLS", () => {
  assert.ok(crossApplicationExpiryMigration.includes("CREATE ROLE eper_customer_asset_upload_expiry_access"));
  assert.ok(crossApplicationExpiryMigration.includes("NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"));
  assert.ok(crossApplicationExpiryMigration.includes("CREATE POLICY customer_asset_upload_expiry_tenant_scope"));
  assert.ok(crossApplicationExpiryMigration.includes("tenant_id = current_setting('eper.tenant_id', true)"));
  assert.ok(crossApplicationExpiryMigration.includes("SECURITY DEFINER"));
  assert.ok(crossApplicationExpiryMigration.includes("set_config('eper.application_id', '', true)"));
  assert.ok(crossApplicationExpiryMigration.includes("current_setting('eper.tenant_id', true) IS DISTINCT FROM p_tenant_id"));
  assert.ok(crossApplicationExpiryMigration.includes("EPER_CUSTOMER_ASSET_EXPIRY_TENANT_CONTEXT_MISMATCH"));
  assert.ok(crossApplicationExpiryMigration.includes("FOR UPDATE SKIP LOCKED"));
  assert.ok(crossApplicationExpiryMigration.includes("clock_timestamp()"));
  assert.ok(crossApplicationExpiryMigration.includes("GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)"));
  assert.ok(crossApplicationExpiryMigration.includes("REVOKE ALL ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer)"));
  assert.ok(crossApplicationExpiryMigration.includes("TO eper_customer_asset_access"));
  assert.doesNotMatch(crossApplicationExpiryMigration, /\bBYPASSRLS\b|DISABLE ROW LEVEL SECURITY/i);
});


const uploadExpiryWorkerRoleMigration = await readFile(new URL("../packages/audit/migrations/028_customer_asset_upload_expiry_worker_access.sql", import.meta.url), "utf8");
const uploadExpiryQueueAgeMigration = await readFile(new URL("../packages/audit/migrations/029_customer_asset_upload_expiry_queue_age.sql", import.meta.url), "utf8");

test("upload expiry worker role is separate and limited to expiry function and audit append", () => {
  assert.ok(uploadExpiryWorkerRoleMigration.includes("CREATE ROLE eper_customer_asset_upload_expiry_worker_access"));
  assert.ok(uploadExpiryWorkerRoleMigration.includes("NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"));
  assert.ok(uploadExpiryWorkerRoleMigration.includes("GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions"));
  assert.ok(uploadExpiryWorkerRoleMigration.includes("GRANT INSERT ON public.eper_audit_events"));
  assert.ok(uploadExpiryWorkerRoleMigration.includes("GRANT SELECT ON public.eper_audit_chain_head"));
  assert.ok(uploadExpiryWorkerRoleMigration.includes("GRANT UPDATE (last_event_hash, updated_at) ON public.eper_audit_chain_head"));
  assert.doesNotMatch(uploadExpiryWorkerRoleMigration, /GRANT (SELECT|UPDATE|DELETE|INSERT) ON public\.eper_customer_asset_upload_sessions/i);
  assert.doesNotMatch(uploadExpiryWorkerRoleMigration, /eper_payment|eper_provider|\\bBYPASSRLS\\b/i);
});

test("upload expiry queue-age metric is tenant-bound and returns no customer identifiers", () => {
  assert.ok(uploadExpiryQueueAgeMigration.includes("eper_customer_asset_upload_expiry_queue_age_ms"));
  assert.ok(uploadExpiryQueueAgeMigration.includes("SECURITY DEFINER"));
  assert.ok(uploadExpiryQueueAgeMigration.includes("current_setting('eper.tenant_id', true) IS DISTINCT FROM p_tenant_id"));
  assert.ok(uploadExpiryQueueAgeMigration.includes("set_config('eper.application_id', '', true)"));
  assert.ok(uploadExpiryQueueAgeMigration.includes("min(s.expires_at)"));
  assert.ok(uploadExpiryQueueAgeMigration.includes("RETURNS bigint"));
  assert.ok(uploadExpiryQueueAgeMigration.includes("TO eper_customer_asset_upload_expiry_worker_access"));
  assert.doesNotMatch(uploadExpiryQueueAgeMigration, /RETURNS TABLE|upload_session_id|asset_id/i);
});
