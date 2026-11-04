import test from "node:test";
import assert from "node:assert/strict";
import { runCustomerAssetScanWorker } from "../dist/packages/assets/customer-asset-scan-worker.js";

function fixture(scanStatus) {
  const controller = new AbortController();
  const calls = [];
  let claimed = false;
  const repository = {
    async claimScanJobs(input) {
      calls.push(["claim", input.limit, input.leaseMs]);
      if (claimed) { controller.abort(); return []; }
      claimed = true;
      return [{ uploadSessionId: "session-1234567890123456", assetId: "asset-1",
        correlationId: "correlation-1", attempt: 1, leaseExpiresAt: new Date(Date.now()+60000).toISOString() }];
    },
    async getUploadSessionForScanning(...args) {
      calls.push(["lookup", ...args]);
      return { assetId: "asset-1", providerUploadReference: "opaque:ref",
        checksumSha256: "a".repeat(64), sizeBytes: 10, mimeType: "image/png", attempt: 1 };
    },
    async renewScanJobLease(input) { calls.push(["renew", input.uploadSessionId]); return true; },
    async retryScanJob(input) { calls.push(["retry", input.errorCode, input.retryAfterMs]); return "pending"; },
    async recordScanResult(input) { calls.push(["record", input.scanStatus, input.workerId]); return {}; },
  };
  const scanner = { async scan(input, requestId) {
    calls.push(["scan", input.providerUploadReference, requestId]);
    return { scanStatus, scannerServiceId: "asset-scanner" };
  }};
  return { controller, calls, repository, scanner };
}

test("customer asset scan worker claims, scans and atomically finalizes a clean job", async () => {
  const f = fixture("clean");
  await runCustomerAssetScanWorker({
    ...f, tenantId: "tenant-1", applicationId: "app-1", workerId: "asset-scanner:worker-1",
    scannerServiceId: "asset-scanner", environment: "sandbox", signal: f.controller.signal,
    onJob() { f.controller.abort(); },
  });
  assert.ok(f.calls.some((call) => call[0] === "scan"));
  assert.ok(f.calls.some((call) => call[0] === "record" && call[1] === "clean"));
  assert.equal(f.calls.filter((call) => call[0] === "retry").length, 0);
});

test("customer asset scan worker persists bounded retry for a scanner error", async () => {
  const f = fixture("error");
  await runCustomerAssetScanWorker({
    ...f, tenantId: "tenant-1", applicationId: "app-1", workerId: "asset-scanner:worker-1",
    scannerServiceId: "asset-scanner", environment: "sandbox", signal: f.controller.signal,
    onJob() { f.controller.abort(); },
  });
  assert.ok(f.calls.some((call) => call[0] === "retry" && call[1] === "SCANNER_PROVIDER_ERROR" && call[2] === 15_000));
  assert.equal(f.calls.filter((call) => call[0] === "record").length, 0);
});


test("customer asset scan worker times out provider calls and routes them through retry", async () => {
  const f = fixture("clean");
  f.scanner.scan = async (_input, _requestId, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await runCustomerAssetScanWorker({
    ...f, tenantId: "tenant-1", applicationId: "app-1", workerId: "asset-scanner:worker-1",
    scannerServiceId: "asset-scanner", environment: "sandbox", signal: f.controller.signal,
    scanTimeoutMs: 1_000, onJob() { f.controller.abort(); },
  });
  assert.ok(f.calls.some((call) => call[0] === "retry" && call[1] === "SCANNER_PROVIDER_ERROR"));
});


test("customer asset scan worker aborts an in-flight scanner call during shutdown", async () => {
  const f = fixture("clean");
  let scanSignal;
  f.scanner.scan = async (_input, _requestId, signal) => new Promise((resolve) => {
    scanSignal = signal;
    signal?.addEventListener("abort", () => resolve({
      scanStatus: "clean", scannerServiceId: "asset-scanner",
    }), { once: true });
  });
  const shutdown = setTimeout(() => f.controller.abort(), 20);
  try {
    await runCustomerAssetScanWorker({
      ...f, tenantId: "tenant-1", applicationId: "app-1", workerId: "asset-scanner:worker-1",
      scannerServiceId: "asset-scanner", environment: "sandbox", signal: f.controller.signal,
    });
  } finally {
    clearTimeout(shutdown);
  }
  assert.equal(scanSignal?.aborted, true);
  assert.equal(f.calls.filter((call) => call[0] === "record").length, 0);
  assert.equal(f.calls.filter((call) => call[0] === "retry").length, 0);
});
