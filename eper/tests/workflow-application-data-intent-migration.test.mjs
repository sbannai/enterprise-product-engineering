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
