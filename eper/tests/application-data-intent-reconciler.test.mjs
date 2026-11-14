import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("application-data reconciler claims only successful intents with an expired-lease fence", async () => {
  const source = await readFile(new URL("../packages/workflows/application-data-intent-reconciler.ts", import.meta.url), "utf8");
  assert.match(source, /intent_status = 'succeeded'/);
  assert.match(source, /reconciliation_status IN \('pending','processing'\)/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /reconciliation_claim_generation = i\.reconciliation_claim_generation \+ 1/);
  assert.match(source, /reconciliation_locked_at < NOW\(\)/);
});

test("application-data reconciliation advances only the exact waiting execution and version", async () => {
  const source = await readFile(new URL("../packages/workflows/application-data-intent-reconciler.ts", import.meta.url), "utf8");
  assert.match(source, /status !== "waiting_for_data"/);
  assert.match(source, /pending_activity_execution_id !== currentIntent\.activity_execution_id/);
  assert.match(source, /current_activity_id !== currentIntent\.activity_id/);
  assert.match(source, /AND status = 'waiting_for_data' AND version = \$8/);
  assert.match(source, /AND pending_activity_execution_id = \$9/);
  assert.match(source, /pending_activity_execution_id = NULL/);
});

test("workflow advancement, outbox, audit and intent advancement share one reconciliation transaction", async () => {
  const source = await readFile(new URL("../packages/workflows/application-data-intent-reconciler.ts", import.meta.url), "utf8");
  const updateInstance = source.indexOf("UPDATE eper_workflow_instances");
  const transition = source.indexOf("INSERT INTO eper_workflow_transitions");
  const outbox = source.indexOf("INSERT INTO eper_workflow_outbox_events");
  const audit = source.indexOf("appendAuditEventInTransaction");
  const advanceIntent = source.indexOf("SET intent_status = 'advanced'");
  const commit = source.lastIndexOf('completion.query("COMMIT")');
  assert.ok(updateInstance >= 0 && transition > updateInstance);
  assert.ok(outbox > transition && audit > outbox && advanceIntent > audit && commit > advanceIntent);
  assert.match(source, /reconciliation_locked_by = \$4 AND reconciliation_claim_generation = \$5/);
  assert.match(source, /reconciliation_status = 'completed'/);
});
