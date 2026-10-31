import {
  runWorkflowOutboxRuntime,
  type WorkflowOutboxRuntimeOptions,
} from "./workflow-outbox-runtime.js";

export type WorkflowOutboxHostSignal = "SIGINT" | "SIGTERM";

export interface WorkflowOutboxSignalHost {
  on(signal: WorkflowOutboxHostSignal, listener: () => void): unknown;
  off(signal: WorkflowOutboxHostSignal, listener: () => void): unknown;
}

/**
 * Adapts a host's process signals to the runtime AbortSignal contract.
 * The host remains responsible for restarting the process after an unexpected
 * exit; this helper guarantees graceful in-process shutdown and listener cleanup.
 */
export async function runWorkflowOutboxWorkerHost(
  options: WorkflowOutboxRuntimeOptions,
  signalHost: WorkflowOutboxSignalHost,
): Promise<void> {
  if (!signalHost || typeof signalHost.on !== "function" || typeof signalHost.off !== "function") {
    throw new Error("WORKFLOW_OUTBOX_SIGNAL_HOST_REQUIRED");
  }
  const controller = new AbortController();
  let shutdownRequested = false;
  let sigintRegistered = false;
  let sigtermRegistered = false;
  const requestShutdown = () => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    controller.abort();
  };
  try {
    signalHost.on("SIGINT", requestShutdown);
    sigintRegistered = true;
    signalHost.on("SIGTERM", requestShutdown);
    sigtermRegistered = true;
    await runWorkflowOutboxRuntime(options, controller.signal);
  } finally {
    if (sigtermRegistered) signalHost.off("SIGTERM", requestShutdown);
    if (sigintRegistered) signalHost.off("SIGINT", requestShutdown);
  }
}
