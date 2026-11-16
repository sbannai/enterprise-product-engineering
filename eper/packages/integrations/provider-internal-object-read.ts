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
 * The underlying iterator is acquired when this wrapper is created and its
 * return() is forwarded even if a consumer never calls next(). This matters
 * for SDK streams that reserve sockets or response bodies at iterator creation.
 * Consumers must exhaust the iterable and await normal completion before
 * accepting a scanner result.
 */
export function verifiedProviderInternalObjectChunks(input: {
  source: AsyncIterable<Uint8Array>;
  expectedSizeBytes: number;
  expectedSha256: string;
  signal?: AbortSignal;
}): AsyncIterableIterator<Uint8Array> {
  const source = input.source[Symbol.asyncIterator]();
  const hash = createHash("sha256");
  let received = 0;
  let validated = false;
  let closed = false;
  let abortHandler: (() => void) | undefined;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (abortHandler) input.signal?.removeEventListener("abort", abortHandler);
    await source.return?.();
  };

  abortHandler = () => { void close().catch(() => undefined); };
  if (input.signal?.aborted) abortHandler();
  else input.signal?.addEventListener("abort", abortHandler, { once: true });

  const iterator: AsyncIterableIterator<Uint8Array> = {
    async next(): Promise<IteratorResult<Uint8Array>> {
      if (input.signal?.aborted) {
        throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_ABORTED");
      }
      if (closed) return { done: true, value: undefined };
      try {
        if (!validated) {
          validated = true;
          if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes <= 0 ||
              !/^[a-f0-9]{64}$/i.test(input.expectedSha256)) {
            throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
          }
        }
        if (input.signal?.aborted) {
          throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_ABORTED");
        }
        const next = await source.next();
        // Abort may race an in-flight provider read; never release bytes returned after close.
        if (closed || input.signal?.aborted) {
          throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_ABORTED");
        }
        if (next.done) {
          if (input.signal?.aborted) {
            throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_ABORTED");
          }
          if (received !== input.expectedSizeBytes) {
            throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
          }
          if (hash.digest("hex") !== input.expectedSha256.toLowerCase()) {
            throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_CHECKSUM_MISMATCH");
          }
          closed = true;
          return { done: true, value: undefined };
        }
        const chunk = next.value;
        if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0) {
          throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_CHUNK_INVALID");
        }
        received += chunk.byteLength;
        if (!Number.isSafeInteger(received) || received > input.expectedSizeBytes) {
          throw new ProviderInternalObjectReadError("PROVIDER_INTERNAL_OBJECT_READ_SIZE_MISMATCH");
        }
        hash.update(chunk);
        return { done: false, value: chunk };
      } catch (error) {
        try { await close(); } catch { /* preserve the verification failure */ }
        throw error;
      }
    },
    async return(value?: unknown): Promise<IteratorResult<Uint8Array>> {
      await close();
      return { done: true, value: value as Uint8Array | undefined };
    },
    async throw(error?: unknown): Promise<IteratorResult<Uint8Array>> {
      try { await close(); } catch { /* preserve the consumer failure */ }
      throw error;
    },
    [Symbol.asyncIterator]() { return this; },
  };
  return iterator;
}
