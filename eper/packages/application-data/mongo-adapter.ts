import { randomUUID } from "node:crypto";
import type { ApplicationDataAdapter, ApplicationDataContext, ApplicationDataModel, ApplicationDataQuery, ApplicationDataRecord, ApplicationDataRelationship } from "./contracts.js";
import { applicationDataCreateHash, applicationDataUpdateHash, applicationDataDeleteHash } from "./idempotency.js";

interface MongoResult { acknowledged?: boolean; matchedCount?: number; deletedCount?: number; }
interface MongoCursor<T> { sort(spec: Record<string, 1 | -1>): MongoCursor<T>; limit(value: number): MongoCursor<T>; toArray(): Promise<T[]>; }
interface MongoCollectionLike<T extends Record<string, unknown>> {
  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<T | null>;
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): MongoCursor<T>;
  insertOne(document: T, options?: Record<string, unknown>): Promise<MongoResult>;
  replaceOne(filter: Record<string, unknown>, document: T, options?: Record<string, unknown>): Promise<MongoResult>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<MongoResult>;
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<MongoResult>;
  deleteOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<MongoResult>;
  createIndex?(keys: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<string>;
}
export interface MongoSessionLike { withTransaction<T>(work: () => Promise<T>): Promise<T>; endSession(): Promise<void>; }
interface MongoDatabaseLike {
  collection<T extends Record<string, unknown>>(name: string): MongoCollectionLike<T>;
  client?: { startSession(): MongoSessionLike };
}
type StoredRecord = ApplicationDataRecord & Record<string, unknown> & { _id: string };
type StoredModel = ApplicationDataModel & Record<string, unknown> & { _id: string };
/** Provider-specific authorization must query MongoDB grants using the same session as the record operation. */
export type MongoWorkflowAuthorizer = (session: MongoSessionLike, context: ApplicationDataContext) => Promise<void>;
/** Structural types keep the official MongoDB driver optional. Transactions require a replica set or sharded cluster. */
export class MongoApplicationDataAdapter implements ApplicationDataAdapter {
  private readonly db: MongoDatabaseLike;
  private readonly authorizeWorkflowGrant?: MongoWorkflowAuthorizer;
  constructor(database: unknown, authorizeWorkflowGrant?: MongoWorkflowAuthorizer) {
    this.db = database as MongoDatabaseLike;
    this.authorizeWorkflowGrant = authorizeWorkflowGrant;
    if (!this.db?.client?.startSession) throw new Error("MONGODB_SESSION_SUPPORT_REQUIRED");
  }
  private async authorizeWorkflow(session: MongoSessionLike, context: ApplicationDataContext): Promise<void> {
    const hasWorkflowProvenance = Boolean(context.workflowRoleId || context.workflowPermission);
    if (!hasWorkflowProvenance) return;
    if (!context.workflowRoleId || !context.workflowPermission || !this.authorizeWorkflowGrant) {
      throw new Error("MONGODB_WORKFLOW_AUTHORIZATION_NOT_CONFIGURED");
    }
    await this.authorizeWorkflowGrant(session, context);
  }
  private async authorizedRead<T>(context: ApplicationDataContext, read: (session?: MongoSessionLike) => Promise<T>): Promise<T> {
    if (!context.workflowRoleId && !context.workflowPermission) return read();
    return this.transaction(async session => {
      await this.authorizeWorkflow(session, context);
      return read(session);
    });
  }
  private records() { return this.db.collection<StoredRecord>("eper_application_data_records"); }
  private models() { return this.db.collection<StoredModel>("eper_application_data_models"); }
  /** Run during deployment/bootstrap; the partial unique index is the cross-process guard for active schemas. */
  async ensureIndexes(): Promise<void> {
    const models = this.models();
    const createIndex = models.createIndex;
    if (!createIndex) throw new Error("MONGODB_INDEX_MANAGEMENT_REQUIRED");
    await createIndex.call(models, { tenantId:1, applicationId:1, entityType:1 }, {
      name:"eper_application_data_one_active_model",
      unique:true,
      partialFilterExpression:{ status:"ACTIVE" }
    });
  }
  private audits() { return this.db.collection<Record<string, unknown>>("eper_application_data_audit"); }
  private outbox() { return this.db.collection<Record<string, unknown>>("eper_application_data_outbox"); }
  private idempotency() { return this.db.collection<Record<string, unknown>>("eper_application_data_idempotency"); }
  private scope(t: string, a: string, e: string) { return { tenantId: t, applicationId: a, entityType: e }; }
  private key(parts: string[]): string { return JSON.stringify(parts); }
  private clean<T extends Record<string, unknown>>(value: T): Omit<T, "_id" | "_relationshipGuard"> {
    const { _id: _ignored, _relationshipGuard: _guard, ...rest } = value; return rest;
  }
  private async transaction<T>(work: (session: MongoSessionLike) => Promise<T>): Promise<T> {
    const session = this.db.client!.startSession();
    try { let result!: T; await session.withTransaction(async () => { result = await work(session); }); return result; }
    catch (error) {
      if (/Transaction numbers are only allowed|replica set|transactions are not supported/i.test(String(error))) throw new Error("MONGODB_TRANSACTIONS_UNAVAILABLE");
      throw error;
    } finally { await session.endSession(); }
  }
  /** A transactional write to each target document serializes relationship creation against target deletion. */
  private async lockRelationshipTargets(session: MongoSessionLike, c: ApplicationDataContext,
    relationships: ApplicationDataRelationship[] | undefined, data: Record<string, unknown>): Promise<void> {
    const targets: Array<{entityType:string; id:string; field:string}> = [];
    for (const relation of relationships ?? []) {
      const value=data[relation.field];
      if (value === undefined || value === null) continue;
      const ids=relation.cardinality === "one" ? [value] : value;
      if (!Array.isArray(ids) || ids.some(id=>typeof id !== "string")) throw new Error("APPLICATION_DATA_RELATIONSHIP_VALUE_INVALID:" + relation.field);
      for (const id of ids as string[]) targets.push({entityType:relation.targetEntity,id,field:relation.field});
    }
    targets.sort((a,b)=>a.entityType.localeCompare(b.entityType)||a.id.localeCompare(b.id));
    for (const targetRef of targets) {
      const targetId=this.key([c.tenantId,c.applicationId,targetRef.entityType,targetRef.id]);
      const result=await this.records().updateOne({_id:targetId},{$inc:{_relationshipGuard:1}},{session});
      if (!result.matchedCount) throw new Error("APPLICATION_DATA_RELATIONSHIP_TARGET_NOT_FOUND:" + targetRef.field);
    }
  }
  private async assertNotReferenced(session: MongoSessionLike, c: ApplicationDataContext, entityType: string, id: string): Promise<void> {
    const models=await this.models().find({tenantId:c.tenantId,applicationId:c.applicationId,status:{$in:["ACTIVE","RETIRED"]}},{session}).toArray();
    for (const model of models) {
      const relationships=(model.relationships ?? []) as ApplicationDataRelationship[];
      for (const relation of relationships.filter(item=>item.targetEntity===entityType)) {
        const filter:Record<string,unknown>={...this.scope(c.tenantId,c.applicationId,String(model.entityType))};
        filter[`data.${relation.field}`]=id;
        const rows=await this.records().find(filter,{session}).limit(1).toArray();
        if (rows.length) throw new Error("APPLICATION_DATA_RECORD_REFERENCED");
      }
    }
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
    await this.transaction(async session => {
      if (to === "ACTIVE") {
        await this.models().updateMany({ ...this.scope(t,a,e), status:"ACTIVE" }, { $set:{status:"RETIRED",updatedAt:new Date().toISOString()} }, {session});
      }
      const result=await this.models().updateOne({ _id:id,status:from }, { $set:{status:to,updatedAt:new Date().toISOString()} }, {session});
      if (!result.matchedCount) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_CONFLICT");
    });
  }
  async getIdempotentCreate(context: ApplicationDataContext, entityType: string, id: string, data: Record<string, unknown>): Promise<ApplicationDataRecord | undefined> {
    const key=context.idempotencyKey;
    if (!key) return undefined;
    return this.authorizedRead(context, async session => {
      const prior=await this.idempotency().findOne({_id:this.key([context.tenantId,context.applicationId,key])},session ? {session} : {});
      if (!prior) return undefined;
      const requestHash=applicationDataCreateHash({tenantId:context.tenantId,applicationId:context.applicationId,entityType,id,data});
      if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
      return prior.response as ApplicationDataRecord;
    });
  }
  async create(record: ApplicationDataRecord, context: ApplicationDataContext, relationships?: ApplicationDataRelationship[]): Promise<ApplicationDataRecord> {
    const key = context.idempotencyKey;
    const requestHash = key ? applicationDataCreateHash(record) : undefined;
    const idempotencyId = key ? this.key([context.tenantId,context.applicationId,key]) : undefined;
    try {
      return await this.transaction(async session => {
        await this.authorizeWorkflow(session, context);
        if (key && idempotencyId && requestHash) {
          const prior=await this.idempotency().findOne({_id:idempotencyId},{session});
          if (prior) {
            if (prior.requestHash !== requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
            return prior.response as ApplicationDataRecord;
          }
        }
        await this.lockRelationshipTargets(session,context,relationships,record.data);
        const id=this.key([record.tenantId,record.applicationId,record.entityType,record.id]);
        try { await this.records().insertOne({ ...record, _id:id }, { session }); }
        catch (error) { if ((error as { code?: number }).code === 11000) throw new Error("APPLICATION_DATA_RECORD_EXISTS"); throw error; }
        await this.evidence(session,context,"APPLICATION_DATA_CREATED",record);
        if (key && idempotencyId && requestHash) {
          try {
            await this.idempotency().insertOne({_id:idempotencyId,tenantId:context.tenantId,applicationId:context.applicationId,
              idempotencyKey:key,requestHash,response:record,createdAt:new Date().toISOString()},{session});
          } catch (error) {
            if ((error as {code?:number}).code === 11000) throw new Error("APPLICATION_DATA_IDEMPOTENCY_RACE");
            throw error;
          }
        }
        return record;
      });
    } catch (error) {
      const replayableRace = error instanceof Error &&
        (error.message === "APPLICATION_DATA_IDEMPOTENCY_RACE" || error.message === "APPLICATION_DATA_RECORD_EXISTS");
      if (!replayableRace || !idempotencyId || !requestHash) throw error;
      const prior=await this.idempotency().findOne({_id:idempotencyId});
      if (!prior) throw error;
      if (prior.requestHash !== requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
      return prior.response as ApplicationDataRecord;
    }
  }
  async get(c: ApplicationDataContext, e: string, id: string): Promise<ApplicationDataRecord | undefined> {
    const read = async (session?: MongoSessionLike) => {
      const r=await this.records().findOne({ _id:this.key([c.tenantId,c.applicationId,e,id]), ...this.scope(c.tenantId,c.applicationId,e) },
        session ? {session} : {});
      return r ? this.clean(r) as unknown as ApplicationDataRecord : undefined;
    };
    if (!c.workflowRoleId && !c.workflowPermission) return read();
    return this.transaction(async session => { await this.authorizeWorkflow(session,c); return read(session); });
  }
  async getIdempotentUpdate(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord | undefined> {
    const key=c.idempotencyKey;
    if (!key) return undefined;
    return this.authorizedRead(c, async session => {
      const prior=await this.idempotency().findOne({_id:this.key([c.tenantId,c.applicationId,key])},session ? {session} : {});
      if (!prior) return undefined;
      const requestHash=applicationDataUpdateHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected,patch});
      if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
      return prior.response as ApplicationDataRecord;
    });
  }
  async update(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }, relationships?: ApplicationDataRelationship[]): Promise<ApplicationDataRecord> {
    const key=c.idempotencyKey;
    const requestHash=key ? applicationDataUpdateHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected,patch}) : undefined;
    const idempotencyId=key ? this.key([c.tenantId,c.applicationId,key]) : undefined;
    try {
      return await this.transaction(async session => {
        await this.authorizeWorkflow(session, c);
        if (key && requestHash && idempotencyId) {
          const prior=await this.idempotency().findOne({_id:idempotencyId},{session});
          if (prior) {
            if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
            return prior.response as ApplicationDataRecord;
          }
        }
        if (patch.data) await this.lockRelationshipTargets(session,c,relationships,patch.data);
        const _id=this.key([c.tenantId,c.applicationId,e,id]);
        const current=await this.records().findOne({ _id, version:expected },{session});
        if (!current) {
          const exists=await this.records().findOne({ _id },{session});
          throw new Error(exists ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND");
        }
        const next={ ...current, ...patch, version:expected+1, updatedAt:new Date().toISOString() };
        const replaced=await this.records().replaceOne({ _id, version:expected },next,{session});
        if (!replaced.matchedCount) throw new Error("APPLICATION_DATA_VERSION_CONFLICT");
        const saved=this.clean(next) as unknown as ApplicationDataRecord;
        await this.evidence(session,c,"APPLICATION_DATA_UPDATED",saved);
        if (key && requestHash && idempotencyId) {
          await this.idempotency().insertOne({_id:idempotencyId,tenantId:c.tenantId,applicationId:c.applicationId,
            idempotencyKey:key,requestHash,response:saved,createdAt:new Date().toISOString()},{session});
        }
        return saved;
      });
    } catch (error) {
      if ((error as {code?:number})?.code !== 11000 || !key || !requestHash || !idempotencyId) throw error;
      const prior=await this.idempotency().findOne({_id:idempotencyId});
      if (!prior) throw error;
      if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
      return prior.response as ApplicationDataRecord;
    }
  }
  async getIdempotentDelete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<boolean> {
    const idempotencyKey = c.idempotencyKey;
    if (!idempotencyKey) return false;
    return this.authorizedRead(c, async session => {
      const prior=await this.idempotency().findOne({_id:this.key([c.tenantId,c.applicationId,idempotencyKey])},session ? {session} : {});
      if (!prior) return false;
      const requestHash=applicationDataDeleteHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected});
      if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
      return !!prior.response && typeof prior.response==="object" && (prior.response as Record<string,unknown>).deleted===true;
    });
  }
  async delete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<void> {
    const key=c.idempotencyKey;
    const requestHash=key ? applicationDataDeleteHash({tenantId:c.tenantId,applicationId:c.applicationId,entityType:e,id,expectedVersion:expected}) : undefined;
    const idempotencyId=key ? this.key([c.tenantId,c.applicationId,key]) : undefined;
    try {
      await this.transaction(async session => {
        await this.authorizeWorkflow(session, c);
        if (key && requestHash && idempotencyId) {
          const prior=await this.idempotency().findOne({_id:idempotencyId},{session});
          if (prior) {
            if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
            if ((prior.response as Record<string,unknown>)?.deleted===true) return;
            throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
          }
        }
        const _id=this.key([c.tenantId,c.applicationId,e,id]);
        const current=await this.records().findOne({ _id,version:expected },{session});
        if (!current) {
          const exists=await this.records().findOne({ _id },{session});
          throw new Error(exists ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND");
        }
        const guard=await this.records().updateOne({_id},{$inc:{_relationshipGuard:1}},{session});
        if (!guard.matchedCount) throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND");
        await this.assertNotReferenced(session,c,e,id);
        const deleted=await this.records().deleteOne({ _id,version:expected },{session});
        if (!deleted.deletedCount) throw new Error("APPLICATION_DATA_VERSION_CONFLICT");
        await this.evidence(session,c,"APPLICATION_DATA_DELETED",this.clean(current) as unknown as ApplicationDataRecord);
        if (key && requestHash && idempotencyId) {
          try {
            await this.idempotency().insertOne({_id:idempotencyId,tenantId:c.tenantId,applicationId:c.applicationId,
              idempotencyKey:key,requestHash,response:{deleted:true},createdAt:new Date().toISOString()},{session});
          } catch (error) {
            if ((error as {code?:number}).code===11000) throw new Error("APPLICATION_DATA_IDEMPOTENCY_RACE");
            throw error;
          }
        }
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message!=="APPLICATION_DATA_IDEMPOTENCY_RACE" || !idempotencyId || !requestHash) throw error;
      const prior=await this.idempotency().findOne({_id:idempotencyId});
      if (!prior) throw error;
      if (prior.requestHash!==requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
      if ((prior.response as Record<string,unknown>)?.deleted!==true) throw error;
    }
  }
  async query(c: ApplicationDataContext, e: string, q: ApplicationDataQuery): Promise<ApplicationDataRecord[]> {
    const read = async (session?: MongoSessionLike) => {
      const rows=await this.records().find(
        { ...this.scope(c.tenantId,c.applicationId,e), ...(q.state ? {state:q.state}:{}), ...(q.afterId ? {id:{$gt:q.afterId}} : {}) },
        session ? {session} : {},
      ).sort({id:1}).limit(q.limit ?? 50).toArray();
      return rows.map(row=>this.clean(row) as unknown as ApplicationDataRecord);
    };
    if (!c.workflowRoleId && !c.workflowPermission) return read();
    return this.transaction(async session => { await this.authorizeWorkflow(session,c); return read(session); });
  }
}
