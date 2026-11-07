import test from "node:test";
import assert from "node:assert/strict";
import { createApprovedWorkflowOutboxDispatcher } from "../dist/packages/workflows/workflow-outbox-dispatcher-adapter.js";

const event = {
  eventId: "11111111-1111-4111-8111-111111111111",
  eventType: "workflow.instance.completed",
  tenantId: "tenant-01",
  applicationId: "app-01",
  instanceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  transitionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  eventVersion: 1,
  attempts: 1,
  payload: {},
  occurredAt: "2026-11-05T00:00:00.000Z",
};

test("approved outbox dispatcher checks durable approval before dispatch", async () => {
  const calls = [];
  const dispatcher = createApprovedWorkflowOutboxDispatcher({
    async authorizeDispatch(received) { calls.push(["authorize", received.eventId]); return true; },
    async dispatch(received) { calls.push(["dispatch", received.eventId]); },
  });
  await dispatcher.dispatch(event);
  assert.deepEqual(calls, [
    ["authorize", event.eventId],
    ["authorize", event.eventId],
    ["dispatch", event.eventId],
  ]);
});

test("unapproved outbox event is rejected without invoking dispatch", async () => {
  let dispatchCalls = 0;
  const dispatcher = createApprovedWorkflowOutboxDispatcher({
    async authorizeDispatch() { return false; },
    async dispatch() { dispatchCalls += 1; },
  });
  await assert.rejects(dispatcher.dispatch(event), /WORKFLOW_OUTBOX_DISPATCH_NOT_APPROVED/);
  assert.equal(dispatchCalls, 0);
});

test("outbox worker refuses a dispatcher without an approval check", () => {
  assert.throws(
    () => createApprovedWorkflowOutboxDispatcher({ dispatch: async () => {} }),
    /WORKFLOW_OUTBOX_APPROVED_DISPATCHER_CONTRACT_INVALID/,
  );
});


test("approval revoked between initial and final dispatch checks prevents dispatch", async () => {
  let checks = 0;
  let dispatchCalls = 0;
  const dispatcher = createApprovedWorkflowOutboxDispatcher({
    async authorizeDispatch() {
      checks += 1;
      return checks === 1;
    },
    async dispatch() { dispatchCalls += 1; },
  });
  await assert.rejects(
    dispatcher.dispatch(event),
    /WORKFLOW_OUTBOX_DISPATCH_NOT_APPROVED/,
  );
  assert.equal(checks, 2);
  assert.equal(dispatchCalls, 0);
});

test("dispatcher must revalidate approval at the side-effect boundary", async () => {
  let checks = 0;
  let approvalActive = true;
  let externalEffects = 0;
  const dispatcher = createApprovedWorkflowOutboxDispatcher({
    async authorizeDispatch() {
      checks += 1;
      const approved = approvalActive;
      if (checks === 2) approvalActive = false;
      return approved;
    },
    async dispatch(received) {
      // Synthetic adapter's final durable read; no network/provider is called.
      if (!approvalActive) throw new Error("WORKFLOW_OUTBOX_DISPATCH_NOT_APPROVED");
      externalEffects += 1;
    },
  });
  await assert.rejects(
    dispatcher.dispatch(event),
    /WORKFLOW_OUTBOX_DISPATCH_NOT_APPROVED/,
  );
  assert.equal(checks, 2);
  assert.equal(externalEffects, 0);
});

test("synthetic dispatcher deduplicates at-least-once retries by immutable event ID", async () => {
  const sideEffects = [];
  const delivered = new Set();
  const dispatcher = createApprovedWorkflowOutboxDispatcher({
    async authorizeDispatch() { return true; },
    async dispatch(received) {
      if (delivered.has(received.eventId)) return;
      delivered.add(received.eventId);
      sideEffects.push(received.eventId);
    },
  });
  await dispatcher.dispatch(event);
  await dispatcher.dispatch(event);
  assert.deepEqual(sideEffects, [event.eventId]);
});
