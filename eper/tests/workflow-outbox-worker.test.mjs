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
  assert.deepEqual(result, { claimed: 3, delivered: 1, retried: 1, deadLettered: 1 });
  assert.equal(dispatched.length, 3);
  assert.equal(calls.find(call => call.method === "claim").options.maxAttempts, 2);
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
