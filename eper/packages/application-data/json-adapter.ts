import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { ApplicationDataAdapter, ApplicationDataContext, ApplicationDataModel, ApplicationDataQuery, ApplicationDataRecord } from "./contracts.js";
import { applicationDataCreateHash, applicationDataUpdateHash, applicationDataDeleteHash } from "./idempotency.js";

/** Local development/import-export adapter only. Not safe for concurrent processes or production transactions. */
export class JsonFileApplicationDataAdapter implements ApplicationDataAdapter {
  constructor(private readonly filePath: string) {}
  private async read(): Promise<{ models: ApplicationDataModel[]; records: ApplicationDataRecord[]; idempotency: Array<{ tenantId:string; applicationId:string; key:string; requestHash:string; response:ApplicationDataRecord | { deleted: true } }> }> {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!value || !Array.isArray(value.models) || !Array.isArray(value.records)) throw new Error();
      return { ...value, idempotency: Array.isArray(value.idempotency) ? value.idempotency : [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { models: [], records: [], idempotency: [] };
      throw new Error("APPLICATION_DATA_FILE_INVALID");
    }
  }
  private async write(value: { models: ApplicationDataModel[]; records: ApplicationDataRecord[]; idempotency: Array<{ tenantId:string; applicationId:string; key:string; requestHash:string; response:ApplicationDataRecord }> }): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = this.filePath + ".tmp";
    await writeFile(temp, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    await rename(temp, this.filePath);
  }
  async getModel(t: string, a: string, e: string, v?: number) {
    return (await this.read()).models.find(m => m.tenantId === t && m.applicationId === a && m.entityType === e && (v === undefined || m.version === v));
  }
  async getActiveModel(t: string, a: string, e: string): Promise<ApplicationDataModel | undefined> {
    const db = await this.read();
    return db.models.filter(m => m.tenantId === t && m.applicationId === a && m.entityType === e && m.status === "ACTIVE")
      .sort((x,y) => y.version - x.version)[0];
  }
  async putModel(model: ApplicationDataModel): Promise<void> {
    const db = await this.read(); if (db.models.some(m => m.tenantId === model.tenantId && m.applicationId === model.applicationId && m.entityType === model.entityType && m.version === model.version)) throw new Error("APPLICATION_DATA_SCHEMA_VERSION_IMMUTABLE");
    db.models.push(model); await this.write(db);
  }
  async transitionModelStatus(t: string, a: string, e: string, v: number, from: ApplicationDataModel["status"], to: ApplicationDataModel["status"]): Promise<void> {
    if (!((from === "DRAFT" && to === "ACTIVE") || (from === "ACTIVE" && to === "RETIRED"))) {
      throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_INVALID");
    }
    const db = await this.read();
    const model = db.models.find(m => m.tenantId === t && m.applicationId === a && m.entityType === e && m.version === v);
    if (!model || model.status !== from) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_CONFLICT");
    if (to === "ACTIVE") {
      for (const active of db.models) if (active.tenantId === t && active.applicationId === a && active.entityType === e && active.status === "ACTIVE") active.status = "RETIRED";
    }
    model.status = to;
    await this.write(db);
  }
  async getIdempotentCreate(context: ApplicationDataContext, entityType: string, id: string, data: Record<string, unknown>): Promise<ApplicationDataRecord | undefined> {
    if (!context.idempotencyKey) return undefined;
    const db=await this.read();
    const prior=db.idempotency.find(item=>item.tenantId===context.tenantId&&item.applicationId===context.applicationId&&item.key===context.idempotencyKey);
    if (!prior) return undefined;
    const requestHash=applicationDataCreateHash({tenantId:context.tenantId,applicationId:context.applicationId,entityType,id,data});
    if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
    if (!prior.response || typeof prior.response!=="object" || "deleted" in prior.response) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
    return prior.response;
  }
  async create(record: ApplicationDataRecord, context: ApplicationDataContext): Promise<ApplicationDataRecord> {
    const db = await this.read();
    if (context.idempotencyKey) {
      const requestHash = applicationDataCreateHash(record);
      const prior = db.idempotency.find(item => item.tenantId === context.tenantId && item.applicationId === context.applicationId && item.key === context.idempotencyKey);
      if (prior) {
        if (prior.requestHash !== requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
        if (!prior.response || typeof prior.response!=="object" || "deleted" in prior.response) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
        return prior.response;
      }
      if (db.records.some(r => r.tenantId === record.tenantId && r.applicationId === record.applicationId && r.entityType === record.entityType && r.id === record.id)) throw new Error("APPLICATION_DATA_RECORD_EXISTS");
      db.records.push(record);
      db.idempotency.push({tenantId:context.tenantId,applicationId:context.applicationId,key:context.idempotencyKey,requestHash,response:record});
      await this.write(db); return record;
    }
    if (db.records.some(r => r.tenantId === record.tenantId && r.applicationId === record.applicationId && r.entityType === record.entityType && r.id === record.id)) throw new Error("APPLICATION_DATA_RECORD_EXISTS");
    db.records.push(record); await this.write(db); return record;
  }
  async get(c: ApplicationDataContext, e: string, id: string) { return (await this.read()).records.find(r => r.tenantId === c.tenantId && r.applicationId === c.applicationId && r.entityType === e && r.id === id); }
  async getIdempotentUpdate(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord | undefined> {
    if (!c.idempotencyKey) return undefined;
    const db=await this.read();
    const prior=db.idempotency.find(item=>item.tenantId===c.tenantId&&item.applicationId===c.applicationId&&item.key===c.idempotencyKey);
    if (!prior) return undefined;
    const requestHash=applicationDataUpdateHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected,patch});
    if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
    if (!prior.response || typeof prior.response!=="object" || "deleted" in prior.response) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
    return prior.response;
  }
  async update(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord> {
    const db = await this.read(); const r = db.records.find(x => x.tenantId === c.tenantId && x.applicationId === c.applicationId && x.entityType === e && x.id === id);
    if (!r) throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND"); if (r.version !== expected) throw new Error("APPLICATION_DATA_VERSION_CONFLICT");
    if (c.idempotencyKey) {
      const requestHash=applicationDataUpdateHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected,patch});
      const prior=db.idempotency.find(item=>item.tenantId===c.tenantId&&item.applicationId===c.applicationId&&item.key===c.idempotencyKey);
      if (prior) {
        if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
        if (!prior.response || typeof prior.response!=="object" || "deleted" in prior.response) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
        return prior.response;
      }
      Object.assign(r, patch, { version: r.version + 1, updatedAt: new Date().toISOString() });
      db.idempotency.push({tenantId:c.tenantId,applicationId:c.applicationId,key:c.idempotencyKey,requestHash,response:r});
    } else Object.assign(r, patch, { version: r.version + 1, updatedAt: new Date().toISOString() });
    await this.write(db); return r;
  }
  async getIdempotentDelete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<boolean> {
    if (!c.idempotencyKey) return false;
    const db=await this.read();
    const prior=db.idempotency.find(item=>item.tenantId===c.tenantId&&item.applicationId===c.applicationId&&item.key===c.idempotencyKey);
    if (!prior) return false;
    const requestHash=applicationDataDeleteHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected});
    if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
    return !!prior.response && typeof prior.response==="object" && "deleted" in prior.response && prior.response.deleted===true;
  }
  async delete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<void> {
    const db = await this.read(); const i = db.records.findIndex(x => x.tenantId === c.tenantId && x.applicationId === c.applicationId && x.entityType === e && x.id === id);
    if (i < 0) throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND"); if (db.records[i].version !== expected) throw new Error("APPLICATION_DATA_VERSION_CONFLICT");
    for (const model of db.models.filter(m => m.tenantId === c.tenantId && m.applicationId === c.applicationId && (m.status === "ACTIVE" || m.status === "RETIRED"))) {
      for (const relation of model.relationships ?? []) {
        if (relation.targetEntity !== e) continue;
        const referenced = db.records.some(record => record.tenantId === c.tenantId && record.applicationId === c.applicationId &&
          record.entityType === model.entityType && (relation.cardinality === "one" ? record.data[relation.field] === id :
            Array.isArray(record.data[relation.field]) && (record.data[relation.field] as unknown[]).includes(id)));
        if (referenced) throw new Error("APPLICATION_DATA_RECORD_REFERENCED");
      }
    }
    if (c.idempotencyKey) {
      const requestHash=applicationDataDeleteHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected});
      const prior=db.idempotency.find(item=>item.tenantId===c.tenantId&&item.applicationId===c.applicationId&&item.key===c.idempotencyKey);
      if (prior) {
        if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
        if (prior.response && typeof prior.response==="object" && "deleted" in prior.response && prior.response.deleted===true) return;
      }
      db.records.splice(i,1);
      if (!prior) db.idempotency.push({tenantId:c.tenantId,applicationId:c.applicationId,key:c.idempotencyKey,requestHash,response:{deleted:true}});
      await this.write(db); return;
    }
    db.records.splice(i, 1); await this.write(db);
  }
  async query(c: ApplicationDataContext, e: string, q: ApplicationDataQuery): Promise<ApplicationDataRecord[]> {
    return (await this.read()).records.filter(r => r.tenantId === c.tenantId && r.applicationId === c.applicationId && r.entityType === e &&
      (!q.state || r.state === q.state) && (!q.afterId || r.id > q.afterId)).sort((a,b) => a.id.localeCompare(b.id)).slice(0, q.limit ?? 50);
  }
}
