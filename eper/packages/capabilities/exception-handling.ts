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

type ExceptionCreateInput = Omit<WorkflowException, "state" | "retryCount" | "updatedAt">;

export interface ExceptionStore {
  create(input: ExceptionCreateInput, beforeCommit?: (created: WorkflowException) => void): WorkflowException;
  get(tenantId: string, id: string): WorkflowException | undefined;
  transition(tenantId: string, id: string, patch: ExceptionPatch, beforeCommit?: (next: WorkflowException, current: WorkflowException) => void): WorkflowException;
  snapshot(): readonly WorkflowException[];
}

export class InMemoryExceptionStore implements ExceptionStore {
  private readonly exceptions = new Map<string, WorkflowException>();
  private readonly idempotency = new Map<string, string>();
  private readonly idempotencyFingerprints = new Map<string, string>();

  constructor(seed: readonly WorkflowException[] = []) {
    for (const value of seed) {
      const key = this.key(value.tenantId, value.id);
      const idem = this.idempotencyKey(value.tenantId, value.idempotencyKey);
      if (this.exceptions.has(key) || this.idempotency.has(idem)) throw new Error("EXCEPTION_SNAPSHOT_INVALID");
      this.exceptions.set(key, { ...value });
      this.idempotency.set(idem, value.id);
      this.idempotencyFingerprints.set(idem, this.fingerprint({ id: value.id, tenantId: value.tenantId, requirementId: value.requirementId, code: value.code, message: value.message, idempotencyKey: value.idempotencyKey, owner: value.owner, createdAt: value.createdAt }));
    }
  }

  snapshot(): readonly WorkflowException[] {
    return [...this.exceptions.values()].map(value => ({ ...value }));
  }

  private key(tenantId: string, id: string): string {
    return JSON.stringify([tenantId, id]);
  }

  private idempotencyKey(tenantId: string, key: string): string {
    return JSON.stringify([tenantId, key]);
  }

  private fingerprint(input: ExceptionCreateInput): string {
    return JSON.stringify({
      id: input.id,
      tenantId: input.tenantId,
      requirementId: input.requirementId,
      code: input.code,
      message: input.message,
      idempotencyKey: input.idempotencyKey,
      owner: input.owner ?? null,
      createdAt: input.createdAt,
    });
  }

  create(input: ExceptionCreateInput, beforeCommit?: (created: WorkflowException) => void): WorkflowException {
    if (!input.id || !input.tenantId || !input.requirementId || !input.code || !input.idempotencyKey || !input.createdAt) {
      throw new Error("EXCEPTION_CONTEXT_REQUIRED");
    }
    const scopedIdempotencyKey = this.idempotencyKey(input.tenantId, input.idempotencyKey);
    const fingerprint = this.fingerprint(input);
    if (this.idempotency.has(scopedIdempotencyKey)) {
      if (this.idempotencyFingerprints.get(scopedIdempotencyKey) !== fingerprint) {
        throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
      }
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
    beforeCommit?.({ ...value });
    this.exceptions.set(scopedId, value);
    this.idempotency.set(scopedIdempotencyKey, input.id);
    this.idempotencyFingerprints.set(scopedIdempotencyKey, fingerprint);
    return { ...value };
  }

  get(tenantId: string, id: string): WorkflowException | undefined {
    const value = this.exceptions.get(this.key(tenantId, id));
    return value ? { ...value } : undefined;
  }

  transition(
    tenantId: string,
    id: string,
    patch: ExceptionPatch,
    beforeCommit?: (next: WorkflowException, current: WorkflowException) => void,
  ): WorkflowException {
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
    beforeCommit?.({ ...next }, { ...current });
    this.exceptions.set(this.key(tenantId, id), next);
    return { ...next };
  }
}
