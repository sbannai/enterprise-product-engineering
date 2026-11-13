import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ApplicationDataService, JsonFileApplicationDataStore, StatefulApplicationDataStore } from "../dist/packages/application-data/index.js";

const scope={tenantId:"tenant-a",applicationId:"shop-a"};
const model={entityType:"Order",fields:[
  {id:"orderNumber",label:"Order number",type:"string",required:true,minLength:1,maxLength:40},
  {id:"total",label:"Total",type:"number",required:true,minimum:0},
  {id:"paid",label:"Paid",type:"boolean",required:true},
  {id:"customerId",label:"Customer",type:"reference",referenceEntity:"Customer",required:true},
],relationships:[{id:"customer",label:"Customer",targetEntity:"Customer",cardinality:"one",required:true}]};
function context(id){return {...scope,actorId:"customer-user",correlationId:"corr-"+id,requirementId:"APP-DATA-TEST",idempotencyKey:id};}
async function configured(store){
  const service=new ApplicationDataService(store);
  await service.saveModel(scope,model,0,context("model-save"));
  await service.publishModel(scope,"Order",1,context("model-publish"));
  return service;
}
const valid={orderNumber:"ORD-1001",total:1250.5,paid:false,customerId:"customer-1"};

test("application data requires a published entity model and validates records",async()=>{
  const service=new ApplicationDataService(new StatefulApplicationDataStore());
  await service.saveModel(scope,model,0,context("draft"));
  await assert.rejects(()=>service.createRecord(scope,"Order",valid,context("before-publish")),/APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED/);
  await service.publishModel(scope,"Order",1,context("publish"));
  await assert.rejects(()=>service.createRecord(scope,"Order",{...valid,unexpected:true},context("unknown-field")),/APPLICATION_DATA_UNKNOWN_FIELD/);
  await assert.rejects(()=>service.createRecord(scope,"Order",{...valid,total:"1250"},context("bad-type")),/APPLICATION_DATA_FIELD_TYPE_INVALID/);
  await assert.rejects(()=>service.createRecord(scope,"Order",{...valid,orderNumber:undefined},context("required")),/APPLICATION_DATA_REQUIRED_FIELD/);
});

test("application data is isolated by both tenant and application",async()=>{
  const store=new StatefulApplicationDataStore();
  const service=new ApplicationDataService(store);
  await configured(store);
  const record=await service.createRecord(scope,"Order",valid,context("create-a"));
  assert.equal((await service.getRecord(scope,"Order",record.recordId))?.data.orderNumber,"ORD-1001");
  assert.equal(await service.getRecord({tenantId:"tenant-b",applicationId:"shop-a"},"Order",record.recordId),null);
  assert.equal(await service.getRecord({tenantId:"tenant-a",applicationId:"shop-b"},"Order",record.recordId),null);
  assert.equal((await service.listModels({tenantId:"tenant-a",applicationId:"shop-b"})).length,0);
});

test("application data uses idempotency and optimistic record versions",async()=>{
  const service=await configured(new StatefulApplicationDataStore());
  const created=await service.createRecord(scope,"Order",valid,context("same-create"));
  const replay=await service.createRecord(scope,"Order",valid,context("same-create"));
  assert.equal(replay.recordId,created.recordId);
  await assert.rejects(()=>service.createRecord(scope,"Order",{...valid,total:5},context("same-create")),/APPLICATION_DATA_IDEMPOTENCY_CONFLICT/);
  const updated=await service.updateRecord(scope,"Order",created.recordId,1,{...valid,paid:true},context("update"));
  assert.equal(updated.version,2);
  assert.equal(updated.data.paid,true);
  await assert.rejects(()=>service.updateRecord(scope,"Order",created.recordId,1,valid,context("stale-update")),/APPLICATION_DATA_RECORD_VERSION_CONFLICT/);
  await service.archiveRecord(scope,"Order",created.recordId,2,context("archive"));
  assert.equal((await service.getRecord(scope,"Order",created.recordId))?.status,"ARCHIVED");
  assert.equal((await service.listRecords(scope,"Order")).length,0);
});

test("JSON application data adapter persists models, records, audit and outbox asynchronously",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"eper-application-data-"));
  const path=join(directory,"application-data.json");
  try{
    const store=await JsonFileApplicationDataStore.open(path);
    const service=await configured(store);
    const record=await service.createRecord(scope,"Order",valid,context("json-create"));
    const reopened=await JsonFileApplicationDataStore.open(path);
    const restored=new ApplicationDataService(reopened);
    assert.equal((await restored.getRecord(scope,"Order",record.recordId))?.data.orderNumber,"ORD-1001");
    const persisted=JSON.parse(await readFile(path,"utf8"));
    assert.equal(persisted.audit.length,3);
    assert.equal(persisted.outbox.length,3);
    assert.ok(persisted.models.some(item=>item.status==="PUBLISHED"));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test("application data rejects stale model edits and publishes immutable versions",async()=>{
  const service=new ApplicationDataService(new StatefulApplicationDataStore());
  await service.saveModel(scope,model,0,context("save-v1"));
  await service.publishModel(scope,"Order",1,context("publish-v1"));
  await assert.rejects(()=>service.saveModel(scope,model,0,context("stale-model")),/APPLICATION_DATA_MODEL_VERSION_CONFLICT/);
  const changed={...model,fields:[...model.fields,{id:"notes",label:"Notes",type:"string"}]};
  const draft=await service.saveModel(scope,changed,1,context("save-v2"));
  assert.equal(draft.schemaVersion,2);
  assert.equal(draft.status,"DRAFT");
  assert.equal((await service.getRecord(scope,"Order","missing")),null);
});

test("application data validates application scope and query limits",async()=>{
  const service=await configured(new StatefulApplicationDataStore());
  await assert.rejects(()=>service.listRecords({tenantId:" ",applicationId:"shop-a"},"Order"),/APPLICATION_DATA_INVALID_TENANTID/);
  await assert.rejects(()=>service.listRecords(scope,"Order",{limit:101}),/APPLICATION_DATA_QUERY_LIMIT_INVALID/);
});
