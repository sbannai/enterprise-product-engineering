import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workflow outbox claim generation migration is additive, idempotent and grants only the required token update", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/016_workflow_outbox_claim_generation.sql", import.meta.url), "utf8");
  assert.match(sql, /^--[\s\S]*BEGIN;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS claim_generation bigint NOT NULL DEFAULT 0/);
  assert.match(sql, /IF NOT EXISTS \([\s\S]*eper_workflow_outbox_claim_generation_nonnegative/);
  assert.match(sql, /CHECK \(claim_generation >= 0\)/);
  assert.match(sql, /GRANT UPDATE \(claim_generation\)/);
  assert.match(sql, /eper_workflow_outbox_worker_access/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /GRANT UPDATE ON eper_workflow_outbox_delivery/);
});
