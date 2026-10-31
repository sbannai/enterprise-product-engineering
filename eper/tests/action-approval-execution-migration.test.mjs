import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../packages/workflows/migrations/007_action_approval_execution_ledger.sql", import.meta.url);

test("action approval migration defines immutable, versioned tenant-scoped proposals", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_action_proposals/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, application_id, proposal_id, proposal_version\)/);
  assert.match(sql, /payload_hash char\(64\) NOT NULL CHECK/);
  assert.match(sql, /UNIQUE \(tenant_id, application_id, idempotency_key\)/);
  assert.match(sql, /CHECK \(expires_at > created_at\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_action_proposals/);
  assert.match(sql, /BEFORE TRUNCATE ON eper_action_proposals/);
});

test("approval grants bind the exact proposal hash and enforce human maker-checker separation", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_action_approval_grants/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, proposal_id, proposal_version, proposal_hash\)/);
  assert.match(sql, /approver_type varchar\(16\) NOT NULL CHECK \(approver_type = 'human'\)/);
  assert.match(sql, /CHECK \(approver_id <> requested_by\)/);
  assert.match(sql, /proposal_version, payload_hash, requested_by\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_action_approval_decisions/);
  assert.match(sql, /decision IN \('approve','reject','revoke'\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_action_approval_decisions/);
  assert.match(sql, /EPER_ACTION_APPROVAL_ACTOR_MISMATCH/);
  assert.match(sql, /eper_action_approval_decisions_validate_actor/);
});

test("execution claims enforce one-use approval and idempotency with immutable identity", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_action_execution_claims/);
  assert.match(sql, /UNIQUE \(tenant_id, application_id, approval_id\)/);
  assert.match(sql, /UNIQUE \(tenant_id, application_id, idempotency_key\)/);
  assert.match(sql, /execution_status IN \('processing','succeeded','failed'\)/);
  assert.match(sql, /EPER_ACTION_EXECUTION_IDENTITY_IMMUTABLE/);
  assert.match(sql, /EPER_ACTION_EXECUTION_ALREADY_SUCCEEDED/);
  assert.match(sql, /UNIQUE \(tenant_id, application_id, execution_id, approval_id\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS eper_action_execution_events/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, execution_id, approval_id\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON eper_action_execution_events/);
  assert.match(sql, /BEFORE TRUNCATE ON eper_action_execution_events/);
});

test("all approval and execution records enforce tenant/application RLS", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ALTER TABLE %I ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\(''eper\.tenant_id'', true\)/);
  assert.match(sql, /current_setting\(''eper\.application_id'', true\)/);
  assert.match(sql, /WITH CHECK/);
  assert.match(sql, /eper_action_proposals_no_truncate/);
  assert.match(sql, /eper_action_approval_grants_no_truncate/);
  assert.match(sql, /eper_action_approval_decisions_no_truncate/);
  assert.match(sql, /eper_action_execution_claims_no_truncate/);
  assert.match(sql, /eper_action_execution_events_no_truncate/);
  const runner = await readFile(new URL("../scripts/migrate-workflows.mjs", import.meta.url), "utf8");
  assert.match(runner, /eper_workflow_schema_migrations/);
  assert.match(runner, /packages.*workflows.*migrations/);
});
