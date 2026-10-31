import test from "node:test";
import assert from "node:assert/strict";
import { runWorkflowOutboxWorkerHost } from "../dist/packages/workflows/workflow-outbox-host.js";

function fakeSignalHost({ signalDuringRegistration, failOnRegistration } = {}) {
  const listeners = new Map();
  return {
    listeners,
    on(signal, listener) {
      if (signal === failOnRegistration) throw new Error("registration failed");
      listeners.set(signal, listener);
      if (signal === signalDuringRegistration) listener();
    },
    off(signal, listener) {
      if (listeners.get(signal) === listener) listeners.delete(signal);
    },
    emit(signal) { listeners.get(signal)?.(); },
  };
}

test("host maps SIGTERM to graceful runtime cancellation and removes listeners", async () => {
  let connects = 0;
  const host = fakeSignalHost({ signalDuringRegistration: "SIGTERM" });
  await runWorkflowOutboxWorkerHost({
    pool: { async connect() { connects += 1; throw new Error("database must not be touched"); } },
    dispatcher: { async dispatch() {} },
    workerId: "worker-01",
  }, host);
  assert.equal(connects, 0);
  assert.equal(host.listeners.size, 0);
});

test("host maps SIGINT to graceful runtime cancellation", async () => {
  let connects = 0;
  const host = fakeSignalHost({ signalDuringRegistration: "SIGINT" });
  await runWorkflowOutboxWorkerHost({
    pool: { async connect() { connects += 1; throw new Error("database must not be touched"); } },
    dispatcher: { async dispatch() {} },
    workerId: "worker-01",
  }, host);
  assert.equal(connects, 0);
  assert.equal(host.listeners.size, 0);
});

test("host removes SIGINT listener when SIGTERM registration fails", async () => {
  const host = fakeSignalHost({ failOnRegistration: "SIGTERM" });
  await assert.rejects(
    runWorkflowOutboxWorkerHost({
      pool: {},
      dispatcher: { async dispatch() {} },
      workerId: "worker-01",
    }, host),
    /registration failed/,
  );
  assert.equal(host.listeners.size, 0);
});

test("host rejects an invalid signal adapter", async () => {
  await assert.rejects(
    runWorkflowOutboxWorkerHost({ pool: {}, dispatcher: { async dispatch() {} }, workerId: "worker-01" }, {}),
    /WORKFLOW_OUTBOX_SIGNAL_HOST_REQUIRED/,
  );
});
