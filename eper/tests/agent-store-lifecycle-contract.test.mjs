import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../packages/agents/postgres-agent-store.ts", import.meta.url), "utf8");
const routes = await readFile(new URL("../apps/api/agent-job-routes.ts", import.meta.url), "utf8");

test("agent store scopes each transaction with tenant and application RLS context", () => {
  assert.match(source, /set_config\('eper\.tenant_id', \$1, true\)/);
  assert.match(source, /set_config\('eper\.application_id', \$2, true\)/);
  assert.match(source, /private async scopedClient/);
});

test("agent worker claims jobs without blocking concurrent workers", () => {
  assert.match(source, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(source, /lease_owner=\$3/);
  assert.match(source, /lease_expires_at=NOW\(\)\+/);
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

test("agent job idempotency is safe when concurrent requests race on a new key", () => {
  assert.match(source, /ON CONFLICT \(tenant_id, application_id, idempotency_key\) DO NOTHING/);
  assert.match(source, /AGENT_JOB_IDEMPOTENCY_LOOKUP_FAILED/);
  assert.match(source, /agent\.job\.idempotency_replay/);
});

test("rejecting an agent draft fails its job instead of reporting success", () => {
  assert.match(source, /status=CASE WHEN \$4='approve' THEN 'succeeded' ELSE 'failed' END/);
  assert.match(source, /AGENT_DRAFT_REJECTED/);
  assert.match(source, /AGENT_DRAFT_JOB_NOT_AWAITING_APPROVAL/);
  assert.match(source, /if \(jobUpdate\.rowCount !== 1\)/);
  assert.match(source, /SELECT status FROM eper_agent_jobs WHERE tenant_id=\\$1 AND application_id=\\$2 AND job_id=\\$3 FOR UPDATE/);
  assert.match(source, /status='awaiting_approval'/);
});

test("durable draft review requires trusted reviewer role and assigned application", () => {
  assert.match(routes, /EPER_AGENT_REVIEWER_ROLE_KEYS/);
  assert.match(routes, /AGENT_REVIEWER_ROLE_REQUIRED/);
  assert.match(routes, /identity\.applicationIds\.includes\(applicationId\)/);
  assert.match(routes, /expectedContentHash/);
  assert.match(routes, /options\.store\.reviewDraft/);
});

test("durable draft read returns review metadata only through tenant/application-scoped storage", () => {
  assert.match(source, /async getDraft/);
  assert.match(source, /WHERE tenant_id=\$1 AND application_id=\$2 AND draft_id=\$3/);
  assert.ok(routes.includes('const draftMatch = /^\\/v1\\/agent-drafts\\/([0-9a-f-]+)$/;'));
  assert.match(routes, /options\.store\.getDraft/);
  assert.ok(routes.includes('const isDraftReviewRoute = /^\\/v1\\/agent-drafts\\/[0-9a-f-]+\\/(approve|reject)$/.test(pathname);'));
  assert.match(routes, /const allowedMethod = pathname === "\/v1\/agent-jobs" \|\| isDraftReviewRoute \? "POST" : "GET";/);
  assert.match(routes, /response\.setHeader\("allow", allowedMethod\);/);
  assert.match(routes, /This HTTP method is not supported for the agent job or draft resource/);
  assert.match(routes, /error instanceof SyntaxError/);
  assert.match(routes, /"INVALID_JSON_BODY"/);
  assert.match(routes, /The request body must contain valid JSON/);
  assert.match(routes, /identity\.applicationIds\.includes\(applicationId\)/);
  assert.match(routes, /AGENT_DRAFT_NOT_FOUND/);
});
