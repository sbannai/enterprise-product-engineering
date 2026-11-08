import test from "node:test";
import assert from "node:assert/strict";
import { runCustomerAssetUploadExpiryWorker } from "../dist/packages/assets/customer-asset-upload-expiry-worker.js";

test("upload expiry worker drains full bounded batches and sleeps only after a partial batch", async () => {
  const controller = new AbortController();
  const calls = [];
  const repository = {
    async expireStaleUploadSessions(input) {
      calls.push(input);
      return calls.length === 1 ? 2 : 0;
    },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal, batchSize: 2,
    onBatch(count) { if (calls.length === 2 && count === 0) controller.abort(); },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].limit, 2);
  assert.equal(calls[0].tenantId, "tenant-1");
  assert.equal(calls[0].applicationId, "app-1");
});

test("upload expiry worker reports failures without leaking error details and remains cancellable", async () => {
  const controller = new AbortController();
  let reported = 0;
  const repository = {
    async expireStaleUploadSessions() { throw new Error("sensitive database detail"); },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal, pollIntervalMs: 100,
    onError() { reported += 1; controller.abort(); },
  });
  assert.equal(reported, 1);
});

test("upload expiry worker rejects unbounded polling and batch configuration", async () => {
  const controller = new AbortController();
  const repository = { async expireStaleUploadSessions() { return 0; } };
  await assert.rejects(() => runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal, batchSize: 501,
  }), /WORKER_OPTIONS_INVALID/);
});

test("expiry worker backs off exponentially after failures and resets after success", async () => {
  const controller = new AbortController();
  const started = [];
  const failureCounts = [];
  let calls = 0;
  const repository = {
    async expireStaleUploadSessions(input) {
      started.push(Date.now());
      calls += 1;
      if (calls <= 2) throw new Error("synthetic failure");
      input.onMetrics?.({ expiredCount: 0, queueAgeMs: 0 });
      return 0;
    },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal,
    pollIntervalMs: 100, maxBackoffMs: 200,
    onError(_error, count) { failureCounts.push(count); },
    onBatch() { controller.abort(); },
  });
  assert.deepEqual(failureCounts, [1, 2]);
  assert.equal(started.length, 3);
  assert.ok(started[1] - started[0] >= 80);
  assert.ok(started[2] - started[1] >= 160);
});

test("expiry worker reports batch duration and queue age without requiring repository metrics", async () => {
  const controller = new AbortController();
  const batches = [];
  const repository = {
    async expireStaleUploadSessions(input) {
      input.onMetrics?.({ expiredCount: 1, queueAgeMs: 1_250 });
      return 1;
    },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal,
    pollIntervalMs: 100, batchSize: 10,
    onBatch(count, duration, age) { batches.push({ count, duration, age }); controller.abort(); },
  });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].count, 1);
  assert.ok(batches[0].duration >= 0);
  assert.equal(batches[0].age, 1_250);
});
