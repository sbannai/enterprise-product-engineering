import type { AuditEnvironment } from "../audit/audit-event-store.js";

export interface CustomerAssetUploadExpiryRepository {
  expireStaleUploadSessions(input: {
    tenantId: string; applicationId: string; environment: AuditEnvironment;
    correlationId: string; limit?: number;
  }): Promise<number>;
}

export interface CustomerAssetUploadExpiryWorkerOptions {
  repository: CustomerAssetUploadExpiryRepository;
  tenantId: string;
  applicationId: string;
  environment: AuditEnvironment;
  correlationId: string;
  signal: AbortSignal;
  pollIntervalMs?: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
  onBatch?: (expiredCount: number, durationMs: number) => void;
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() {
    clearTimeout(timer);
    signal.removeEventListener("abort", done);
    resolve();
  }
  signal.addEventListener("abort", done, { once: true });
});

/** Expires abandoned upload sessions without reading payloads or contacting providers. */
export async function runCustomerAssetUploadExpiryWorker(
  options: CustomerAssetUploadExpiryWorkerOptions,
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 60_000 ||
      !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_EXPIRY_WORKER_OPTIONS_INVALID");
  }

  while (!options.signal.aborted) {
    try {
      const batchStartedAt = Date.now();
      const expiredCount = await options.repository.expireStaleUploadSessions({
        tenantId: options.tenantId,
        applicationId: options.applicationId,
        environment: options.environment,
        correlationId: options.correlationId,
        limit: batchSize,
      });
      options.onBatch?.(expiredCount, Math.max(0, Date.now() - batchStartedAt));
      // Drain full batches immediately; otherwise wait before the next bounded pass.
      if (expiredCount < batchSize && !options.signal.aborted) {
        await sleep(pollIntervalMs, options.signal);
      }
    } catch (error) {
      options.onError?.(error);
      if (!options.signal.aborted) await sleep(pollIntervalMs, options.signal);
    }
  }
}
