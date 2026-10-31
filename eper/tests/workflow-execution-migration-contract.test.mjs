import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../packages/workflows/migrations/001_workflow_execution.sql", import.meta.url);

test("workflow execution migration defines application-scoped immutable definition versions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_workflow_definition_versions/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, application_id, workflow_id, definition_version\)/);
  assert.match(sql, /definition_digest char\(64\) NOT NULL CHECK/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, workflow_id, definition_version, definition_digest\)/);
});

test("workflow execution migration defines durable instances, transition history and idempotency", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["eper_workflow_instances", "eper_workflow_transitions", "eper_workflow_idempotency"]) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  }
  assert.match(sql, /UNIQUE \(tenant_id, application_id, instance_id, idempotency_key\)/);
  assert.match(sql, /request_fingerprint char\(64\) NOT NULL CHECK/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, instance_id\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, instance_id, transition_id\)/);
  assert.match(sql, /resulting_version bigint NOT NULL CHECK \(resulting_version > expected_version\)/);
});

test("workflow execution migration enforces tenant/application row-level security and uses its own ledger", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ALTER TABLE %I ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\(''eper\.tenant_id'', true\)/);
  assert.match(sql, /current_setting\(''eper\.application_id'', true\)/);
  assert.match(sql, /WITH CHECK/);
  assert.match(sql, /EPER_WORKFLOW_LEDGER_APPEND_ONLY/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_workflow_definition_versions/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_workflow_transitions/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_workflow_idempotency/);
  const lifecycle = await readFile(new URL("../packages/workflows/migrations/002_workflow_publication_events.sql", import.meta.url), "utf8");
  for (const table of ["eper_workflow_definition_versions", "eper_workflow_transitions", "eper_workflow_idempotency"]) {
    assert.match(lifecycle, new RegExp("BEFORE TRUNCATE ON " + table));
  }
  assert.doesNotMatch(sql, /eper_schema_migrations/);
  const runner = await readFile(new URL("../scripts/migrate-workflows.mjs", import.meta.url), "utf8");
  assert.match(runner, /eper_workflow_schema_migrations/);
  assert.match(runner, /packages.*workflows.*migrations/);
});


test("workflow publication lifecycle is append-only, application-scoped and concurrency-safe", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/002_workflow_publication_events.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_workflow_publication_events/);
  assert.match(sql, /event_type varchar\(16\) NOT NULL CHECK \(event_type IN \('published','retired'\)\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, workflow_id, definition_version\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_workflow_publication_events/);
  assert.match(sql, /BEFORE TRUNCATE ON eper_workflow_publication_events/);
  assert.match(sql, /current_setting\('eper\.tenant_id', true\)/);
  assert.match(sql, /current_setting\('eper\.application_id', true\)/);
  const publisher = await readFile(new URL("../packages/workflows/workflow-definition-publisher.ts", import.meta.url), "utf8");
  assert.match(publisher, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.match(publisher, /INSERT INTO eper_workflow_publication_events/);
});


test("workflow actor role assignments are application-scoped and forced through RLS", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/003_workflow_actor_role_assignments.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_workflow_actor_role_assignment/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, application_id, actor_id, role_id\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, actor_id, application_id\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\('eper\.tenant_id', true\)/);
  assert.match(sql, /current_setting\('eper\.application_id', true\)/);
});


test("workflow role catalogue stores application-scoped permission grants", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/004_workflow_role_definitions.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_workflow_role_definition/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, application_id, role_id\)/);
  assert.match(sql, /permissions jsonb NOT NULL CHECK/);
  assert.match(sql, /role_status varchar\(16\) NOT NULL/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\('eper\.tenant_id', true\)/);
  assert.match(sql, /current_setting\('eper\.application_id', true\)/);
  assert.match(sql, /eper_workflow_actor_role_assignment_role_fk/);
});


test("workflow instance starts have a unique, fingerprinted idempotency key", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/005_workflow_start_idempotency.sql", import.meta.url), "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS start_idempotency_key/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS start_request_fingerprint/);
  assert.match(sql, /start_request_fingerprint ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS eper_workflow_instances_start_idempotency_idx/);
  assert.match(sql, /WHERE start_idempotency_key IS NOT NULL/);
});
