import test from "node:test";
import assert from "node:assert/strict";
import { ProviderOperationWorkerHost } from "../dist/packages/integrations/provider-operation-worker-host.js";

function setup(results) {
  const calls = { passes: 0, waits: [], closed: 0, errors: [] };
  const worker = { async runOnce() { calls.passes++; return results.shift() ?? {
    recovered: 0, claimed: 0, succeeded: 0, retried: 0, needsAttention: 0, leaseLost: 0,
  }; } };
  const wakeSource = {
    async wait(timeout, signal) {
      calls.waits.push(timeout);
      if (calls.waits.length >= 1) controller.abort();
      return "timeout";
    },
    async close() { calls.closed++; },
  };
  const controller = new AbortController();
  return { calls, worker, wakeSource, controller };
}

test("provider host performs a bounded pass then waits for a queue wake or reconciliation", async () => {
  const state = setup([]);
  const host = new ProviderOperationWorkerHost(state.worker, state.wakeSource, {
    reconciliationIntervalMs: 12_000,
  });
  await host.run(state.controller.signal);
  assert.equal(state.calls.passes, 1);
  assert.deepEqual(state.calls.waits, [12_000]);
  assert.equal(state.calls.closed, 1);
});

test("provider host drains a full batch before waiting", async () => {
  const state = setup([{
    recovered: 0, claimed: 100, succeeded: 100, retried: 0, needsAttention: 0, leaseLost: 0,
  }]);
  const host = new ProviderOperationWorkerHost(state.worker, state.wakeSource);
  await host.run(state.controller.signal);
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
