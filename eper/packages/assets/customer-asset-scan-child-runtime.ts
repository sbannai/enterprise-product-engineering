import type { CustomerAssetScanChildStart, CustomerAssetScanChildResult, CustomerAssetScanChildFailure } from "./customer-asset-scan-child-protocol.js";
import type { CustomerAssetScanChildResolvedInput, PostgresCustomerAssetScanChildInputResolver } from "./customer-asset-scan-child-input-resolver.js";
import type { CustomerAssetScanChildSpiffeIdentityVerifier } from "./customer-asset-scan-child-spiffe-identity.js";
import type { ProviderStorageDriverDispatchService, ProviderStorageOperationResult } from "../integrations/provider-storage-driver-dispatch-service.js";

export interface CustomerAssetScanChildScanner {
  scan(input: {
    assetId: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    source: AsyncIterable<Uint8Array>;
  }, requestId: string, signal: AbortSignal): Promise<{ scanStatus: "clean" | "infected" | "error" }>;
}

export interface CustomerAssetScanChildRuntimeDependencies {
  identity: Pick<CustomerAssetScanChildSpiffeIdentityVerifier, "verifyCurrentProcessIdentity">;
  input: Pick<PostgresCustomerAssetScanChildInputResolver, "resolve">;
  provider: Pick<ProviderStorageDriverDispatchService<unknown>, "dispatch">;
  scanner: CustomerAssetScanChildScanner;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return value !== null && typeof value === "object" &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function";
}

/** Execute one scanner attempt entirely inside the isolated child process. */
export class CustomerAssetScanChildRuntime {
  constructor(private readonly dependencies: CustomerAssetScanChildRuntimeDependencies) {}

  async execute(start: CustomerAssetScanChildStart, signal: AbortSignal):
    Promise<CustomerAssetScanChildResult | CustomerAssetScanChildFailure> {
    const failure = (code: CustomerAssetScanChildFailure["code"]): CustomerAssetScanChildFailure => ({
      version: 3, type: "failure", jobToken: start.jobToken,
      claimGeneration: start.claimGeneration, code,
    });
    if (signal.aborted) return failure("SCANNER_BOOTSTRAP_FAILED");

    let context: CustomerAssetScanChildResolvedInput;
    let providerStream: ProviderStorageOperationResult;
    try {
      const workload = await this.dependencies.identity.verifyCurrentProcessIdentity(signal);
      context = await this.dependencies.input.resolve({ start, workload });
      if (context.scannerServiceId !== start.scannerServiceId ||
          context.tenantId !== start.input.tenantId ||
          context.applicationId !== start.input.applicationId ||
          context.assetId !== start.input.assetId ||
          context.checksumSha256 !== start.input.checksumSha256.toLowerCase() ||
          context.sizeBytes !== start.input.sizeBytes || context.mimeType !== start.input.mimeType) {
        return failure("SCANNER_BOOTSTRAP_FAILED");
      }
      providerStream = await this.dependencies.provider.dispatch({
        tenantId: context.tenantId,
        applicationId: context.applicationId,
        actorId: context.scannerServiceId,
        correlationId: start.requestId,
        expectedConnectionId: context.providerConnectionId,
        requestId: start.requestId,
        signal,
        operation: {
          kind: "read_object_internal",
          request: {
            assetId: context.assetId,
            providerObjectReference: context.providerObjectReference,
            expectedSizeBytes: context.sizeBytes,
            expectedSha256: context.checksumSha256,
          },
        },
      });
    } catch {
      return failure("SCANNER_BOOTSTRAP_FAILED");
    }
    // A provider adapter may settle after cancellation. Do not start scanner
    // work against a stream returned after the parent has revoked this attempt.
    if (signal.aborted) return failure("SCANNER_BOOTSTRAP_FAILED");
    if (!isAsyncIterable(providerStream)) return failure("SCANNER_BOOTSTRAP_FAILED");

    let exhausted = false;
    let iteratorClosed = false;
    const providerIterator = (providerStream as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
    const closeProviderIterator = async () => {
      if (iteratorClosed) return;
      iteratorClosed = true;
      await providerIterator.return?.();
    };
    const verifiedSource: AsyncIterable<Uint8Array> = {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const next = await providerIterator.next();
            if (next.done) {
              exhausted = true;
              return;
            }
            yield next.value;
          }
        } finally {
          if (!exhausted) await closeProviderIterator();
        }
      },
    };

    try {
      const outcome = await this.dependencies.scanner.scan({
        assetId: context.assetId,
        mimeType: context.mimeType,
        sizeBytes: context.sizeBytes,
        checksumSha256: context.checksumSha256,
        source: verifiedSource,
      }, start.requestId, signal);
      // A scanner that returns before consuming the entire verified stream
      // cannot produce a trusted verdict: size and SHA-256 checks run at EOF.
      // Close explicitly as well: a scanner may never request the iterable,
      // in which case its generator/finally block would never start.
      if (!exhausted) await closeProviderIterator();
      if (!exhausted || signal.aborted ||
          !outcome || !["clean", "infected", "error"].includes(outcome.scanStatus)) {
        return failure("SCANNER_RESULT_INVALID");
      }
      return {
        version: 3, type: "result", jobToken: start.jobToken,
        claimGeneration: start.claimGeneration, scannerServiceId: context.scannerServiceId,
        scanStatus: outcome.scanStatus,
      };
    } catch {
      try { await closeProviderIterator(); } catch { /* preserve the scan failure */ }
      return failure("SCANNER_EXECUTION_FAILED");
    }
  }
}
