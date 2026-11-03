import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../packages/workflows/migrations/014_workflow_definition_drafts.sql", import.meta.url);

test("workflow draft migration is appended after the existing workflow migration sequence", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_workflow_definition_drafts/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, application_id, workflow_id\)/);
  assert.match(sql, /REFERENCES eper_tenant_application_assignment \(tenant_id, application_id\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\('eper\.tenant_id', true\)/);
  assert.match(sql, /current_setting\('eper\.application_id', true\)/);
  assert.match(sql, /WITH CHECK/);
  assert.match(sql, /draft_version bigint NOT NULL CHECK \(draft_version > 0\)/);
  assert.match(sql, /definition jsonb NOT NULL CHECK \(jsonb_typeof\(definition\) = 'object'\)/);
});

test("workflow migration runner retains its dedicated ordered checksum ledger", async () => {
  const runner = await readFile(new URL("../scripts/migrate-workflows.mjs", import.meta.url), "utf8");
  assert.match(runner, /eper_workflow_schema_migrations/);
  assert.match(runner, /packages.*workflows.*migrations/);
  const sharedRunner = await readFile(new URL("../scripts/migrate-payments.mjs", import.meta.url), "utf8");
  assert.match(sharedRunner, /\.sort\(\)/);
  assert.match(sharedRunner, /createHash\("sha256"\)/);
  assert.match(sharedRunner, /EPER_MIGRATION_CHECKSUM_MISMATCH/);
});
