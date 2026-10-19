export interface AuthoritativeRecord {
  id: string;
  tenantId: string;
  version: number;
  state: string;
  data: Record<string, unknown>;
}

export interface AuthoritativeRecordStore {
  create(record: AuthoritativeRecord): AuthoritativeRecord;
  get(tenantId: string, id: string): AuthoritativeRecord | undefined;
  update(tenantId: string, id: string, expectedVersion: number, patch: Partial<Pick<AuthoritativeRecord, "state" | "data">>): AuthoritativeRecord;
  delete(tenantId: string, id: string, expectedVersion: number): void;
}

export class InMemoryAuthoritativeRecordStore implements AuthoritativeRecordStore {
  private readonly records = new Map<string, AuthoritativeRecord>();

  private cloneData(data: Record<string, unknown>): Record<string, unknown> {
    try {
      const serialized = JSON.stringify(data);
      if (serialized === undefined) throw new Error("RECORD_DATA_NOT_SERIALIZABLE");
      return JSON.parse(serialized) as Record<string, unknown>;
    } catch {
      throw new Error("RECORD_DATA_NOT_SERIALIZABLE");
    }
  }

  private cloneRecord(record: AuthoritativeRecord): AuthoritativeRecord {
    return { ...record, data: this.cloneData(record.data) };
  }

  private key(tenantId: string, id: string): string {
    return JSON.stringify([tenantId, id]);
  }

  create(record: AuthoritativeRecord): AuthoritativeRecord {
    if (!record || typeof record !== "object" ||
      typeof record.id !== "string" || !record.id.trim() ||
      typeof record.tenantId !== "string" || !record.tenantId.trim() ||
      typeof record.state !== "string" || !record.state.trim()) {
      throw new Error("RECORD_CONTEXT_REQUIRED");
    }
    if (!Number.isInteger(record.version) || record.version < 1) {
      throw new Error("RECORD_VERSION_INVALID");
    }
    if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
      throw new Error("RECORD_DATA_INVALID");
    }
    const key = this.key(record.tenantId, record.id);
    if (this.records.has(key)) throw new Error("RECORD_ALREADY_EXISTS");
    const stored = this.cloneRecord(record);
    this.records.set(key, stored);
    return this.cloneRecord(stored);
  }

  get(tenantId: string, id: string): AuthoritativeRecord | undefined {
    const value = this.records.get(this.key(tenantId, id));
    return value ? this.cloneRecord(value) : undefined;
  }

  update(
    tenantId: string,
    id: string,
    expectedVersion: number,
    patch: Partial<Pick<AuthoritativeRecord, "state" | "data">>,
  ): AuthoritativeRecord {
    const key = this.key(tenantId, id);
    const current = this.records.get(key);
    if (!current) throw new Error("RECORD_NOT_FOUND");
    if (current.version !== expectedVersion) throw new Error("RECORD_VERSION_CONFLICT");
    const next: AuthoritativeRecord = {
      ...current,
      version: current.version + 1,
      state: patch.state ?? current.state,
      data: patch.data ? this.cloneData(patch.data) : this.cloneData(current.data),
    };
    this.records.set(key, next);
    return this.cloneRecord(next);
  }

  delete(tenantId: string, id: string, expectedVersion: number): void {
    const key = this.key(tenantId, id);
    const current = this.records.get(key);
    if (!current) throw new Error("RECORD_NOT_FOUND");
    if (current.version !== expectedVersion) throw new Error("RECORD_VERSION_CONFLICT");
    this.records.delete(key);
  }
}
