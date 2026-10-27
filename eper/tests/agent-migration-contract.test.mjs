import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../packages/capabilities/migrations/003_agent_workflows.sql", import.meta.url);

test("agent workflow migration defines durable tenant/application-scoped records", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of [
    "eper_agent_jobs",
    "eper_agent_drafts",
    "eper_agent_approvals",
    "eper_agent_configurations",
  ]) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  }
  assert.match(sql, /PRIMARY KEY \(tenant_id, application_id, job_id\)/);
  assert.match(sql, /UNIQUE \(tenant_id, application_id, idempotency_key\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, job_id\)/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, application_id, draft_id\)/);
});

test("agent workflow migration restricts states and requires content integrity fields", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /'queued','running','awaiting_approval','succeeded','failed','cancelled'/);
  assert.match(sql, /'pending_approval','approved','rejected','expired'/);
  assert.match(sql, /request_fingerprint char\(64\).*integrity/i);
  assert.match(sql, /content_hash char\(64\)/);
  assert.match(sql, /jsonb_typeof\(input\) = 'object'/);
  assert.match(sql, /jsonb_typeof\(payload\) = 'object'/);
});

test("agent workflow migration enables forced row-level security with tenant and application scope", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ALTER TABLE %I ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE %I FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_setting\(''eper\.tenant_id'', true\)/);
  assert.match(sql, /current_setting\(''eper\.application_id'', true\)/);
  assert.match(sql, /WITH CHECK/);
  assert.match(sql, /003_agent_workflows/);
});
