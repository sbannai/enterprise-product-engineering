import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../packages/audit/migrations/053_customer_asset_scan_child_authenticated_context.sql", import.meta.url),
  "utf8",
);

test("authenticated scanner context derives authorization scope from session_user mapping", () => {
  assert.match(migration, /eper_resolve_customer_asset_scan_child_context\s*\(\s*p_asset_id uuid,\s*p_claim_generation bigint\s*\)/);
  assert.match(migration, /WHERE i\.login_role = session_user::name\s+AND i\.enabled = true/);
  assert.match(migration, /v_identity\.tenant_id/);
  assert.match(migration, /v_identity\.application_id/);
  assert.match(migration, /v_identity\.worker_id/);
  assert.match(migration, /v_identity\.scanner_service_id/);
  assert.match(migration, /v_identity\.spiffe_id/);
  assert.match(migration, /v_identity\.provider_connection_id/);
  assert.match(migration, /j\.claim_generation = p_claim_generation/);
});

test("authenticated scanner context exposes only EXECUTE to the child access role", () => {
  assert.match(migration, /LANGUAGE plpgsql\s+SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog/);
  assert.match(migration, /SET row_security = on/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.eper_resolve_customer_asset_scan_child_context\(uuid, bigint\)\s+TO eper_customer_asset_scan_child_access/);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON\s+public\.eper_customer_asset_(?:assets|scan_jobs|upload_sessions)\s+TO\s+eper_customer_asset_scan_child_access/i);
});

test("authenticated scanner context does not accept caller-supplied scope or connection claims", () => {
  const signature = migration.match(/CREATE OR REPLACE FUNCTION public\.eper_resolve_customer_asset_scan_child_context\(([\s\S]*?)\)\s*RETURNS TABLE/);
  assert.ok(signature);
  assert.doesNotMatch(signature[1], /tenant|application|worker|scanner|spiffe|connection/i);
});
