import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { AuthoritativeRecordService, AuthorizationService, BusinessValidationService, AuditEvidenceService, ExceptionHandlingService, GovernedReportingService } from "../dist/packages/capabilities/services.js";

const req = (id) => { const r = requirementBindings.find(x => x.id === id); assert.ok(r, "Missing governed requirement: " + id); return r; };
const ctx = (id) => ({ tenantId: "wave-06-ch468", principalId: "wave-06-runner", correlationId: id });

test("REQ-46801 / SRS-FR-2353: authoritative lifecycle", async () => {
  const r=req("REQ-46801"); assert.equal(r.pattern,"XX01"); const s=new AuthoritativeRecordService();
  await s.execute(r,{context:ctx("46801-create"),payload:{operation:"create",record:{id:"46801-record",tenantId:"wave-06-ch468",version:1,state:"OPEN",data:{source:"wave-06"}}}});
  const u=await s.execute(r,{context:ctx("46801-update"),payload:{operation:"update",tenantId:"wave-06-ch468",id:"46801-record",expectedVersion:1,patch:{state:"CLOSED"}}});
  assert.equal(u.data.payload.record.version,2); assert.equal(u.data.payload.record.state,"CLOSED");
  assert.throws(()=>s.execute(r,{context:ctx("46801-stale"),payload:{operation:"update",tenantId:"wave-06-ch468",id:"46801-record",expectedVersion:1,patch:{state:"REOPENED"}}}),/RECORD_VERSION_CONFLICT/);
});
test("REQ-46802 / SRS-FR-2354: authorization", async () => {
  const r=req("REQ-46802"); assert.equal(r.pattern,"XX02"); const s=new AuthorizationService();
  const d=await s.execute(r,{context:ctx("46802-deny"),payload:{operation:"decide",request:{tenantId:"wave-06-ch468",principalId:"actor-46802",action:"material.update",resource:"authoritative-record"},policies:[{tenantId:"wave-06-ch468",principalId:"actor-46802",actions:["material.update"],resources:["authoritative-record"],effect:"ALLOW"},{tenantId:"wave-06-ch468",principalId:"actor-46802",actions:["material.update"],resources:["authoritative-record"],effect:"DENY"}]}});
  assert.equal(d.data.payload.decision.effect,"DENY");
  const dd=await s.execute(r,{context:ctx("46802-default"),payload:{operation:"decide",request:{tenantId:"wave-06-ch468",principalId:"unlisted",action:"material.delete",resource:"authoritative-record"}}});
  assert.equal(dd.data.payload.decision.effect,"DENY");
});
test("REQ-46803 / SRS-FR-2355: business validation", async () => {
  const r=req("REQ-46803"); assert.equal(r.pattern,"XX03"); const s=new BusinessValidationService();
  s.addRule({id:"46803-positive-amount",evaluate:i=>i?.amount>0?null:{code:"MANDATORY_CONDITION_FAILED",message:"Amount must be positive",severity:"ERROR"}});
  const v=await s.execute(r,{context:ctx("46803-valid"),payload:{operation:"validate",input:{amount:100}}}); assert.equal(v.data.payload.validation.valid,true);
  const i=await s.execute(r,{context:ctx("46803-invalid"),payload:{operation:"validate",input:{amount:0}}}); assert.equal(i.data.payload.validation.valid,false);
});
test("REQ-46804 / SRS-FR-2356: audit integrity and tenant isolation", async () => {
  const r=req("REQ-46804"); assert.equal(r.pattern,"XX04"); const s=new AuditEvidenceService();
  const a=await s.execute(r,{context:ctx("46804-append"),payload:{operation:"append",evidence:{id:"46804-evidence",tenantId:"wave-06-ch468",requirementId:"REQ-46804",action:"MATERIAL_EVENT",principalId:"wave-06-runner",correlationId:"46804-append",occurredAt:"2026-09-25T03:00:00.000Z",payload:{result:"PASS"}}}});
  assert.match(a.data.payload.evidence.integrityHash,/^[a-f0-9]{64}$/);
  const own=await s.execute(r,{context:ctx("46804-list"),payload:{operation:"listByRequirement",tenantId:"wave-06-ch468",requirementId:"REQ-46804"}}); assert.equal(own.data.payload.evidence.length,1);
  const other=await s.execute(r,{context:{...ctx("46804-other"),tenantId:"other-tenant"},payload:{operation:"listByRequirement",tenantId:"other-tenant",requirementId:"REQ-46804"}}); assert.equal(other.data.payload.evidence.length,0);
});
test("REQ-46805 / SRS-FR-2357: controlled exception lifecycle", async () => {
  const r=req("REQ-46805"); assert.equal(r.pattern,"XX05"); const s=new ExceptionHandlingService();
  await s.execute(r,{context:ctx("46805-create"),payload:{operation:"create",exception:{id:"46805-exception",tenantId:"wave-06-ch468",requirementId:"REQ-46805",code:"CONTROLLED_FAILURE",message:"Acceptance scenario",idempotencyKey:"46805-idempotency",createdAt:"2026-09-25T03:00:00.000Z"}}});
  const retry=await s.execute(r,{context:ctx("46805-retry"),payload:{operation:"transition",tenantId:"wave-06-ch468",id:"46805-exception",patch:{state:"RETRYING"}}}); assert.equal(retry.data.payload.exception.state,"RETRYING");
  const resolved=await s.execute(r,{context:ctx("46805-resolve"),payload:{operation:"transition",tenantId:"wave-06-ch468",id:"46805-exception",patch:{state:"RESOLVED"}}}); assert.equal(resolved.data.payload.exception.state,"RESOLVED");
  assert.throws(()=>s.execute(r,{context:ctx("46805-invalid"),payload:{operation:"transition",tenantId:"wave-06-ch468",id:"46805-exception",patch:{state:"RETRYING"}}}),/EXCEPTION_INVALID_TRANSITION/);
});
test("REQ-46806 / SRS-FR-2358: governed reporting", async () => {
  const r=req("REQ-46806"); assert.equal(r.pattern,"XX06"); const s=new GovernedReportingService();
  await s.execute(r,{context:ctx("46806-publish"),payload:{operation:"publish",row:{tenantId:"wave-06-ch468",reportId:"status-performance",values:{state:"OPEN",performance:99},sourceRequirementIds:["REQ-46806"],generatedAt:"2026-09-25T03:00:00.000Z"}}});
  const own=await s.execute(r,{context:ctx("46806-query"),payload:{operation:"query",request:{tenantId:"wave-06-ch468",reportId:"status-performance",filters:{state:"OPEN"},limit:10}}}); assert.equal(own.data.payload.rows.length,1);
  const other=await s.execute(r,{context:{...ctx("46806-other"),tenantId:"other-tenant"},payload:{operation:"query",request:{tenantId:"other-tenant",reportId:"status-performance",limit:10}}}); assert.equal(other.data.payload.rows.length,0);
});
