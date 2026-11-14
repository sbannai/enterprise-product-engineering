import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("application data reconciliation worker gets a dedicated least-privilege NOLOGIN role", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/022_application_data_reconciliation_worker_access.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE ROLE eper_application_data_reconcile_access[\s\S]*NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
  assert.match(sql, /GRANT SELECT \(tenant_id, application_id, assignment_status\)[\s\S]*eper_tenant_application_assignment/);
  assert.match(sql, /GRANT UPDATE \(status, current_activity_id, data, pending_activity_execution_id,[\s\S]*ON eper_workflow_instances/);
  assert.match(sql, /GRANT UPDATE \(intent_status, reconciliation_status,[\s\S]*ON eper_workflow_application_data_intents/);
  assert.match(sql, /GRANT INSERT ON eper_workflow_transitions,[\s\S]*eper_workflow_outbox_events,[\s\S]*eper_workflow_outbox_delivery/);
  assert.match(sql, /GRANT INSERT ON eper_audit_events/);
  assert.match(sql, /GRANT UPDATE \(last_event_hash, updated_at\)[\s\S]*eper_audit_chain_head/);
  assert.doesNotMatch(sql, /GRANT (?:UPDATE|ALL) ON eper_workflow_instances/);
  assert.doesNotMatch(sql, /GRANT (?:UPDATE|DELETE|TRUNCATE|ALL) ON eper_audit_events/);
  assert.match(sql, /COMMIT;\s*$/);
});
