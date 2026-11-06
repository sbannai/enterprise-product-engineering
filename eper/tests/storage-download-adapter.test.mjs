import test from "node:test";
import assert from "node:assert/strict";
import { createStorageDownloadAdapter } from "../dist/packages/assets/storage-download-adapter.js";

const request = {
  tenantId: "tenant-a",
  actorId: "actor-a",
  applicationId: "app-a",
  assetId: "asset-a",
  accessReference: "private:opaque-reference",
  fileName: "brief.pdf",
  mimeType: "application/pdf",
};

test("provider-neutral storage adapter returns only allowlisted HTTPS grants within TTL", async () => {
  const now = Date.parse("2026-10-26T14:00:00.000Z");
  const adapter = createStorageDownloadAdapter({
    invoke: async (input, correlationId) => {
      assert.equal(input.tenantId, "tenant-a");
      assert.equal(input.accessReference, "private:opaque-reference");
      assert.equal(correlationId, "request-123");
      return {
        success: true,
        value: {
          url: "https://assets.example.test/download?signature=temporary",
          expiresAt: "2026-10-26T14:10:00.000Z",
        },
      };
    },
  }, { allowedHosts: ["assets.example.test"], now: () => now });

  assert.deepEqual(await adapter(request, "request-123"), {
    url: "https://assets.example.test/download?signature=temporary",
    expiresAt: "2026-10-26T14:10:00.000Z",
  });
});

test("provider-neutral storage adapter rejects untrusted or unsafe download grants", async () => {
  const now = Date.parse("2026-10-26T14:00:00.000Z");
  const grants = [
    { url: "http://assets.example.test/file", expiresAt: "2026-10-26T14:05:00.000Z" },
    { url: "https://attacker.example.test/file", expiresAt: "2026-10-26T14:05:00.000Z" },
    { url: "https://user:pass@assets.example.test/file", expiresAt: "2026-10-26T14:05:00.000Z" },
    { url: "https://assets.example.test/file", expiresAt: "2026-10-26T13:59:00.000Z" },
    { url: "https://assets.example.test/file", expiresAt: "2026-10-26T14:16:00.000Z" },
    { url: "not a url", expiresAt: "2026-10-26T14:05:00.000Z" },
  ];

  for (const value of grants) {
    const adapter = createStorageDownloadAdapter({
      invoke: async () => ({ success: true, value }),
    }, { allowedHosts: ["assets.example.test"], now: () => now });
    assert.equal(await adapter(request, "request-123"), null);
  }
});

test("provider-neutral storage adapter fails closed for failed or throwing providers", async () => {
  const options = { allowedHosts: ["assets.example.test"], now: () => Date.parse("2026-10-26T14:00:00.000Z") };
  const failed = createStorageDownloadAdapter({
    invoke: async () => ({ success: false, retryable: true }),
  }, options);
  const throwing = createStorageDownloadAdapter({
    invoke: async () => { throw new Error("provider unavailable"); },
  }, options);

  assert.equal(await failed(request, "request-123"), null);
  assert.equal(await throwing(request, "request-123"), null);
});

test("provider-neutral storage adapter requires explicit host allowlist and caps TTL", () => {
  const port = { invoke: async () => ({ success: false }) };
  assert.throws(() => createStorageDownloadAdapter(port, { allowedHosts: [] }), /ASSET_STORAGE_ALLOWED_HOSTS_REQUIRED/);
  assert.throws(() => createStorageDownloadAdapter(port, { allowedHosts: ["assets.example.test"], maxTtlMs: 16 * 60_000 }), /ASSET_STORAGE_MAX_TTL_INVALID/);
});
