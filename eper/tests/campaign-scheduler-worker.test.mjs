import test from "node:test";
import assert from "node:assert/strict";
import { runCampaignExecutionWorker } from "../dist/packages/campaign-scheduler/campaign-execution-worker.js";

function execution(overrides = {}) {
  return {
    id: "execution-1",
    scheduleId: "schedule-1",
    tenantId: "tenant-a",
    applicationId: "app-a",
    scheduledFor: "2030-01-01T00:00:00.000Z",
    status: "running",
    attemptCount: 1,
    idempotencyKey: "campaign:schedule-1:2030-01-01T00:00:00.000Z",
    payload: { campaignId: "campaign-a" },
    availableAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeStore(claimed = []) {
  const calls = [];
  return {
    calls,
    async recoverStaleExecutions() { calls.push("recover"); return 0; },
    async materializeDueOneTimeSchedules() { calls.push("materialize-once"); return 0; },
    async materializeDueRecurringSchedules() { calls.push("materialize-recurring"); return 0; },
    async claimExecutions(workerId, batchSize) { calls.push(["claim", workerId, batchSize]); return claimed.splice(0); },
    async isExecutionAuthorizedForDispatch(input) { calls.push(["authorize-current", input]); return true; },
    async completeExecution(input) { calls.push(["complete", input]); return true; },
    async failExecution(input) { calls.push(["fail", input]); return "retry_wait"; },
  };
}

test("worker processes claimed executions asynchronously and completes with tenant scope and idempotency", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  const dispatchCalls = [];
  await runCampaignExecutionWorker(store, async (job) => {
    dispatchCalls.push(job);
    controller.abort();
    return { outcome: { accepted: true } };
  }, { workerId: "worker-a", signal: controller.signal, idleDelayMs: 100, authorizeDispatch: async () => true });
  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0].idempotencyKey, "campaign:schedule-1:2030-01-01T00:00:00.000Z");
  const complete = store.calls.find((call) => Array.isArray(call) && call[0] === "complete");
  assert.ok(complete);
  assert.equal(complete[1].tenantId, "tenant-a");
  assert.equal(complete[1].applicationId, "app-a");
  assert.equal(complete[1].workerId, "worker-a");
  assert.deepEqual(complete[1].result, { accepted: true });
  assert.deepEqual(store.calls.slice(0, 4), ["recover", "materialize-once", "materialize-recurring", ["claim", "worker-a", 10]]);
});

test("worker records dispatch failures for bounded retry handling", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  const reported = [];
  await runCampaignExecutionWorker(store, async () => {
    controller.abort();
    throw new Error("provider timeout");
  }, {
    workerId: "worker-b",
    signal: controller.signal,
    onError: (error) => reported.push(error.message),
    authorizeDispatch: async () => true,
  });
  const failed = store.calls.find((call) => Array.isArray(call) && call[0] === "fail");
  assert.ok(failed);
  assert.equal(failed[1].tenantId, "tenant-a");
  assert.equal(failed[1].applicationId, "app-a");
  assert.equal(failed[1].workerId, "worker-b");
  assert.equal(failed[1].errorCode, "CAMPAIGN_DISPATCH_FAILED");
  assert.equal(failed[1].maxAttempts, 5);
  assert.deepEqual(reported, ["provider timeout"]);
});

test("worker rejects invalid configuration before touching the store", async () => {
  const store = fakeStore();
  await assert.rejects(
    runCampaignExecutionWorker(store, async () => ({ outcome: {} }), { workerId: " ", idleDelayMs: 100 }),
    /CAMPAIGN_WORKER_ID_REQUIRED/,
  );
  await assert.rejects(
    runCampaignExecutionWorker(store, async () => ({ outcome: {} }), { workerId: "worker-a", batchSize: 101, authorizeDispatch: async () => true }),
    /CAMPAIGN_CLAIM_LIMIT_INVALID/,
  );
  assert.deepEqual(store.calls, []);
});
