import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../packages/audit/migrations/021_customer_asset_repository.sql", import.meta.url), "utf8");
const scanDispatchMigration = await readFile(new URL("../packages/audit/migrations/022_customer_asset_scan_dispatch.sql", import.meta.url), "utf8");
const uploadRecoveryMigration = await readFile(new URL("../packages/audit/migrations/023_customer_asset_upload_recovery.sql", import.meta.url), "utf8");
const scanClaimGenerationMigration = await readFile(new URL("../packages/audit/migrations/033_customer_asset_scan_claim_generation.sql", import.meta.url), "utf8");

test("customer asset repository migration separates customer assets from application links", () => {
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS eper_customer_assets"));
  assert.ok(migration.includes("repository_scope IN ('customer_shared', 'application_restricted')"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS eper_customer_asset_application_links"));
  assert.ok(migration.includes("FOREIGN KEY (tenant_id, asset_id, repository_scope)"));
  assert.ok(migration.includes("CHECK (repository_scope = 'customer_shared')"));
  assert.ok(migration.includes("ON DELETE RESTRICT"));
  assert.ok(migration.includes("UNIQUE (tenant_id, application_id, idempotency_key)"));
  assert.ok(migration.includes("UNIQUE (tenant_id, asset_id, repository_scope)"));
  assert.ok(migration.includes("DROP POLICY IF EXISTS customer_asset_application_read ON eper_customer_assets;"));
  assert.ok(migration.includes("DROP POLICY IF EXISTS customer_asset_application_insert ON eper_customer_assets;"));
  assert.ok(migration.includes("DROP POLICY IF EXISTS customer_asset_application_update ON eper_customer_assets;"));
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


test("customer asset upload recovery persists immutable request identity without provider secrets", () => {
  assert.ok(uploadRecoveryMigration.includes("ADD COLUMN IF NOT EXISTS request_fingerprint char(64)"));
  assert.ok(uploadRecoveryMigration.includes("request_fingerprint ~ '^[a-f0-9]{64}$'"));
  assert.ok(uploadRecoveryMigration.includes("provider_grant_expires_at timestamptz"));
  assert.ok(uploadRecoveryMigration.includes("last_recovered_at timestamptz"));
  assert.ok(uploadRecoveryMigration.includes("tenant_id, application_id, actor_id, idempotency_key"));
  assert.ok(uploadRecoveryMigration.includes("never the signed URL or token"));
  assert.doesNotMatch(uploadRecoveryMigration, /signed_url|bearer_token|access_token/i);
  assert.ok(uploadRecoveryMigration.includes("BEGIN;"));
  assert.ok(uploadRecoveryMigration.includes("COMMIT;"));
});

const uploadProviderOutcomeMigration = await readFile(new URL("../packages/audit/migrations/024_customer_asset_upload_provider_outcomes.sql", import.meta.url), "utf8");

test("provider outcome migration preserves uncertainty for legacy rows and constrains outcome/reference consistency", () => {
  assert.ok(uploadProviderOutcomeMigration.includes("ADD COLUMN IF NOT EXISTS provider_outcome varchar(16) NOT NULL DEFAULT 'unknown'"));
  assert.ok(uploadProviderOutcomeMigration.includes("SET provider_outcome = 'succeeded'"));
  assert.ok(uploadProviderOutcomeMigration.includes("WHERE provider_upload_reference IS NOT NULL"));
  assert.ok(uploadProviderOutcomeMigration.includes("provider_outcome IN ('unknown', 'succeeded', 'rejected')"));
  assert.ok(uploadProviderOutcomeMigration.includes("provider_outcome <> 'succeeded' OR provider_upload_reference IS NOT NULL"));
  assert.ok(uploadProviderOutcomeMigration.includes("provider_outcome <> 'rejected' OR provider_upload_reference IS NULL"));
  assert.match(uploadProviderOutcomeMigration, /Legacy rows without a persisted provider reference remain unknown/);
  assert.ok(!uploadProviderOutcomeMigration.includes("SET provider_outcome = 'rejected'"), "legacy failures must not be reclassified as definitive rejections");
});

const expiryWorkerRoleMigration = await readFile(new URL("../packages/audit/migrations/029_customer_asset_upload_expiry_worker_role.sql", import.meta.url), "utf8");
const expiryQueueAgeMigration = await readFile(new URL("../packages/audit/migrations/030_customer_asset_upload_expiry_queue_age.sql", import.meta.url), "utf8");

test("expiry worker role is non-login and limited to expiry function plus append-only audit", () => {
  assert.ok(expiryWorkerRoleMigration.includes("CREATE ROLE eper_customer_asset_upload_expiry_worker_access"));
  assert.ok(expiryWorkerRoleMigration.includes("NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"));
  assert.ok(expiryWorkerRoleMigration.includes("GRANT EXECUTE ON FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer, uuid)"));
  assert.ok(expiryWorkerRoleMigration.includes("GRANT INSERT ON public.eper_audit_events"));
  assert.ok(expiryWorkerRoleMigration.includes("GRANT SELECT ON public.eper_audit_chain_head"));
  assert.ok(expiryWorkerRoleMigration.includes("GRANT UPDATE (last_event_hash, updated_at)"));
  assert.doesNotMatch(expiryWorkerRoleMigration, /GRANT .* ON public\\.eper_customer_asset_(assets|application_links|upload_sessions|scan_jobs)/i);
  assert.doesNotMatch(expiryWorkerRoleMigration, /eper_payment_|eper_provider_/i);
});

test("expiry queue-age migration retains tenant scope, optional asset filter and bounded SKIP LOCKED processing", () => {
  assert.ok(expiryQueueAgeMigration.includes("DROP FUNCTION public.eper_expire_customer_asset_upload_sessions(varchar, integer, uuid)"));
  assert.ok(expiryQueueAgeMigration.includes("expires_at timestamptz"));
  assert.ok(expiryQueueAgeMigration.includes("p_asset_id uuid DEFAULT NULL"));
  assert.ok(expiryQueueAgeMigration.includes("FOR UPDATE SKIP LOCKED"));
  assert.ok(expiryQueueAgeMigration.includes("clock_timestamp()"));
  assert.ok(expiryQueueAgeMigration.includes("TO eper_customer_asset_access, eper_customer_asset_upload_expiry_worker_access"));
});


test("scan claim-generation migration is additive, repeatable and nonnegative", () => {
  assert.match(scanClaimGenerationMigration, /BEGIN;/);
  assert.match(scanClaimGenerationMigration, /ADD COLUMN IF NOT EXISTS claim_generation bigint NOT NULL DEFAULT 0/);
  assert.match(scanClaimGenerationMigration, /claim_generation >= 0/);
  assert.match(scanClaimGenerationMigration, /COMMIT;/);
  assert.match(scanClaimGenerationMigration, /stale worker/i);
});

const uploadAttemptGenerationMigration = await readFile(new URL("../packages/audit/migrations/045_customer_asset_upload_attempt_generations.sql", import.meta.url), "utf8");

test("upload attempt generations are monotonic, unique and immutable while historical attempts remain", () => {
  assert.ok(uploadAttemptGenerationMigration.includes("ADD COLUMN IF NOT EXISTS attempt_generation bigint"));
  assert.ok(uploadAttemptGenerationMigration.includes("row_number() OVER"));
  assert.ok(uploadAttemptGenerationMigration.includes("PARTITION BY tenant_id, asset_id"));
  assert.ok(uploadAttemptGenerationMigration.includes("attempt_generation > 0"));
  assert.ok(uploadAttemptGenerationMigration.includes("upload_attempt_generation bigint NOT NULL DEFAULT 0"));
  assert.ok(uploadAttemptGenerationMigration.includes("UNIQUE INDEX IF NOT EXISTS eper_customer_asset_upload_attempt_generation_uq"));
  assert.ok(uploadAttemptGenerationMigration.includes("EPER_CUSTOMER_ASSET_UPLOAD_ATTEMPT_IDENTITY_IMMUTABLE"));
  assert.ok(uploadAttemptGenerationMigration.includes("BEFORE UPDATE ON eper_customer_asset_upload_sessions"));
  assert.ok(uploadAttemptGenerationMigration.includes("COMMIT;"));
});

const expectedChecksumMigration = await readFile(new URL("../packages/audit/migrations/032_customer_asset_upload_expected_checksum.sql", import.meta.url), "utf8");

test("expected upload checksum migration is additive, repeatable and fails closed for legacy NULL rows", () => {
  assert.ok(expectedChecksumMigration.includes("ADD COLUMN IF NOT EXISTS expected_checksum_sha256 char(64)"));
  assert.ok(expectedChecksumMigration.includes("expected_checksum_sha256 IS NULL OR expected_checksum_sha256 ~ '^[a-f0-9]{64}$'"));
  assert.ok(expectedChecksumMigration.includes("NULL is legacy-only and fails closed at completion"));
  assert.ok(expectedChecksumMigration.includes("BEGIN;"));
  assert.ok(expectedChecksumMigration.includes("COMMIT;"));
});


const scanChildIsolationMigration = await readFile(new URL("../packages/audit/migrations/046_customer_asset_scan_child_readonly_input.sql", import.meta.url), "utf8");
const scanChildProviderBindingMigration = await readFile(new URL("../packages/audit/migrations/053_customer_asset_scan_child_provider_binding.sql", import.meta.url), "utf8");

test("scanner child input resolver binds the authenticated LOGIN identity to one tenant, application, worker and service", () => {
  assert.ok(scanChildIsolationMigration.includes("CREATE TABLE IF NOT EXISTS public.eper_customer_asset_scan_child_identities"));
  assert.ok(scanChildIsolationMigration.includes("login_role name PRIMARY KEY"));
  assert.ok(scanChildIsolationMigration.includes("WHERE i.login_role = session_user::name"));
  assert.ok(scanChildIsolationMigration.includes("v_identity.worker_id <> p_worker_id"));
  assert.ok(scanChildIsolationMigration.includes("v_identity.scanner_service_id <> p_scanner_service_id"));
  assert.ok(scanChildIsolationMigration.includes("v_identity.tenant_id <> p_tenant_id"));
  assert.ok(scanChildIsolationMigration.includes("v_identity.application_id <> p_application_id"));
});

test("scanner child source lookup is lease- and generation-fenced and exposes no mutation path", () => {
  assert.ok(scanChildIsolationMigration.includes("SECURITY DEFINER"));
  assert.ok(scanChildIsolationMigration.includes("j.lease_owner = p_worker_id"));
  assert.ok(scanChildIsolationMigration.includes("j.lease_expires_at > pg_catalog.clock_timestamp()"));
  assert.ok(scanChildIsolationMigration.includes("j.claim_generation = p_claim_generation"));
  assert.ok(scanChildIsolationMigration.includes("s.upload_status = 'completed'"));
  assert.ok(scanChildIsolationMigration.includes("a.upload_status = 'scanning'"));
  assert.ok(scanChildIsolationMigration.includes("a.scan_status = 'pending'"));
  assert.ok(scanChildIsolationMigration.includes("GRANT EXECUTE ON FUNCTION public.eper_resolve_customer_asset_scan_child_input"));
  assert.doesNotMatch(scanChildIsolationMigration, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL).*eper_customer_asset_(assets|upload_sessions|scan_jobs).*eper_customer_asset_scan_child_access/i);
  assert.doesNotMatch(scanChildIsolationMigration, /GRANT .*eper_audit_(events|chain_head).*eper_customer_asset_scan_child_access/i);
  assert.ok(scanChildIsolationMigration.includes("REVOKE ALL ON FUNCTION public.eper_resolve_customer_asset_scan_child_input"));
  assert.ok(scanChildIsolationMigration.includes("COMMIT;"));
});

test("scanner child provider connection is operator-pinned and resolvable only for the live authenticated lease", () => {
  assert.ok(scanChildProviderBindingMigration.includes("ADD COLUMN IF NOT EXISTS provider_connection_id varchar(128)"));
  assert.ok(scanChildProviderBindingMigration.includes("enabled = false OR provider_connection_id IS NOT NULL"));
  assert.ok(scanChildProviderBindingMigration.includes("WHERE i.login_role = session_user::name"));
  assert.ok(scanChildProviderBindingMigration.includes("v_identity.provider_connection_id"));
  assert.ok(scanChildProviderBindingMigration.includes("j.lease_owner = p_worker_id"));
  assert.ok(scanChildProviderBindingMigration.includes("j.claim_generation = p_claim_generation"));
  assert.ok(scanChildProviderBindingMigration.includes("j.lease_expires_at > pg_catalog.clock_timestamp()"));
  assert.ok(scanChildProviderBindingMigration.includes("GRANT EXECUTE ON FUNCTION public.eper_resolve_customer_asset_scan_child_provider_binding"));
  assert.doesNotMatch(scanChildProviderBindingMigration, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL).*eper_customer_asset_(assets|upload_sessions|scan_jobs).*eper_customer_asset_scan_child_access/i);
  assert.ok(scanChildProviderBindingMigration.includes("COMMIT;"));
});
