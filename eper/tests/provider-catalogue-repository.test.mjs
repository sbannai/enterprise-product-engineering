import test from "node:test";
import assert from "node:assert/strict";
import {PostgresProviderCatalogueRepository,ProviderCatalogueConflictError} from "../dist/packages/integrations/postgres-provider-catalogue-repository.js";
const context={actorId:"product-admin-01",correlationId:"catalogue-test-01",environment:"sandbox"};
const registries={adapterKeys:["mail-adapter"],capabilityKeys:["email.send"],authModes:["oauth"]};
const stamp="2026-11-03T00:00:00.000Z";
function fixture({failAudit=false,existing=false}={}) {
 const calls=[],rows=existing?[{provider_key:"mail-primary",display_name:"Primary Mail",adapter_key:"mail-adapter",adapter_version:"1.0",capabilities:["email.send"],auth_modes:["oauth"],configuration_schema:{type:"object"},provider_status:"ACTIVE",version:2,created_at:stamp,updated_at:stamp,updated_by:"admin"}]:[];
 const client={async query(sql,v=[]){calls.push({sql,v});
  if(sql.includes("FROM eper_provider_definitions")&&sql.includes("FOR UPDATE"))return {rows:rows.filter(x=>x.provider_key===v[0]).map(x=>({...x})),rowCount:1};
  if(sql.includes("INSERT INTO eper_provider_definitions")){const x={provider_key:v[0],display_name:v[1],adapter_key:v[2],adapter_version:v[3],capabilities:JSON.parse(v[4]),auth_modes:JSON.parse(v[5]),configuration_schema:JSON.parse(v[6]),provider_status:"ACTIVE",version:1,created_at:stamp,updated_at:stamp,updated_by:v[7]};rows.push(x);return {rows:[x],rowCount:1};}
  if(sql.includes("UPDATE eper_provider_definitions")){const x=rows[0];if(!x||Number(x.version)!==Number(v.at(-1)))return {rows:[],rowCount:0};if(sql.includes("SET provider_status"))x.provider_status=v[1];else x.display_name=v[1];x.version++;return {rows:[{...x,updated_at:stamp}],rowCount:1};}
  if(failAudit&&sql.includes("INSERT INTO eper_audit_events"))throw new Error("AUDIT_WRITE_FAILED");
  if(sql.includes("SELECT last_event_hash"))return {rows:[{last_event_hash:null}],rowCount:1};
  return {rows:[],rowCount:1};
 },release(){calls.push({sql:"RELEASE"});}};
 return {calls,rows,repository:new PostgresProviderCatalogueRepository({async connect(){return client;}},registries,"test-build")};
}
const definition={...context,providerKey:"mail-primary",displayName:"Primary Mail",adapterKey:"mail-adapter",adapterVersion:"1.0",capabilities:["email.send"],authModes:["oauth"],configurationSchema:{type:"object",properties:{region:{type:"string"}}}};
test("create inserts a provider definition and appends audit in the same transaction",async()=>{const {repository,calls}=fixture();const v=await repository.create(definition);assert.equal(v.version,1);assert.equal(v.status,"ACTIVE");assert.ok(calls.some(x=>x.sql.includes("INSERT INTO eper_audit_events")));assert.ok(calls.some(x=>x.sql==="COMMIT"));});
test("unregistered adapter, capability and auth mode are rejected before database access",async()=>{for(const change of [{adapterKey:"other"},{capabilities:["sms.send"]},{authModes:["password"]}]){const {repository,calls}=fixture();await assert.rejects(()=>repository.create({...definition,...change}));assert.equal(calls.length,0);}});
test("remote references and unsupported schema keywords are rejected",async()=>{for(const schema of [{$ref:"https://invalid.example/schema"},{type:"object",properties:{x:{pattern:".*"}}}]){const {repository,calls}=fixture();await assert.rejects(()=>repository.create({...definition,configurationSchema:schema}));assert.equal(calls.length,0);}});
test("stale optimistic updates fail without audit or mutation",async()=>{const {repository,calls,rows}=fixture({existing:true});await assert.rejects(()=>repository.update({...context,providerKey:"mail-primary",expectedVersion:1,displayName:"Changed"}),e=>e instanceof ProviderCatalogueConflictError&&e.currentVersion===2);assert.equal(rows[0].display_name,"Primary Mail");assert.ok(!calls.some(x=>x.sql.includes("INSERT INTO eper_audit_events")));assert.ok(calls.some(x=>x.sql==="ROLLBACK"));});
test("successful metadata update increments version and audits",async()=>{const {repository,calls}=fixture({existing:true});const v=await repository.update({...context,providerKey:"mail-primary",expectedVersion:2,displayName:"Updated Mail"});assert.equal(v.version,3);assert.equal(v.displayName,"Updated Mail");assert.ok(calls.some(x=>x.sql.includes("INSERT INTO eper_audit_events")));});
test("deprecation is terminal and lifecycle changes are audited",async()=>{const {repository,calls}=fixture({existing:true});const v=await repository.setStatus({...context,providerKey:"mail-primary",expectedVersion:2,status:"DEPRECATED"});assert.equal(v.status,"DEPRECATED");await assert.rejects(()=>repository.setStatus({...context,providerKey:"mail-primary",expectedVersion:3,status:"ACTIVE"}),/PROVIDER_CATALOGUE_DEPRECATED_IS_TERMINAL/);assert.ok(calls.some(x=>x.sql.includes("INSERT INTO eper_audit_events")));});
test("audit failure rolls back catalogue mutation",async()=>{const {repository,calls,rows}=fixture({failAudit:true});await assert.rejects(()=>repository.create(definition),/AUDIT_WRITE_FAILED/);assert.equal(rows.length,0);assert.ok(calls.some(x=>x.sql==="ROLLBACK"));assert.ok(!calls.some(x=>x.sql==="COMMIT"));});
