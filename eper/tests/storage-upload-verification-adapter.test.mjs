import test from "node:test";
import assert from "node:assert/strict";
import { createStorageUploadVerificationAdapter } from "../dist/packages/assets/storage-upload-verification-adapter.js";

const request = {
  tenantId: "tenant-a", applicationId: "app-a", assetId: "asset-a",
  uploadSessionId: "session-000000000000000001",
  providerUploadReference: "opaque-provider-reference",
  expectedSizeBytes: 4096, expectedMimeType: "application/pdf", expectedSha256: "a".repeat(64),
};
const valid = {
  objectExists: true, sizeBytes: 4096, detectedMimeType: "application/pdf",
  checksumSha256: "a".repeat(64),
};

test("verification adapter accepts provider-observed metadata and returns only verification facts", async () => {
  const calls = [];
  const verify = createStorageUploadVerificationAdapter({
    async invoke(input, requestId) {
      calls.push({ input, requestId });
      return { success: true, value: valid };
    },
  });
  const result = await verify(request, "verify-correlation-001");
  assert.deepEqual(result, {
    sizeBytes: 4096, detectedMimeType: "application/pdf", checksumSha256: "a".repeat(64),
  });
  assert.equal(calls[0].input.providerUploadReference, request.providerUploadReference);
  assert.equal(calls[0].requestId, "verify-correlation-001");
});

test("verification adapter fails closed for missing objects, mismatches and malformed checksums", async () => {
  for (const value of [
    { ...valid, objectExists: false },
    { ...valid, sizeBytes: 4095 },
    { ...valid, detectedMimeType: "text/plain" },
    { ...valid, checksumSha256: "not-a-sha256" },
    { ...valid, checksumSha256: "b".repeat(64) },
  ]) {
    const verify = createStorageUploadVerificationAdapter({
      async invoke() { return { success: true, value }; },
    });
    assert.equal(await verify(request, "verify-correlation-002"), null);
  }
});

test("verification adapter fails closed on provider failure or exception", async () => {
  const rejected = createStorageUploadVerificationAdapter({
    async invoke() { return { success: false, retryable: true }; },
  });
  const thrown = createStorageUploadVerificationAdapter({
    async invoke() { throw new Error("provider offline"); },
  });
  assert.equal(await rejected(request, "verify-correlation-003"), null);
  assert.equal(await thrown(request, "verify-correlation-004"), null);
});


test("verification adapter rejects malformed expected SHA-256 before accepting provider facts", async () => {
  const verify = createStorageUploadVerificationAdapter({ async invoke() { return { success: true, value: valid }; } });
  assert.equal(await verify({ ...request, expectedSha256: "invalid" }, "verify-correlation-003"), null);
});
