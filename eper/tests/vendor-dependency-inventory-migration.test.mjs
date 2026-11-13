import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(root, "packages/audit/migrations/051_vendor_dependency_inventory.sql");

test("vendor dependency policy, notice evidence and installations are tenant/application scoped", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of [
    "eper_dependency_policy",
    "eper_dependency_notice_evidence",
    "eper_dependency_installation",
  ]) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
    assert.match(sql, new RegExp("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"));
    assert.match(sql, new RegExp("ALTER TABLE " + table + " FORCE ROW LEVEL SECURITY"));
    assert.match(sql, new RegExp("CREATE POLICY .* ON " + table));
  }
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id\)/);
  assert.match(sql, /scope_type IN \('application','workstation','device','user','gateway'\)/);
});

test("vendor notice evidence is append-only and can retain verification provenance", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /verification_state IN \('verified','unverified','not_provided'\)/);
  assert.match(sql, /source TEXT/);
  assert.match(sql, /reference TEXT/);
  assert.match(sql, /evidence_digest TEXT/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_dependency_notice_evidence/);
  assert.match(sql, /EPER_DEPENDENCY_NOTICE_EVIDENCE_IMMUTABLE/);
});

test("mandatory vendor updates retain a minimum version and effective deadline", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /mandatory_update BOOLEAN/);
  assert.match(sql, /required_minimum_version TEXT/);
  assert.match(sql, /effective_at TIMESTAMPTZ/);
  assert.match(sql, /mandatory_update = true AND required_minimum_version IS NOT NULL[\s\S]*effective_at IS NOT NULL/);
});
