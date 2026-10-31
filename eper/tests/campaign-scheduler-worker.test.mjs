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
    async recoverStaleExecutions(...args) { calls.push(["recover", ...args]); return 0; },
    async materializeDueOneTimeSchedules() { calls.push("materialize-once"); return 0; },
    async materializeDueRecurringSchedules() { calls.push("materialize-recurring"); return 0; },
    async claimExecutions(workerId, batchSize) { calls.push(["claim", workerId, batchSize]); return claimed.splice(0); },
    async isExecutionAuthorizedForDispatch(input) { calls.push(["authorize-current", input]); return true; },
    async beginExecutionDispatch(input) { calls.push(["dispatch-fence", input]); return true; },
    async getDispatchFenceDenialReason(input) { calls.push(["fence-denial-reason", input]); return "denied"; },
    async deferExecutionForSchedulePause(input) { calls.push(["defer-paused", input]); return true; },
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
  const fence = store.calls.find((call) => Array.isArray(call) && call[0] === "dispatch-fence");
  assert.ok(fence, "worker must establish the dispatch fence before provider dispatch");
  const complete = store.calls.find((call) => Array.isArray(call) && call[0] === "complete");
  assert.ok(complete);
  assert.equal(complete[1].tenantId, "tenant-a");
  assert.equal(complete[1].applicationId, "app-a");
  assert.equal(complete[1].workerId, "worker-a");
  assert.deepEqual(complete[1].result, { accepted: true });
  assert.deepEqual(store.calls.slice(0, 4), [["recover", 300, 5], "materialize-once", "materialize-recurring", ["claim", "worker-a", 10]]);
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

test("worker reports lost completion lease and records ambiguous outcome without silent success", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  store.completeExecution = async (input) => {
    store.calls.push(["complete", input]);
    return false;
  };
  const reported = [];
  await runCampaignExecutionWorker(store, async () => {
    controller.abort();
    return { outcome: { accepted: true } };
  }, {
    workerId: "worker-lost-lease",
    signal: controller.signal,
    idleDelayMs: 100,
    authorizeDispatch: async () => true,
    onError: (error) => reported.push(error.message),
  });
  assert.deepEqual(reported, ["CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST"]);
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "fail"
    && call[1].errorCode === "CAMPAIGN_EXECUTION_COMPLETION_LEASE_LOST"));
});

test("worker treats explicit policy denial as terminal and never acquires dispatch fence", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  store.failExecution = async (input) => {
    store.calls.push(["fail", input]);
    controller.abort();
    return "dead_letter";
  };
  let dispatchCalls = 0;
  await runCampaignExecutionWorker(store, async () => {
    dispatchCalls += 1;
    controller.abort();
    return { outcome: { accepted: true } };
  }, {
    workerId: "worker-policy-denied",
    signal: controller.signal,
    idleDelayMs: 100,
    authorizeDispatch: async () => false,
  });
  assert.equal(dispatchCalls, 0);
  assert.ok(!store.calls.some((call) => Array.isArray(call) && call[0] === "dispatch-fence"));
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "fail"
    && call[1].errorCode === "CAMPAIGN_DISPATCH_POLICY_DENIED"
    && call[1].maxAttempts === 1));
});

test("worker shutdown during authorization does not acquire dispatch fence", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  let dispatchCalls = 0;
  await runCampaignExecutionWorker(store, async () => {
    dispatchCalls += 1;
    return { outcome: {} };
  }, {
    workerId: "worker-shutdown-auth",
    signal: controller.signal,
    idleDelayMs: 100,
    authorizeDispatch: async () => { controller.abort(); return true; },
  });
  assert.equal(dispatchCalls, 0);
  assert.ok(!store.calls.some((call) => Array.isArray(call) && call[0] === "dispatch-fence"));
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "fail"
    && call[1].errorCode === "CAMPAIGN_WORKER_SHUTDOWN_BEFORE_DISPATCH_FENCE"
    && call[1].maxAttempts === 5));
});

test("worker shutdown after dispatch fence dead-letters without calling provider", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  store.beginExecutionDispatch = async (input) => {
    store.calls.push(["dispatch-fence", input]);
    controller.abort();
    return true;
  };
  let dispatchCalls = 0;
  await runCampaignExecutionWorker(store, async () => {
    dispatchCalls += 1;
    return { outcome: {} };
  }, {
    workerId: "worker-shutdown-fenced",
    signal: controller.signal,
    idleDelayMs: 100,
    authorizeDispatch: async () => true,
  });
  assert.equal(dispatchCalls, 0);
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "fail"
    && call[1].errorCode === "CAMPAIGN_WORKER_SHUTDOWN_AFTER_DISPATCH_FENCE"
    && call[1].maxAttempts === 1));
});

test("worker records authorization service failures distinctly and never dispatches", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  let dispatchCalls = 0;
  const reported = [];
  await runCampaignExecutionWorker(store, async () => {
    dispatchCalls += 1;
    controller.abort();
    return { outcome: { accepted: true } };
  }, {
    workerId: "worker-auth-outage",
    signal: controller.signal,
    idleDelayMs: 100,
    authorizeDispatch: async () => { controller.abort(); throw new Error("policy service unavailable"); },
    onError: (error) => reported.push(error.message),
  });
  assert.equal(dispatchCalls, 0);
  assert.deepEqual(reported, ["policy service unavailable"]);
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "fail"
    && call[1].errorCode === "CAMPAIGN_DISPATCH_AUTHORIZATION_UNAVAILABLE"
    && call[1].maxAttempts === 5));
  assert.ok(!store.calls.some((call) => Array.isArray(call) && call[0] === "dispatch-fence"));
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


test("worker does not call provider when the atomic dispatch fence is denied", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  store.beginExecutionDispatch = async (input) => {
    store.calls.push(["dispatch-fence", input]);
    return false;
  };
  store.failExecution = async (input) => {
    store.calls.push(["fail", input]);
    controller.abort();
    return "retry_wait";
  };
  let dispatchCalls = 0;
  await runCampaignExecutionWorker(store, async () => {
    dispatchCalls += 1;
    controller.abort();
    return { outcome: { accepted: true } };
  }, {
    workerId: "worker-fence-denied",
    signal: controller.signal,
    idleDelayMs: 100,
    authorizeDispatch: async () => true,
  });
  assert.equal(dispatchCalls, 0);
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "fail"
    && call[1].errorCode === "CAMPAIGN_DISPATCH_POLICY_DENIED"));
});


test("worker preserves cancellation when dispatch fence loses a race to cancel", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  store.beginExecutionDispatch = async (input) => { store.calls.push(["dispatch-fence", input]); return false; };
  store.getDispatchFenceDenialReason = async (input) => {
    store.calls.push(["fence-denial-reason", input]);
    controller.abort();
    return "cancelled";
  };
  let dispatchCalls = 0;
  await runCampaignExecutionWorker(store, async () => { dispatchCalls += 1; return { outcome: {} }; }, {
    workerId: "worker-cancel-race", signal: controller.signal, idleDelayMs: 100, authorizeDispatch: async () => true,
  });
  assert.equal(dispatchCalls, 0);
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "fence-denial-reason"));
  assert.ok(!store.calls.some((call) => Array.isArray(call) && call[0] === "fail"));
});

test("worker requeues a paused schedule after dispatch fence denial", async () => {
  const controller = new AbortController();
  const store = fakeStore([execution()]);
  store.beginExecutionDispatch = async (input) => { store.calls.push(["dispatch-fence", input]); return false; };
  store.getDispatchFenceDenialReason = async (input) => {
    store.calls.push(["fence-denial-reason", input]);
    controller.abort();
    return "paused";
  };
  let dispatchCalls = 0;
  await runCampaignExecutionWorker(store, async () => { dispatchCalls += 1; return { outcome: {} }; }, {
    workerId: "worker-pause-race", signal: controller.signal, idleDelayMs: 100, maxAttempts: 5, authorizeDispatch: async () => true,
  });
  assert.equal(dispatchCalls, 0);
  assert.ok(store.calls.some((call) => Array.isArray(call) && call[0] === "defer-paused"));
  assert.equal(store.calls.some((call) => Array.isArray(call) && call[0] === "fail"), false);
});
