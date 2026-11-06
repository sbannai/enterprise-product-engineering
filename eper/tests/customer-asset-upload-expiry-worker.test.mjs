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
