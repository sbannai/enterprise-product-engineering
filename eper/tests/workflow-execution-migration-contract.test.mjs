import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../packages/workflows/migrations/001_workflow_execution.sql", import.meta.url);

test("workflow execution migration defines application-scoped immutable definition versions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_workflow_definition_versions/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, application_id, workflow_id, definition_version\)/);
  assert.match(sql, /definition_digest char\(64\) NOT NULL CHECK/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, workflow_id, definition_version\)/);
});

test("workflow execution migration defines durable instances, transition history and idempotency", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["eper_workflow_instances", "eper_workflow_transitions", "eper_workflow_idempotency"]) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  }
  assert.match(sql, /UNIQUE \(tenant_id, application_id, instance_id, idempotency_key\)/);
  assert.match(sql, /request_fingerprint char\(64\) NOT NULL CHECK/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, instance_id\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, transition_id\)/);
  assert.match(sql, /resulting_version bigint NOT NULL CHECK \(resulting_version > expected_version\)/);
});

test("workflow execution migration enforces tenant/application row-level security", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ALTER TABLE %I ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\(''eper\.tenant_id'', true\)/);
  assert.match(sql, /current_setting\(''eper\.application_id'', true\)/);
  assert.match(sql, /WITH CHECK/);
  assert.doesNotMatch(sql, /eper_schema_migrations/);
  const runner = await readFile(new URL("../scripts/migrate-workflows.mjs", import.meta.url), "utf8");
  assert.match(runner, /eper_workflow_schema_migrations/);
  assert.match(runner, /packages.*workflows.*migrations/);
});
