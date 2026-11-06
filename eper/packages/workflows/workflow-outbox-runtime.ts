import type { AuditSqlPool } from "../audit/audit-event-store.js";
import { PostgresWorkflowOutboxContextSource } from "./postgres-workflow-outbox-context-source.js";
import { PostgresWorkflowOutboxStore } from "./postgres-workflow-outbox-store.js";
import {
  WorkflowOutboxProcess,
  type WorkflowOutboxProcessOptions,
} from "./workflow-outbox-process.js";
import {
  WorkflowOutboxWorker,
  type WorkflowOutboxDispatcher,
  type WorkflowOutboxWorkerOptions,
} from "./workflow-outbox-worker.js";

export interface WorkflowOutboxRuntimeOptions {
  /** Restricted platform-worker pool; never pass a request-scoped pool. */
  pool: AuditSqlPool;
  /** Explicit host-provided dispatcher. No default/no-op dispatcher is supplied. */
  dispatcher: WorkflowOutboxDispatcher;
  workerId: string;
  worker?: Omit<Partial<WorkflowOutboxWorkerOptions>, "workerId">;
  process?: WorkflowOutboxProcessOptions;
  /** Shared cap for database context discovery and per-pass processing. */
  maxContexts?: number;
}

/**
 * Composes the PostgreSQL stores, trusted scope discovery, worker and continuous
 * process loop. The host owns process supervision and supplies an AbortSignal
 * wired to its SIGTERM/SIGINT lifecycle. External dispatch remains disabled
 * unless the host explicitly supplies an approved dispatcher implementation.
 */
export function createWorkflowOutboxRuntime(options: WorkflowOutboxRuntimeOptions): WorkflowOutboxProcess {
  if (!options || !options.pool || typeof options.pool.connect !== "function") {
    throw new Error("WORKFLOW_OUTBOX_RUNTIME_POOL_REQUIRED");
  }
  if (!options.dispatcher || typeof options.dispatcher.dispatch !== "function") {
    throw new Error("WORKFLOW_OUTBOX_RUNTIME_DISPATCHER_REQUIRED");
  }
  const store = new PostgresWorkflowOutboxStore(options.pool);
  const processLimit = options.process?.maxContextsPerPass;
  if (options.maxContexts !== undefined && processLimit !== undefined && options.maxContexts !== processLimit) {
    throw new Error("WORKFLOW_OUTBOX_CONTEXT_LIMIT_MISMATCH");
  }
  const maxContexts = options.maxContexts ?? processLimit ?? 1_000;
  const contexts = new PostgresWorkflowOutboxContextSource(options.pool, maxContexts);
  const worker = new WorkflowOutboxWorker(store, options.dispatcher, {
    ...options.worker,
    workerId: options.workerId,
  });
  return new WorkflowOutboxProcess(worker, contexts, {
    ...options.process,
    maxContextsPerPass: maxContexts,
  });
}

/** Entry point for a host-managed long-running worker process. */
export async function runWorkflowOutboxRuntime(
  options: WorkflowOutboxRuntimeOptions,
  signal: AbortSignal,
): Promise<void> {
  if (!signal || typeof signal.aborted !== "boolean") {
    throw new Error("WORKFLOW_OUTBOX_RUNTIME_ABORT_SIGNAL_REQUIRED");
  }
  await createWorkflowOutboxRuntime(options).run(signal);
}
