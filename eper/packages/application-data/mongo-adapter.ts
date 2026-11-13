import { randomUUID } from "node:crypto";
import type { ApplicationDataAdapter, ApplicationDataContext, ApplicationDataModel, ApplicationDataQuery, ApplicationDataRecord } from "./contracts.js";

interface MongoResult { acknowledged?: boolean; matchedCount?: number; deletedCount?: number; }
interface MongoCursor<T> { sort(spec: Record<string, 1 | -1>): MongoCursor<T>; limit(value: number): MongoCursor<T>; toArray(): Promise<T[]>; }
interface MongoCollectionLike<T extends Record<string, unknown>> {
  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<T | null>;
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): MongoCursor<T>;
  insertOne(document: T, options?: Record<string, unknown>): Promise<MongoResult>;
  replaceOne(filter: Record<string, unknown>, document: T, options?: Record<string, unknown>): Promise<MongoResult>;
  deleteOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<MongoResult>;
}
interface MongoSessionLike { withTransaction<T>(work: () => Promise<T>): Promise<T>; endSession(): Promise<void>; }
interface MongoDatabaseLike {
  collection<T extends Record<string, unknown>>(name: string): MongoCollectionLike<T>;
  client?: { startSession(): MongoSessionLike };
}
type StoredRecord = ApplicationDataRecord & Record<string, unknown> & { _id: string };
type StoredModel = ApplicationDataModel & Record<string, unknown> & { _id: string };
/** Structural types keep the official MongoDB driver optional. Transactions require a replica set or sharded cluster. */
export class MongoApplicationDataAdapter implements ApplicationDataAdapter {
  private readonly db: MongoDatabaseLike;
  constructor(database: unknown) {
    this.db = database as MongoDatabaseLike;
    if (!this.db?.client?.startSession) throw new Error("MONGODB_SESSION_SUPPORT_REQUIRED");
  }
  private records() { return this.db.collection<StoredRecord>("eper_application_data_records"); }
  private models() { return this.db.collection<StoredModel>("eper_application_data_models"); }
  private audits() { return this.db.collection<Record<string, unknown>>("eper_application_data_audit"); }
  private outbox() { return this.db.collection<Record<string, unknown>>("eper_application_data_outbox"); }
  private scope(t: string, a: string, e: string) { return { tenantId: t, applicationId: a, entityType: e }; }
  private key(parts: string[]): string { return JSON.stringify(parts); }
  private clean<T extends Record<string, unknown>>(value: T): Omit<T, "_id"> {
    const { _id: _ignored, ...rest } = value; return rest;
  }
  private async transaction<T>(work: (session: MongoSessionLike) => Promise<T>): Promise<T> {
    const session = this.db.client!.startSession();
    try { let result!: T; await session.withTransaction(async () => { result = await work(session); }); return result; }
    catch (error) {
      if (/Transaction numbers are only allowed|replica set|transactions are not supported/i.test(String(error))) throw new Error("MONGODB_TRANSACTIONS_UNAVAILABLE");
      throw error;
    } finally { await session.endSession(); }
  }
  private async evidence(session: MongoSessionLike, c: ApplicationDataContext, action: string, r: ApplicationDataRecord): Promise<void> {
    const id = randomUUID(); const occurredAt = new Date().toISOString();
    const payload = { applicationId:r.applicationId, entityType:r.entityType, recordId:r.id, version:r.version };
    await this.audits().insertOne({ _id:id, tenantId:c.tenantId, applicationId:c.applicationId, requirementId:c.requirementId,
      action, actorId:c.actorId, correlationId:c.correlationId, occurredAt, payload }, { session });
    await this.outbox().insertOne({ _id:id, tenantId:c.tenantId, applicationId:c.applicationId, aggregateType:"application_data_record",
      aggregateId:r.id, eventType:action, correlationId:c.correlationId, payload, occurredAt, deliveredAt:null, attempts:0 }, { session });
  }
  async getModel(t: string, a: string, e: string, v?: number): Promise<ApplicationDataModel | undefined> {
    const r=await this.models().findOne({ _id:this.key([t,a,e,String(v ?? "latest")]), ...this.scope(t,a,e), ...(v === undefined ? {} : { version:v }) });
    if (r) return this.clean(r) as unknown as ApplicationDataModel;
    if (v !== undefined) return undefined;
    const latest = await this.models().find({ ...this.scope(t,a,e) }).sort({ version:-1 }).limit(1).toArray();
    return latest[0] ? this.clean(latest[0]) as unknown as ApplicationDataModel : undefined;
  }
  async getActiveModel(t: string, a: string, e: string): Promise<ApplicationDataModel | undefined> {
    const rows=await this.models().find({ ...this.scope(t,a,e), status:"ACTIVE" }).sort({version:-1}).limit(1).toArray();
    return rows[0] ? this.clean(rows[0]) as unknown as ApplicationDataModel : undefined;
  }
  async putModel(model: ApplicationDataModel): Promise<void> {
    await this.transaction(async session => {
      const id=this.key([model.tenantId,model.applicationId,model.entityType,String(model.version)]);
      try { await this.models().insertOne({ ...model, _id:id }, { session }); }
      catch (error) { if ((error as { code?: number }).code === 11000) throw new Error("APPLICATION_DATA_SCHEMA_VERSION_IMMUTABLE"); throw error; }
    });
  }
  async transitionModelStatus(t: string, a: string, e: string, v: number, from: ApplicationDataModel["status"], to: ApplicationDataModel["status"]): Promise<void> {
    if (!((from==="DRAFT"&&to==="ACTIVE")||(from==="ACTIVE"&&to==="RETIRED"))) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_INVALID");
    const id=this.key([t,a,e,String(v)]);
    const result=await this.models().replaceOne({ _id:id,status:from }, { ...(await this.models().findOne({_id:id}) ?? {}), status:to }, {});
    if (!result.matchedCount) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_CONFLICT");
  }
  async create(record: ApplicationDataRecord, context: ApplicationDataContext): Promise<ApplicationDataRecord> {
    return this.transaction(async session => {
      const id=this.key([record.tenantId,record.applicationId,record.entityType,record.id]);
      try { await this.records().insertOne({ ...record, _id:id }, { session }); }
      catch (error) { if ((error as { code?: number }).code === 11000) throw new Error("APPLICATION_DATA_RECORD_EXISTS"); throw error; }
      await this.evidence(session,context,"APPLICATION_DATA_CREATED",record); return record;
    });
  }
  async get(c: ApplicationDataContext, e: string, id: string): Promise<ApplicationDataRecord | undefined> {
    const r=await this.records().findOne({ _id:this.key([c.tenantId,c.applicationId,e,id]), ...this.scope(c.tenantId,c.applicationId,e) });
    return r ? this.clean(r) as unknown as ApplicationDataRecord : undefined;
  }
  async update(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord> {
    return this.transaction(async session => {
      const _id=this.key([c.tenantId,c.applicationId,e,id]);
      const current=await this.records().findOne({ _id, version:expected },{session});
      if (!current) {
        const exists=await this.records().findOne({ _id },{session});
        throw new Error(exists ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND");
      }
      const next={ ...current, ...patch, version:expected+1, updatedAt:new Date().toISOString() };
      await this.records().replaceOne({ _id, version:expected },next,{session});
      const saved=this.clean(next) as unknown as ApplicationDataRecord;
      await this.evidence(session,c,"APPLICATION_DATA_UPDATED",saved); return saved;
    });
  }
  async delete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<void> {
    await this.transaction(async session => {
      const _id=this.key([c.tenantId,c.applicationId,e,id]);
      const current=await this.records().findOne({ _id,version:expected },{session});
      if (!current) {
        const exists=await this.records().findOne({ _id },{session});
        throw new Error(exists ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND");
      }
      await this.records().deleteOne({ _id,version:expected },{session});
      await this.evidence(session,c,"APPLICATION_DATA_DELETED",this.clean(current) as unknown as ApplicationDataRecord);
    });
  }
  async query(c: ApplicationDataContext, e: string, q: ApplicationDataQuery): Promise<ApplicationDataRecord[]> {
    const rows=await this.records().find({ ...this.scope(c.tenantId,c.applicationId,e), ...(q.state ? {state:q.state}:{}), ...(q.afterId ? {id:{$gt:q.afterId}}:{}) })
      .sort({id:1}).limit(q.limit ?? 50).toArray();
    return rows.map(row=>this.clean(row) as unknown as ApplicationDataRecord);
  }
}
