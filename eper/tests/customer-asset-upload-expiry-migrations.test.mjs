import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrations = new URL("../packages/audit/migrations/", import.meta.url);

test("upload retry migration keeps terminal history and scopes idempotency to an application", async () => {
  const sql = await readFile(new URL("027_customer_asset_upload_retry_lifecycle.sql", migrations), "utf8");
  assert.match(sql, /DROP CONSTRAINT IF EXISTS eper_customer_asset_upload_sessions_tenant_id_asset_id_key/);
  assert.match(sql, /ON eper_customer_asset_upload_sessions \(tenant_id, application_id, idempotency_key\)/);
  assert.match(sql, /ON eper_customer_asset_upload_sessions \(tenant_id, asset_id\)\s+WHERE upload_status IN \('initiated', 'in_progress'\)/);
  assert.match(sql, /WHERE upload_status IN \('initiated', 'in_progress'\)/);
  assert.doesNotMatch(sql, /DELETE FROM eper_customer_asset_upload_sessions/i);
});

test("cross-application expiry uses a tenant-bound NOLOGIN function owner without bypassing RLS", async () => {
  const sql = await readFile(new URL("028_customer_asset_cross_application_expiry.sql", migrations), "utf8");
  assert.match(sql, /NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
  assert.match(sql, /CREATE POLICY customer_asset_upload_expiry_tenant_scope/);
  assert.match(sql, /tenant_id = current_setting\('eper\.tenant_id', true\)/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /current_setting\('eper\.tenant_id', true\) IS DISTINCT FROM p_tenant_id/);
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /p_asset_id IS NULL OR s\.asset_id = p_asset_id/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.eper_expire_customer_asset_upload_sessions\(varchar, integer, uuid\)/);
  assert.doesNotMatch(sql, /BYPASSRLS\s*;\s*--/i);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/i);
});


test("031 binds expiry authorization to an operator-managed authenticated LOGIN scope and canonical active states", async () => {
  const sql = await readFile(new URL("031_customer_asset_expiry_worker_tenant_scope.sql", migrations), "utf8");
  assert.match(sql, /PRIMARY KEY \(login_role, tenant_id\)/);
  assert.match(sql, /scope\.login_role = session_user/);
  assert.match(sql, /scope\.enabled = true/);
  assert.match(sql, /EPER_CUSTOMER_ASSET_EXPIRY_WORKER_SCOPE_DENIED/);
  assert.match(sql, /GRANT SELECT ON public\.eper_customer_asset_upload_expiry_worker_tenant_scope\s+TO eper_customer_asset_upload_expiry_access/);
  assert.match(sql, /REVOKE ALL ON public\.eper_customer_asset_upload_expiry_worker_tenant_scope\s+FROM eper_customer_asset_upload_expiry_worker_access/);
  assert.match(sql, /upload_status IN \('initiated', 'in_progress'\)/);
  assert.doesNotMatch(sql, /'reserved'/);
});
