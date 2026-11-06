import test from "node:test";
import assert from "node:assert/strict";
import { runCustomerAssetUploadExpiryWorker } from "../dist/packages/assets/customer-asset-upload-expiry-worker.js";

test("upload expiry worker drains full bounded batches and sleeps only after a partial batch", async () => {
  const controller = new AbortController();
  const calls = [];
  const batches = [];
  const repository = {
    async expireStaleUploadSessions(input) {
      calls.push(input);
      input.onMetrics?.({
        expiredCount: calls.length === 1 ? 2 : 0,
        queueAgeMs: calls.length === 1 ? 1_250 : 0,
      });
      return calls.length === 1 ? 2 : 0;
    },
  };
  await runCustomerAssetUploadExpiryWorker({
    repository, tenantId: "tenant-1", applicationId: "app-1", environment: "sandbox",
    correlationId: "expiry-correlation", signal: controller.signal, batchSize: 2,
    onBatch(count, durationMs, queueAgeMs) {
      batches.push({ count, durationMs, queueAgeMs });
      if (calls.length === 2 && count === 0) controller.abort();
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].limit, 2);
  assert.equal(calls[0].tenantId, "tenant-1");
  assert.equal(calls[0].applicationId, "app-1");
  assert.equal(batches.length, 2);
  assert.equal(batches[0].queueAgeMs, 1_250);
  assert.ok(batches.every((batch) => batch.durationMs >= 0));
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
