import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  ApplicationDataActorContext, ApplicationDataModel, ApplicationDataRecord, ApplicationDataRecordFilter,
  ApplicationDataScope, ApplicationDataStore,
} from "./types.js";
import { canonicalJson, digest, validateApplicationDataScope } from "./validation.js";

type Row=Record<string,unknown>;
function parseJson<T>(value:unknown):T{return (typeof value==="string"?JSON.parse(value):value) as T;}
function modelFromRow(row:Row):ApplicationDataModel{
  const definition=parseJson<{fields:ApplicationDataModel["fields"];relationships:ApplicationDataModel["relationships"];createdBy:string}>(row.definition);
  return {tenantId:String(row.tenant_id),applicationId:String(row.application_id),entityType:String(row.entity_type),
    schemaVersion:Number(row.schema_version),status:String(row.model_status) as ApplicationDataModel["status"],
    fields:definition.fields,relationships:definition.relationships,digest:String(row.schema_digest),
    createdAt:new Date(row.created_at as string|Date).toISOString(),updatedAt:new Date(row.updated_at as string|Date).toISOString(),
    ...(row.published_at?{publishedAt:new Date(row.published_at as string|Date).toISOString()}:{}),
    createdBy:String(row.created_by),...(row.published_by?{publishedBy:String(row.published_by)}:{})};
}
function recordFromRow(row:Row):ApplicationDataRecord{
  return {tenantId:String(row.tenant_id),applicationId:String(row.application_id),entityType:String(row.entity_type),
    recordId:String(row.record_id),schemaVersion:Number(row.schema_version),version:Number(row.record_version),
    status:String(row.record_status) as ApplicationDataRecord["status"],data:parseJson<Record<string,unknown>>(row.data),
    createdAt:new Date(row.created_at as string|Date).toISOString(),updatedAt:new Date(row.updated_at as string|Date).toISOString(),
    createdBy:String(row.created_by),updatedBy:String(row.updated_by)};
}
function assertContext(scope:ApplicationDataScope,context:ApplicationDataActorContext):void{
  validateApplicationDataScope(scope);
  if(context.tenantId!==scope.tenantId||context.applicationId!==scope.applicationId)throw new Error("APPLICATION_DATA_CONTEXT_SCOPE_MISMATCH");
  for(const [name,value] of Object.entries({actorId:context.actorId,correlationId:context.correlationId,requirementId:context.requirementId,idempotencyKey:context.idempotencyKey}))
    if(typeof value!=="string"||!value.trim()||value.length>160)throw new Error("APPLICATION_DATA_CONTEXT_INVALID:"+name);
}
async function tx<T>(pool:Pool,scope:ApplicationDataScope,work:(client:PoolClient)=>Promise<T>):Promise<T>{
  validateApplicationDataScope(scope);const client=await pool.connect();
  try{await client.query("BEGIN");await client.query("SELECT set_config('eper.tenant_id',$1,true)",[scope.tenantId]);
    await client.query("SELECT set_config('eper.application_id',$1,true)",[scope.applicationId]);
    const result=await work(client);await client.query("COMMIT");return result;
  }catch(error){try{await client.query("ROLLBACK");}catch{}throw error;}finally{client.release();}
}
async function idempotent<T>(client:PoolClient,context:ApplicationDataActorContext,fingerprint:string,work:()=>Promise<T>):Promise<T>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify([context.tenantId,context.applicationId,context.idempotencyKey])]);
  const prior=await client.query<{request_fingerprint:string;response:unknown}>(
    "SELECT request_fingerprint,response FROM eper_application_data_idempotency WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3",
    [context.tenantId,context.applicationId,context.idempotencyKey]);
  if(prior.rows[0]){
    if(prior.rows[0].request_fingerprint.trim()!==fingerprint)throw new Error("APPLICATION_DATA_IDEMPOTENCY_CONFLICT");
    return parseJson<T>(prior.rows[0].response);
  }
  const result=await work();
  await client.query("INSERT INTO eper_application_data_idempotency(tenant_id,application_id,idempotency_key,request_fingerprint,response) VALUES($1,$2,$3,$4,$5::jsonb)",
    [context.tenantId,context.applicationId,context.idempotencyKey,fingerprint,JSON.stringify(result)]);
  return result;
}
async function evidence(client:PoolClient,scope:ApplicationDataScope,entityType:string,recordId:string|undefined,action:string,
  context:ApplicationDataActorContext,beforeVersion:number|undefined,afterVersion:number|undefined,payload:unknown):Promise<void>{
  const auditId=randomUUID(),occurredAt=new Date().toISOString(),payloadDigest=digest(payload);
  await client.query(`INSERT INTO eper_application_data_audit
    (tenant_id,application_id,audit_id,entity_type,record_id,action,actor_id,correlation_id,requirement_id,occurred_at,before_version,after_version,payload_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [scope.tenantId,scope.applicationId,auditId,entityType,recordId??null,action,context.actorId,context.correlationId,context.requirementId,occurredAt,beforeVersion??null,afterVersion??null,payloadDigest]);
  await client.query(`INSERT INTO eper_application_data_outbox
    (tenant_id,application_id,event_id,aggregate_type,aggregate_id,event_type,event_version,correlation_id,payload,occurred_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [scope.tenantId,scope.applicationId,auditId,recordId?"application_data_record":"application_data_model",recordId??entityType,
      "application.data."+action.toLowerCase(),afterVersion??1,context.correlationId,
      JSON.stringify({entityType,...(recordId?{recordId}:{}),...(afterVersion===undefined?{}:{version:afterVersion}),payloadDigest}),occurredAt]);
}
export class PostgresApplicationDataStore implements ApplicationDataStore{
  constructor(private readonly pool:Pool){}
  async getModel(scope:ApplicationDataScope,entityType:string,schemaVersion?:number):Promise<ApplicationDataModel|null>{
    return tx(this.pool,scope,async c=>{const q=schemaVersion===undefined
      ?await c.query("SELECT * FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND model_status='PUBLISHED' ORDER BY schema_version DESC LIMIT 1",[scope.tenantId,scope.applicationId,entityType])
      :await c.query("SELECT * FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND schema_version=$4",[scope.tenantId,scope.applicationId,entityType,schemaVersion]);
      return q.rows[0]?modelFromRow(q.rows[0]):null;});
  }
  async listModels(scope:ApplicationDataScope):Promise<ApplicationDataModel[]>{
    return tx(this.pool,scope,async c=>{const q=await c.query("SELECT * FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 ORDER BY entity_type,schema_version DESC",[scope.tenantId,scope.applicationId]);return q.rows.map(modelFromRow);});
  }
  async saveModel(scope:ApplicationDataScope,input:Omit<ApplicationDataModel,"tenantId"|"applicationId"|"schemaVersion"|"status"|"digest"|"createdAt"|"updatedAt"|"publishedAt"|"publishedBy">,
    expectedVersion:number,context:ApplicationDataActorContext):Promise<ApplicationDataModel>{
    assertContext(scope,context);const fingerprint=digest({operation:"saveModel",entityType:input.entityType,fields:input.fields,relationships:input.relationships,expectedVersion});
    return tx(this.pool,scope,c=>idempotent(c,context,fingerprint,async()=>{
      const latest=await c.query("SELECT schema_version FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 ORDER BY schema_version DESC LIMIT 1 FOR UPDATE",
        [scope.tenantId,scope.applicationId,input.entityType]);
      const current=Number(latest.rows[0]?.schema_version??0);if(current!==expectedVersion)throw new Error("APPLICATION_DATA_MODEL_VERSION_CONFLICT");
      const now=new Date().toISOString(),version=current+1,definition={fields:input.fields,relationships:input.relationships??[],createdBy:context.actorId};
      const schemaDigest=digest({entityType:input.entityType,fields:input.fields,relationships:input.relationships??[]});
      const q=await c.query(`INSERT INTO eper_application_data_models(tenant_id,application_id,entity_type,schema_version,model_status,definition,schema_digest,created_by,created_at,updated_at)
        VALUES($1,$2,$3,$4,'DRAFT',$5::jsonb,$6,$7,$8,$8) RETURNING *`,
        [scope.tenantId,scope.applicationId,input.entityType,version,JSON.stringify(definition),schemaDigest,context.actorId,now]);
      const saved=modelFromRow(q.rows[0]);await evidence(c,scope,input.entityType,undefined,"MODEL_SAVED",context,current||undefined,version,{digest:schemaDigest});return saved;
    }));
  }
  async publishModel(scope:ApplicationDataScope,entityType:string,expectedVersion:number,context:ApplicationDataActorContext):Promise<ApplicationDataModel>{
    assertContext(scope,context);const fingerprint=digest({operation:"publishModel",entityType,expectedVersion});
    return tx(this.pool,scope,c=>idempotent(c,context,fingerprint,async()=>{
      const q=await c.query("SELECT * FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND schema_version=$4 FOR UPDATE",
        [scope.tenantId,scope.applicationId,entityType,expectedVersion]);
      if(!q.rows[0])throw new Error("APPLICATION_DATA_MODEL_NOT_FOUND");
      if(q.rows[0].model_status!=="DRAFT")throw new Error("APPLICATION_DATA_MODEL_ALREADY_PUBLISHED");
      const saved=await c.query("UPDATE eper_application_data_models SET model_status='PUBLISHED',published_by=$5,published_at=now(),updated_at=now() WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND schema_version=$4 RETURNING *",
        [scope.tenantId,scope.applicationId,entityType,expectedVersion,context.actorId]);
      const model=modelFromRow(saved.rows[0]);await evidence(c,scope,entityType,undefined,"MODEL_PUBLISHED",context,expectedVersion,expectedVersion,{digest:model.digest});return model;
    }));
  }
  async getRecord(scope:ApplicationDataScope,entityType:string,recordId:string):Promise<ApplicationDataRecord|null>{
    return tx(this.pool,scope,async c=>{const q=await c.query("SELECT * FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4",
      [scope.tenantId,scope.applicationId,entityType,recordId]);return q.rows[0]?recordFromRow(q.rows[0]):null;});
  }
  async listRecords(scope:ApplicationDataScope,entityType:string,filter:ApplicationDataRecordFilter={}):Promise<ApplicationDataRecord[]>{
    const limit=filter.limit??50;if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error("APPLICATION_DATA_QUERY_LIMIT_INVALID");
    if(filter.equals&&Object.keys(filter.equals).length>20)throw new Error("APPLICATION_DATA_QUERY_FILTER_INVALID");
    return tx(this.pool,scope,async c=>{const q=await c.query(`SELECT * FROM eper_application_data_records
      WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_status='ACTIVE'
      AND ($4::uuid IS NULL OR record_id>$4::uuid) AND data @> $5::jsonb
      ORDER BY record_id LIMIT $6`,
      [scope.tenantId,scope.applicationId,entityType,filter.afterRecordId??null,JSON.stringify(filter.equals??{}),limit]);return q.rows.map(recordFromRow);});
  }
  async createRecord(scope:ApplicationDataScope,entityType:string,data:Record<string,unknown>,context:ApplicationDataActorContext):Promise<ApplicationDataRecord>{
    assertContext(scope,context);const fingerprint=digest({operation:"createRecord",entityType,data});
    return tx(this.pool,scope,c=>idempotent(c,context,fingerprint,async()=>{
      const model=await c.query("SELECT schema_version FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND model_status='PUBLISHED' ORDER BY schema_version DESC LIMIT 1",
        [scope.tenantId,scope.applicationId,entityType]);if(!model.rows[0])throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
      const now=new Date().toISOString(),recordId=randomUUID();
      const q=await c.query(`INSERT INTO eper_application_data_records(tenant_id,application_id,entity_type,record_id,schema_version,record_version,record_status,data,created_by,updated_by,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,1,'ACTIVE',$6::jsonb,$7,$7,$8,$8) RETURNING *`,
        [scope.tenantId,scope.applicationId,entityType,recordId,Number(model.rows[0].schema_version),JSON.stringify(data),context.actorId,now]);
      const record=recordFromRow(q.rows[0]);await evidence(c,scope,entityType,recordId,"RECORD_CREATED",context,undefined,1,data);return record;
    }));
  }
  async updateRecord(scope:ApplicationDataScope,entityType:string,recordId:string,expectedVersion:number,data:Record<string,unknown>,context:ApplicationDataActorContext):Promise<ApplicationDataRecord>{
    assertContext(scope,context);const fingerprint=digest({operation:"updateRecord",entityType,recordId,expectedVersion,data});
    return tx(this.pool,scope,c=>idempotent(c,context,fingerprint,async()=>{
      const prior=await c.query("SELECT record_version FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4 FOR UPDATE",
        [scope.tenantId,scope.applicationId,entityType,recordId]);if(!prior.rows[0])throw new Error("APPLICATION_DATA_RECORD_NOT_FOUND");
      if(Number(prior.rows[0].record_version)!==expectedVersion)throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      const model=await c.query("SELECT schema_version FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND model_status='PUBLISHED' ORDER BY schema_version DESC LIMIT 1",
        [scope.tenantId,scope.applicationId,entityType]);if(!model.rows[0])throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
      const q=await c.query(`UPDATE eper_application_data_records SET schema_version=$5,record_version=record_version+1,data=$6::jsonb,updated_by=$7,updated_at=now()
        WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4 AND record_version=$8 RETURNING *`,
        [scope.tenantId,scope.applicationId,entityType,recordId,Number(model.rows[0].schema_version),JSON.stringify(data),context.actorId,expectedVersion]);
      if(!q.rows[0])throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      const record=recordFromRow(q.rows[0]);await evidence(c,scope,entityType,recordId,"RECORD_UPDATED",context,expectedVersion,record.version,data);return record;
    }));
  }
  async deleteRecord(scope:ApplicationDataScope,entityType:string,recordId:string,expectedVersion:number,context:ApplicationDataActorContext):Promise<void>{
    assertContext(scope,context);const fingerprint=digest({operation:"archiveRecord",entityType,recordId,expectedVersion});
    await tx(this.pool,scope,c=>idempotent(c,context,fingerprint,async()=>{
      const q=await c.query("UPDATE eper_application_data_records SET record_status='ARCHIVED',record_version=record_version+1,updated_by=$5,updated_at=now() WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4 AND record_version=$6 RETURNING record_version",
        [scope.tenantId,scope.applicationId,entityType,recordId,context.actorId,expectedVersion]);
      if(!q.rows[0])throw new Error("APPLICATION_DATA_RECORD_VERSION_CONFLICT");
      await evidence(c,scope,entityType,recordId,"RECORD_ARCHIVED",context,expectedVersion,Number(q.rows[0].record_version),{});return true;
    }));
  }
}
