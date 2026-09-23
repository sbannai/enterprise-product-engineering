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

  private key(tenantId: string, id: string): string {
    return tenantId + ":" + id;
  }

  create(record: AuthoritativeRecord): AuthoritativeRecord {
    const key = this.key(record.tenantId, record.id);
    if (this.records.has(key)) throw new Error("RECORD_ALREADY_EXISTS");
    const stored = { ...record, data: { ...record.data } };
    this.records.set(key, stored);
    return { ...stored, data: { ...stored.data } };
  }

  get(tenantId: string, id: string): AuthoritativeRecord | undefined {
    const value = this.records.get(this.key(tenantId, id));
    return value ? { ...value, data: { ...value.data } } : undefined;
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
      data: patch.data ? { ...patch.data } : { ...current.data },
    };
    this.records.set(key, next);
    return { ...next, data: { ...next.data } };
  }

  delete(tenantId: string, id: string, expectedVersion: number): void {
    const key = this.key(tenantId, id);
    const current = this.records.get(key);
    if (!current) throw new Error("RECORD_NOT_FOUND");
    if (current.version !== expectedVersion) throw new Error("RECORD_VERSION_CONFLICT");
    this.records.delete(key);
  }
}
