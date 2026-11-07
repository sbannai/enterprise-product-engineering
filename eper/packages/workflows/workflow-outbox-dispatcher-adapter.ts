import type { WorkflowOutboxEvent } from "./postgres-workflow-outbox-store.js";
import type { WorkflowOutboxDispatcher } from "./workflow-outbox-worker.js";
import { WorkflowOutboxDispatchNotApprovedError } from "./workflow-outbox-errors.js";

export interface ApprovedWorkflowOutboxDispatcher {
  /** Must resolve durable human approval for this exact event before dispatch. */
  authorizeDispatch(event: WorkflowOutboxEvent, signal?: AbortSignal): Promise<boolean>;
  /**
   * Must revalidate the same durable approval immediately before the external side effect,
   * because revocation can race the host's final pre-dispatch check. Must deduplicate by event.eventId.
   */
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
      // First check rejects already-revoked work before dispatch preparation.
      if (await adapter.authorizeDispatch(event, signal) !== true) {
        throw new WorkflowOutboxDispatchNotApprovedError();
      }
      // Recheck at the dispatch boundary; adapter.dispatch must still revalidate
      // immediately before its provider side effect to close the final TOCTOU window.
      if (await adapter.authorizeDispatch(event, signal) !== true) {
        throw new WorkflowOutboxDispatchNotApprovedError();
      }
      await adapter.dispatch(event, signal);
    },
  };
}
