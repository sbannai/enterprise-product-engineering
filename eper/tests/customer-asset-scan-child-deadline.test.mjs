import assert from "node:assert/strict";
import test from "node:test";
import { awaitCustomerAssetScanChildDeadline } from "../dist/packages/assets/customer-asset-scan-child-deadline.js";

function abortGate() {
  let reject;
  const promise = new Promise((_resolve, rejectPromise) => { reject = rejectPromise; });
  return { promise, reject };
}

test("child deadline returns the initialized value when initialization finishes before abort", async () => {
  const controller = new AbortController();
  const gate = abortGate();
  const value = { ready: true };
  assert.equal(
    await awaitCustomerAssetScanChildDeadline(Promise.resolve(value), gate.promise, controller.signal),
    value,
  );
});

test("child deadline rejects promptly on abort and disposes a factory result that arrives late", async () => {
  const controller = new AbortController();
  const gate = abortGate();
  let resolveFactory;
  const factory = new Promise((resolve) => { resolveFactory = resolve; });
  const disposed = [];
  const raced = awaitCustomerAssetScanChildDeadline(
    factory,
    gate.promise,
    controller.signal,
    (resource) => disposed.push(resource),
  );

  const timeout = new Error("child deadline elapsed");
  controller.abort();
  gate.reject(timeout);
  await assert.rejects(raced, /child deadline elapsed/);

  const lateResource = { close() {} };
  resolveFactory(lateResource);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(disposed, [lateResource]);
});

test("child deadline contains a late factory rejection after abort", async () => {
  const controller = new AbortController();
  const gate = abortGate();
  let rejectFactory;
  const factory = new Promise((_resolve, reject) => { rejectFactory = reject; });
  const raced = awaitCustomerAssetScanChildDeadline(factory, gate.promise, controller.signal);
  controller.abort();
  gate.reject(new Error("timeout"));
  await assert.rejects(raced, /timeout/);
  rejectFactory(new Error("late factory failure"));
  await new Promise((resolve) => setImmediate(resolve));
});
