import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("internal asset scan requires service bearer token and records only trusted scanner outcome", async () => {
  const keys = ["EPER_CUSTOMER_ASSET_SCAN_API_ENABLED", "EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN",
    "EPER_CUSTOMER_ASSET_PERSISTENCE", "EPER_AUDIT_PERSISTENCE", "EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const serviceToken = "internal-malware-scanner-token-with-strong-entropy-0001";
  process.env.EPER_CUSTOMER_ASSET_SCAN_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN = serviceToken;
  process.env.EPER_CUSTOMER_ASSET_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID = "eper-malware-scanner";
  const calls = [];
  const server = createAppServer({
    customerAssetRepository: {
      async getUploadSessionForScanning(tenantId, applicationId, uploadSessionId) {
        calls.push({ type: "lookup", tenantId, applicationId, uploadSessionId });
        return {
          assetId: "asset-a", providerUploadReference: "private-object-ref",
          checksumSha256: "a".repeat(64), sizeBytes: 4096, mimeType: "application/pdf", attempt: 2,
        };
      },
      async recordScanResult(input) {
        calls.push({ type: "record", input });
        return { assetId: "asset-a", uploadStatus: "available", scanStatus: "clean", lifecycleStatus: "active" };
      },
      async completeScanJob(input) { calls.push({ type: "complete", input }); return true; },
    },
    assetMalwareScanResolver: async (input, requestId) => {
      calls.push({ type: "scan", input, requestId });
      return { scanStatus: "clean", scannerServiceId: "eper-malware-scanner" };
    },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/internal/customer-assets/scan";
    const body = JSON.stringify({
      tenantId: "tenant-a", applicationId: "app-a",
      uploadSessionId: "00000000-0000-4000-8000-000000000001",
      workerId: "eper-malware-scanner:worker-01",
      scanStatus: "clean", scannerServiceId: "attacker-controlled", attempt: 1,
    });
    const denied = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(denied.status, 401);
    assert.equal(calls.length, 0);

    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + serviceToken, "content-type": "application/json", "x-correlation-id": "scan-correlation-001" },
      body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { asset: {
      assetId: "asset-a", uploadStatus: "available", scanStatus: "clean", lifecycleStatus: "active",
    } });
    assert.deepEqual(calls.map((call) => call.type), ["lookup", "scan", "record", "complete"]);
    assert.equal(calls[1].input.providerUploadReference, "private-object-ref");
    assert.equal(calls[2].input.scannerServiceId, "eper-malware-scanner");
    assert.equal(calls[2].input.scanStatus, "clean");
    assert.equal(calls[2].input.correlationId, "scan-correlation-001");
    assert.equal(calls[3].input.workerId, "eper-malware-scanner:worker-01");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test("internal scan route is hidden when disabled and rejects invalid scan job references", async () => {
  const keys = ["EPER_CUSTOMER_ASSET_SCAN_API_ENABLED", "EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN",
    "EPER_CUSTOMER_ASSET_PERSISTENCE", "EPER_AUDIT_PERSISTENCE"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.EPER_CUSTOMER_ASSET_SCAN_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN = "internal-malware-scanner-token-with-strong-entropy-0002";
  process.env.EPER_CUSTOMER_ASSET_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  const server = createAppServer({
    customerAssetRepository: { async getUploadSessionForScanning() { throw new Error("must not be called"); } },
    assetMalwareScanResolver: async () => { throw new Error("must not be called"); },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/internal/customer-assets/scan";
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + process.env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "../other", applicationId: "app-a", uploadSessionId: "bad" }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_scan_job_reference" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});


test("internal scan claim endpoint returns tenant-scoped jobs under configured worker identity", async () => {
  const keys = ["EPER_CUSTOMER_ASSET_SCAN_API_ENABLED", "EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN",
    "EPER_CUSTOMER_ASSET_PERSISTENCE", "EPER_AUDIT_PERSISTENCE", "EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.EPER_CUSTOMER_ASSET_SCAN_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN = "internal-malware-scanner-token-with-strong-entropy-0003";
  process.env.EPER_CUSTOMER_ASSET_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_ID = "eper-malware-scanner";
  const calls = [];
  const server = createAppServer({
    customerAssetRepository: {
      async claimScanJobs(input) {
        calls.push(input);
        return [{ uploadSessionId: "00000000-0000-4000-8000-000000000001",
          assetId: "asset-a", correlationId: "corr-a", attempt: 1, leaseExpiresAt: "2026-11-04T03:22:00.000Z" }];
      },
    },
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const url = "http://127.0.0.1:" + address.port + "/internal/customer-assets/scan/claim";
    const denied = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-a", applicationId: "app-a" }) });
    assert.equal(denied.status, 401);
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + process.env.EPER_CUSTOMER_ASSET_SCANNER_SERVICE_TOKEN,
        "content-type": "application/json" },
      body: JSON.stringify({ tenantId: "tenant-a", applicationId: "app-a", workerId: "eper-malware-scanner:worker-01", limit: 3, leaseMs: 30000 }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.jobs.length, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { tenantId: "tenant-a", applicationId: "app-a",
      workerId: "eper-malware-scanner:worker-01", limit: 3, leaseMs: 30000 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
