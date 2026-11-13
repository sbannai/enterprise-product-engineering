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
test("model versions cannot be overwritten in place", async t => {\n  const service=await fixture(t);\n  await assert.rejects(()=>service.registerModel({...model,fields:[...model.fields,{id:"notes",type:"string"}]}),/SCHEMA_VERSION_IMMUTABLE/);\n});\ntest("workflow data operations require an authorization decision", async t => {\n  const service=await fixture(t); const activity=new ApplicationDataWorkflowActivity(service, async () => { throw new Error("DENIED"); });\n  await assert.rejects(()=>activity.execute(context,{entityType:"Order",operation:"query"},{ }),/DENIED/);\n});\ntest("JSON adapter is explicitly a local file adapter", async t => {
  const service=await fixture(t); await service.create(context,"Order","order-01",{customerId:"c1",total:12,status:"NEW"});
  assert.ok((await service.query(context,"Order",{limit:10})).length===1);
});
