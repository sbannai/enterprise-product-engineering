import type { WorkflowOutboxEvent } from "./postgres-workflow-outbox-store.js";
import type { WorkflowOutboxDispatcher } from "./workflow-outbox-worker.js";
import { WorkflowOutboxDispatchNotApprovedError } from "./workflow-outbox-errors.js";

export interface ApprovedWorkflowOutboxDispatcher {
  /** Must resolve durable human approval for this exact event before dispatch. */
  authorizeDispatch(event: WorkflowOutboxEvent, signal?: AbortSignal): Promise<boolean>;
  /** Delivery is at-least-once; implementations must deduplicate by event.eventId. */
  dispatch(event: WorkflowOutboxEvent, signal?: AbortSignal): Promise<void>;
}

export function createApprovedWorkflowOutboxDispatcher(
  adapter: ApprovedWorkflowOutboxDispatcher,
): WorkflowOutboxDispatcher {
  if (!adapter || typeof adapter.authorizeDispatch !== "function" ||
      typeof adapter.dispatch !== "function") {
    throw new Error("WORKFLOW_OUTBOX_APPROVED_DISPATCHER_CONTRACT_INVALID");
  }

  return {
    async dispatch(event, signal) {
      if (await adapter.authorizeDispatch(event, signal) !== true) {
        throw new WorkflowOutboxDispatchNotApprovedError();
      }
      await adapter.dispatch(event, signal);
    },
  };
}
