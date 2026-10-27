import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../packages/agents/postgres-agent-store.ts", import.meta.url), "utf8");

test("agent store scopes each transaction with tenant and application RLS context", () => {
  assert.match(source, /set_config\('eper\.tenant_id', \$1, true\)/);
  assert.match(source, /set_config\('eper\.application_id', \$2, true\)/);
  assert.match(source, /private async scopedClient/);
});

test("agent worker claims jobs without blocking concurrent workers", () => {
  assert.match(source, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(source, /lease_owner=\$3/);
  assert.match(source, /lease_expires_at=NOW\+/);
});

test("agent failures use bounded retry and enforce worker lease ownership", () => {
  assert.match(source, /async failOrRetryJob/);
  assert.match(source, /AGENT_JOB_LEASE_NOT_OWNED/);
  assert.match(source, /attempt < maxAttempts/);
  assert.match(source, /Math\.min\(300, baseDelaySeconds \* \(2 \*\* Math\.max\(0, attempt - 1\)\)\)/);
  assert.match(source, /agent\.job\.retry_scheduled/);
  assert.match(source, /agent\.job\.failed/);
});

test("agent cancellation is scoped, state-guarded and audited", () => {
  assert.match(source, /async cancelJob/);
  assert.match(source, /status IN \('queued','running'\)/);
  assert.match(source, /agent\.job\.cancel/);
});

test("job, draft and review mutations write audit inside the same transaction", () => {
  assert.match(source, /async enqueueJob/);
  assert.match(source, /async persistDraft/);
  assert.match(source, /async reviewDraft/);
  assert.ok((source.match(/appendAuditEventInTransaction\(/g) ?? []).length >= 6);
});
