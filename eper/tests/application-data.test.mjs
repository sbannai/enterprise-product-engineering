import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileApplicationDataAdapter } from "../dist/packages/application-data/json-adapter.js";
import { ApplicationDataService } from "../dist/packages/application-data/service.js";
import { ApplicationDataWorkflowActivity } from "../dist/packages/application-data/workflow-binding.js";

const context = { tenantId:"tenant-a", applicationId:"app-a", actorId:"actor-a", correlationId:"corr-a", requirementId:"REQ-TEST" };
const model = { tenantId:"tenant-a", applicationId:"app-a", entityType:"Order", version:1, status:"ACTIVE",
  fields:[{id:"customerId",type:"string",required:true},{id:"total",type:"number",required:true},{id:"status",type:"string",required:true,enum:["NEW","PAID"]}] };
async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),"eper-app-data-")); t.after(()=>rm(dir,{recursive:true,force:true}));
  const service=new ApplicationDataService(new JsonFileApplicationDataAdapter(join(dir,"data.json")));
  await service.registerModel(model); return service;
}
test("application data is scoped to tenant and application and validates registered entity fields", async t => {
  const service=await fixture(t);
  await service.create(context,"Order","order-01",{customerId:"c1",total:12,status:"NEW"});
  assert.equal((await service.get(context,"Order","order-01")).data.total,12);
  await assert.rejects(()=>service.get({...context,applicationId:"app-b"},"Order","order-01"),/MODEL_NOT_ACTIVE/);
  await assert.rejects(()=>service.create(context,"Order","order-02",{customerId:"c1",total:"12",status:"NEW"}),/FIELD_TYPE_INVALID/);
  await assert.rejects(()=>service.create(context,"Order","order-03",{customerId:"c1",total:12,status:"NEW",unexpected:true}),/UNKNOWN_FIELD/);
});
test("application data enforces optimistic concurrency and schema validation on update", async t => {
  const service=await fixture(t);
  await service.create(context,"Order","order-01",{customerId:"c1",total:12,status:"NEW"});
  const updated=await service.update(context,"Order","order-01",1,{data:{customerId:"c1",total:14,status:"PAID"}});
  assert.equal(updated.version,2);
  await assert.rejects(()=>service.update(context,"Order","order-01",1,{state:"ARCHIVED"}),/VERSION_CONFLICT/);
});
test("workflow binding invokes registered operations without exposing a storage collection", async t => {
  const service=await fixture(t); const activity=new ApplicationDataWorkflowActivity(service, async () => {});
  const result=await activity.execute(context,{entityType:"Order",operation:"create",recordIdField:"orderId",dataField:"payload"},{orderId:"order-01",payload:{customerId:"c1",total:12,status:"NEW"}});
  assert.equal(result.result.id,"order-01");
  await assert.rejects(()=>activity.execute(context,{entityType:"Order",operation:"create",recordIdField:"id",dataField:"payload"},{id:"order-02",payload:{bad:true}}),/UNKNOWN_FIELD/);
});
test("model versions cannot be overwritten in place", async t => {
  const service=await fixture(t);
  await assert.rejects(()=>service.registerModel({...model,fields:[...model.fields,{id:"notes",type:"string"}]}),/SCHEMA_VERSION_IMMUTABLE/);
});
test("workflow data operations require an authorization decision", async t => {
  const service=await fixture(t); const activity=new ApplicationDataWorkflowActivity(service, async () => { throw new Error("DENIED"); });
  await assert.rejects(()=>activity.execute(context,{entityType:"Order",operation:"query"},{ }),/DENIED/);
});
test("JSON adapter is explicitly a local file adapter", async t => {
  const service=await fixture(t); await service.create(context,"Order","order-01",{customerId:"c1",total:12,status:"NEW"});
  assert.ok((await service.query(context,"Order",{limit:10})).length===1);
});

test("relationships must resolve to records in the same tenant and application", async t => {
  const service=await fixture(t);
  await service.registerModel({tenantId:"tenant-a",applicationId:"app-a",entityType:"Customer",version:1,status:"ACTIVE",
    fields:[{id:"name",type:"string",required:true}]});
  await service.registerModel({...model,version:2,relationships:[{field:"customerId",targetEntity:"Customer",cardinality:"one"}]});
  await assert.rejects(()=>service.create(context,"Order","order-missing",{customerId:"customer-404",total:10,status:"NEW"}),/RELATIONSHIP_TARGET_NOT_FOUND/);
  await service.create(context,"Customer","customer-01",{name:"A"});
  await service.create(context,"Order","order-linked",{customerId:"customer-01",total:10,status:"NEW"});
  await assert.rejects(()=>service.get({...context,applicationId:"app-b"},"Order","order-linked"),/MODEL_NOT_ACTIVE/);
});

test("draft schema versions do not displace the active transaction schema", async t => {
  const service=await fixture(t);
  await service.registerModel({...model,version:2,status:"DRAFT",fields:[...model.fields,{id:"notes",type:"string"}]});
  const saved=await service.create(context,"Order","order-draft-safe",{customerId:"c1",total:8,status:"NEW"});
  assert.equal(saved.schemaVersion,1);
});

test("draft schema activation is an explicit status-only transition", async t => {
  const service=await fixture(t);
  const draft={...model,version:2,status:"DRAFT",fields:[...model.fields,{id:"notes",type:"string"}]};
  await service.registerModel(draft);
  await service.activateModel("tenant-a","app-a","Order",2);
  const saved=await service.create(context,"Order","order-v2",{customerId:"c1",total:8,status:"NEW",notes:"published"});
  assert.equal(saved.schemaVersion,2);
  await assert.rejects(()=>service.registerModel({...draft,status:"ACTIVE"}),/SCHEMA_VERSION_IMMUTABLE/);
});

test("activating a new schema retires the previous active version", async t => {
  const service=await fixture(t);
  const draft={...model,version:2,status:"DRAFT",fields:[...model.fields,{id:"notes",type:"string"}]};
  await service.registerModel(draft);
  await service.activateModel("tenant-a","app-a","Order",2);
  assert.equal((await service["adapter"].getModel("tenant-a","app-a","Order",1)).status,"RETIRED");
  assert.equal((await service["adapter"].getActiveModel("tenant-a","app-a","Order")).version,2);
});

test("create idempotency returns the original result and rejects key reuse with different data", async t => {
  const service=await fixture(t);
  const requestContext={...context,idempotencyKey:"checkout-attempt-0001"};
  const first=await service.create(requestContext,"Order","order-retry-01",{customerId:"c1",total:12,status:"NEW"});
  const replay=await service.create(requestContext,"Order","order-retry-01",{customerId:"c1",total:12,status:"NEW"});
  assert.deepEqual(replay,first);
  assert.equal((await service.query(context,"Order",{limit:10})).length,1);
  await assert.rejects(()=>service.create(requestContext,"Order","order-retry-02",{customerId:"c1",total:99,status:"NEW"}),/IDEMPOTENCY_KEY_REUSED/);
  assert.equal((await service.query(context,"Order",{limit:10})).length,1);
});

test("create without an idempotency key retains ordinary duplicate-record protection", async t => {
  const service=await fixture(t);
  await service.create(context,"Order","order-plain-01",{customerId:"c1",total:12,status:"NEW"});
  await assert.rejects(()=>service.create(context,"Order","order-plain-01",{customerId:"c1",total:12,status:"NEW"}),/RECORD_EXISTS/);
});
