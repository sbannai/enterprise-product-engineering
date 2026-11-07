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
