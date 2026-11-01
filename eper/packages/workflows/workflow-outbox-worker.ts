import {
  PostgresWorkflowOutboxStore,
  type WorkflowOutboxContext,
  type WorkflowOutboxEvent,
} from "./postgres-workflow-outbox-store.js";

export interface WorkflowOutboxDispatcher {
  /** Dispatchers must treat eventId as an idempotency key (delivery is at-least-once). */
  dispatch(event: WorkflowOutboxEvent, signal?: AbortSignal): Promise<void>;
}

export interface WorkflowOutboxWorkerOptions {
  workerId: string;
  maxAttempts?: number;
  baseRetryDelaySeconds?: number;
  maxRetryDelaySeconds?: number;
  leaseSeconds?: number;
}

export interface WorkflowOutboxRunResult {
  claimed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
  interrupted: number;
}

export class WorkflowOutboxRunError extends AggregateError {
  constructor(errors: unknown[], readonly result: WorkflowOutboxRunResult) {
    super(errors, "WORKFLOW_OUTBOX_CLAIM_PROCESSING_FAILED");
    this.name = "WorkflowOutboxRunError";
  }
}

class WorkflowOutboxLeaseLostError extends Error {
  constructor() {
    super("WORKFLOW_OUTBOX_LEASE_LOST");
    this.name = "WorkflowOutboxLeaseLostError";
  }
}

/** One bounded worker pass; scheduling/lifecycle is owned by the host worker process. */
export class WorkflowOutboxWorker {
  private readonly maxAttempts: number;
  private readonly baseRetryDelaySeconds: number;
  private readonly maxRetryDelaySeconds: number;
  private readonly leaseSeconds: number;

  constructor(
    private readonly store: PostgresWorkflowOutboxStore,
    private readonly dispatcher: WorkflowOutboxDispatcher,
    private readonly options: WorkflowOutboxWorkerOptions,
  ) {
    if (typeof options.workerId !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(options.workerId)) {
      throw new Error("WORKFLOW_OUTBOX_WORKER_ID_INVALID");
    }
    this.maxAttempts = options.maxAttempts ?? 8;
    this.baseRetryDelaySeconds = options.baseRetryDelaySeconds ?? 5;
    this.maxRetryDelaySeconds = options.maxRetryDelaySeconds ?? 3600;
    this.leaseSeconds = options.leaseSeconds ?? 60;
    if (!Number.isSafeInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 100 ||
        !Number.isSafeInteger(this.baseRetryDelaySeconds) || this.baseRetryDelaySeconds < 0 || this.baseRetryDelaySeconds > 86_400 ||
        !Number.isSafeInteger(this.maxRetryDelaySeconds) || this.maxRetryDelaySeconds < this.baseRetryDelaySeconds || this.maxRetryDelaySeconds > 86_400 ||
        !Number.isSafeInteger(this.leaseSeconds) || this.leaseSeconds < 10 || this.leaseSeconds > 3600) {
      throw new Error("WORKFLOW_OUTBOX_WORKER_OPTIONS_INVALID");
    }
  }

  async runOnce(context: WorkflowOutboxContext, limit = 20, signal?: AbortSignal): Promise<WorkflowOutboxRunResult> {
    const events = await this.store.claim(context, {
      workerId: this.options.workerId, limit, leaseSeconds: this.leaseSeconds,
      maxAttempts: this.maxAttempts,
    });
    const result: WorkflowOutboxRunResult = {
      claimed: events.length, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 0, interrupted: 0,
    };
    // Start every claim immediately, but do not let one bookkeeping failure detach sibling work.
    const settled = await Promise.allSettled(
      events.map(event => this.processClaim(context, event, result, signal)),
    );
    const failures = settled.filter(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    if (failures.length > 0) {
      throw new WorkflowOutboxRunError(failures.map(item => item.reason), { ...result });
    }
    return result;
  }

  private async processClaim(
    context: WorkflowOutboxContext,
    event: WorkflowOutboxEvent,
    result: WorkflowOutboxRunResult,
    shutdownSignal?: AbortSignal,
  ): Promise<void> {
    const controller = new AbortController();
    let leaseLost = false;
    let shutdownRequested = shutdownSignal?.aborted ?? false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const requestShutdown = () => {
      shutdownRequested = true;
      if (heartbeat) clearInterval(heartbeat);
      controller.abort(shutdownSignal?.reason ?? new Error("WORKFLOW_OUTBOX_SHUTDOWN"));
    };
    if (shutdownSignal) {
      shutdownSignal.addEventListener("abort", requestShutdown, { once: true });
      // Close the race between the initial aborted read and listener registration.
      if (shutdownSignal.aborted) requestShutdown();
    }
    let renewalInFlight: Promise<void> | null = null;
    const heartbeatMs = Math.max(1_000, Math.floor(this.leaseSeconds * 1_000 / 3));
    if (!shutdownRequested) heartbeat = setInterval(() => {
      if (shutdownRequested || renewalInFlight || leaseLost) return;
      renewalInFlight = (async () => {
        try {
          const renewed = await this.store.renewLease(
            context, event.eventId, this.options.workerId, this.leaseSeconds,
          );
          if (!renewed) {
            leaseLost = true;
            controller.abort(new WorkflowOutboxLeaseLostError());
          }
        } catch (error) {
          leaseLost = true;
          controller.abort(error);
        }
      })().finally(() => { renewalInFlight = null; });
    }, heartbeatMs);

    try {
      if (shutdownRequested) {
        result.interrupted += 1;
        return;
      }
      await this.dispatcher.dispatch(event, controller.signal);
      if (shutdownRequested) {
        result.interrupted += 1;
        return;
      }
      // Stop scheduling renewals before acknowledging; an interval tick must not race markDelivered.
      if (heartbeat) clearInterval(heartbeat);
      if (renewalInFlight) await renewalInFlight;
      if (leaseLost) throw new WorkflowOutboxLeaseLostError();
      await this.store.markDelivered(context, event.eventId, this.options.workerId);
      result.delivered += 1;
    } catch (error) {
      if (heartbeat) clearInterval(heartbeat);
      if (renewalInFlight) await renewalInFlight;
      if (shutdownRequested) {
        // Preserve the claimed row for lease-expiry recovery; cancellation may leave provider outcome ambiguous.
        result.interrupted += 1;
        return;
      }
      if (leaseLost || error instanceof WorkflowOutboxLeaseLostError) {
        // Ownership is gone: do not acknowledge or mutate a lease now owned by another worker.
        result.leaseLost += 1;
        return;
      }
      const message = error instanceof Error ? error.message : "WORKFLOW_OUTBOX_DISPATCH_FAILED";
      const delay = Math.min(
        this.baseRetryDelaySeconds * (2 ** Math.max(0, event.attempts - 1)),
        this.maxRetryDelaySeconds,
      );
      const failure = await this.store.markFailed(context, event.eventId, {
        workerId: this.options.workerId, maxAttempts: this.maxAttempts,
        retryDelaySeconds: delay, error: message,
      });
      if (failure.status === "dead_letter") result.deadLettered += 1;
      else result.retried += 1;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (renewalInFlight) await renewalInFlight;
      shutdownSignal?.removeEventListener("abort", requestShutdown);
    }
  }
}
