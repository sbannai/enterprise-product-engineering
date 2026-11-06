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
    async getStaleUploadQueueAgeMs() { return 1250; },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal, batchSize: 2,
    onBatch(metrics) {
      assert.equal(metrics.queueAgeMs, 1250);
      assert.ok(metrics.batchDurationMs >= 0);
      if (calls.length === 2 && metrics.expiredCount === 0) controller.abort();
    },
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
    async getStaleUploadQueueAgeMs() { return 0; },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal, pollIntervalMs: 100,
    onError(_error, consecutiveFailures) {
      reported += 1;
      assert.equal(consecutiveFailures, 1);
      controller.abort();
    },
  });
  assert.equal(reported, 1);
});

test("upload expiry worker rejects unbounded polling and batch configuration", async () => {
  const controller = new AbortController();
  const repository = {
    async expireStaleUploadSessions() { return 0; },
    async getStaleUploadQueueAgeMs() { return 0; },
  };
  await assert.rejects(() => runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal, batchSize: 501,
  }), /WORKER_OPTIONS_INVALID/);
});


test("upload expiry worker backs off exponentially after failures and resets after a successful batch", async () => {
  const controller = new AbortController();
  const attempts = [];
  const failures = [];
  let calls = 0;
  const repository = {
    async expireStaleUploadSessions() {
      attempts.push(Date.now());
      calls += 1;
      if (calls <= 2) throw new Error("synthetic failure");
      return 0;
    },
    async getStaleUploadQueueAgeMs() { return 0; },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal,
    pollIntervalMs: 100, maxBackoffMs: 200,
    onError(_error, count) { failures.push(count); },
    onBatch() { controller.abort(); },
  });
  assert.deepEqual(failures, [1, 2]);
  assert.equal(attempts.length, 3);
  assert.ok(attempts[1] - attempts[0] >= 80, "first retry uses the poll interval");
  assert.ok(attempts[2] - attempts[1] >= 160, "second retry doubles the delay");
});
