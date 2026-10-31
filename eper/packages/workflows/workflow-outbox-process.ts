import type { WorkflowOutboxContext } from "./postgres-workflow-outbox-store.js";
import {
  WorkflowOutboxWorker,
  type WorkflowOutboxRunResult,
} from "./workflow-outbox-worker.js";

export interface WorkflowOutboxContextSource {
  /** Return only tenant/application scopes this worker is authorized to process. */
  listActiveContexts(signal?: AbortSignal): Promise<WorkflowOutboxContext[]>;
}

export interface WorkflowOutboxProcessOptions {
  batchSize?: number;
  idlePollMs?: number;
  maxContextsPerPass?: number;
  onPass?: (result: WorkflowOutboxRunResult & { contextsVisited: number }) => void;
  onError?: (error: unknown, context?: WorkflowOutboxContext) => void;
}

function validateOptions(options: WorkflowOutboxProcessOptions): Required<Pick<
  WorkflowOutboxProcessOptions, "batchSize" | "idlePollMs" | "maxContextsPerPass"
>> {
  const batchSize = options.batchSize ?? 20;
  const idlePollMs = options.idlePollMs ?? 1_000;
  const maxContextsPerPass = options.maxContextsPerPass ?? 1_000;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100 ||
      !Number.isSafeInteger(idlePollMs) || idlePollMs < 50 || idlePollMs > 60_000 ||
      !Number.isSafeInteger(maxContextsPerPass) || maxContextsPerPass < 1 || maxContextsPerPass > 10_000) {
    throw new Error("WORKFLOW_OUTBOX_PROCESS_OPTIONS_INVALID");
  }
  return { batchSize, idlePollMs, maxContextsPerPass };
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

/**
 * Long-running host worker. It continuously discovers authorized tenant/application
 * scopes and drains their outboxes; it does not depend on request traffic or cron
 * expressions. Delivery remains at-least-once, so dispatchers must deduplicate eventId.
 */
export class WorkflowOutboxProcess {
  private readonly options: ReturnType<typeof validateOptions>;

  constructor(
    private readonly worker: WorkflowOutboxWorker,
    private readonly contexts: WorkflowOutboxContextSource,
    options: WorkflowOutboxProcessOptions = {},
  ) {
    this.options = validateOptions(options);
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const total: WorkflowOutboxRunResult & { contextsVisited: number } = {
        claimed: 0, delivered: 0, retried: 0, deadLettered: 0, contextsVisited: 0,
      };
      try {
        const listed = await this.contexts.listActiveContexts(signal);
        if (!Array.isArray(listed) || listed.length > this.options.maxContextsPerPass) {
          throw new Error("WORKFLOW_OUTBOX_CONTEXT_SOURCE_INVALID");
        }
        const unique = new Map<string, WorkflowOutboxContext>();
        for (const context of listed) {
          if (!context || typeof context.tenantId !== "string" ||
              typeof context.applicationId !== "string") {
            throw new Error("WORKFLOW_OUTBOX_CONTEXT_SOURCE_INVALID");
          }
          unique.set(context.tenantId + "\u0000" + context.applicationId, context);
        }
        for (const context of unique.values()) {
          if (signal.aborted) break;
          total.contextsVisited += 1;
          try {
            const result = await this.worker.runOnce(context, this.options.batchSize);
            total.claimed += result.claimed;
            total.delivered += result.delivered;
            total.retried += result.retried;
            total.deadLettered += result.deadLettered;
          } catch (error) {
            try { this.options.onError?.(error, context); } catch { /* observability callbacks must not stop delivery */ }
          }
        }
      } catch (error) {
        try { this.options.onError?.(error); } catch { /* observability callbacks must not stop delivery */ }
      }
      try { this.options.onPass?.(total); } catch { /* observability callbacks must not stop delivery */ }
      if (!signal.aborted && total.claimed === 0) {
        await waitForNextPass(signal, this.options.idlePollMs);
      }
    }
  }
}
