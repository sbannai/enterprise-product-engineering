import test from "node:test";
import assert from "node:assert/strict";
import { processAgentJobOnce } from "../dist/packages/agents/agent-worker.js";

const baseJob = {
  jobId: "job-0001",
  tenantId: "tenant-a",
  applicationId: "growth-hub",
  requestedBy: "maker-a",
  agentId: "sales",
  intent: "follow-up",
  input: { objective: "confirm admissions priorities", audience: "the admissions team" },
};

function fakeStore({ job = baseJob, saved = { draftId: "draft-0001", contentHash: "hash-1" }, persistError, retry = { status: "queued", retryAt: "2026-10-29T06:00:00.000Z" } } = {}) {
  const calls = { claim: [], persist: [], fail: [] };
  return {
    calls,
    async claimNextJob(input) { calls.claim.push(input); return job; },
    async persistDraft(input) {
      calls.persist.push(input);
      if (persistError) throw persistError;
      return saved;
    },
    async failOrRetryJob(input) { calls.fail.push(input); return input.retryable ? retry : { status: "failed" }; },
  };
}

const options = (store) => ({
  store,
  tenantId: "tenant-a",
  applicationId: "growth-hub",
  workerId: "worker-test",
  environment: "sandbox",
});

test("worker returns idle without writing a draft when no job is available", async () => {
  const store = fakeStore({ job: null });
  assert.deepEqual(await processAgentJobOnce(options(store)), { outcome: "idle" });
  assert.equal(store.calls.persist.length, 0);
  assert.equal(store.calls.fail.length, 0);
});

test("worker turns a supported sales job into a human-review draft without side effects", async () => {
  const store = fakeStore();
  const result = await processAgentJobOnce(options(store));
  assert.deepEqual(result, {
    outcome: "draft_created",
    jobId: "job-0001",
    draftId: "draft-0001",
    contentHash: "hash-1",
  });
  assert.equal(store.calls.claim[0].tenantId, "tenant-a");
  assert.equal(store.calls.claim[0].applicationId, "growth-hub");
  assert.equal(store.calls.persist[0].tenantId, "tenant-a");
  assert.equal(store.calls.persist[0].applicationId, "growth-hub");
  assert.equal(store.calls.persist[0].createdBy, "maker-a");
  assert.equal(store.calls.persist[0].payload.sendEnabled, false);
  assert.equal(store.calls.fail.length, 0);
});

test("worker schedules bounded retry when draft persistence fails", async () => {
  const store = fakeStore({ persistError: new Error("DATABASE_TEMPORARILY_UNAVAILABLE") });
  const result = await processAgentJobOnce(options(store));
  assert.deepEqual(result, {
    outcome: "retry_scheduled",
    jobId: "job-0001",
    retryAt: "2026-10-29T06:00:00.000Z",
  });
  assert.equal(store.calls.fail[0].failureCode, "DATABASE_TEMPORARILY_UNAVAILABLE");
  assert.equal(store.calls.fail[0].retryable, true);
  assert.equal(store.calls.fail[0].tenantId, "tenant-a");
  assert.equal(store.calls.fail[0].applicationId, "growth-hub");
});

test("worker does not retry unsupported intents", async () => {
  const store = fakeStore({ job: { ...baseJob, intent: "unknown-intent" } });
  const result = await processAgentJobOnce(options(store));
  assert.equal(result.outcome, "failed");
  assert.equal(result.failureCode, "AGENT_INTENT_UNSUPPORTED");
  assert.equal(store.calls.fail[0].failureCode, "AGENT_INTENT_UNSUPPORTED");
  assert.equal(store.calls.fail[0].retryable, false);
});

test("worker sanitizes unexpected failure text before recording retry", async () => {
  const store = fakeStore({ persistError: new Error("database password is secret!") });
  await processAgentJobOnce(options(store));
  assert.equal(store.calls.fail[0].failureCode, "AGENT_WORKER_UNEXPECTED_FAILURE");
});
