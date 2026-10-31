import {
  PostgresWorkflowOutboxStore,
  type WorkflowOutboxContext,
  type WorkflowOutboxEvent,
} from "./postgres-workflow-outbox-store.js";

export interface WorkflowOutboxDispatcher {
  /** Dispatchers must treat eventId as an idempotency key (delivery is at-least-once). */
  dispatch(event: WorkflowOutboxEvent): Promise<void>;
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

  async runOnce(context: WorkflowOutboxContext, limit = 20): Promise<WorkflowOutboxRunResult> {
    const events = await this.store.claim(context, {
      workerId: this.options.workerId, limit, leaseSeconds: this.leaseSeconds,
    });
    const result: WorkflowOutboxRunResult = {
      claimed: events.length, delivered: 0, retried: 0, deadLettered: 0,
    };
    for (const event of events) {
      try {
        await this.dispatcher.dispatch(event);
        await this.store.markDelivered(context, event.eventId, this.options.workerId);
        result.delivered += 1;
      } catch (error) {
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
      }
    }
    return result;
  }
}
