import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { withTenantTransaction, enqueueOutboxEvent } from "../capabilities/postgres-transaction.js";
import type { ApplicationDataAdapter, ApplicationDataContext, ApplicationDataModel, ApplicationDataQuery, ApplicationDataRecord } from "./contracts.js";
import { applicationDataCreateHash } from "./idempotency.js";

type Row = Record<string, unknown>;
function json<T>(value: unknown): T { return (typeof value === "string" ? JSON.parse(value) : value) as T; }
function object(value: unknown): Record<string, unknown> { const parsed = json<unknown>(value); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("APPLICATION_DATA_PERSISTED_VALUE_INVALID"); return parsed as Record<string, unknown>; }
function mapRecord(row: Row): ApplicationDataRecord {
  return { tenantId: String(row.tenant_id), applicationId: String(row.application_id), entityType: String(row.entity_type),
    id: String(row.record_id), schemaVersion: Number(row.schema_version), version: Number(row.version),
    state: String(row.state) as ApplicationDataRecord["state"], data: object(row.data),
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() };
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const o = value as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map(k => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
}
export class PostgresApplicationDataAdapter implements ApplicationDataAdapter {
  constructor(private readonly pool: Pool) {}
  private async scope<T>(context: ApplicationDataContext, work: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
    return withTenantTransaction(this.pool, context.tenantId, async ({ client }) => {
      await client.query("SELECT set_config('eper.application_id', $1, true)", [context.applicationId]);
      return work(client);
    });
  }
  async getModel(t: string, a: string, e: string, v?: number): Promise<ApplicationDataModel | undefined> {
    return withTenantTransaction(this.pool, t, async ({ client }) => {
      await client.query("SELECT set_config('eper.application_id',$1,true)",[a]);
      const result = await client.query<Row>("SELECT tenant_id,application_id,entity_type,version,status,fields,relationships FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND ($4::integer IS NULL OR version=$4) ORDER BY version DESC LIMIT 1", [t,a,e,v ?? null]);
      const r = result.rows[0]; return r ? { tenantId:String(r.tenant_id), applicationId:String(r.application_id), entityType:String(r.entity_type), version:Number(r.version), status:r.status as ApplicationDataModel["status"], fields:json<ApplicationDataModel["fields"]>(r.fields), relationships:json<ApplicationDataModel["relationships"]>(r.relationships ?? []) } : undefined;
    });
  }
  async getActiveModel(t: string, a: string, e: string): Promise<ApplicationDataModel | undefined> {
    return withTenantTransaction(this.pool, t, async ({ client }) => {
      await client.query("SELECT set_config('eper.application_id',$1,true)",[a]);
      const result = await client.query<Row>("SELECT tenant_id,application_id,entity_type,version,status,fields,relationships FROM eper_application_data_models WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND status='ACTIVE' ORDER BY version DESC LIMIT 1",[t,a,e]);
      const r=result.rows[0]; return r ? { tenantId:String(r.tenant_id),applicationId:String(r.application_id),entityType:String(r.entity_type),version:Number(r.version),status:r.status as ApplicationDataModel["status"],fields:json<ApplicationDataModel["fields"]>(r.fields),relationships:json<ApplicationDataModel["relationships"]>(r.relationships ?? []) } : undefined;
    });
  }
  async putModel(model: ApplicationDataModel): Promise<void> {
    await withTenantTransaction(this.pool, model.tenantId, async ({ client }) => {
      await client.query("SELECT set_config('eper.application_id',$1,true)",[model.applicationId]);
      await client.query("INSERT INTO eper_application_data_models(tenant_id,application_id,entity_type,version,status,fields,relationships) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)", [model.tenantId,model.applicationId,model.entityType,model.version,model.status,JSON.stringify(model.fields),JSON.stringify(model.relationships ?? [])]);
    });
  }
  async transitionModelStatus(t: string, a: string, e: string, v: number, from: ApplicationDataModel["status"], to: ApplicationDataModel["status"]): Promise<void> {
    if (!((from==="DRAFT"&&to==="ACTIVE")||(from==="ACTIVE"&&to==="RETIRED"))) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_INVALID");
    await withTenantTransaction(this.pool,t,async({client})=>{
      await client.query("SELECT set_config('eper.application_id',$1,true)",[a]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${t}:${a}:${e}:schema-activation`]);
      if (to === "ACTIVE") {
        await client.query("UPDATE eper_application_data_models SET status='RETIRED',updated_at=now() WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND status='ACTIVE'", [t,a,e]);
      }
      const result=await client.query("UPDATE eper_application_data_models SET status=$6,updated_at=now() WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND version=$4 AND status=$5",[t,a,e,v,from,to]);
      if (!result.rowCount) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_CONFLICT");
    });
  }
  private async evidence(client: import("pg").PoolClient, context: ApplicationDataContext, action: string, record: ApplicationDataRecord): Promise<void> {
    const id = randomUUID(); const occurredAt = new Date().toISOString();
    const payload = { entityType:record.entityType, recordId:record.id, applicationId:record.applicationId, version:record.version };
    const material = canonical({ id, tenantId:context.tenantId, requirementId:context.requirementId, action, principalId:context.actorId, correlationId:context.correlationId, occurredAt, payload });
    const integrityHash = createHash("sha256").update(material).digest("hex");
    await client.query("INSERT INTO audit_evidence(tenant_id,evidence_id,requirement_id,action,principal_id,correlation_id,occurred_at,payload,canonicalization_version,integrity_hash) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,1,$9)", [context.tenantId,id,context.requirementId,action,context.actorId,context.correlationId,occurredAt,JSON.stringify(payload),integrityHash]);
    await enqueueOutboxEvent({ tenantId:context.tenantId, client }, { eventId:id, tenantId:context.tenantId, aggregateType:"application_data_record", aggregateId:record.id, eventType:action, correlationId:context.correlationId, payload });
  }
  async create(record: ApplicationDataRecord, context: ApplicationDataContext): Promise<ApplicationDataRecord> {
    return this.scope(context, async client => {
      const key = context.idempotencyKey;
      const requestHash = key ? applicationDataCreateHash(record) : undefined;
      if (key && requestHash) {
        // Serialize the same key across processes; the idempotency row is committed with the business write.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`application-data:${context.tenantId}:${context.applicationId}:${key}`]);
        const replay = await client.query<Row>("SELECT request_hash,response FROM eper_application_data_idempotency WHERE tenant_id=$1 AND application_id=$2 AND idempotency_key=$3", [context.tenantId,context.applicationId,key]);
        if (replay.rows[0]) {
          if (String(replay.rows[0].request_hash) !== requestHash) throw new Error("APPLICATION_DATA_IDEMPOTENCY_KEY_REUSED");
          return json<ApplicationDataRecord>(replay.rows[0].response);
        }
      }
      const result = await client.query<Row>("INSERT INTO eper_application_data_records(tenant_id,application_id,entity_type,record_id,schema_version,version,state,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *", [record.tenantId,record.applicationId,record.entityType,record.id,record.schemaVersion,record.version,record.state,JSON.stringify(record.data)]);
      const saved = mapRecord(result.rows[0]);
      await this.evidence(client,context,"APPLICATION_DATA_CREATED",saved);
      if (key && requestHash) {
        await client.query("INSERT INTO eper_application_data_idempotency(tenant_id,application_id,idempotency_key,request_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)", [context.tenantId,context.applicationId,key,requestHash,JSON.stringify(saved)]);
      }
      return saved;
    });
  }
  async get(c: ApplicationDataContext, e: string, id: string): Promise<ApplicationDataRecord | undefined> {
    return this.scope(c, async client => { const r=await client.query<Row>("SELECT * FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4",[c.tenantId,c.applicationId,e,id]); return r.rows[0] ? mapRecord(r.rows[0]) : undefined; });
  }
  async update(c: ApplicationDataContext, e: string, id: string, expected: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord> {
    return this.scope(c, async client => {
      const r=await client.query<Row>("UPDATE eper_application_data_records SET state=COALESCE($5,state),data=COALESCE($6::jsonb,data),version=version+1,updated_at=now() WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4 AND version=$7 RETURNING *",[c.tenantId,c.applicationId,e,id,patch.state ?? null,patch.data === undefined ? null : JSON.stringify(patch.data),expected]);
      if (!r.rows[0]) { const exists=await client.query("SELECT 1 FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4",[c.tenantId,c.applicationId,e,id]); throw new Error(exists.rowCount ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND"); }
      const saved=mapRecord(r.rows[0]); await this.evidence(client,c,"APPLICATION_DATA_UPDATED",saved); return saved;
    });
  }
  async delete(c: ApplicationDataContext, e: string, id: string, expected: number): Promise<void> {
    await this.scope(c, async client => {
      const r=await client.query<Row>("DELETE FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4 AND version=$5 RETURNING *",[c.tenantId,c.applicationId,e,id,expected]);
      if (!r.rows[0]) { const exists=await client.query("SELECT 1 FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND record_id=$4",[c.tenantId,c.applicationId,e,id]); throw new Error(exists.rowCount ? "APPLICATION_DATA_VERSION_CONFLICT" : "APPLICATION_DATA_RECORD_NOT_FOUND"); }
      await this.evidence(client,c,"APPLICATION_DATA_DELETED",mapRecord(r.rows[0]));
    });
  }
  async query(c: ApplicationDataContext, e: string, q: ApplicationDataQuery): Promise<ApplicationDataRecord[]> {
    return this.scope(c, async client => { const r=await client.query<Row>("SELECT * FROM eper_application_data_records WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND ($4::text IS NULL OR state=$4) AND ($5::text IS NULL OR record_id>$5) ORDER BY record_id LIMIT $6",[c.tenantId,c.applicationId,e,q.state ?? null,q.afterId ?? null,q.limit ?? 50]); return r.rows.map(mapRecord); });
  }
}
