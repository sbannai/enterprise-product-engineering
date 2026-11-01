import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkflowOutboxRuntime,
  runWorkflowOutboxRuntime,
} from "../dist/packages/workflows/workflow-outbox-runtime.js";

test("runtime requires a restricted pool and an explicit dispatcher", () => {
  assert.throws(
    () => createWorkflowOutboxRuntime({ pool: {}, dispatcher: { async dispatch() {} }, workerId: "worker-01" }),
    /WORKFLOW_OUTBOX_RUNTIME_POOL_REQUIRED/,
  );
  assert.throws(
    () => createWorkflowOutboxRuntime({ pool: { async connect() { throw new Error("unused"); } }, dispatcher: null, workerId: "worker-01" }),
    /WORKFLOW_OUTBOX_RUNTIME_DISPATCHER_REQUIRED/,
  );
});

test("runtime validates worker identity before starting", () => {
  const pool = { async connect() { throw new Error("database must not be touched during composition"); } };
  assert.throws(
    () => createWorkflowOutboxRuntime({ pool, dispatcher: { async dispatch() {} }, workerId: "bad worker id" }),
    /WORKFLOW_OUTBOX_WORKER_ID_INVALID/,
  );
});

test("runtime exits cleanly when the host has already requested shutdown", async () => {
  let connects = 0;
  const pool = { async connect() { connects += 1; throw new Error("unexpected database access"); } };
  const controller = new AbortController();
  controller.abort();
  await runWorkflowOutboxRuntime({
    pool,
    dispatcher: { async dispatch() {} },
    workerId: "worker-01",
  }, controller.signal);
  assert.equal(connects, 0);
});

test("runtime requires a host lifecycle AbortSignal", async () => {
  const pool = { async connect() { throw new Error("unexpected database access"); } };
  await assert.rejects(
    runWorkflowOutboxRuntime({
      pool,
      dispatcher: { async dispatch() {} },
      workerId: "worker-01",
    }, null),
    /WORKFLOW_OUTBOX_RUNTIME_ABORT_SIGNAL_REQUIRED/,
  );
});


test("runtime applies one context cap to discovery and processing", () => {
  const pool = { async connect() { throw new Error("database must not be touched during composition"); } };
  const dispatcher = { async dispatch() {} };
  assert.throws(
    () => createWorkflowOutboxRuntime({
      pool, dispatcher, workerId: "worker-01", maxContexts: 10,
      process: { maxContextsPerPass: 20 },
    }),
    /WORKFLOW_OUTBOX_CONTEXT_LIMIT_MISMATCH/,
  );
  assert.doesNotThrow(() => createWorkflowOutboxRuntime({
    pool, dispatcher, workerId: "worker-01", maxContexts: 25,
  }));
  assert.doesNotThrow(() => createWorkflowOutboxRuntime({
    pool, dispatcher, workerId: "worker-01", process: { maxContextsPerPass: 30 },
  }));
});
