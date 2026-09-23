export type ExceptionState = "OPEN" | "RETRYING" | "RESOLVED" | "ESCALATED";

export interface WorkflowException {
  id: string;
  tenantId: string;
  requirementId: string;
  code: string;
  message: string;
  state: ExceptionState;
  retryCount: number;
  idempotencyKey: string;
  owner?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionPatch {
  state?: ExceptionState;
  owner?: string;
  message?: string;
}

export class InMemoryExceptionStore {
  private readonly exceptions = new Map<string, WorkflowException>();
  private readonly idempotency = new Map<string, string>();

  create(input: Omit<WorkflowException, "state" | "retryCount" | "updatedAt">): WorkflowException {
    if (!input.id || !input.tenantId || !input.requirementId || !input.code || !input.idempotencyKey) {
      throw new Error("EXCEPTION_CONTEXT_REQUIRED");
    }
    if (this.idempotency.has(input.idempotencyKey)) {
      return this.get(input.tenantId, this.idempotency.get(input.idempotencyKey)!)!;
    }
    if (this.exceptions.has(input.id)) throw new Error("EXCEPTION_ALREADY_EXISTS");

    const now = input.createdAt;
    const value: WorkflowException = {
      ...input,
      state: "OPEN",
      retryCount: 0,
      updatedAt: now,
    };
    this.exceptions.set(input.id, value);
    this.idempotency.set(input.idempotencyKey, input.id);
    return { ...value };
  }

  get(tenantId: string, id: string): WorkflowException | undefined {
    const value = this.exceptions.get(id);
    return value && value.tenantId === tenantId ? { ...value } : undefined;
  }

  transition(tenantId: string, id: string, patch: ExceptionPatch): WorkflowException {
    const current = this.get(tenantId, id);
    if (!current) throw new Error("EXCEPTION_NOT_FOUND");

    const allowed: Record<ExceptionState, readonly ExceptionState[]> = {
      OPEN: ["RETRYING", "RESOLVED", "ESCALATED"],
      RETRYING: ["RETRYING", "RESOLVED", "ESCALATED"],
      RESOLVED: [],
      ESCALATED: ["RESOLVED"],
    };
    if (patch.state && !allowed[current.state].includes(patch.state)) {
      throw new Error("EXCEPTION_INVALID_TRANSITION");
    }

    const next: WorkflowException = {
      ...current,
      state: patch.state ?? current.state,
      owner: patch.owner ?? current.owner,
      message: patch.message ?? current.message,
      retryCount: patch.state === "RETRYING" ? current.retryCount + 1 : current.retryCount,
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, next);
    return { ...next };
  }
}
