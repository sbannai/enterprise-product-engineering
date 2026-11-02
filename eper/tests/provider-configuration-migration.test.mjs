import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(resolve(root, "packages/audit/migrations/012_provider_configuration_foundation.sql"), "utf8");

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
