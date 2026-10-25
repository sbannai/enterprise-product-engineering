import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryExceptionStore, type ExceptionCreateInput, type ExceptionPatch, type ExceptionStore, type WorkflowException } from "./exception-handling.js";
import type { AuditEvidence, AuditEvidenceStore } from "./audit-evidence.js";

interface StateDocument {
  schemaVersion: 1;
  exceptions: WorkflowException[];
  lifecycleEvidence: AuditEvidence[];
}

/**
 * Single-process local/UAT adapter. Exception state and lifecycle evidence share
 * a JSON document, but each update is an atomic file replacement, not a database
 * transaction. Concurrent writers and crash-atomic state+audit commits are unsupported.
 */
export class JsonFileExceptionStore implements ExceptionStore, Pick<AuditEvidenceStore, "append" | "listByRequirement" | "verify"> {
  constructor(private readonly filePath: string) {
    if (!filePath?.trim()) throw new Error("PERSISTENCE_PATH_REQUIRED");
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    try { readFileSync(filePath, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.commitState({ schemaVersion: 1, exceptions: [], lifecycleEvidence: [] });
    }
  }

  private readState(): StateDocument {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      let state: StateDocument;
      if (Array.isArray(parsed)) {
        // Legacy array files are normalized, then pass through the same integrity checks.
        state = { schemaVersion: 1, exceptions: parsed as WorkflowException[], lifecycleEvidence: [] };
      } else {
        if (!parsed || typeof parsed !== "object") throw new Error();
        state = parsed as StateDocument;
        if (state.schemaVersion !== 1 || !Array.isArray(state.exceptions) || !Array.isArray(state.lifecycleEvidence)) throw new Error();
      }
      const allowedStates = ["OPEN", "RETRYING", "RESOLVED", "ESCALATED"];
      for (const item of state.exceptions) {
        if (!item || typeof item !== "object" || Array.isArray(item) ||
            typeof item.id !== "string" || !item.id.trim() ||
            typeof item.tenantId !== "string" || !item.tenantId.trim() ||
            typeof item.requirementId !== "string" || !item.requirementId.trim() ||
            typeof item.code !== "string" || !item.code.trim() ||
            typeof item.message !== "string" || !item.message.trim() ||
            typeof item.idempotencyKey !== "string" || !item.idempotencyKey.trim() ||
            typeof item.createdAt !== "string" || Number.isNaN(Date.parse(item.createdAt)) ||
            typeof item.updatedAt !== "string" || Number.isNaN(Date.parse(item.updatedAt)) ||
            !allowedStates.includes(item.state) ||
            !Number.isSafeInteger(item.retryCount) || item.retryCount < 0 ||
            (item.owner !== undefined && (typeof item.owner !== "string" || !item.owner.trim()))) throw new Error();
      }
      const evidenceKeys = new Set<string>();
      for (const entry of state.lifecycleEvidence) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
            typeof entry.id !== "string" || !entry.id.trim() ||
            typeof entry.tenantId !== "string" || !entry.tenantId.trim() ||
            typeof entry.requirementId !== "string" || !entry.requirementId.trim() ||
            typeof entry.principalId !== "string" || !entry.principalId.trim() ||
            typeof entry.correlationId !== "string" || !entry.correlationId.trim() ||
            typeof entry.action !== "string" || !entry.action.trim() ||
            typeof entry.occurredAt !== "string" || Number.isNaN(Date.parse(entry.occurredAt)) ||
            !entry.payload || typeof entry.payload !== "object" || Array.isArray(entry.payload) ||
            typeof entry.integrityHash !== "string" || !/^[a-f0-9]{64}$/.test(entry.integrityHash)) throw new Error();
        const uniqueKey = JSON.stringify([entry.tenantId, entry.id]);
        if (evidenceKeys.has(uniqueKey)) throw new Error();
        evidenceKeys.add(uniqueKey);
        const { integrityHash, ...material } = entry;
        if (createHash("sha256").update(this.auditMaterial(material)).digest("hex") !== integrityHash) throw new Error();
      }
      const exceptionKeys = new Set<string>();
      const idempotencyKeys = new Set<string>();
      for (const item of state.exceptions) {
        const exceptionKey = JSON.stringify([item.tenantId, item.id]);
        const idempotencyKey = JSON.stringify([item.tenantId, item.idempotencyKey]);
        if (exceptionKeys.has(exceptionKey) || idempotencyKeys.has(idempotencyKey)) throw new Error();
        exceptionKeys.add(exceptionKey);
        idempotencyKeys.add(idempotencyKey);
      }
      return state;
    } catch { throw new Error("PERSISTENCE_DATA_INVALID"); }
  }

  private commitState(state: StateDocument): void {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, this.filePath);
  }

  private commitExceptions(exceptions: readonly WorkflowException[]): void {
    const current = this.readState();
    this.commitState({ schemaVersion: 1, exceptions: exceptions.map(value => ({ ...value })), lifecycleEvidence: current.lifecycleEvidence });
  }

  private transact<T>(action: (store: InMemoryExceptionStore) => T): T {
    const store = new InMemoryExceptionStore(this.readState().exceptions);
    const result = action(store);
    this.commitExceptions(store.snapshot());
    return result;
  }

  create(input: ExceptionCreateInput, beforeCommit?: (created: WorkflowException) => void): WorkflowException {
    return this.transact(store => store.create(input, beforeCommit));
  }

  get(tenantId: string, id: string): WorkflowException | undefined {
    return new InMemoryExceptionStore(this.readState().exceptions).get(tenantId, id);
  }

  transition(tenantId: string, id: string, patch: ExceptionPatch, beforeCommit?: (next: WorkflowException, current: WorkflowException) => void): WorkflowException {
    return this.transact(store => store.transition(tenantId, id, patch, beforeCommit));
  }

  snapshot(): readonly WorkflowException[] {
    return this.readState().exceptions.map(value => ({ ...value }));
  }

  private auditMaterial(entry: Omit<AuditEvidence, "integrityHash">): string {
    const serialized = JSON.stringify(entry.payload);
    if (serialized === undefined) throw new Error("AUDIT_PAYLOAD_NOT_SERIALIZABLE");
    const payload = JSON.parse(serialized);
    return JSON.stringify({ id: entry.id, tenantId: entry.tenantId, requirementId: entry.requirementId,
      action: entry.action, principalId: entry.principalId, correlationId: entry.correlationId,
      occurredAt: entry.occurredAt, payload });
  }

  append(input: Omit<AuditEvidence, "integrityHash">): AuditEvidence {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        typeof input.id !== "string" || !input.id.trim() ||
        typeof input.tenantId !== "string" || !input.tenantId.trim() ||
        typeof input.requirementId !== "string" || !input.requirementId.trim() ||
        typeof input.principalId !== "string" || !input.principalId.trim() ||
        typeof input.correlationId !== "string" || !input.correlationId.trim()) {
      throw new Error("AUDIT_EVIDENCE_CONTEXT_REQUIRED");
    }
    if (typeof input.action !== "string" || !input.action.trim() ||
        typeof input.occurredAt !== "string" || !input.occurredAt.trim()) {
      throw new Error("AUDIT_EVIDENCE_FIELDS_REQUIRED");
    }
    if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error("AUDIT_EVIDENCE_TIMESTAMP_INVALID");
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) {
      throw new Error("AUDIT_PAYLOAD_INVALID");
    }
    const serializedPayload = JSON.stringify(input.payload);
    if (serializedPayload === undefined) throw new Error("AUDIT_PAYLOAD_NOT_SERIALIZABLE");
    const state = this.readState();
    if (state.lifecycleEvidence.some(entry => entry.tenantId === input.tenantId && entry.id === input.id)) throw new Error("AUDIT_EVIDENCE_ALREADY_EXISTS");
    const integrityHash = createHash("sha256").update(this.auditMaterial(input)).digest("hex");
    const entry = JSON.parse(JSON.stringify({ ...input, integrityHash })) as AuditEvidence;
    this.commitState({ ...state, lifecycleEvidence: [...state.lifecycleEvidence, entry] });
    return JSON.parse(JSON.stringify(entry)) as AuditEvidence;
  }

  listByRequirement(tenantId: string, requirementId: string): readonly AuditEvidence[] {
    return this.readState().lifecycleEvidence.filter(entry => entry.tenantId === tenantId && entry.requirementId === requirementId)
      .map(entry => JSON.parse(JSON.stringify(entry)) as AuditEvidence);
  }

  verify(entry: AuditEvidence): boolean {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.integrityHash || "")) return false;
    try {
      const { integrityHash, ...material } = entry;
      return createHash("sha256").update(this.auditMaterial(material)).digest("hex") === integrityHash;
    } catch { return false; }
  }
}
