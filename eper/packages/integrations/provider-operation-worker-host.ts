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

export type ProviderWorkerHostEvent =
  | { type: "host_started" }
  | { type: "worker_pass_completed"; claimed: number; succeeded: number; retried: number; needsAttention: number; leaseLost: number; recovered: number }
  | { type: "worker_pass_failed" }
  | { type: "wake_wait_started"; timeoutMs: number }
  | { type: "wake_source_reconnected" }
  | { type: "host_stopped" };

export interface ProviderOperationWorkerHostOptions {
  reconciliationIntervalMs?: number;
  drainBatchSize?: number;
  /** Emits bounded, non-sensitive operational facts; never pass raw errors or tenant data. */
  onEvent?: (event: ProviderWorkerHostEvent) => void;
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

  /** Telemetry must never become a dependency of queue execution. */
  private emit(event: ProviderWorkerHostEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {
      // Deliberately swallow exporter/callback failures; queue processing continues.
    }
  }

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
      this.emit({ type: "host_started" });
      while (!signal.aborted) {
        let result: ProviderOperationWorkerResult;
        try {
          result = await this.worker.runOnce(signal);
        } catch (error) {
          this.options.onError?.(error);
          this.emit({ type: "worker_pass_failed" });
          if (signal.aborted) break;
          await abortableDelay(Math.min(this.reconciliationIntervalMs, 5_000), signal);
          continue;
        }
        this.emit({
          type: "worker_pass_completed",
          claimed: result.claimed,
          succeeded: result.succeeded,
          retried: result.retried,
          needsAttention: result.needsAttention,
          leaseLost: result.leaseLost,
          recovered: result.recovered,
        });
        if (signal.aborted) break;
        // A full batch may leave eligible work behind; drain it before sleeping.
        if (result.claimed >= this.drainBatchSize) continue;
        try {
          this.emit({ type: "wake_wait_started", timeoutMs: this.reconciliationIntervalMs });
          await this.wakeSource.wait(this.reconciliationIntervalMs, signal);
        } catch (error) {
          this.options.onError?.(error);
          if (!signal.aborted) {
            try {
              // Re-establish LISTEN before the next queue scan after a disconnect.
              await this.wakeSource.start();
              this.emit({ type: "wake_source_reconnected" });
            } catch (reconnectError) {
              this.options.onError?.(reconnectError);
              await abortableDelay(Math.min(this.reconciliationIntervalMs, 5_000), signal);
            }
          }
        }
      }
    } finally {
      await this.wakeSource.close();
      this.emit({ type: "host_stopped" });
    }
  }
}
