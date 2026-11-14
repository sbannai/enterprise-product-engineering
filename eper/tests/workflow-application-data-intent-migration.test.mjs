import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workflow application-data intent migration provides durable idempotent worker hand-off", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/018_application_data_activity_intents.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_workflow_application_data_intents/);
  assert.match(sql, /UNIQUE \(tenant_id, application_id, idempotency_key\)/);
  assert.match(sql, /UNIQUE \(tenant_id, application_id, instance_id, activity_execution_id\)/);
  assert.match(sql, /request_fingerprint char\(64\)/);
  assert.match(sql, /intent_status IN \('pending','processing','succeeded','failed','dead_letter','advanced'\)/);
  assert.match(sql, /claim_generation bigint NOT NULL DEFAULT 0/);
  assert.match(sql, /actor_id varchar\(128\) NOT NULL/);
  assert.match(sql, /correlation_id varchar\(128\) NOT NULL/);
  assert.match(sql, /requirement_id varchar\(128\) NOT NULL/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\('eper\.tenant_id', true\)/);
  assert.match(sql, /current_setting\('eper\.application_id', true\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, instance_id\)/);
  assert.match(sql, /intent_status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL/);
  assert.match(sql, /intent_status IN .*'succeeded','advanced'.* AND result IS NOT NULL/);
});

test("workflow instance wait state is pinned to one activity execution intent", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/019_workflow_application_data_wait_state.sql", import.meta.url), "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pending_activity_execution_id uuid/);
  assert.match(sql, /'waiting_for_data'/);
  assert.match(sql, /status = 'waiting_for_data' AND pending_activity_execution_id IS NOT NULL/);
  assert.match(sql, /status <> 'waiting_for_data' AND pending_activity_execution_id IS NULL/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, instance_id, pending_activity_execution_id\)/);
  assert.match(sql, /REFERENCES eper_workflow_application_data_intents/);
  assert.match(sql, /activity_execution_id\)/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS eper_workflow_instances_check/);
});

test("workflow instance can have only one unadvanced application-data intent", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/020_application_data_single_pending_intent.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS eper_workflow_application_data_one_unadvanced_intent_idx/);
  assert.match(sql, /ON eper_workflow_application_data_intents \(tenant_id, application_id, instance_id\)/);
  assert.match(sql, /WHERE intent_status <> 'advanced'/);
});


test("successful application-data writes have a separately fenced reconciliation lease", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/021_application_data_reconciliation_lease.sql", import.meta.url), "utf8");
  assert.match(sql, /reconciliation_status IN \('pending','processing','completed'\)/);
  assert.match(sql, /reconciliation_claim_generation bigint NOT NULL DEFAULT 0/);
  assert.match(sql, /reconciliation_locked_at IS NOT NULL/);
  assert.match(sql, /reconciliation_locked_by IS NOT NULL/);
  assert.match(sql, /intent_status = 'succeeded'[\s\S]*reconciliation_status IN \('pending','processing'\)/);
  assert.match(sql, /intent_status = 'advanced'[\s\S]*reconciliation_status = 'completed'/);
  assert.match(sql, /WHERE intent_status = 'succeeded'[\s\S]*reconciliation_status IN \('pending','processing'\)/);
});

test("application-data intent authorization metadata is mandatory as a complete pair", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/024_application_data_intent_authorization.sql", import.meta.url), "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS actor_role_id varchar\(128\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS required_permission varchar\(32\)/);
  assert.match(sql, /actor_role_id IS NULL AND required_permission IS NULL/);
  assert.match(sql, /actor_role_id IS NOT NULL[\s\S]*required_permission IS NOT NULL/);
  assert.match(sql, /'workflow:act','workflow:approve'/);
});

test("reconciliation dead-letter migration bounds poison-intent retries", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/026_application_data_reconciliation_dead_letter.sql", import.meta.url), "utf8");
  assert.match(sql, /DROP CONSTRAINT IF EXISTS eper_workflow_application_data_intents_reconciliation_status_check/);
  assert.match(sql, /reconciliation_status IN \('pending','processing','completed','dead_letter'\)/);
  assert.match(sql, /intent_status = 'succeeded'[\s\S]*reconciliation_status IN \('pending','processing','dead_letter'\)/);
  assert.match(sql, /reconciliation_status = 'dead_letter'/);
});
