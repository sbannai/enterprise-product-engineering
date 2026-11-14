import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("application-data executor receives scoped, least-privilege database grants", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/023_application_data_executor_worker_access.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE ROLE eper_application_data_executor_access[\s\S]*NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
  assert.match(sql, /GRANT SELECT \(tenant_id, application_id, assignment_status\)[\s\S]*eper_tenant_application_assignment/);
  assert.match(sql, /GRANT SELECT ON eper_workflow_application_data_intents/);
  assert.match(sql, /GRANT UPDATE \(intent_status, attempts, available_at, locked_at, locked_by,[\s\S]*ON eper_workflow_application_data_intents/);
  assert.match(sql, /GRANT SELECT ON eper_application_data_models/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON eper_application_data_records/);
  assert.match(sql, /GRANT SELECT, INSERT ON eper_application_data_idempotency/);
  assert.match(sql, /GRANT INSERT ON audit_evidence, transactional_outbox/);
  assert.doesNotMatch(sql, /GRANT (?:UPDATE|ALL) ON eper_workflow_instances/);
  assert.match(sql, /COMMIT;\s*$/);
});
