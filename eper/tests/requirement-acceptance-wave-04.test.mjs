import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { AuthoritativeRecordService, AuthorizationService, BusinessValidationService, AuditEvidenceService, ExceptionHandlingService, GovernedReportingService } from "../dist/packages/capabilities/services.js";

const req = (id) => { const r = requirementBindings.find((x) => x.id === id); assert.ok(r, `Missing governed requirement: ${id}`); return r; };
const ctx = (id) => ({ tenantId: "wave-04-ch466", principalId: "wave-04-runner", correlationId: id });

test("REQ-46601 / SRS-FR-2341: authoritative lifecycle", async () => {
  const r=req("REQ-46601"); assert.equal(r.pattern,"XX01"); const s=new AuthoritativeRecordService();
  await s.execute(r,{context:ctx("46601-create"),payload:{operation:"create",record:{id:"46601-record",tenantId:"wave-04-ch466",version:1,state:"OPEN",data:{source:"wave-04"}}}});
  const u=await s.execute(r,{context:ctx("46601-update"),payload:{operation:"update",tenantId:"wave-04-ch466",id:"46601-record",expectedVersion:1,patch:{state:"CLOSED"}}});
  assert.equal(u.data.payload.record.version,2); assert.equal(u.data.payload.record.state,"CLOSED");
  assert.throws(()=>s.execute(r,{context:ctx("46601-stale"),payload:{operation:"update",tenantId:"wave-04-ch466",id:"46601-record",expectedVersion:1,patch:{state:"REOPENED"}}}),/RECORD_VERSION_CONFLICT/);
});

test("REQ-46602 / SRS-FR-2342: authorization", async () => {
  const r=req("REQ-46602"); assert.equal(r.pattern,"XX02"); const s=new AuthorizationService();
  const d=await s.execute(r,{context:ctx("46602-deny"),payload:{operation:"decide",request:{tenantId:"wave-04-ch466",principalId:"actor-46602",action:"material.update",resource:"authoritative-record"},policies:[{tenantId:"wave-04-ch466",principalId:"actor-46602",actions:["material.update"],resources:["authoritative-record"],effect:"ALLOW"},{tenantId:"wave-04-ch466",principalId:"actor-46602",actions:["material.update"],resources:["authoritative-record"],effect:"DENY"}]}});
  assert.equal(d.data.payload.decision.effect,"DENY");
  const dd=await s.execute(r,{context:ctx("46602-default"),payload:{operation:"decide",request:{tenantId:"wave-04-ch466",principalId:"unlisted",action:"material.delete",resource:"authoritative-record"}}});
  assert.equal(dd.data.payload.decision.effect,"DENY");
});

test("REQ-46603 / SRS-FR-2343: business validation", async () => {
  const r=req("REQ-46603"); assert.equal(r.pattern,"XX03"); const s=new BusinessValidationService();
  s.addRule({id:"46603-positive-amount",evaluate:(input)=>input?.amount>0?null:{code:"MANDATORY_CONDITION_FAILED",message:"Amount must be positive",severity:"ERROR"}});
  const v=await s.execute(r,{context:ctx("46603-valid"),payload:{operation:"validate",input:{amount:100}}});
  assert.equal(v.data.payload.validation.valid,true);
  const i=await s.execute(r,{context:ctx("46603-invalid"),payload:{operation:"validate",input:{amount:0}}});
  assert.equal(i.data.payload.validation.valid,false);
});

test("REQ-46604 / SRS-FR-2344: audit integrity", async () => {
  const r=req("REQ-46604"); assert.equal(r.pattern,"XX04"); const s=new AuditEvidenceService();
  const a=await s.execute(r,{context:ctx("46604-append"),payload:{operation:"append",evidence:{id:"46604-evidence",tenantId:"wave-04-ch466",requirementId:"REQ-46604",action:"MATERIAL_EVENT",principalId:"wave-04-runner",correlationId:"46604-append",occurredAt:"2026-09-24T04:00:00.000Z",payload:{result:"PASS"}}}});
  assert.match(a.data.payload.evidence.integrityHash,/^[a-f0-9]{64}$/);
  const own=await s.execute(r,{context:ctx("46604-list"),payload:{operation:"listByRequirement",tenantId:"wave-04-ch466",requirementId:"REQ-46604"}});
  assert.equal(own.data.payload.evidence.length,1);
});

test("REQ-46605 / SRS-FR-2345: exception lifecycle", async () => {
  const r=req("REQ-46605"); assert.equal(r.pattern,"XX05"); const s=new ExceptionHandlingService();
  await s.execute(r,{context:ctx("46605-create"),payload:{operation:"create",exception:{id:"46605-exception",tenantId:"wave-04-ch466",requirementId:"REQ-46605",code:"CONTROLLED_FAILURE",message:"Acceptance scenario",idempotencyKey:"46605-idempotency",createdAt:"2026-09-24T04:00:00.000Z"}}});
  const retry=await s.execute(r,{context:ctx("46605-retry"),payload:{operation:"transition",tenantId:"wave-04-ch466",id:"46605-exception",patch:{state:"RETRYING"}}});
  assert.equal(retry.data.payload.exception.state,"RETRYING");
  const resolved=await s.execute(r,{context:ctx("46605-resolve"),payload:{operation:"transition",tenantId:"wave-04-ch466",id:"46605-exception",patch:{state:"RESOLVED"}}});
  assert.equal(resolved.data.payload.exception.state,"RESOLVED");
  assert.throws(()=>s.execute(r,{context:ctx("46605-invalid"),payload:{operation:"transition",tenantId:"wave-04-ch466",id:"46605-exception",patch:{state:"RETRYING"}}}),/EXCEPTION_INVALID_TRANSITION/);
});

test("REQ-46606 / SRS-FR-2346: governed reporting", async () => {
  const r=req("REQ-46606"); assert.equal(r.pattern,"XX06"); const s=new GovernedReportingService();
  await s.execute(r,{context:ctx("46606-publish"),payload:{operation:"publish",row:{tenantId:"wave-04-ch466",reportId:"status-performance",values:{state:"OPEN",performance:99},sourceRequirementIds:["REQ-46606"],generatedAt:"2026-09-24T04:00:00.000Z"}}});
  const own=await s.execute(r,{context:ctx("46606-query"),payload:{operation:"query",request:{tenantId:"wave-04-ch466",reportId:"status-performance",filters:{state:"OPEN"},limit:10}}});
  assert.equal(own.data.payload.rows.length,1);
  const other=await s.execute(r,{context:{...ctx("46606-other"),tenantId:"other-tenant"},payload:{operation:"query",request:{tenantId:"other-tenant",reportId:"status-performance",limit:10}}});
  assert.equal(other.data.payload.rows.length,0);
});
