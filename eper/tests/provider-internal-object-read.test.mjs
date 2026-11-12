import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ProviderInternalObjectReadError,
  verifiedProviderInternalObjectChunks,
} from "../dist/packages/integrations/provider-internal-object-read.js";

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(...chunk);
  return chunks;
}
const bytes = new Uint8Array([97, 98, 99]);
const sha256 = createHash("sha256").update(bytes).digest("hex");

test("verifies exact byte count and SHA-256 while streaming", async () => {
  const result = await collect(verifiedProviderInternalObjectChunks({
    source: (async function* () { yield new Uint8Array([97]); yield new Uint8Array([98, 99]); })(),
    expectedSizeBytes: 3, expectedSha256: sha256,
  }));
  assert.deepEqual(result, [97, 98, 99]);
});

test("rejects an oversized stream before yielding bytes beyond the approved size", async () => {
  const iterator = verifiedProviderInternalObjectChunks({
    source: (async function* () { yield new Uint8Array([1, 2]); yield new Uint8Array([3]); })(),
    expectedSizeBytes: 2, expectedSha256: "a".repeat(64),
  });
  assert.deepEqual((await iterator.next()).value, new Uint8Array([1, 2]));
  await assert.rejects(() => iterator.next(), error =>
    error instanceof ProviderInternalObjectReadError &&
    error.code === "PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
});

test("rejects truncated streams and checksum mismatch", async () => {
  await assert.rejects(() => collect(verifiedProviderInternalObjectChunks({
    source: (async function* () { yield new Uint8Array([97, 98]); })(),
    expectedSizeBytes: 3, expectedSha256: sha256,
  })), error => error.code === "PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
  await assert.rejects(() => collect(verifiedProviderInternalObjectChunks({
    source: (async function* () { yield bytes; })(),
    expectedSizeBytes: 3, expectedSha256: "b".repeat(64),
  })), error => error.code === "PROVIDER_INTERNAL_OBJECT_READ_CHECKSUM_MISMATCH");
});

test("rejects invalid chunks and cancellation", async () => {
  await assert.rejects(() => collect(verifiedProviderInternalObjectChunks({
    source: (async function* () { yield null; })(),
    expectedSizeBytes: 3, expectedSha256: sha256,
  })), error => error.code === "PROVIDER_INTERNAL_OBJECT_READ_CHUNK_INVALID");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => collect(verifiedProviderInternalObjectChunks({
    source: (async function* () { yield bytes; })(),
    expectedSizeBytes: 3, expectedSha256: sha256, signal: controller.signal,
  })), error => error.code === "PROVIDER_INTERNAL_OBJECT_READ_ABORTED");
});
