import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(root, "packages/audit/migrations/039_remote_desktop_sessions_and_consent.sql");

test("remote desktop sessions are application-owned, view-only by default and expire", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_remote_desktop_session/);
  assert.match(sql, /DEFAULT 'REQUESTED'/);
  assert.match(sql, /mode TEXT NOT NULL DEFAULT 'VIEW_ONLY'/);
  assert.match(sql, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(sql, /REFERENCES eper_tenant_application_assignment/);
  assert.match(sql, /CHECK \(expires_at > created_at\)/);
  assert.match(sql, /AS \\$eper\\$[\\s\\S]*REMOTE_DESKTOP_SESSION_BINDING_IMMUTABLE[\\s\\S]*\\$eper\\$;/);
  assert.match(sql, /REMOTE_DESKTOP_SESSION_BINDING_IMMUTABLE/);
  assert.match(sql, /BEFORE UPDATE OF tenant_id, application_id, session_id, endpoint_id/);
  assert.match(sql, /'REQUESTED','ACCEPTED','ACTIVE','STOPPED','DENIED','EXPIRED','REVOKED','DISCONNECTED'/);
});

test("remote desktop consent is bound to the same session, endpoint, mode and application", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_remote_desktop_consent/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, session_id\)/);
  assert.match(sql, /granted_mode TEXT NOT NULL CHECK \(granted_mode IN \('VIEW_ONLY','REMOTE_CONTROL'\)\)/);
  assert.match(sql, /revoked_at TIMESTAMPTZ/);
  assert.match(sql, /eper_remote_desktop_session_consent_fk/);
});

test("remote desktop session and consent records both enforce transaction-local RLS", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of ["eper_remote_desktop_session", "eper_remote_desktop_consent"]) {
    assert.match(sql, new RegExp("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"));
    assert.match(sql, new RegExp("ALTER TABLE " + table + " FORCE ROW LEVEL SECURITY"));
    assert.match(sql, new RegExp("tenant_id = current_setting\\('eper\\.tenant_id', true\\)[\\s\\S]*application_id = current_setting\\('eper\\.application_id', true\\)"));
  }
});
