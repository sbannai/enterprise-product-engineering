import test from "node:test";
import assert from "node:assert/strict";
import { ProviderOperationWorkerHost } from "../dist/packages/integrations/provider-operation-worker-host.js";

function setup(results) {
  const calls = { passes: 0, starts: 0, waits: [], closed: 0, errors: [] };
  const worker = { async runOnce() { calls.passes++; return results.shift() ?? {
    recovered: 0, claimed: 0, succeeded: 0, retried: 0, needsAttention: 0, leaseLost: 0,
  }; } };
  const controller = new AbortController();
  const wakeSource = {
    async start() { calls.starts++; },
    async wait(timeout, signal) {
      calls.waits.push(timeout);
      if (calls.waits.length >= 1) controller.abort();
      return "timeout";
    },
    async close() { calls.closed++; },
  };
  return { calls, worker, wakeSource, controller };
}

test("provider host performs a bounded pass then waits for a queue wake or reconciliation", async () => {
  const state = setup([]);
  const host = new ProviderOperationWorkerHost(state.worker, state.wakeSource, {
    reconciliationIntervalMs: 12_000,
  });
  await host.run(state.controller.signal);
  assert.equal(state.calls.starts, 1);
  assert.equal(state.calls.passes, 1);
  assert.deepEqual(state.calls.waits, [12_000]);
  assert.equal(state.calls.closed, 1);
});

test("provider host drains a full batch before waiting", async () => {
  const state = setup([{
    recovered: 0, claimed: 10, succeeded: 10, retried: 0, needsAttention: 0, leaseLost: 0,
  }]);
  const host = new ProviderOperationWorkerHost(state.worker, state.wakeSource);
  await host.run(state.controller.signal);
  assert.equal(state.calls.starts, 1);
  assert.equal(state.calls.passes, 2);
  assert.equal(state.calls.waits.length, 1);
  assert.equal(state.calls.closed, 1);
});

test("provider host validates bounded reconciliation interval", () => {
  const state = setup([]);
  assert.throws(() => new ProviderOperationWorkerHost(state.worker, state.wakeSource, {
    reconciliationIntervalMs: 10,
  }), /PROVIDER_WORKER_RECONCILIATION_INTERVAL_INVALID/);
});


test("provider host reports worker failures and closes cleanly on abort", async () => {
  const state = setup([]);
  const worker = {
    async runOnce() {
      state.controller.abort();
      throw new Error("synthetic worker failure");
    },
  };
  const host = new ProviderOperationWorkerHost(worker, state.wakeSource, {
    onError(code) {
      state.calls.errors.push(code);
    },
  });
  await host.run(state.controller.signal);
  assert.deepEqual(state.calls.errors, ["WORKER_PASS_FAILED"]);
  assert.equal(state.calls.starts, 1);
  assert.equal(state.calls.closed, 1);
  assert.equal(state.calls.waits.length, 0);
});

test("provider host reconnects its wake source before the next scan", async () => {
  const state = setup([]);
  let waits = 0;
  state.wakeSource.wait = async () => {
    waits++;
    if (waits === 1) throw new Error("listener disconnected");
    state.controller.abort();
    return "timeout";
  };
  const host = new ProviderOperationWorkerHost(state.worker, state.wakeSource, {
    onError(code) { state.calls.errors.push(code); },
  });
  await host.run(state.controller.signal);
  assert.equal(state.calls.starts, 2);
  assert.equal(state.calls.passes, 2);
  assert.deepEqual(state.calls.errors, ["WAKE_SOURCE_WAIT_FAILED"]);
  assert.equal(state.calls.closed, 1);
});


test("provider host emits bounded lifecycle metrics without forwarding error details", async () => {
  const state = setup([{
    recovered: 2, claimed: 3, succeeded: 1, retried: 1, needsAttention: 1, leaseLost: 0,
  }]);
  const events = [];
  const worker = {
    async runOnce() {
      if (events.some(event => event.type === "worker_pass_completed")) {
        state.controller.abort();
        throw new Error("token=must-not-appear-in-metrics");
      }
      return {
        recovered: 2, claimed: 3, succeeded: 1, retried: 1, needsAttention: 1, leaseLost: 0,
      };
    },
  };
  const host = new ProviderOperationWorkerHost(worker, state.wakeSource, {
    onEvent(event) { events.push(event); },
    onError(code) { state.calls.errors.push(code); },
  });
  await host.run(state.controller.signal);
  assert.deepEqual(events, [
    { type: "host_started" },
    { type: "worker_pass_completed", recovered: 2, claimed: 3, succeeded: 1, retried: 1, needsAttention: 1, leaseLost: 0 },
    { type: "wake_wait_started", timeoutMs: 30_000 },
    { type: "host_stopped" },
  ]);
  assert.equal(JSON.stringify(events).includes("must-not-appear"), false);
});


test("provider host continues queue processing when telemetry exporter throws", async () => {
  const state = setup([]);
  const host = new ProviderOperationWorkerHost(state.worker, state.wakeSource, {
    onEvent() { throw new Error("metrics exporter unavailable"); },
  });
  await host.run(state.controller.signal);
  assert.equal(state.calls.passes, 1);
  assert.equal(state.calls.waits.length, 1);
  assert.equal(state.calls.closed, 1);
});

test("provider host reports only bounded failure codes, never exception messages", async () => {
  const state = setup([]);
  const host = new ProviderOperationWorkerHost({
    async runOnce() {
      state.controller.abort();
      throw new Error("password=do-not-leak");
    },
  }, state.wakeSource, {
    onError(code) { state.calls.errors.push(code); },
  });
  await host.run(state.controller.signal);
  assert.deepEqual(state.calls.errors, ["WORKER_PASS_FAILED"]);
  assert.equal(JSON.stringify(state.calls.errors).includes("do-not-leak"), false);
});

test("provider host isolates error callback exceptions", async () => {
  const state = setup([]);
  const host = new ProviderOperationWorkerHost({
    async runOnce() {
      state.controller.abort();
      throw new Error("private exception");
    },
  }, state.wakeSource, {
    onError() { throw new Error("telemetry unavailable"); },
  });
  await host.run(state.controller.signal);
  assert.equal(state.calls.closed, 1);
});
