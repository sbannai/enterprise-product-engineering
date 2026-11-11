import test from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_ASSET_SCAN_CHILD_PROTOCOL_VERSION as VERSION,
  isCustomerAssetScanChildStart,
  isCustomerAssetScanChildResult,
  isCustomerAssetScanChildFailure,
} from "../dist/packages/assets/customer-asset-scan-child-protocol.js";

const start = () => ({
  version: VERSION, type: "start", jobToken: "a".repeat(64), claimGeneration: 3,
  requestId: "scan-request-1", scannerServiceId: "scanner.synthetic.v1",
  input: {
    tenantId: "tenant-1", applicationId: "application-1", assetId: "asset-1",
    uploadSessionId: "upload-1", providerUploadReference: "synthetic-object-1",
    checksumSha256: "b".repeat(64), sizeBytes: 1024, mimeType: "application/pdf",
  },
});

test("scanner child start accepts the versioned least-privilege envelope", () => {
  assert.equal(isCustomerAssetScanChildStart(start()), true);
});

test("scanner child start rejects unknown fields that could smuggle capabilities", () => {
  const message = start();
  message.databaseUrl = "postgres://must-not-cross-ipc";
  assert.equal(isCustomerAssetScanChildStart(message), false);
  const nested = start();
  nested.input.secretReference = "must-not-cross-ipc";
  assert.equal(isCustomerAssetScanChildStart(nested), false);\n  for (const forbidden of ["providerUploadReference", "uploadSessionId", "secretReference"]) {\n    const message = start(); message.input[forbidden] = "must-not-cross-ipc";\n    assert.equal(isCustomerAssetScanChildStart(message), false, forbidden + " must never cross child IPC");\n  }
});

test("scanner child start rejects malformed identity, generation and scan input", () => {
  for (const mutate of [
    (m) => { m.version = 2; },
    (m) => { m.jobToken = "short"; },
    (m) => { m.claimGeneration = 0; },
    (m) => { m.input.checksumSha256 = "not-a-digest"; },
    (m) => { m.input.sizeBytes = -1; },
    (m) => { m.input.mimeType = "application/pdf\\nsecret"; },
  ]) {
    const message = start();
    mutate(message);
    assert.equal(isCustomerAssetScanChildStart(message), false);
  }
});

test("scanner child result is bound to a positive claim generation and known status", () => {
  const result = {
    version: VERSION, type: "result", jobToken: "c".repeat(64), claimGeneration: 3,
    scannerServiceId: "scanner.synthetic.v1", scanStatus: "clean",
  };
  assert.equal(isCustomerAssetScanChildResult(result), true);
  assert.equal(isCustomerAssetScanChildResult({ ...result, claimGeneration: 2.5 }), false);
  assert.equal(isCustomerAssetScanChildResult({ ...result, scanStatus: "verified" }), false);
  assert.equal(isCustomerAssetScanChildResult({ ...result, databaseUrl: "secret" }), false);
});

test("scanner child failure exposes only bounded stable error codes", () => {
  const failure = {
    version: VERSION, type: "failure", jobToken: "d".repeat(64), claimGeneration: 4,
    code: "SCANNER_EXECUTION_FAILED",
  };
  assert.equal(isCustomerAssetScanChildFailure(failure), true);
  assert.equal(isCustomerAssetScanChildFailure({ ...failure, code: "provider-secret-error" }), false);
  assert.equal(isCustomerAssetScanChildFailure({ ...failure, rawError: "secret" }), false);
});
