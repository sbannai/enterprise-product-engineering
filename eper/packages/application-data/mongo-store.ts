import { randomUUID } from "node:crypto";
import type {
  ApplicationDataActorContext, ApplicationDataModel, ApplicationDataRecord, ApplicationDataRecordFilter,
  ApplicationDataScope, ApplicationDataStore,
} from "./types.js";
import { digest, validateApplicationDataScope } from "./validation.js";

/** Minimal structural contracts; a MongoDB driver's Db and ClientSession satisfy these at runtime. */
export interface MongoApplicationDataSession { withTransaction<T>(work:()=>Promise<T>):Promise<T|undefined>; endSession():Promise<void>; }
export interface MongoApplicationDataCursor<T> { sort(order:Record<string,1|-1>):MongoApplicationDataCursor<T>; limit(count:number):MongoApplicationDataCursor<T>; toArray():Promise<T[]>; }
export interface MongoApplicationDataCollection<T extends Record<string,unknown>> {
  findOne(filter:Record<string,unknown>,options?:Record<string,unknown>):Promise<T|null>;
  find(filter:Record<string,unknown>,options?:Record<string,unknown>):MongoApplicationDataCursor<T>;
  insertOne(document:T,options?:Record<string,unknown>):Promise<unknown>;
  replaceOne(filter:Record<string,unknown>,replacement:T,options?:Record<string,unknown>):Promise<{matchedCount:number;upsertedCount?:number}>;
  updateOne(filter:Record<string,unknown>,update:Record<string,unknown>,options?:Record<string,unknown>):Promise<{matchedCount:number;modifiedCount:number}>;
  createIndex(keys:Record<string,1|-1>,options?:Record<string,unknown>):Promise<unknown>;
}
export interface MongoApplicationDataDatabase { collection<T extends Record<string,unknown>>(name:string):MongoApplicationDataCollection<T>; }
export interface MongoApplicationDataClient { startSession():MongoApplicationDataSession; }

type Doc=Record<string,unknown>;
function scopeFilter(scope:ApplicationDataScope):Doc{return {tenantId:scope.tenantId,applicationId:scope.applicationId};}
function assertContext(scope:ApplicationDataScope,context:ApplicationDataActorContext):void{
  validateApplicationDataScope(scope);
  if(context.tenantId!==scope.tenantId||context.applicationId!==scope.applicationId)throw new Error("APPLICATION_DATA_CONTEXT_SCOPE_MISMATCH");
  for(const [name,value] of Object.entries({actorId:context.actorId,correlationId:context.correlationId,requirementId:context.requirementId,idempotencyKey:context.idempotencyKey}))
    if(typeof value!=="string"||!value.trim()||value.length>160)throw new Error("APPLICATION_DATA_CONTEXT_INVALID:"+name);
}
function modelDoc(row:Doc):ApplicationDataModel{return row as unknown as ApplicationDataModel;}
function recordDoc(row:Doc):ApplicationDataRecord{return row as unknown as ApplicationDataRecord;}

export class MongoApplicationDataStore implements ApplicationDataStore {
  private readonly models:MongoApplicationDataCollection<Doc>;
  private readonly records:MongoApplicationDataCollection<Doc>;
  private readonly audit:MongoApplicationDataCollection<Doc>;
  private readonly outbox:MongoApplicationDataCollection<Doc>;
  private readonly idempotency:MongoApplicationDataCollection<Doc>;
  constructor(private readonly database:MongoApplicationDataDatabase,private readonly client:MongoApplicationDataClient){
    this.models=database.collection("eper_application_data_models");
    this.records=database.collection("eper_application_data_records");
    this.audit=database.collection("eper_application_data_audit");
    this.outbox=database.collection("eper_application_data_outbox");
    this.idempotency=database.collection("eper_application_data_idempotency");
  }
  async ensureIndexes():Promise<void>{
    await this.models.createIndex({tenantId:1,applicationId:1,entityType:1,schemaVersion:-1},{unique:true,name:"eper_application_data_model_scope_version"});
    await this.records.createIndex({tenantId:1,applicationId:1,entityType:1,recordId:1},{unique:true,name:"eper_application_data_record_scope_id"});
    await this.records.createIndex({tenantId:1,applicationId:1,entityType:1,recordStatus:1,recordId:1},{name:"eper_application_data_record_query"});
    await this.audit.createIndex({tenantId:1,applicationId:1,auditId:1},{unique:true,name:"eper_application_data_audit_id"});
    await this.outbox.createIndex({tenantId:1,applicationId:1,eventId:1},{unique:true,name:"eper_application_data_event_id"});
    await this.idempotency.createIndex({tenantId:1,applicationId:1,key:1},{unique:true,name:"eper_application_data_idempotency_key"});
  }
  private async transaction<T>(work:(session:MongoApplicationDataSession)=>Promise<T>):Promise<T>{
    const session=this.client.startSession();
    try{let value:T|undefined;await session.withTransaction(async()=>{value=await work(session);return value;});
      if(value===undefined)throw new Error("APPLICATION_DATA_MONGO_TRANSACTION_RESULT_MISSING");return value;
    }finally{await session.endSession();}
  }
  private async once<T>(session:MongoApplicationDataSession,scope:ApplicationDataScope,context:ApplicationDataActorContext,fingerprint:string,work:()=>Promise<T>):Promise<T>{
    const filter={...scopeFilter(scope),key:context.idempotencyKey};
    const prior=await this.idempotency.findOne(filter,{session});
    if(prior){if(prior.fingerprint!==fingerprint)throw new Error("APPLICATION_DATA_IDEMPOTENCY_CONFLICT");return prior.result as T;}
    const result=await work();
    await this.idempotency.insertOne({...filter,fingerprint,result,createdAt:new Date().toISOString()},{session});
    return result;
  }
  private async evidence(session:MongoApplicationDataSession,scope:ApplicationDataScope,entityType:string,recordId:string|undefined,action:string,
    context:ApplicationDataActorContext,beforeVersion:number|undefined,afterVersion:number|undefined,payload:unknown):Promise<void>{
    const auditId=randomUUID(),occurredAt=new Date().toISOString(),payloadDigest=digest(payload);
    await this.audit.insertOne({ ...scopeFilter(scope),auditId,entityType,recordId,action,actorId:context.actorId,
      correlationId:context.correlationId,requirementId:context.requirementId,occurredAt,beforeVersion,afterVersion,payloadDigest},{session});
    await this.outbox.insertOne({...scopeFilter(scope),eventId:auditId,aggregateType:recordId?"application_data_record":"application_data_model",
      aggregateId:recordId??entityType,eventType:"application.data."+action.toLowerCase(),eventVersion:afterVersion??1,
      correlationId:context.correlationId,payload:{entityType,recordId,version:afterVersion,payloadDigest},occurredAt},{session});
  }
  async getModel(scope:ApplicationDataScope,entityType:string,schemaVersion?:number):Promise<ApplicationDataModel|null>{
    validateApplicationDataScope(scope);const filter={...scopeFilter(scope),entityType,...(schemaVersion===undefined?{status:"PUBLISHED"}:{schemaVersion})};
    const row=await this.models.findOne(filter,{sort:{schemaVersion:-1}});return row?modelDoc(row):null;
  }
  async listModels(scope:ApplicationDataScope):Promise<ApplicationDataModel[]>{
    validateApplicationDataScope(scope);return (await this.models.find(scopeFilter(scope)).sort({entityType:1,schemaVersion:-1}).toArray()).map(modelDoc);
  }
  async saveModel(scope:ApplicationDataScope,input:Omit<ApplicationDataModel,"tenantId"|"applicationId"|"schemaVersion"|"status"|"digest"|"createdAt"|"updatedAt"|"publishedAt"|"publishedBy">,
    expectedVersion:number,context:ApplicationDataActorContext):Promise<ApplicationDataModel>{
    assertContext(scope,context);const fingerprint=digest({operation:"saveModel",entityType:input.entityType,fields:input.fields,relationships:input.relationships,expectedVersion});
    return this.transaction(session=>this.once(session,scope,context,fingerprint,async()=>{
      const latest=await this.models.findOne({...scopeFilter(scope),entityType:input.entityType},{session,sort:{schemaVersion:-1}});
      const current=Number(latest?.schemaVersion??0);if(current!==expectedVersion)throw new Error("APPLICATION_DATA_MODEL_VERSION_CONFLICT");
      const now=new Date().toISOString(),model:ApplicationDataModel={...input,tenantId:scope.tenantId,applicationId:scope.applicationId,
        schemaVersion:current+1,status:"DRAFT",digest:digest({entityType:input.entityType,fields:input.fields,relationships:input.relationships??[]}),
        createdAt:now,updatedAt:now,createdBy:context.actorId,relationships:input.relationships??[]};
      await this.models.insertOne({...model},{session});await this.evidence(session,scope,input.entityType,undefined,"MODEL_SAVED",context,current||undefined,model.schemaVersion,{digest:model.digest});return model;
    }));
  }
  async publishModel(scope:ApplicationDataScope,entityType:string,expectedVersion:number,context:ApplicationDataActorContext):Promise<ApplicationDataModel>{
    assertContext(scope,context);const fingerprint=digest({operation:"publishModel",entityType,expectedVersion});
    return this.transaction(session=>this.once(session,scope,context,fingerprint,async()=>{
      const filter={...scopeFilter(scope),entityType,schemaVersion:expectedVersion,status:"DRAFT"};
      const row=await this.models.findOne(filter,{session});if(!row)throw new Error("APPLICATION_DATA_MODEL_NOT_FOUND");
      const publishedAt=new Date().toISOString(),published={...row,status:"PUBLISHED",publishedAt,publishedBy:context.actorId,updatedAt:publishedAt};
      const updated=await this.models.replaceOne(filter,published,{session});if(updated.matchedCount!==1)throw new Error("APPLICATION_DATA_MODEL_VERSION_CONFLICT");
      await this.evidence(session,scope,entityType,undefined,"MODEL_PUBLISHED",context,expectedVersion,expectedVersion,{digest:row.digest});return modelDoc(published);
    }));
  }
  async getRecord(scope:ApplicationDataScope,entityType:string,recordId:string):Promise<ApplicationDataRecord|null>{
    validateApplicationDataScope(scope);const row=await this.records.findOne({...scopeFilter(scope),entityType,recordId});return row?recordDoc(row):null;
  }
  async listRecords(scope:ApplicationDataScope,entityType:string,filter:ApplicationDataRecordFilter={}):Promise<ApplicationDataRecord[]>{
    validateApplicationDataScope(scope);const limit=filter.limit??50;if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error("APPLICATION_DATA_QUERY_LIMIT_INVALID");
    const query:Doc={...scopeFilter(scope),entityType,status:"ACTIVE"};
    if(filter.afterRecordId)query.recordId={$gt:filter.afterRecordId};
    for(const [key,value] of Object.entries(filter.equals??{}))query["data."+key]=value;
    return (await this.records.find(query).sort({recordId:1}).limit(limit).toArray()).map(recordDoc);
  }
  async createRecord(scope:ApplicationDataScope,entityType:string,data:Record<string,unknown>,context:ApplicationDataActorContext):Promise<ApplicationDataRecord>{
    assertContext(scope,context);const fingerprint=digest({operation:"createRecord",entityType,data});
    return this.transaction(session=>this.once(session,scope,context,fingerprint,async()=>{
      const model=await this.models.findOne({...scopeFilter(scope),entityType,status:"PUBLISHED"},{session,sort:{schemaVersion:-1}});
      if(!model)throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
      const now=new Date().toISOString(),record:ApplicationDataRecord={tenantId:scope.tenantId,applicationId:scope.applicationId,entityType,
        recordId:randomUUID(),schemaVersion:Number(model.schemaVersion),version:1,status:"ACTIVE",data:structuredClone(data),
        createdAt:now,updatedAt:now,createdBy:context.actorId,updatedBy:context.actorId};
      await this.records.insertOne({...record},{session});await this.evidence(session,scope,entityType,record.recordId,"RECORD_CREATED",context,undefined,1,data);return record;
    }));
  }
  async updateRecord(scope:ApplicationDataScope,entityType:string,recordId:string,expectedVersion:number,data:Record<string,unknown>,context:ApplicationDataActorContext):Promise<ApplicationDataRecord>{
    assertContext(scope,context);const fingerprint=digest({operation:"updateRecord",entityType,recordId,expectedVersion,data});
    return this.transaction(session=>this.once(session,scope,context,fingerprint,async()=>{
      const filter={...scopeFilter(scope),entityType,recordId};const current=await this.records.findOne(filter,{session});
      if(!current)throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND");if(Number(current.version)!==expectedVersion)throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      const model=await this.models.findOne({...scopeFilter(scope),entityType,status:"PUBLISHED"},{session,sort:{schemaVersion:-1}});
      if(!model)throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
      const updated:ApplicationDataRecord={...recordDoc(current),schemaVersion:Number(model.schemaVersion),version:expectedVersion+1,
        data:structuredClone(data),updatedAt:new Date().toISOString(),updatedBy:context.actorId};
      const result=await this.records.replaceOne({...filter,version:expectedVersion},{...updated},{session});
      if(result.matchedCount!==1)throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      await this.evidence(session,scope,entityType,recordId,"RECORD_UPDATED",context,expectedVersion,updated.version,data);return updated;
    }));
  }
  async deleteRecord(scope:ApplicationDataScope,entityType:string,recordId:string,expectedVersion:number,context:ApplicationDataActorContext):Promise<void>{
    assertContext(scope,context);const fingerprint=digest({operation:"archiveRecord",entityType,recordId,expectedVersion});
    await this.transaction(session=>this.once(session,scope,context,fingerprint,async()=>{
      const filter={...scopeFilter(scope),entityType,recordId,version:expectedVersion,status:"ACTIVE"};
      const current=await this.records.findOne(filter,{session});if(!current)throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      const updated=await this.records.updateOne(filter,{$set:{status:"ARCHIVED",version:expectedVersion+1,updatedAt:new Date().toISOString(),updatedBy:context.actorId}},{session});
      if(updated.matchedCount!==1)throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      await this.evidence(session,scope,entityType,recordId,"RECORD_ARCHIVED",context,expectedVersion,expectedVersion+1,{});return true;
    }));
  }
}
