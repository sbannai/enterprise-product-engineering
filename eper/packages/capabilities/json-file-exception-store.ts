import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { InMemoryExceptionStore, type ExceptionCreateInput, type ExceptionPatch, type ExceptionStore, type WorkflowException } from "./exception-handling.js";

/** Local durable adapter for isolated development/UAT. Not safe for concurrent writers. */
export class JsonFileExceptionStore implements ExceptionStore {
  constructor(private readonly filePath: string) {
    if (!filePath?.trim()) throw new Error("PERSISTENCE_PATH_REQUIRED");
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    try { readFileSync(filePath, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; this.commit([]); }
  }
  private read(): WorkflowException[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(parsed) || parsed.some(value => !value || typeof value.id !== "string" || typeof value.tenantId !== "string" || typeof value.idempotencyKey !== "string")) throw new Error();
      return parsed as WorkflowException[];
    } catch { throw new Error("PERSISTENCE_DATA_INVALID"); }
  }
  private commit(values: readonly WorkflowException[]): void {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(values), { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, this.filePath);
  }
  private transact<T>(action: (store: InMemoryExceptionStore) => T): T {
    const store = new InMemoryExceptionStore(this.read());
    const result = action(store);
    this.commit(store.snapshot());
    return result;
  }
  create(input: ExceptionCreateInput, beforeCommit?: (created: WorkflowException) => void): WorkflowException {
    return this.transact(store => store.create(input, beforeCommit));
  }
  get(tenantId: string, id: string): WorkflowException | undefined {
    return this.transactRead(store => store.get(tenantId, id));
  }
  transition(tenantId: string, id: string, patch: ExceptionPatch, beforeCommit?: (next: WorkflowException, current: WorkflowException) => void): WorkflowException {
    return this.transact(store => store.transition(tenantId, id, patch, beforeCommit));
  }
  snapshot(): readonly WorkflowException[] { return this.read().map(value => ({ ...value })); }
  private transactRead<T>(action: (store: InMemoryExceptionStore) => T): T {
    return action(new InMemoryExceptionStore(this.read()));
  }
}
