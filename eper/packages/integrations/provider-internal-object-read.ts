import { createHash } from "node:crypto";

export class ProviderInternalObjectReadError extends Error {
  constructor(readonly code:
    | "PROVIDER_INTERNAL_OBJECT_READ_ABORTED"
    | "PROVIDER_INTERNAL_OBJECT_READ_CHUNK_INVALID"
    | "PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH"
    | "PROVIDER_INTERNAL_OBJECT_READ_CHECKSUM_MISMATCH") {
    super(code);
    this.name = "ProviderInternalObjectReadError";
  }
}

/**
 * Wraps a provider stream with a strict size ceiling and SHA-256 verification.
 * Consumers must exhaust the iterable and await normal completion before
 * accepting a scanner result; any truncation, overflow, or digest mismatch
 * rejects iteration and therefore invalidates that result.
 */
export async function* verifiedProviderInternalObjectChunks(input: {
  source: AsyncIterable<Uint8Array>;
  expectedSizeBytes: number;
  expectedSha256: string;
  signal?: AbortSignal;
}): AsyncGenerator<Uint8Array> {
  if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes <= 0 ||
      !/^[a-f0-9]{64}$/i.test(input.expectedSha256)) {
    throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
  }
  const hash = createHash("sha256");
  let received = 0;
  for await (const chunk of input.source) {
    if (input.signal?.aborted) {
      throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_ABORTED");
    }
    if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) {
      throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_CHUNK_INVALID");
    }
    received += chunk.byteLength;
    if (!Number.isSafeInteger(received) || received > input.expectedSizeBytes) {
      throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
    }
    hash.update(chunk);
    yield chunk;
  }
  if (input.signal?.aborted) {
    throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_ABORTED");
  }
  if (received !== input.expectedSizeBytes) {
    throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
  }
  if (hash.digest("hex") !== input.expectedSha256.toLowerCase()) {
    throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_CHECKSUM_MISMATCH");
  }
}
