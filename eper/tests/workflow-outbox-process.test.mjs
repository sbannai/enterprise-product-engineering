import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowOutboxProcess } from "../dist/packages/workflows/workflow-outbox-process.js";

test("outbox process continuously drains authorized scopes and deduplicates context discovery", async () => {
  const controller = new AbortController();
  let discoveries = 0;
  let workerCalls = 0;
  const passes = [];
  const worker = {
    async runOnce(context, limit) {
      workerCalls++;
      assert.deepEqual(context, { tenantId: "tenant-a", applicationId: "app-a" });
      assert.equal(limit, 5);
      return { claimed: workerCalls === 1 ? 1 : 0, delivered: workerCalls === 1 ? 1 : 0, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0 };
    },
  };
  const contexts = {
    async listActiveContexts() {
      discoveries++;
      return [
        { tenantId: "tenant-a", applicationId: "app-a" },
        { tenantId: "tenant-a", applicationId: "app-a" },
      ];
    },
  };
  const process = new WorkflowOutboxProcess(worker, contexts, {
    batchSize: 5,
    idlePollMs: 50,
    onPass(result) {
      passes.push(result);
      if (passes.length === 2) controller.abort();
    },
  });
  await process.run(controller.signal);
  assert.equal(discoveries, 2);
  assert.equal(workerCalls, 2);
  assert.deepEqual(passes, [
    { claimed: 1, delivered: 1, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0, contextsVisited: 1 },
    { claimed: 0, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0, contextsVisited: 1 },
  ]);
});

test("outbox process reports a tenant-scope failure and continues other scopes", async () => {
  const controller = new AbortController();
  const errors = [];
  const workerCalls = [];
  const worker = {
    async runOnce(context) {
      workerCalls.push(context.applicationId);
      if (context.applicationId === "app-a") throw new Error("database unavailable");
      return { claimed: 0, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0 };
    },
  };
  const contexts = {
    async listActiveContexts() {
      return [
        { tenantId: "tenant-a", applicationId: "app-a" },
        { tenantId: "tenant-a", applicationId: "app-b" },
      ];
    },
  };
  const process = new WorkflowOutboxProcess(worker, contexts, {
    idlePollMs: 50,
    onError(error, context) { errors.push({ message: error.message, applicationId: context?.applicationId }); },
    onPass() { controller.abort(); },
  });
  await process.run(controller.signal);
  assert.deepEqual(workerCalls, ["app-a", "app-b"]);
  assert.deepEqual(errors, [{ message: "database unavailable", applicationId: "app-a" }]);
});

test("outbox process rejects unsafe polling and context limits", () => {
  const worker = { async runOnce() { return { claimed: 0, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0 }; } };
  const contexts = { async listActiveContexts() { return []; } };
  assert.throws(() => new WorkflowOutboxProcess(worker, contexts, { idlePollMs: 1 }), /WORKFLOW_OUTBOX_PROCESS_OPTIONS_INVALID/);
  assert.throws(() => new WorkflowOutboxProcess(worker, contexts, { maxContextsPerPass: 20_000 }), /WORKFLOW_OUTBOX_PROCESS_OPTIONS_INVALID/);
});


test("outbox process forwards shutdown signal to an in-flight worker pass", async () => {
  const controller = new AbortController();
  let receivedSignal;
  const worker = {
    async runOnce(_context, _limit, signal) {
      receivedSignal = signal;
      controller.abort();
      return { claimed: 0, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0 };
    },
  };
  const contexts = {
    async listActiveContexts() {
      return [{ tenantId: "tenant-a", applicationId: "app-a" }];
    },
  };
  const process = new WorkflowOutboxProcess(worker, contexts, { idlePollMs: 50 });
  await process.run(controller.signal);
  assert.equal(receivedSignal, controller.signal);
});


test("outbox process includes partial worker counters when a claim fails", async () => {
  const controller = new AbortController();
  const passes = [];
  const errors = [];
  const worker = {
    async runOnce() {
      const error = new Error("WORKFLOW_OUTBOX_CLAIM_PROCESSING_FAILED");
      error.result = { claimed: 2, delivered: 1, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0 };
      throw error;
    },
  };
  const contexts = {
    async listActiveContexts() {
      return [{ tenantId: "tenant-a", applicationId: "app-a" }];
    },
  };
  const process = new WorkflowOutboxProcess(worker, contexts, {
    idlePollMs: 50,
    onError(error) { errors.push(error.message); },
    onPass(result) { passes.push(result); controller.abort(); },
  });
  await process.run(controller.signal);
  assert.deepEqual(errors, ["WORKFLOW_OUTBOX_CLAIM_PROCESSING_FAILED"]);
  assert.deepEqual(passes, [{
    claimed: 2, delivered: 1, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0, contextsVisited: 1,
  }]);
});
