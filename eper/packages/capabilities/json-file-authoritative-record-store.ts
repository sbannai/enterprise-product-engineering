import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AuthoritativeRecord, AuthoritativeRecordStore } from "./authoritative-records.js";

/**
 * Local durable adapter for isolated development/UAT. Each operation reloads
 * the JSON file and commits by atomic rename. This is not a multi-process or
 * distributed database; production deployments should use a transactional DB.
 */
export class JsonFileAuthoritativeRecordStore implements AuthoritativeRecordStore {
  constructor(private readonly filePath: string) {
    if (!filePath || !filePath.trim()) throw new Error("PERSISTENCE_PATH_REQUIRED");
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    try {
      readFileSync(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.commit([]);
    }
  }

  private key(tenantId: string, id: string): string {
    return JSON.stringify([tenantId, id]);
  }

  private read(): AuthoritativeRecord[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch {
      throw new Error("PERSISTENCE_DATA_INVALID");
    }
    if (!Array.isArray(parsed)) throw new Error("PERSISTENCE_DATA_INVALID");
    return parsed as AuthoritativeRecord[];
  }

  private commit(records: AuthoritativeRecord[]): void {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(records), { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporaryPath, this.filePath);
  }

  private clone(record: AuthoritativeRecord): AuthoritativeRecord {
    try {
      const data = JSON.parse(JSON.stringify(record.data));
      return { ...record, data };
    } catch {
      throw new Error("RECORD_DATA_NOT_SERIALIZABLE");
    }
  }

  create(record: AuthoritativeRecord): AuthoritativeRecord {
    const records = this.read();
    if (records.some(item => this.key(item.tenantId, item.id) === this.key(record.tenantId, record.id))) {
      throw new Error("RECORD_ALREADY_EXISTS");
    }
    const stored = this.clone(record);
    records.push(stored);
    this.commit(records);
    return this.clone(stored);
  }

  get(tenantId: string, id: string): AuthoritativeRecord | undefined {
    const record = this.read().find(item => this.key(item.tenantId, item.id) === this.key(tenantId, id));
    return record ? this.clone(record) : undefined;
  }

  update(
    tenantId: string,
    id: string,
    expectedVersion: number,
    patch: Partial<Pick<AuthoritativeRecord, "state" | "data">>,
  ): AuthoritativeRecord {
    const records = this.read();
    const index = records.findIndex(item => this.key(item.tenantId, item.id) === this.key(tenantId, id));
    if (index < 0) throw new Error("RECORD_NOT_FOUND");
    const current = records[index];
    if (current.version !== expectedVersion) throw new Error("RECORD_VERSION_CONFLICT");
    const next = this.clone({
      ...current,
      version: current.version + 1,
      state: patch.state ?? current.state,
      data: patch.data ?? current.data,
    });
    records[index] = next;
    this.commit(records);
    return this.clone(next);
  }

  delete(tenantId: string, id: string, expectedVersion: number): void {
    const records = this.read();
    const index = records.findIndex(item => this.key(item.tenantId, item.id) === this.key(tenantId, id));
    if (index < 0) throw new Error("RECORD_NOT_FOUND");
    if (records[index].version !== expectedVersion) throw new Error("RECORD_VERSION_CONFLICT");
    records.splice(index, 1);
    this.commit(records);
  }
}
