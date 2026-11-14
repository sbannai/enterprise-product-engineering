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
  const result=await activity.execute({...context,idempotencyKey:"workflow-create-0001"},{entityType:"Order",operation:"create",recordIdField:"orderId",dataField:"payload"},{orderId:"order-01",payload:{customerId:"c1",total:12,status:"NEW"}});
  assert.equal(result.result.id,"order-01");
  await assert.rejects(()=>activity.execute({...context,idempotencyKey:"workflow-create-0002"},{entityType:"Order",operation:"create",recordIdField:"id",dataField:"payload"},{id:"order-02",payload:{bad:true}}),/UNKNOWN_FIELD/);
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
  await service.registerModel({...model,version:2,status:"DRAFT",relationships:[{field:"customerId",targetEntity:"Customer",cardinality:"one"}]});
  await service.activateModel("tenant-a","app-a","Order",2);
  await assert.rejects(()=>service.create(context,"Order","order-missing",{customerId:"customer-404",total:10,status:"NEW"}),/RELATIONSHIP_TARGET_NOT_FOUND/);
  await service.create(context,"Customer","customer-01",{name:"A"});
  await service.create(context,"Order","order-linked",{customerId:"customer-01",total:10,status:"NEW"});
  await assert.rejects(()=>service.delete(context,"Customer","customer-01",1),/APPLICATION_DATA_RECORD_REFERENCED/);
  await service.delete(context,"Order","order-linked",1);
  await service.delete(context,"Customer","customer-01",1);
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
  await assert.rejects(()=>service.registerModel({...draft,status:"ACTIVE"}),/ACTIVATION_REQUIRED/);
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
  await service.registerModel({...model,version:2,status:"DRAFT",fields:[...model.fields,{id:"fulfillmentMode",type:"string",required:true}]});
  await service.activateModel("tenant-a","app-a","Order",2);
  const replayAfterSchemaUpgrade=await service.create(requestContext,"Order","order-retry-01",{customerId:"c1",total:12,status:"NEW"});
  assert.deepEqual(replayAfterSchemaUpgrade,first);
  assert.equal((await service.query(context,"Order",{limit:10})).length,1);
  await assert.rejects(()=>service.create(requestContext,"Order","order-retry-02",{customerId:"c1",total:99,status:"NEW"}),/IDEMPOTENCY_KEY_REUSED/);
  assert.equal((await service.query(context,"Order",{limit:10})).length,1);
});

test("update idempotency replays the original versioned mutation and rejects changed payloads", async t => {
  const service=await fixture(t);
  await service.create(context,"Order","order-update-retry",{customerId:"c1",total:12,status:"NEW"});
  const requestContext={...context,idempotencyKey:"update-attempt-0001"};
  const patch={data:{customerId:"c1",total:12,status:"PAID"}};
  const first=await service.update(requestContext,"Order","order-update-retry",1,patch);
  const replay=await service.update(requestContext,"Order","order-update-retry",1,patch);
  assert.deepEqual(replay,first);
  assert.equal(replay.version,2);
  await assert.rejects(()=>service.update(requestContext,"Order","order-update-retry",1,{data:{customerId:"c1",total:12,status:"CANCELLED"}}),/IDEMPOTENCY_KEY_REUSED/);
  assert.equal((await service.get(context,"Order","order-update-retry")).version,2);
});

test("delete idempotency replays a committed delete and rejects key reuse", async t => {
  const service=await fixture(t);
  await service.create(context,"Order","order-delete-retry",{customerId:"c1",total:12,status:"NEW"});
  const requestContext={...context,idempotencyKey:"delete-attempt-0001"};
  await service.delete(requestContext,"Order","order-delete-retry",1);
  await service.delete(requestContext,"Order","order-delete-retry",1);
  assert.equal(await service.get(context,"Order","order-delete-retry"),undefined);
  await assert.rejects(()=>service.delete(requestContext,"Order","another-order",1),/IDEMPOTENCY_KEY_REUSED/);
});

test("create without an idempotency key retains ordinary duplicate-record protection", async t => {
  const service=await fixture(t);
  await service.create(context,"Order","order-plain-01",{customerId:"c1",total:12,status:"NEW"});
  await assert.rejects(()=>service.create(context,"Order","order-plain-01",{customerId:"c1",total:12,status:"NEW"}),/RECORD_EXISTS/);
});


test("workflow data mutations require stable idempotency and replay the committed result", async t => {
  const service=await fixture(t);
  const activity=new ApplicationDataWorkflowActivity(service,async()=>{});
  const binding={entityType:"Order",operation:"create",recordIdField:"recordId",dataField:"order"};
  const input={recordId:"workflow-order-01",order:{customerId:"c1",total:42,status:"NEW"}};
  await assert.rejects(()=>activity.execute(context,binding,input),/WORKFLOW_IDEMPOTENCY_KEY_REQUIRED/);
  const requestContext={...context,idempotencyKey:"wf-instance-01-activity-01"};
  const first=await activity.execute(requestContext,binding,input);
  const replay=await activity.execute(requestContext,binding,input);
  assert.deepEqual(replay,first);
  await assert.rejects(()=>activity.execute(requestContext,binding,{
    ...input,order:{customerId:"c1",total:43,status:"NEW"}
  }),/IDEMPOTENCY_KEY_REUSED/);
});

test("workflow data update requires an explicit patch payload", async t => {
  const service=await fixture(t);
  const activity=new ApplicationDataWorkflowActivity(service,async()=>{});
  const requestContext={...context,idempotencyKey:"wf-instance-02-activity-01"};
  await assert.rejects(()=>activity.execute(requestContext,{
    entityType:"Order",operation:"update",recordIdField:"recordId",expectedVersionField:"version"
  },{recordId:"order-01",version:1}),/WORKFLOW_INPUT_INVALID/);
});
