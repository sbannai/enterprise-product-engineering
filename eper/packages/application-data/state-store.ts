import { randomUUID } from "node:crypto";
import type {
  ApplicationDataActorContext, ApplicationDataAuditEntry, ApplicationDataModel, ApplicationDataOutboxEvent,
  ApplicationDataRecord, ApplicationDataRecordFilter, ApplicationDataScope, ApplicationDataState, ApplicationDataStore,
} from "./types.js";
import { canonicalJson, digest, validateApplicationDataScope } from "./validation.js";

function emptyState(): ApplicationDataState {
  return { models: [], records: [], audit: [], outbox: [], idempotency: [] };
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function assertContext(scope: ApplicationDataScope, context: ApplicationDataActorContext): void {
  validateApplicationDataScope(scope);
  if (context.tenantId !== scope.tenantId || context.applicationId !== scope.applicationId) {
    throw new Error("APPLICATION_DATA_CONTEXT_SCOPE_MISMATCH");
  }
  for (const [name,value] of Object.entries({actorId:context.actorId,correlationId:context.correlationId,requirementId:context.requirementId,idempotencyKey:context.idempotencyKey})) {
    if (typeof value !== "string" || !value.trim() || value.length > 160) throw new Error("APPLICATION_DATA_CONTEXT_INVALID:" + name);
  }
}
function scoped(scope: ApplicationDataScope, entityType: string, recordId?: string): string {
  return JSON.stringify([scope.tenantId,scope.applicationId,entityType,recordId ?? null]);
}

export class StatefulApplicationDataStore implements ApplicationDataStore {
  protected state: ApplicationDataState;
  private queue: Promise<void> = Promise.resolve();

  constructor(initialState: ApplicationDataState = emptyState()) {
    this.state = clone(initialState);
    this.validateState(this.state);
  }

  protected async persist(_next: ApplicationDataState): Promise<void> {}

  protected async mutate<T>(work: (next: ApplicationDataState) => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      const next = clone(this.state);
      const result = await work(next);
      await this.persist(next);
      this.state = next;
      return clone(result);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  protected async read<T>(work: (state: ApplicationDataState) => T): Promise<T> {
    await this.queue;
    return clone(work(this.state));
  }

  private validateState(state: ApplicationDataState): void {
    if (!state || !Array.isArray(state.models) || !Array.isArray(state.records) ||
        !Array.isArray(state.audit) || !Array.isArray(state.outbox) || !Array.isArray(state.idempotency)) {
      throw new Error("APPLICATION_DATA_STATE_INVALID");
    }
    const recordKeys = new Set<string>();
    for (const record of state.records) {
      const key = scoped(record,record.entityType,record.recordId);
      if (recordKeys.has(key)) throw new Error("APPLICATION_DATA_STATE_DUPLICATE_RECORD");
      recordKeys.add(key);
    }
  }

  private appendEvidence(next: ApplicationDataState, scope: ApplicationDataScope, entityType: string,
    recordId: string | undefined, action: string, context: ApplicationDataActorContext,
    beforeVersion: number | undefined, afterVersion: number | undefined, payload: unknown): void {
    const occurredAt = new Date().toISOString();
    const auditId = randomUUID();
    const payloadDigest = digest(payload);
    const audit: ApplicationDataAuditEntry = {
      auditId, tenantId:scope.tenantId, applicationId:scope.applicationId, entityType,
      ...(recordId ? {recordId} : {}), action, actorId:context.actorId, correlationId:context.correlationId,
      requirementId:context.requirementId, occurredAt, ...(beforeVersion === undefined ? {} : {beforeVersion}),
      ...(afterVersion === undefined ? {} : {afterVersion}), payloadDigest,
    };
    next.audit.push(audit);
    const event: ApplicationDataOutboxEvent = {
      eventId: auditId, tenantId:scope.tenantId, applicationId:scope.applicationId,
      aggregateType: recordId ? "application_data_record" : "application_data_model",
      aggregateId: recordId ?? entityType, eventType: "application.data." + action.toLowerCase(),
      eventVersion: afterVersion ?? 1, correlationId:context.correlationId,
      payload:{entityType,...(recordId?{recordId}:{}),...(afterVersion===undefined?{}:{version:afterVersion}),payloadDigest},
      occurredAt,
    };
    next.outbox.push(event);
  }

  private replay<T>(state: ApplicationDataState, context: ApplicationDataActorContext, fingerprint: string): T | undefined {
    const prior = state.idempotency.find(item => item.tenantId===context.tenantId &&
      item.applicationId===context.applicationId && item.key===context.idempotencyKey);
    if (!prior) return undefined;
    if (prior.fingerprint !== fingerprint) throw new Error("APPLICATION_DATA_IDEMPOTENCY_CONFLICT");
    return clone(prior.result) as T;
  }

  private remember(state: ApplicationDataState, context: ApplicationDataActorContext, fingerprint: string, result: unknown): void {
    state.idempotency.push({tenantId:context.tenantId,applicationId:context.applicationId,key:context.idempotencyKey,fingerprint,result:clone(result)});
  }

  async getModel(scope: ApplicationDataScope, entityType: string, schemaVersion?: number): Promise<ApplicationDataModel | null> {
    validateApplicationDataScope(scope);
    return this.read(state => {
      const matches=state.models.filter(m=>m.tenantId===scope.tenantId&&m.applicationId===scope.applicationId&&m.entityType===entityType&&
        (schemaVersion===undefined||m.schemaVersion===schemaVersion));
      const selected=schemaVersion===undefined ? matches.filter(m=>m.status==="PUBLISHED").sort((a,b)=>b.schemaVersion-a.schemaVersion)[0]
        : matches.find(m=>m.schemaVersion===schemaVersion);
      return selected ?? null;
    });
  }

  async listModels(scope: ApplicationDataScope): Promise<ApplicationDataModel[]> {
    validateApplicationDataScope(scope);
    return this.read(state=>state.models.filter(m=>m.tenantId===scope.tenantId&&m.applicationId===scope.applicationId)
      .sort((a,b)=>a.entityType.localeCompare(b.entityType)||b.schemaVersion-a.schemaVersion));
  }

  async saveModel(scope: ApplicationDataScope, input: Omit<ApplicationDataModel,"tenantId"|"applicationId"|"schemaVersion"|"status"|"digest"|"createdAt"|"updatedAt"|"publishedAt"|"publishedBy">,
    expectedVersion: number, context: ApplicationDataActorContext): Promise<ApplicationDataModel> {
    assertContext(scope,context);
    if (!Number.isSafeInteger(expectedVersion)||expectedVersion<0) throw new Error("APPLICATION_DATA_MODEL_VERSION_INVALID");
    const fingerprint=digest({operation:"saveModel",entityType:input.entityType,fields:input.fields,relationships:input.relationships,expectedVersion});
    return this.mutate(next=>{
      const replay=this.replay<ApplicationDataModel>(next,context,fingerprint); if(replay)return replay;
      const versions=next.models.filter(m=>m.tenantId===scope.tenantId&&m.applicationId===scope.applicationId&&m.entityType===input.entityType);
      const current=versions.sort((a,b)=>b.schemaVersion-a.schemaVersion)[0];
      if((current?.schemaVersion??0)!==expectedVersion) throw new Error("APPLICATION_DATA_MODEL_VERSION_CONFLICT");
      const now=new Date().toISOString();
      const model:ApplicationDataModel={...clone(input),tenantId:scope.tenantId,applicationId:scope.applicationId,
        schemaVersion:expectedVersion+1,status:"DRAFT",digest:digest({entityType:input.entityType,fields:input.fields,relationships:input.relationships}),
        createdAt:now,updatedAt:now,createdBy:context.actorId};
      next.models.push(model);
      this.appendEvidence(next,scope,input.entityType,undefined,"MODEL_SAVED",context,current?.schemaVersion,model.schemaVersion,{digest:model.digest});
      this.remember(next,context,fingerprint,model);
      return model;
    });
  }

  async publishModel(scope: ApplicationDataScope, entityType: string, expectedVersion: number, context: ApplicationDataActorContext): Promise<ApplicationDataModel> {
    assertContext(scope,context);
    const fingerprint=digest({operation:"publishModel",entityType,expectedVersion});
    return this.mutate(next=>{
      const replay=this.replay<ApplicationDataModel>(next,context,fingerprint);if(replay)return replay;
      const model=next.models.find(m=>m.tenantId===scope.tenantId&&m.applicationId===scope.applicationId&&m.entityType===entityType&&m.schemaVersion===expectedVersion);
      if(!model)throw new Error("APPLICATION_DATA_MODEL_NOT_FOUND");
      if(model.status!=="DRAFT")throw new Error("APPLICATION_DATA_MODEL_ALREADY_PUBLISHED");
      const published={...model,status:"PUBLISHED" as const,publishedAt:new Date().toISOString(),publishedBy:context.actorId,updatedAt:new Date().toISOString()};
      next.models=next.models.map(m=>m===model?published:m);
      this.appendEvidence(next,scope,entityType,undefined,"MODEL_PUBLISHED",context,expectedVersion,expectedVersion,{digest:model.digest});
      this.remember(next,context,fingerprint,published);
      return published;
    });
  }

  async getRecord(scope: ApplicationDataScope, entityType: string, recordId: string): Promise<ApplicationDataRecord|null> {
    validateApplicationDataScope(scope);
    return this.read(state=>state.records.find(r=>r.tenantId===scope.tenantId&&r.applicationId===scope.applicationId&&r.entityType===entityType&&r.recordId===recordId)??null);
  }

  async listRecords(scope: ApplicationDataScope, entityType: string, filter: ApplicationDataRecordFilter = {}): Promise<ApplicationDataRecord[]> {
    validateApplicationDataScope(scope);
    const limit=filter.limit??50;
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error("APPLICATION_DATA_QUERY_LIMIT_INVALID");
    if(filter.equals && (!filter.equals||typeof filter.equals!=="object"||Array.isArray(filter.equals)||Object.keys(filter.equals).length>20))throw new Error("APPLICATION_DATA_QUERY_FILTER_INVALID");
    return this.read(state=>state.records.filter(r=>r.tenantId===scope.tenantId&&r.applicationId===scope.applicationId&&r.entityType===entityType&&r.status==="ACTIVE"&&
      (!filter.afterRecordId||r.recordId>filter.afterRecordId)&&Object.entries(filter.equals??{}).every(([k,v])=>r.data[k]===v))
      .sort((a,b)=>a.recordId.localeCompare(b.recordId)).slice(0,limit));
  }

  async createRecord(scope: ApplicationDataScope, entityType: string, data: Record<string,unknown>, context: ApplicationDataActorContext): Promise<ApplicationDataRecord> {
    assertContext(scope,context);
    const fingerprint=digest({operation:"createRecord",entityType,data});
    return this.mutate(next=>{
      const replay=this.replay<ApplicationDataRecord>(next,context,fingerprint);if(replay)return replay;
      const model=next.models.filter(m=>m.tenantId===scope.tenantId&&m.applicationId===scope.applicationId&&m.entityType===entityType&&m.status==="PUBLISHED").sort((a,b)=>b.schemaVersion-a.schemaVersion)[0];
      if(!model)throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
      const now=new Date().toISOString(), recordId=randomUUID();
      const record:ApplicationDataRecord={tenantId:scope.tenantId,applicationId:scope.applicationId,entityType,recordId,schemaVersion:model.schemaVersion,
        version:1,status:"ACTIVE",data:clone(data),createdAt:now,updatedAt:now,createdBy:context.actorId,updatedBy:context.actorId};
      next.records.push(record);
      this.appendEvidence(next,scope,entityType,recordId,"RECORD_CREATED",context,undefined,1,data);
      this.remember(next,context,fingerprint,record);
      return record;
    });
  }

  async updateRecord(scope: ApplicationDataScope, entityType: string, recordId: string, expectedVersion: number, data: Record<string,unknown>, context: ApplicationDataActorContext): Promise<ApplicationDataRecord> {
    assertContext(scope,context);
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("APPLICATION_DATA_RECORD_VERSION_INVALID");
    const fingerprint=digest({operation:"updateRecord",entityType,recordId,expectedVersion,data});
    return this.mutate(next=>{
      const replay=this.replay<ApplicationDataRecord>(next,context,fingerprint);if(replay)return replay;
      const index=next.records.findIndex(r=>r.tenantId===scope.tenantId&&r.applicationId===scope.applicationId&&r.entityType===entityType&&r.recordId===recordId);
      if(index<0)throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND");
      const current=next.records[index];
      if(current.version!==expectedVersion)throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      const model=next.models.filter(m=>m.tenantId===scope.tenantId&&m.applicationId===scope.applicationId&&m.entityType===entityType&&m.status==="PUBLISHED").sort((a,b)=>b.schemaVersion-a.schemaVersion)[0];
      if(!model)throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
      const updated={...current,schemaVersion:model.schemaVersion,version:current.version+1,data:clone(data),updatedAt:new Date().toISOString(),updatedBy:context.actorId};
      next.records[index]=updated;
      this.appendEvidence(next,scope,entityType,recordId,"RECORD_UPDATED",context,current.version,updated.version,data);
      this.remember(next,context,fingerprint,updated);
      return updated;
    });
  }

  async deleteRecord(scope: ApplicationDataScope, entityType: string, recordId: string, expectedVersion: number, context: ApplicationDataActorContext): Promise<void> {
    assertContext(scope,context);
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new Error("APPLICATION_DATA_RECORD_VERSION_INVALID");
    const fingerprint=digest({operation:"archiveRecord",entityType,recordId,expectedVersion});
    await this.mutate(next=>{
      const replay=this.replay<boolean>(next,context,fingerprint);if(replay===true)return;
      const index=next.records.findIndex(r=>r.tenantId===scope.tenantId&&r.applicationId===scope.applicationId&&r.entityType===entityType&&r.recordId===recordId);
      if(index<0)throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND");
      const current=next.records[index];
      if(current.version!==expectedVersion)throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      const archived={...current,status:"ARCHIVED" as const,version:current.version+1,updatedAt:new Date().toISOString(),updatedBy:context.actorId};
      next.records[index]=archived;
      this.appendEvidence(next,scope,entityType,recordId,"RECORD_ARCHIVED",context,current.version,archived.version,{});
      this.remember(next,context,fingerprint,true);
    });
  }

  async exportState(): Promise<ApplicationDataState> { return this.read(state=>state); }
}
