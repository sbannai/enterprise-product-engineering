export class WorkflowOutboxDispatchNotApprovedError extends Error {
  readonly code = "WORKFLOW_OUTBOX_DISPATCH_NOT_APPROVED";

  constructor() {
    super("WORKFLOW_OUTBOX_DISPATCH_NOT_APPROVED");
    this.name = "WorkflowOutboxDispatchNotApprovedError";
  }
}
