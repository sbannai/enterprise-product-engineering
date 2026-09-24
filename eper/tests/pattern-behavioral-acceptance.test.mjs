import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { AuthoritativeRecordService, AuthorizationService, BusinessValidationService, AuditEvidenceService, ExceptionHandlingService, GovernedReportingService } from "../dist/packages/capabilities/services.js";
const req=(pattern)=>requirementBindings.find((r)=>r.pattern===pattern);
const context=(id)=>({tenantId:"behavioral-acceptance",principalId:"acceptance-runner",correlationId:id});

test("XX01 authoritative records: create, update, version control and tenant isolation",async()=>{
 const service=new AuthoritativeRecordService(),requirement=req("XX01");
 const created=await service.execute(requirement,{context:context("xx01-create"),payload:{operation:"create",record:{id:"rec-1",tenantId:"behavioral-acceptance",version:1,state:"OPEN",data:{}}}});
 assert.equal(created.data.payload.record.version,1);
 const updated=await service.execute(requirement,{context:context("xx01-update"),payload:{operation:"update",tenantId:"behavioral-acceptance",id:"rec-1",expectedVersion:1,patch:{state:"CLOSED"}}});
 assert.equal(updated.data.payload.record.version,2); assert.equal(updated.data.payload.record.state,"CLOSED");
 assert.throws(()=>service.execute(requirement,{context:context("xx01-stale"),payload:{operation:"update",tenantId:"behavioral-acceptance",id:"rec-1",expectedVersion:1,patch:{}}}),/RECORD_VERSION_CONFLICT/);
 const other=await service.execute(requirement,{context:{...context("xx01-tenant"),tenantId:"other-tenant"},payload:{operation:"get",tenantId:"other-tenant",id:"rec-1"}});
 assert.equal(other.data.payload.record,undefined);
});
test("XX02 authorization: explicit allow, deny precedence and default deny",async()=>{
 const service=new AuthorizationService(),requirement=req("XX02");
 const denied=await service.execute(requirement,{context:context("xx02-deny"),payload:{operation:"decide",request:{tenantId:"behavioral-acceptance",principalId:"user-1",action:"read",resource:"record"},policies:[{tenantId:"behavioral-acceptance",principalId:"user-1",actions:["read"],resources:["record"],effect:"ALLOW"},{tenantId:"behavioral-acceptance",principalId:"user-1",actions:["read"],resources:["record"],effect:"DENY"}]}});
 assert.equal(denied.data.payload.decision.effect,"DENY");
 const allowed=await service.execute(requirement,{context:context("xx02-allow"),payload:{operation:"decide",request:{tenantId:"behavioral-acceptance",principalId:"user-2",action:"read",resource:"record"},policies:[{tenantId:"behavioral-acceptance",principalId:"user-2",actions:["read"],resources:["record"],effect:"ALLOW"}]}});
 assert.equal(allowed.data.payload.decision.effect,"ALLOW");
 const def=await service.execute(requirement,{context:context("xx02-default"),payload:{operation:"decide",request:{tenantId:"behavioral-acceptance",principalId:"unknown",action:"delete",resource:"record"}}});
 assert.equal(def.data.payload.decision.effect,"DENY");
});
test("XX03 business validation: valid input passes and rule violation is reported",async()=>{
 const service=new BusinessValidationService(),requirement=req("XX03");
 service.addRule({id:"amount-positive",evaluate:(input)=>input?.amount>0?null:{code:"AMOUNT_NON_POSITIVE",message:"Amount must be positive",severity:"ERROR"}});
 const valid=await service.execute(requirement,{context:context("xx03-valid"),payload:{operation:"validate",input:{amount:100}}});
 assert.equal(valid.data.payload.validation.valid,true);
 const invalid=await service.execute(requirement,{context:context("xx03-invalid"),payload:{operation:"validate",input:{amount:0}}});
 assert.equal(invalid.data.payload.validation.valid,false); assert.equal(invalid.data.payload.validation.issues.length,1);
});
test("XX04 audit evidence: append, integrity hash and tenant isolation",async()=>{
 const service=new AuditEvidenceService(),requirement=req("XX04");
 const evidence={id:"ev-1",tenantId:"behavioral-acceptance",requirementId:requirement.id,action:"TEST_EXECUTION",principalId:"acceptance-runner",correlationId:"xx04-append",occurredAt:"2026-09-24T00:00:00.000Z",payload:{result:"PASS"}};
 const appended=await service.execute(requirement,{context:context("xx04-append"),payload:{operation:"append",evidence}});
 assert.equal(appended.data.payload.evidence.id,"ev-1"); assert.match(appended.data.payload.evidence.integrityHash,/^[a-f0-9]{64}$/);
 const listed=await service.execute(requirement,{context:context("xx04-list"),payload:{operation:"listByRequirement",tenantId:"behavioral-acceptance",requirementId:requirement.id}});
 assert.equal(listed.data.payload.evidence.length,1);
 const other=await service.execute(requirement,{context:context("xx04-other"),payload:{operation:"listByRequirement",tenantId:"other-tenant",requirementId:requirement.id}});
 assert.equal(other.data.payload.evidence.length,0);
});
test("XX05 exception handling: valid transition, retry count and invalid terminal transition",async()=>{
 const service=new ExceptionHandlingService(),requirement=req("XX05");
 const created=await service.execute(requirement,{context:context("xx05-create"),payload:{operation:"create",exception:{id:"ex-1",tenantId:"behavioral-acceptance",requirementId:requirement.id,code:"FAILURE",message:"failure",idempotencyKey:"idem-ex-1",createdAt:"2026-09-24T00:00:00.000Z"}}});
 assert.equal(created.data.payload.exception.state,"OPEN");
 const retrying=await service.execute(requirement,{context:context("xx05-retry"),payload:{operation:"transition",tenantId:"behavioral-acceptance",id:"ex-1",patch:{state:"RETRYING"}}});
 assert.equal(retrying.data.payload.exception.state,"RETRYING"); assert.equal(retrying.data.payload.exception.retryCount,1);
 const resolved=await service.execute(requirement,{context:context("xx05-resolve"),payload:{operation:"transition",tenantId:"behavioral-acceptance",id:"ex-1",patch:{state:"RESOLVED"}}});
 assert.equal(resolved.data.payload.exception.state,"RESOLVED");
 assert.throws(()=>service.execute(requirement,{context:context("xx05-invalid"),payload:{operation:"transition",tenantId:"behavioral-acceptance",id:"ex-1",patch:{state:"RETRYING"}}}),/EXCEPTION_INVALID_TRANSITION/);
});
test("XX06 governed reporting: publish, query filtering and tenant isolation",async()=>{
 const service=new GovernedReportingService(),requirement=req("XX06");
 await service.execute(requirement,{context:context("xx06-publish"),payload:{operation:"publish",row:{tenantId:"behavioral-acceptance",reportId:"status",values:{state:"OPEN",priority:"P1"},sourceRequirementIds:[requirement.id],generatedAt:"2026-09-24T00:00:00.000Z"}}});
 const own=await service.execute(requirement,{context:context("xx06-query"),payload:{operation:"query",request:{tenantId:"behavioral-acceptance",reportId:"status",filters:{state:"OPEN"},limit:10}}});
 assert.equal(own.data.payload.rows.length,1);
 const other=await service.execute(requirement,{context:context("xx06-other"),payload:{operation:"query",request:{tenantId:"other-tenant",reportId:"status",limit:10}}});
 assert.equal(other.data.payload.rows.length,0);
});
