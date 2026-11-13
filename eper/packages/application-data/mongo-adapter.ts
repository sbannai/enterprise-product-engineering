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
/** Structural types keep the official MongoDB driver optional for deployments that do not select this adapter. */
export class MongoApplicationDataAdapter implements ApplicationDataAdapter {
  constructor(private readonly db: MongoDatabaseLike) {
    if (!db.client?.startSession) throw new Error("MONGODB_SESSION_SUPPORT_REQUIRED");
  }
  private records() { return this.db.collection<ApplicationDataRecord & Record<string, unknown>>("eper_application_data_records"); }
  private models() { return this.db.collection<ApplicationDataModel & Record<string, unknown>>("eper_application_data_models"); }
  private scope(t: string, a: string, e: string) { return { tenantId: t, applicationId: a, entityType: e }; }
  private async transaction<T>(work: (session: MongoSessionLike) => Promise<T>): Promise<T> {
    const session = this.db.client!.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => { result = await work(session); });
      return result;
    } catch (error) {
      if (/Transaction numbers are only allowed|replica set|transactions are not supported/i.test(String(error))) throw new Error("MONGODB_TRANSACTIONS_UNAVAILABLE");
      throw error;
    } finally { await session.endSession(); }
  }
  async getModel(t: string, a: string, e: string, v?: number) {
    return this.models().findOne({ ...this.scope(t,a,e), ...(v === undefined ? {} : { version: v }) });
  }
  async putModel(model: ApplicationDataModel): Promise<void> {
    await this.transaction(async session => {
      await this.models().replaceOne({ ...this.scope(model.tenantId,model.applicationId,model.entityType), version: model.version }, model as ApplicationDataModel & Record<string, unknown>, { upsert: true, session });
    });
  }
  async create(record: ApplicationDataRecord): Promise<ApplicationDataRecord> {
    return this.transaction(async session => {
      try { await this.records().insertOne(record as ApplicationDataRecord & Record<string, unknown>, { session }); }
      catch (error) { if ((error as { code?: number }).code === 11000) throw new Error("APPLICATION_DATA_RECORD_EXISTS"); throw error; }
      return record;
    });
  }
  async get(c: ApplicationDataContext, e: string, id: string) {
    return this.records().findOne({ ...this.scope(c.tenantId,c.applicationId,e), id });
  }
  async update(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord> {
    return this.transaction(async session => {
      const filter = { ...this.scope(c.tenantId,c.applicationId,e), id, version: expected };
      const current = await this.records().findOne(filter, { session });
      if (!current) {
        const exists = await this.records().findOne({ ...this.scope(c.tenantId,c.applicationId,e), id }, { session });
        throw new Error(exists ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND");
      }
      const next = { ...current, ...patch, version: expected + 1, updatedAt: new Date().toISOString() };
      await this.records().replaceOne(filter, next as ApplicationDataRecord & Record<string, unknown>, { session });
      return next;
    });
  }
  async delete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<void> {
    await this.transaction(async session => {
      const result = await this.records().deleteOne({ ...this.scope(c.tenantId,c.applicationId,e), id, version: expected }, { session });
      if (result.deletedCount !== 1) {
        const exists = await this.records().findOne({ ...this.scope(c.tenantId,c.applicationId,e), id }, { session });
        throw new Error(exists ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND");
      }
    });
  }
  async query(c: ApplicationDataContext, e: string, q: ApplicationDataQuery): Promise<ApplicationDataRecord[]> {
    return this.records().find({ ...this.scope(c.tenantId,c.applicationId,e), ...(q.state ? { state: q.state } : {}), ...(q.afterId ? { id: { $gt: q.afterId } } : {}) })
      .sort({ id: 1 }).limit(q.limit ?? 50).toArray();
  }
}
