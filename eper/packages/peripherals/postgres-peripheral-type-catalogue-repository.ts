import { appendAuditEventInTransaction, hashAuditEnvelope, type AuditEnvironment, type AuditSqlClient, type AuditSqlPool } from "../audit/audit-event-store.js";

export type PeripheralTypeLifecycle = "ACTIVE" | "DEPRECATED";
export type PeripheralSchemaLifecycle = "DRAFT" | "PUBLISHED" | "DEPRECATED";
export interface PeripheralTypeDefinition {
  typeKey: string; displayName: string; lifecycleStatus: PeripheralTypeLifecycle;
  schemaVersion: number; adapterKey: string; adapterVersion: string;
  configurationSchema: Record<string, unknown>; compatibility: Record<string, unknown>;
  schemaStatus: PeripheralSchemaLifecycle; createdAt: string; updatedAt: string;
}
export interface PeripheralCatalogueContext { actorId: string; correlationId: string; environment: AuditEnvironment; }
export class PeripheralCatalogueConflictError extends Error {
  constructor() { super("PERIPHERAL_CATALOGUE_VERSION_CONFLICT"); }
}
type Row = {
  type_key:string; display_name:string; lifecycle_status:PeripheralTypeLifecycle;
  schema_version:number|string; adapter_key:string; adapter_version:string;
  configuration_schema:Record<string,unknown>|string; compatibility:Record<string,unknown>|string;
  schema_status:PeripheralSchemaLifecycle; created_at:Date|string; updated_at:Date|string;
};
const decode=<T>(v:T|string):T=>typeof v==="string"?JSON.parse(v) as T:v;
const iso=(v:Date|string)=>v instanceof Date?v.toISOString():new Date(v).toISOString();
const field=(v:string,max:number)=>{if(typeof v!=="string"||!v.trim()||v.trim().length>max)throw new Error("PERIPHERAL_CATALOGUE_FIELD_INVALID");return v.trim();};
const keyPattern=/^[a-z][a-z0-9_.-]{1,95}$/;
function validateSchema(value:Record<string,unknown>,depth=0):void {
  const invalid=()=>{throw new Error("PERIPHERAL_CATALOGUE_SCHEMA_INVALID");};
  if(!value||typeof value!=="object"||Array.isArray(value)||depth>8)invalid();
  let serialized:string;try{serialized=JSON.stringify(value);}catch{invalid();}
  if(serialized!.length>16384||Object.keys(value).length>64)invalid();
  const allowed=new Set(["type","title","description","properties","required","additionalProperties","enum","items","minLength","maxLength","minimum","maximum"]);
  if(Object.keys(value).some(k=>!allowed.has(k)))throw new Error("PERIPHERAL_CATALOGUE_SCHEMA_KEYWORD_UNSUPPORTED");
  const types=["object","array","string","number","integer","boolean"];
  if(value.type!==undefined&&(typeof value.type!=="string"||!types.includes(value.type)))invalid();
  if(value.type!=="object")invalid();
  if(value.properties!==undefined){
    if(!value.properties||typeof value.properties!=="object"||Array.isArray(value.properties))invalid();
    const entries=Object.entries(value.properties as Record<string,unknown>);if(entries.length>64)invalid();
    for(const [key,child] of entries){if(!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)||!child||typeof child!=="object"||Array.isArray(child))invalid();validateSchema(child as Record<string,unknown>,depth+1);}
  }
  if(value.required!==undefined){
    if(!Array.isArray(value.required)||value.required.length>64)invalid();
    const required=value.required as unknown[];
    const names=new Set(value.properties&&typeof value.properties==="object"?Object.keys(value.properties as object):[]);
    if(required.some((k:unknown)=>typeof k!=="string"||!names.has(k)))invalid();
  }
  if(value.additionalProperties!==undefined&&typeof value.additionalProperties!=="boolean")invalid();
}
function map(r:Row):PeripheralTypeDefinition{return {
  typeKey:r.type_key,displayName:r.display_name,lifecycleStatus:r.lifecycle_status,
  schemaVersion:Number(r.schema_version),adapterKey:r.adapter_key,adapterVersion:r.adapter_version,
  configurationSchema:decode(r.configuration_schema),compatibility:decode(r.compatibility),
  schemaStatus:r.schema_status,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at),
};}
const SELECT=`SELECT d.type_key,d.display_name,d.lifecycle_status,s.schema_version,s.adapter_key,s.adapter_version,
 s.configuration_schema,s.compatibility,l.lifecycle_status AS schema_status,d.created_at,d.updated_at
 FROM eper_peripheral_type_definitions d
 JOIN eper_peripheral_type_schema_lifecycle l ON l.type_key=d.type_key
 JOIN eper_peripheral_type_schema_versions s ON s.type_key=l.type_key AND s.schema_version=l.schema_version`;
export class PostgresPeripheralTypeCatalogueRepository {
 constructor(private readonly pool:AuditSqlPool,private readonly serviceVersion?:string){}
 async list(limit=50):Promise<PeripheralTypeDefinition[]>{
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("PERIPHERAL_CATALOGUE_LIMIT_INVALID");
  const c=await this.pool.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('eper.platform_admin','true',true)");
   const r=await c.query<Row>(SELECT+" ORDER BY d.display_name,d.type_key,s.schema_version DESC LIMIT $1",[limit]);await c.query("COMMIT");return r.rows.map(map);
  }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
 }
 async get(typeKey:string):Promise<PeripheralTypeDefinition|null>{
  const key=field(typeKey,96);const c=await this.pool.connect();try{await c.query("SELECT set_config('eper.platform_admin','true',false)");
   await c.query("BEGIN");await c.query("SELECT set_config('eper.platform_admin','true',true)");
   const r=await c.query<Row>(SELECT+" WHERE d.type_key=$1 ORDER BY s.schema_version DESC LIMIT 1",[key]);await c.query("COMMIT");return r.rows[0]?map(r.rows[0]):null;
  }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
 }
 async create(i:PeripheralCatalogueContext&{typeKey:string;displayName:string;adapterKey:string;adapterVersion:string;configurationSchema:Record<string,unknown>;compatibility?:Record<string,unknown>}):Promise<PeripheralTypeDefinition>{
  field(i.actorId,128);field(i.correlationId,128);const typeKey=field(i.typeKey,96);
  if(!keyPattern.test(typeKey))throw new Error("PERIPHERAL_CATALOGUE_TYPE_KEY_INVALID");
  const displayName=field(i.displayName,160),adapterKey=field(i.adapterKey,96),adapterVersion=field(i.adapterVersion,64);
  validateSchema(i.configurationSchema);const compatibility=i.compatibility??{};
  if(!compatibility||typeof compatibility!=="object"||Array.isArray(compatibility)||JSON.stringify(compatibility).length>8192)throw new Error("PERIPHERAL_CATALOGUE_COMPATIBILITY_INVALID");
  const c=await this.pool.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('eper.platform_admin','true',true)");
   await c.query("INSERT INTO eper_peripheral_type_definitions(type_key,display_name,created_by,updated_by) VALUES($1,$2,$3,$3)",[typeKey,displayName,i.actorId]);
   await c.query("INSERT INTO eper_peripheral_type_schema_versions(type_key,schema_version,adapter_key,adapter_version,configuration_schema,compatibility,created_by) VALUES($1,1,$2,$3,$4::jsonb,$5::jsonb,$6)",[typeKey,adapterKey,adapterVersion,JSON.stringify(i.configurationSchema),JSON.stringify(compatibility),i.actorId]);
   await c.query("INSERT INTO eper_peripheral_type_schema_lifecycle(type_key,schema_version,lifecycle_status,changed_by) VALUES($1,1,'DRAFT',$2)",[typeKey,i.actorId]);
   const result=await c.query<Row>(SELECT+" WHERE d.type_key=$1 AND s.schema_version=1",[typeKey]);if(!result.rows[0])throw new Error("PERIPHERAL_CATALOGUE_CREATE_EMPTY");
   const saved=map(result.rows[0]);await this.audit(c,i,"peripheral.type.create",typeKey,null,saved);await c.query("COMMIT");return saved;
  }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
 }
 async createSchemaVersion(i:PeripheralCatalogueContext&{typeKey:string;adapterKey:string;adapterVersion:string;configurationSchema:Record<string,unknown>;compatibility?:Record<string,unknown>}):Promise<PeripheralTypeDefinition>{
  field(i.actorId,128);field(i.correlationId,128);const key=field(i.typeKey,96);
  const adapterKey=field(i.adapterKey,96),adapterVersion=field(i.adapterVersion,64);validateSchema(i.configurationSchema);
  const compatibility=i.compatibility??{};if(!compatibility||typeof compatibility!=="object"||Array.isArray(compatibility)||JSON.stringify(compatibility).length>8192)throw new Error("PERIPHERAL_CATALOGUE_COMPATIBILITY_INVALID");
  const c=await this.pool.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('eper.platform_admin','true',true)");
   const definition=await c.query("SELECT type_key FROM eper_peripheral_type_definitions WHERE type_key=$1 AND lifecycle_status='ACTIVE' FOR UPDATE",[key]);
   if(!definition.rows[0])throw new Error("PERIPHERAL_CATALOGUE_TYPE_NOT_FOUND_OR_DEPRECATED");
   const current=await c.query<{next_version:number}>(`SELECT COALESCE(MAX(schema_version),0)+1 AS next_version FROM eper_peripheral_type_schema_versions WHERE type_key=$1`,[key]);
   const version=Number(current.rows[0]?.next_version??1);
   await c.query("INSERT INTO eper_peripheral_type_schema_versions(type_key,schema_version,adapter_key,adapter_version,configuration_schema,compatibility,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)",[key,version,adapterKey,adapterVersion,JSON.stringify(i.configurationSchema),JSON.stringify(compatibility),i.actorId]);
   await c.query("INSERT INTO eper_peripheral_type_schema_lifecycle(type_key,schema_version,lifecycle_status,changed_by) VALUES($1,$2,'DRAFT',$3)",[key,version,i.actorId]);
   const result=await c.query<Row>(SELECT+" WHERE d.type_key=$1 AND s.schema_version=$2",[key,version]);if(!result.rows[0])throw new Error("PERIPHERAL_CATALOGUE_SCHEMA_CREATE_EMPTY");
   const saved=map(result.rows[0]);await this.audit(c,i,"peripheral.type.schema.draft",key,null,saved);await c.query("COMMIT");return saved;
  }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
 }
 async publish(i:PeripheralCatalogueContext&{typeKey:string;schemaVersion:number}):Promise<PeripheralTypeDefinition>{
  field(i.actorId,128);field(i.correlationId,128);const key=field(i.typeKey,96);
  if(!Number.isSafeInteger(i.schemaVersion)||i.schemaVersion<1)throw new Error("PERIPHERAL_CATALOGUE_SCHEMA_VERSION_INVALID");
  const c=await this.pool.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('eper.platform_admin','true',true)");
   const current=await c.query<Row>(SELECT+" WHERE d.type_key=$1 AND s.schema_version=$2 FOR UPDATE OF d,l",[key,i.schemaVersion]);
   if(!current.rows[0])throw new Error("PERIPHERAL_CATALOGUE_SCHEMA_NOT_FOUND");
   if(current.rows[0].lifecycle_status==="DEPRECATED")throw new Error("PERIPHERAL_CATALOGUE_SCHEMA_DEPRECATED_TERMINAL");
   const before=map(current.rows[0]);
   await c.query("UPDATE eper_peripheral_type_schema_lifecycle SET lifecycle_status='DEPRECATED',changed_at=NOW(),changed_by=$2 WHERE type_key=$1 AND lifecycle_status='PUBLISHED'",[key,i.actorId]);
   await c.query("UPDATE eper_peripheral_type_schema_lifecycle SET lifecycle_status='PUBLISHED',changed_at=NOW(),changed_by=$3 WHERE type_key=$1 AND schema_version=$2",[key,i.schemaVersion,i.actorId]);
   const afterResult=await c.query<Row>(SELECT+" WHERE d.type_key=$1 AND s.schema_version=$2",[key,i.schemaVersion]);
   const after=map(afterResult.rows[0]);await this.audit(c,i,"peripheral.type.schema.publish",key,before,after);await c.query("COMMIT");return after;
  }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
 }
 async deprecate(i:PeripheralCatalogueContext&{typeKey:string}):Promise<PeripheralTypeDefinition>{
  field(i.actorId,128);field(i.correlationId,128);const key=field(i.typeKey,96);const c=await this.pool.connect();
  try{await c.query("BEGIN");await c.query("SELECT set_config('eper.platform_admin','true',true)");
   const found=await c.query<Row>(SELECT+" WHERE d.type_key=$1 ORDER BY s.schema_version DESC LIMIT 1 FOR UPDATE OF d",[key]);
   if(!found.rows[0])throw new Error("PERIPHERAL_CATALOGUE_TYPE_NOT_FOUND");const before=map(found.rows[0]);
   if(before.lifecycleStatus==="DEPRECATED")throw new Error("PERIPHERAL_CATALOGUE_TYPE_ALREADY_DEPRECATED");
   await c.query("UPDATE eper_peripheral_type_definitions SET lifecycle_status='DEPRECATED',updated_at=NOW(),updated_by=$2 WHERE type_key=$1",[key,i.actorId]);
   await c.query("UPDATE eper_peripheral_type_schema_lifecycle SET lifecycle_status='DEPRECATED',changed_at=NOW(),changed_by=$2 WHERE type_key=$1 AND lifecycle_status<>'DEPRECATED'",[key,i.actorId]);
   const afterResult=await c.query<Row>(SELECT+" WHERE d.type_key=$1 ORDER BY s.schema_version DESC LIMIT 1",[key]);
   const after=map(afterResult.rows[0]);await this.audit(c,i,"peripheral.type.deprecate",key,before,after);await c.query("COMMIT");return after;
  }catch(e){await c.query("ROLLBACK").catch(()=>undefined);throw e;}finally{c.release();}
 }
 private async audit(c:AuditSqlClient,i:PeripheralCatalogueContext,action:string,key:string,before:PeripheralTypeDefinition|null,after:PeripheralTypeDefinition){
  await appendAuditEventInTransaction(c,{tenantId:"platform",applicationId:"peripheral-catalogue",environment:i.environment,actorType:"human",actorId:i.actorId,action,outcome:"success",resourceType:"peripheral-type",resourceId:key,correlationId:i.correlationId,source:"platform",operationName:action,serviceVersion:this.serviceVersion,beforeHash:before?hashAuditEnvelope(before as unknown as Record<string,unknown>):undefined,afterHash:hashAuditEnvelope(after as unknown as Record<string,unknown>),payload:{typeKey:key,schemaVersion:after.schemaVersion,schemaStatus:after.schemaStatus}});
 }
}
