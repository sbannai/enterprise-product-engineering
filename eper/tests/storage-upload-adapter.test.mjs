import test from "node:test";
import assert from "node:assert/strict";
import { createStorageUploadAdapter } from "../dist/packages/assets/storage-upload-adapter.js";

const request = {
  tenantId: "tenant-a", actorId: "actor-a", applicationId: "app-a",
  assetId: "asset-a", uploadSessionId: "session-a",
  fileName: "brief.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  sizeBytes: 4096,
};

test("storage upload adapter returns a scoped short-lived HTTPS capability", async () => {
  let received;
  const adapter = createStorageUploadAdapter({
    invoke: async (input, correlationId) => {
      received = { input, correlationId };
      return { success: true, externalReference: "opaque-provider-object-001", value: {
        url: "https://storage.example.test/upload?signature=opaque",
        method: "PUT", expiresAt: new Date(1_700_000_060_000).toISOString(),
        headers: { "content-type": request.mimeType, "x-upload-token": "opaque" },
      } };
    },
  }, { allowedHosts: ["storage.example.test"], now: () => 1_700_000_000_000 });
  const result = await adapter(request, "upload-request-001");
  assert.equal(received.input, request);
  assert.equal(received.correlationId, "upload-request-001");
  assert.equal(result.kind, "succeeded");
  assert.equal(result.method, "PUT");
  assert.equal(result.expiresAt, new Date(1_700_000_060_000).toISOString());
  assert.equal(result.headers["content-type"], request.mimeType);
  assert.match(result.url, /^https:\/\/storage\.example\.test\//);
});

test("storage upload adapter rejects untrusted, insecure and overlong grants", async () => {
  const grants = [
    { url: "http://storage.example.test/upload", method: "PUT", expiresAt: new Date(1_700_000_060_000).toISOString() },
    { url: "https://evil.example.test/upload", method: "PUT", expiresAt: new Date(1_700_000_060_000).toISOString() },
    { url: "https://user:pass@storage.example.test/upload", method: "PUT", expiresAt: new Date(1_700_000_060_000).toISOString() },
    { url: "https://storage.example.test/upload", method: "DELETE", expiresAt: new Date(1_700_000_060_000).toISOString() },
    { url: "https://storage.example.test/upload", method: "PUT", expiresAt: new Date(1_700_001_000_000).toISOString() },
  ];
  for (const grant of grants) {
    const adapter = createStorageUploadAdapter({
      invoke: async () => ({ success: true, value: grant }),
    }, { allowedHosts: ["storage.example.test"], now: () => 1_700_000_000_000 });
    assert.equal((await adapter(request, "upload-request-002")).kind, "unknown");
  }
});

test("storage upload adapter fails closed for provider errors and unsafe headers", async () => {
  const failed = createStorageUploadAdapter({
    invoke: async () => { throw new Error("provider secret must not escape"); },
  }, { allowedHosts: ["storage.example.test"] });
  assert.deepEqual(await failed(request, "upload-request-003"), { kind: "unknown", reason: "transport" });

  const unsafe = createStorageUploadAdapter({
    invoke: async () => ({ success: true, value: {
      url: "https://storage.example.test/upload", method: "PUT",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      headers: { "x-injected": "value\\r\\nX-Evil: yes" },
    } }),
  }, { allowedHosts: ["storage.example.test"] });
  assert.equal((await unsafe(request, "upload-request-004")).kind, "unknown");
});

test("storage upload adapter validates allowlist and TTL configuration", () => {
  const port = { invoke: async () => ({ success: false }) };
  assert.throws(() => createStorageUploadAdapter(port, { allowedHosts: [] }), /ASSET_STORAGE_ALLOWED_HOSTS_REQUIRED/);
  assert.throws(() => createStorageUploadAdapter(port, { allowedHosts: ["storage.example.test"], maxTtlMs: 900_000 + 1 }), /ASSET_STORAGE_MAX_TTL_INVALID/);
});

test("storage upload adapter refuses to renew a different provider object", async () => {
  const adapter = createStorageUploadAdapter({
    invoke: async (input) => ({
      success: true,
      externalReference: "provider-object-different",
      value: {
        url: "https://storage.example.test/upload", method: "PUT",
        expiresAt: new Date(1_700_000_060_000).toISOString(),
      },
    }),
  }, { allowedHosts: ["storage.example.test"], now: () => 1_700_000_000_000 });
  assert.equal((await adapter({ ...request, providerUploadReference: "provider-object-original" }, "upload-recovery-001")).kind, "unknown");
});

test("storage upload adapter distinguishes definitive provider rejection from retryable uncertainty", async () => {
  const rejected = createStorageUploadAdapter({
    invoke: async () => ({ success: false, definitiveRejection: true, rejectionCode: "policy_denied" }),
  }, { allowedHosts: ["storage.example.test"] });
  const unknown = createStorageUploadAdapter({
    invoke: async () => ({ success: false, retryable: false }),
  }, { allowedHosts: ["storage.example.test"] });
  assert.deepEqual(await rejected(request, "upload-reject-001"), { kind: "rejected", rejectionCode: "policy_denied" });
  assert.deepEqual(await unknown(request, "upload-unknown-001"), { kind: "unknown", reason: "transport" });
});
