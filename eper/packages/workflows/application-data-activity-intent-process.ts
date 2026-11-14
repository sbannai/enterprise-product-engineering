import type { ApplicationDataActivityIntentWorker } from "./application-data-activity-intent-worker.js";
import type { WorkflowOutboxContext, WorkflowOutboxContextSource } from "./workflow-outbox-process.js";

export interface ApplicationDataActivityIntentProcessOptions {
  idlePollMs?: number;
  maxContextsPerPass?: number;
  onPass?: (result: { contextsVisited: number; succeeded: number; idle: number; retrying: number; deadLettered: number; errors: number }) => void;
  onError?: (error: unknown, context?: WorkflowOutboxContext) => void;
}
function waitForNextPass(signal: AbortSignal, milliseconds: number): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** Long-running host loop for durable application-data activity intents. */
export class ApplicationDataActivityIntentProcess {
  private readonly idlePollMs: number;
  private readonly maxContextsPerPass: number;
  constructor(
    private readonly worker: ApplicationDataActivityIntentWorker,
    private readonly contexts: WorkflowOutboxContextSource,
    private readonly options: ApplicationDataActivityIntentProcessOptions = {},
  ) {
    this.idlePollMs = options.idlePollMs ?? 1_000;
    this.maxContextsPerPass = options.maxContextsPerPass ?? 1_000;
    if (!Number.isSafeInteger(this.idlePollMs) || this.idlePollMs < 50 || this.idlePollMs > 60_000 ||
        !Number.isSafeInteger(this.maxContextsPerPass) || this.maxContextsPerPass < 1 ||
        this.maxContextsPerPass > 10_000) {
      throw new Error("WORKFLOW_APPLICATION_DATA_INTENT_PROCESS_OPTIONS_INVALID");
    }
  }

  async run(signal: AbortSignal): Promise<void> {
    if (!signal || typeof signal.aborted !== "boolean") {
      throw new Error("WORKFLOW_APPLICATION_DATA_INTENT_ABORT_SIGNAL_REQUIRED");
    }
    while (!signal.aborted) {
      const total = { contextsVisited: 0, succeeded: 0, idle: 0, retrying: 0, deadLettered: 0, errors: 0 };
      try {
        const listed = await this.contexts.listActiveContexts(signal);
        if (!Array.isArray(listed) || listed.length > this.maxContextsPerPass) {
          throw new Error("WORKFLOW_APPLICATION_DATA_INTENT_CONTEXT_SOURCE_INVALID");
        }
        const unique = new Map<string, WorkflowOutboxContext>();
        for (const context of listed) {
          if (!context || typeof context.tenantId !== "string" || !context.tenantId ||
              typeof context.applicationId !== "string" || !context.applicationId) {
            throw new Error("WORKFLOW_APPLICATION_DATA_INTENT_CONTEXT_SOURCE_INVALID");
          }
          unique.set(context.tenantId + "\u0000" + context.applicationId, context);
        }
        for (const context of unique.values()) {
          if (signal.aborted) break;
          total.contextsVisited += 1;
          try {
            const result = await this.worker.runOnce(context.tenantId, context.applicationId);
            if (result.status === "succeeded") total.succeeded += 1;
            else if (result.status === "retrying") total.retrying += 1;
            else if (result.status === "dead_letter") total.deadLettered += 1;
            else total.idle += 1;
          } catch (error) {
            total.errors += 1;
            try { this.options.onError?.(error, context); } catch { /* telemetry must not stop execution */ }
          }
        }
      } catch (error) {
        total.errors += 1;
        try { this.options.onError?.(error); } catch { /* telemetry must not stop execution */ }
      }
      try { this.options.onPass?.(total); } catch { /* telemetry must not stop execution */ }
      if (!signal.aborted) await waitForNextPass(signal, this.idlePollMs);
    }
  }
}
