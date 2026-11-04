import type {
  ProviderOperationWorker,
  ProviderOperationWorkerResult,
} from "./provider-operation-worker.js";

export interface ProviderQueueWakeSource {
  /** Establish LISTEN before the first queue scan to close the scan/subscribe race. */
  start(): Promise<void>;
  /** Resolves on a generic queue wake-up or after timeout; no tenant data is carried. */
  wait(timeoutMs: number, signal: AbortSignal): Promise<"notified" | "timeout">;
  close(): Promise<void>;
}

export interface ProviderOperationWorkerHostOptions {
  reconciliationIntervalMs?: number;
  drainBatchSize?: number;
  onError?: (error: unknown) => void;
}

const abortableDelay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) return resolve();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", finish);
    resolve();
  };
  const timer = setTimeout(finish, ms);
  signal.addEventListener("abort", finish, { once: true });
});

/**
 * Long-lived host for bounded provider-worker passes.
 * Queue notifications wake the host promptly; the bounded timeout is a
 * reconciliation safety net for delayed retries, lease expiry and missed
 * notifications. It is not the primary queue scheduler.
 */
export class ProviderOperationWorkerHost {
  private readonly reconciliationIntervalMs: number;
  private readonly drainBatchSize: number;

  constructor(
    private readonly worker: Pick<ProviderOperationWorker, "runOnce">,
    private readonly wakeSource: ProviderQueueWakeSource,
    private readonly options: ProviderOperationWorkerHostOptions = {},
  ) {
    this.reconciliationIntervalMs = options.reconciliationIntervalMs ?? 30_000;
    this.drainBatchSize = options.drainBatchSize ?? 10;
    if (!Number.isSafeInteger(this.drainBatchSize) || this.drainBatchSize < 1 || this.drainBatchSize > 100) {
      throw new Error("PROVIDER_WORKER_DRAIN_BATCH_SIZE_INVALID");
    }
    if (!Number.isSafeInteger(this.reconciliationIntervalMs)
      || this.reconciliationIntervalMs < 1_000
      || this.reconciliationIntervalMs > 300_000) {
      throw new Error("PROVIDER_WORKER_RECONCILIATION_INTERVAL_INVALID");
    }
    if (!worker || typeof worker.runOnce !== "function"
      || !wakeSource || typeof wakeSource.start !== "function"
      || typeof wakeSource.wait !== "function"
      || typeof wakeSource.close !== "function") {
      throw new Error("PROVIDER_WORKER_HOST_DEPENDENCIES_INVALID");
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    try {
      await this.wakeSource.start();
      while (!signal.aborted) {
        let result: ProviderOperationWorkerResult;
        try {
          result = await this.worker.runOnce(signal);
        } catch (error) {
          this.options.onError?.(error);
          if (signal.aborted) break;
          await abortableDelay(Math.min(this.reconciliationIntervalMs, 5_000), signal);
          continue;
        }
        if (signal.aborted) break;
        // A full batch may leave eligible work behind; drain it before sleeping.
        if (result.claimed >= this.drainBatchSize) continue;
        try {
          await this.wakeSource.wait(this.reconciliationIntervalMs, signal);
        } catch (error) {
          this.options.onError?.(error);
          if (!signal.aborted) {
            try {
              // Re-establish LISTEN before the next queue scan after a disconnect.
              await this.wakeSource.start();
            } catch (reconnectError) {
              this.options.onError?.(reconnectError);
              await abortableDelay(Math.min(this.reconciliationIntervalMs, 5_000), signal);
            }
          }
        }
      }
    } finally {
      await this.wakeSource.close();
    }
  }
}
