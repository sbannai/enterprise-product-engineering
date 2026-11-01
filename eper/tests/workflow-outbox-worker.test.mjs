import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowOutboxWorker } from "../dist/packages/workflows/workflow-outbox-worker.js";

const events = [
  { eventId: "11111111-1111-4111-8111-111111111111", eventType: "workflow.instance.started", attempts: 1 },
  { eventId: "22222222-2222-4222-8222-222222222222", eventType: "workflow.instance.submitted", attempts: 1 },
  { eventId: "33333333-3333-4333-8333-333333333333", eventType: "workflow.instance.completed", attempts: 2 },
].map(event => ({
  ...event, tenantId: "tenant-01", applicationId: "app-01",
  instanceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  transitionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  eventVersion: 1, payload: {}, occurredAt: "2026-10-31T12:00:00.000Z",
}));

test("outbox worker dispatches, retries transient failures and dead-letters exhausted events", async () => {
  const calls = [];
  const store = {
    async claim(context, options) { calls.push({ method: "claim", context, options }); return events; },
    async renewLease(context, eventId, workerId, leaseSeconds) { calls.push({ method: "renew", eventId, workerId, leaseSeconds }); return true; },
    async markDelivered(context, eventId, workerId) { calls.push({ method: "delivered", eventId, workerId }); },
    async markFailed(context, eventId, options) {
      calls.push({ method: "failed", eventId, options });
      return { status: options.maxAttempts <= events.find(event => event.eventId === eventId).attempts ? "dead_letter" : "pending",
        attempts: events.find(event => event.eventId === eventId).attempts };
    },
  };
  const dispatched = [];
  const worker = new WorkflowOutboxWorker(store, {
    async dispatch(event) {
      dispatched.push(event.eventId);
      if (event.eventType !== "workflow.instance.started") throw new Error("temporary receiver failure");
    },
  }, { workerId: "worker-01", maxAttempts: 2, baseRetryDelaySeconds: 3, maxRetryDelaySeconds: 30 });

  const result = await worker.runOnce({ tenantId: "tenant-01", applicationId: "app-01" }, 10);
  assert.deepEqual(result, { claimed: 3, delivered: 1, retried: 1, deadLettered: 1, leaseLost: 0, interrupted: 0 });
  assert.equal(dispatched.length, 3);
  assert.equal(calls.filter(call => call.method === "delivered").length, 1);
  const failures = calls.filter(call => call.method === "failed");
  assert.equal(failures.length, 2);
  assert.equal(failures[0].options.retryDelaySeconds, 3);
  assert.equal(failures[1].options.retryDelaySeconds, 6);
  assert.equal(failures.every(call => call.options.workerId === "worker-01"), true);
});

test("outbox worker rejects unsafe retry and lease settings", () => {
  const store = { async claim() { return []; } };
  assert.throws(
    () => new WorkflowOutboxWorker(store, { async dispatch() {} }, { workerId: "worker-01", maxAttempts: 0 }),
    /WORKFLOW_OUTBOX_WORKER_OPTIONS_INVALID/,
  );
  assert.throws(
    () => new WorkflowOutboxWorker(store, { async dispatch() {} }, { workerId: "worker-01", leaseSeconds: 5 }),
    /WORKFLOW_OUTBOX_WORKER_OPTIONS_INVALID/,
  );
});


test("outbox worker renews a lease while a slow dispatch is running", async () => {
  const calls = [];
  const event = events[0];
  const store = {
    async claim() { return [event]; },
    async renewLease(context, eventId, workerId, leaseSeconds) {
      calls.push({ eventId, workerId, leaseSeconds });
      return true;
    },
    async markDelivered() { calls.push("delivered"); },
    async markFailed() { throw new Error("unexpected failure"); },
  };
  const worker = new WorkflowOutboxWorker(store, {
    async dispatch(_event, signal) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 3_800);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
    },
  }, { workerId: "worker-01", leaseSeconds: 10 });
  const result = await worker.runOnce({ tenantId: "tenant-01", applicationId: "app-01" }, 1);
  assert.equal(calls.length >= 1, true, "long dispatch must renew its lease");
  assert.deepEqual(calls[0], {
    eventId: event.eventId, workerId: "worker-01", leaseSeconds: 10,
  });
  assert.deepEqual(result, { claimed: 1, delivered: 1, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0 });
});

test("outbox worker aborts dispatch and avoids acknowledging after lease ownership is lost", async () => {
  const event = events[0];
  const calls = [];
  const store = {
    async claim() { return [event]; },
    async renewLease() { return false; },
    async markDelivered() { calls.push("delivered"); },
    async markFailed() { calls.push("failed"); throw new Error("must not mutate another worker's lease"); },
  };
  const worker = new WorkflowOutboxWorker(store, {
    async dispatch(_event, signal) {
      await new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  }, { workerId: "worker-01", leaseSeconds: 10 });
  const result = await worker.runOnce({ tenantId: "tenant-01", applicationId: "app-01" }, 1);
  assert.deepEqual(calls, []);
  assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 1, interrupted: 0 });
});


test("outbox worker starts heartbeats for every claimed event without a serial local queue", async () => {
  const renewals = [];
  const batch = events.slice(0, 2);
  const store = {
    async claim() { return batch; },
    async renewLease(_context, eventId) { renewals.push(eventId); return true; },
    async markDelivered() {},
    async markFailed() { throw new Error("unexpected failure"); },
  };
  const worker = new WorkflowOutboxWorker(store, {
    async dispatch(_event, signal) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 3_800);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        }, { once: true });
      });
    },
  }, { workerId: "worker-01", leaseSeconds: 10 });
  const result = await worker.runOnce({ tenantId: "tenant-01", applicationId: "app-01" }, 2);
  assert.equal(renewals.includes(batch[0].eventId), true);
  assert.equal(renewals.includes(batch[1].eventId), true, "later claimed events must not wait behind serial dispatch");
  assert.deepEqual(result, { claimed: 2, delivered: 2, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0 });
});


test("outbox worker propagates shutdown cancellation and leaves ambiguous claims for lease recovery", async () => {
  const event = events[0];
  const calls = [];
  const store = {
    async claim() { return [event]; },
    async renewLease() { return true; },
    async markDelivered() { calls.push("delivered"); },
    async markFailed() { calls.push("failed"); },
  };
  const shutdown = new AbortController();
  let dispatchStarted;
  const started = new Promise(resolve => { dispatchStarted = resolve; });
  const worker = new WorkflowOutboxWorker(store, {
    async dispatch(_event, signal) {
      dispatchStarted();
      await new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  }, { workerId: "worker-01", leaseSeconds: 10 });
  const running = worker.runOnce({ tenantId: "tenant-01", applicationId: "app-01" }, 1, shutdown.signal);
  await started;
  shutdown.abort(new Error("host shutdown"));
  const result = await running;
  assert.deepEqual(calls, []);
  assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 1 });
});


test("outbox worker waits for sibling claims to settle before surfacing bookkeeping failures", async () => {
  const batch = events.slice(0, 2);
  let siblingFinished = false;
  const store = {
    async claim() { return batch; },
    async renewLease() { return true; },
    async markDelivered() {},
    async markFailed() { throw new Error("database acknowledgement unavailable"); },
  };
  const worker = new WorkflowOutboxWorker(store, {
    async dispatch(event) {
      if (event.eventId === batch[0].eventId) throw new Error("provider rejected event");
      await new Promise(resolve => setTimeout(resolve, 30));
      siblingFinished = true;
    },
  }, { workerId: "worker-01", leaseSeconds: 10 });
  let failure;
  try {
    await worker.runOnce({ tenantId: "tenant-01", applicationId: "app-01" }, 2);
  } catch (error) {
    failure = error;
  }
  assert.match(failure?.message ?? "", /WORKFLOW_OUTBOX_CLAIM_PROCESSING_FAILED/);
  assert.equal(
    failure.errors.some(error => error.message === "database acknowledgement unavailable"),
    true,
    "the original bookkeeping failure must remain available",
  );
  assert.equal(siblingFinished, true, "runOnce must not reject while another claimed dispatch is still active");
});


test("outbox worker attaches partial counters when a sibling claim fails bookkeeping", async () => {
  const batch = events.slice(0, 2);
  const store = {
    async claim() { return batch; },
    async renewLease() { return true; },
    async markDelivered() {},
    async markFailed() { throw new Error("acknowledgement database unavailable"); },
  };
  const worker = new WorkflowOutboxWorker(store, {
    async dispatch(event) {
      if (event.eventId === batch[0].eventId) throw new Error("provider rejected event");
    },
  }, { workerId: "worker-01", leaseSeconds: 10 });
  let failure;
  try {
    await worker.runOnce({ tenantId: "tenant-01", applicationId: "app-01" }, 2);
  } catch (error) {
    failure = error;
  }
  assert.match(failure?.message ?? "", /WORKFLOW_OUTBOX_CLAIM_PROCESSING_FAILED/);
  assert.deepEqual(failure.result, {
    claimed: 2, delivered: 1, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0,
  });
});
