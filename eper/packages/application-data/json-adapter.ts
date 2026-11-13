import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { ApplicationDataAdapter, ApplicationDataContext, ApplicationDataModel, ApplicationDataQuery, ApplicationDataRecord } from "./contracts.js";

/** Local development/import-export adapter only. Not safe for concurrent processes or production transactions. */
export class JsonFileApplicationDataAdapter implements ApplicationDataAdapter {
  constructor(private readonly filePath: string) {}
  private async read(): Promise<{ models: ApplicationDataModel[]; records: ApplicationDataRecord[] }> {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!value || !Array.isArray(value.models) || !Array.isArray(value.records)) throw new Error();
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { models: [], records: [] };
      throw new Error("APPLICATION_DATA_FILE_INVALID");
    }
  }
  private async write(value: { models: ApplicationDataModel[]; records: ApplicationDataRecord[] }): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = this.filePath + ".tmp";
    await writeFile(temp, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    await rename(temp, this.filePath);
  }
  async getModel(t: string, a: string, e: string, v?: number) {
    return (await this.read()).models.find(m => m.tenantId === t && m.applicationId === a && m.entityType === e && (v === undefined || m.version === v));
  }
  async putModel(model: ApplicationDataModel): Promise<void> {
    const db = await this.read(); const i = db.models.findIndex(m => m.tenantId === model.tenantId && m.applicationId === model.applicationId && m.entityType === model.entityType && m.version === model.version);
    if (i < 0) db.models.push(model); else db.models[i] = model; await this.write(db);
  }
  async create(record: ApplicationDataRecord): Promise<ApplicationDataRecord> {
    const db = await this.read(); if (db.records.some(r => r.tenantId === record.tenantId && r.applicationId === record.applicationId && r.entityType === record.entityType && r.id === record.id)) throw new Error("APPLICATION_DATA_RECORD_EXISTS");
    db.records.push(record); await this.write(db); return record;
  }
  async get(c: ApplicationDataContext, e: string, id: string) { return (await this.read()).records.find(r => r.tenantId === c.tenantId && r.applicationId === c.applicationId && r.entityType === e && r.id === id); }
  async update(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord> {
    const db = await this.read(); const r = db.records.find(x => x.tenantId === c.tenantId && x.applicationId === c.applicationId && x.entityType === e && x.id === id);
    if (!r) throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND"); if (r.version !== expected) throw new Error("APPLICATION_DATA_VERSION_CONFLICT");
    Object.assign(r, patch, { version: r.version + 1, updatedAt: new Date().toISOString() }); await this.write(db); return r;
  }
  async delete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<void> {
    const db = await this.read(); const i = db.records.findIndex(x => x.tenantId === c.tenantId && x.applicationId === c.applicationId && x.entityType === e && x.id === id);
    if (i < 0) throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND"); if (db.records[i].version !== expected) throw new Error("APPLICATION_DATA_VERSION_CONFLICT");
    db.records.splice(i, 1); await this.write(db);
  }
  async query(c: ApplicationDataContext, e: string, q: ApplicationDataQuery): Promise<ApplicationDataRecord[]> {
    return (await this.read()).records.filter(r => r.tenantId === c.tenantId && r.applicationId === c.applicationId && r.entityType === e &&
      (!q.state || r.state === q.state) && (!q.afterId || r.id > q.afterId)).sort((a,b) => a.id.localeCompare(b.id)).slice(0, q.limit ?? 50);
  }
}
