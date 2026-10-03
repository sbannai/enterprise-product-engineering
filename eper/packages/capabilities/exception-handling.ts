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

  private key(tenantId: string, id: string): string {
    return JSON.stringify([tenantId, id]);
  }

  private idempotencyKey(tenantId: string, key: string): string {
    return JSON.stringify([tenantId, key]);
  }

  create(input: Omit<WorkflowException, "state" | "retryCount" | "updatedAt">): WorkflowException {
    if (!input.id || !input.tenantId || !input.requirementId || !input.code || !input.idempotencyKey) {
      throw new Error("EXCEPTION_CONTEXT_REQUIRED");
    }
    const scopedIdempotencyKey = this.idempotencyKey(input.tenantId, input.idempotencyKey);
    if (this.idempotency.has(scopedIdempotencyKey)) {
      return this.get(input.tenantId, this.idempotency.get(scopedIdempotencyKey)!)!;
    }
    const scopedId = this.key(input.tenantId, input.id);
    if (this.exceptions.has(scopedId)) throw new Error("EXCEPTION_ALREADY_EXISTS");

    const now = input.createdAt;
    const value: WorkflowException = {
      ...input,
      state: "OPEN",
      retryCount: 0,
      updatedAt: now,
    };
    this.exceptions.set(scopedId, value);
    this.idempotency.set(scopedIdempotencyKey, input.id);
    return { ...value };
  }

  get(tenantId: string, id: string): WorkflowException | undefined {
    const value = this.exceptions.get(this.key(tenantId, id));
    return value ? { ...value } : undefined;
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
    this.exceptions.set(this.key(tenantId, id), next);
    return { ...next };
  }
}
