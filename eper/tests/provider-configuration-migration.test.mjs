import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(resolve(root, "packages/audit/migrations/012_provider_configuration_foundation.sql"), "utf8");
const pendingBindingMigration = await readFile(resolve(root, "packages/audit/migrations/014_provider_pending_validation_binding.sql"), "utf8");
const tenantDefaultsMigration = await readFile(resolve(root, "packages/audit/migrations/016_tenant_provider_defaults.sql"), "utf8");

test("provider foundation separates platform catalogue, tenant connections and application bindings", () => {
  for (const table of [
    "eper_provider_definitions",
    "eper_provider_connections",
    "eper_provider_connection_applications",
    "eper_application_provider_policies",
    "eper_provider_operations",
    "eper_provider_webhook_receipts",
  ]) assert.match(migration, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  assert.match(migration, /PRIMARY KEY \(tenant_id, connection_id\)/);
  assert.match(migration, /PRIMARY KEY \(tenant_id, application_id, connection_id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id, connection_id, provider_key\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id, application_id, connection_id\)/);
});

test("provider persistence stores secret references, never credential columns or values", () => {
  assert.match(migration, /secret_reference TEXT NOT NULL/);
  assert.match(migration, /safe_metadata JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.doesNotMatch(migration, /\b(api_key|access_token|refresh_token|client_secret|password)\s+TEXT\b/i);
  assert.match(migration, /-- Secrets are references only/);
});

test("provider operations and webhooks enforce idempotency and replay correlation", () => {
  assert.match(migration, /UNIQUE \(tenant_id, application_id, connection_id, idempotency_key\)/);
  assert.match(migration, /UNIQUE \(provider_key, provider_event_id\)/);
  assert.match(migration, /signature_valid BOOLEAN NOT NULL/);
  assert.match(migration, /payload_digest TEXT NOT NULL/);
  assert.match(migration, /'NEEDS_ATTENTION'/);
});

test("provider tenant tables force RLS and application tables require both scope keys", () => {
  for (const table of [
    "eper_provider_connections",
    "eper_provider_connection_applications",
    "eper_application_provider_policies",
    "eper_provider_operations",
    "eper_provider_webhook_receipts",
  ]) {
    assert.match(migration, new RegExp("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"));
    assert.match(migration, new RegExp("ALTER TABLE " + table + " FORCE ROW LEVEL SECURITY"));
  }
  assert.match(migration, /tenant_id = current_setting\('eper\.tenant_id', true\)/);
  assert.match(migration, /application_id = current_setting\('eper\.application_id', true\)/);
  assert.match(migration, /tenant_id TEXT NOT NULL CHECK[^\n]*\n  application_id TEXT NOT NULL CHECK/);
});


test("provider connections can be application-bound while pending validation", () => {
  assert.match(pendingBindingMigration, /binding_status IN \('PENDING_VALIDATION', 'ACTIVE', 'SUSPENDED', 'REVOKED'\)/);
});


test("provider defaults are tenant-wide, versioned, RLS-isolated and reject nested credential keys", () => {
  assert.match(tenantDefaultsMigration, /CREATE TABLE IF NOT EXISTS eper_tenant_provider_defaults/);
  assert.match(tenantDefaultsMigration, /PRIMARY KEY \(tenant_id, connection_id\)/);
  assert.match(tenantDefaultsMigration, /FOREIGN KEY \(tenant_id, connection_id\)[\s\S]*REFERENCES eper_provider_connections/);
  assert.match(tenantDefaultsMigration, /version BIGINT NOT NULL DEFAULT 1 CHECK \(version > 0\)/);
  assert.match(tenantDefaultsMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(tenantDefaultsMigration, /FORCE ROW LEVEL SECURITY/);
  assert.match(tenantDefaultsMigration, /current_setting\('eper\.tenant_id', true\)/);
  assert.match(tenantDefaultsMigration, /eper_provider_policy_contains_secret_key/);
  for (const key of ["password", "clientsecret", "accesstoken", "refreshtoken", "apikey", "authorization", "token"]) {
    assert.ok(tenantDefaultsMigration.includes("'" + key + "'"), "secret key rejected: " + key);
  }
  assert.match(tenantDefaultsMigration, /jsonb_array_elements/);
  assert.match(tenantDefaultsMigration, /jsonb_each/);
});


test("provider operation payload reference migration keeps legacy rows nullable and validates opaque references", async () => {
  const source = await readFile(new URL("../packages/audit/migrations/017_provider_operation_payload_reference.sql", import.meta.url), "utf8");
  assert.match(source, /ADD COLUMN IF NOT EXISTS payload_reference TEXT/);
  assert.match(source, /payload_reference IS NULL/);
  assert.ok(source.includes("payload_reference ~ '^[A-Za-z0-9]"));
  assert.match(source, /tenant_id, application_id, payload_reference/);
  assert.match(source, /independently authorized tenant\/application-scoped payload store/);
});

test("provider operation leases support expiry recovery and fencing generations", async () => {
  const source = await readFile(new URL("../packages/audit/migrations/018_provider_operation_leases.sql", import.meta.url), "utf8");
  assert.match(source, /ADD COLUMN IF NOT EXISTS lease_owner TEXT/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS fencing_token BIGINT NOT NULL DEFAULT 0/);
  assert.match(source, /fencing_token >= 0/);
  assert.match(source, /operation_status = 'DISPATCHING'/);
});
