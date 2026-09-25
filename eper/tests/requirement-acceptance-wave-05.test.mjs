import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { AuthoritativeRecordService, AuthorizationService, BusinessValidationService, AuditEvidenceService, ExceptionHandlingService, GovernedReportingService } from "../dist/packages/capabilities/services.js";

const req = (id) => { const r = requirementBindings.find((x) => x.id === id); assert.ok(r, `Missing governed requirement: ${id}`); return r; };
const ctx = (id) => ({ tenantId: "wave-05-ch467", principalId: "wave-05-runner", correlationId: id });

test("REQ-46701 / SRS-FR-2347: authoritative lifecycle", async () => {
  const r=req("REQ-46701"); assert.equal(r.pattern,"XX01"); const s=new AuthoritativeRecordService();
  await s.execute(r,{context:ctx("46701-create"),payload:{operation:"create",record:{id:"46701-record",tenantId:"wave-05-ch467",version:1,state:"OPEN",data:{source:"wave-05"}}}});
  const u=await s.execute(r,{context:ctx("46701-update"),payload:{operation:"update",tenantId:"wave-05-ch467",id:"46701-record",expectedVersion:1,patch:{state:"CLOSED"}}});
  assert.equal(u.data.payload.record.version,2); assert.equal(u.data.payload.record.state,"CLOSED");
  assert.throws(()=>s.execute(r,{context:ctx("46701-stale"),payload:{operation:"update",tenantId:"wave-05-ch467",id:"46701-record",expectedVersion:1,patch:{state:"REOPENED"}}}),/RECORD_VERSION_CONFLICT/);
});

test("REQ-46702 / SRS-FR-2348: authorization", async () => {
  const r=req("REQ-46702"); assert.equal(r.pattern,"XX02"); const s=new AuthorizationService();
  const d=await s.execute(r,{context:ctx("46702-deny"),payload:{operation:"decide",request:{tenantId:"wave-05-ch467",principalId:"actor-46702",action:"material.update",resource:"authoritative-record"},policies:[{tenantId:"wave-05-ch467",principalId:"actor-46702",actions:["material.update"],resources:["authoritative-record"],effect:"ALLOW"},{tenantId:"wave-05-ch467",principalId:"actor-46702",actions:["material.update"],resources:["authoritative-record"],effect:"DENY"}]}});
  assert.equal(d.data.payload.decision.effect,"DENY");
  const dd=await s.execute(r,{context:ctx("46702-default"),payload:{operation:"decide",request:{tenantId:"wave-05-ch467",principalId:"unlisted",action:"material.delete",resource:"authoritative-record"}}});
  assert.equal(dd.data.payload.decision.effect,"DENY");
});

test("REQ-46703 / SRS-FR-2349: business validation", async () => {
  const r=req("REQ-46703"); assert.equal(r.pattern,"XX03"); const s=new BusinessValidationService();
  s.addRule({id:"46703-positive-amount",evaluate:(input)=>input?.amount>0?null:{code:"MANDATORY_CONDITION_FAILED",message:"Amount must be positive",severity:"ERROR"}});
  const v=await s.execute(r,{context:ctx("46703-valid"),payload:{operation:"validate",input:{amount:100}}});
  assert.equal(v.data.payload.validation.valid,true);
  const i=await s.execute(r,{context:ctx("46703-invalid"),payload:{operation:"validate",input:{amount:0}}});
  assert.equal(i.data.payload.validation.valid,false);
});

test("REQ-46704 / SRS-FR-2350: audit integrity and tenant isolation", async () => {
  const r=req("REQ-46704"); assert.equal(r.pattern,"XX04"); const s=new AuditEvidenceService();
  const a=await s.execute(r,{context:ctx("46704-append"),payload:{operation:"append",evidence:{id:"46704-evidence",tenantId:"wave-05-ch467",requirementId:"REQ-46704",action:"MATERIAL_EVENT",principalId:"wave-05-runner",correlationId:"46704-append",occurredAt:"2026-09-25T03:00:00.000Z",payload:{result:"PASS"}}}});
  assert.match(a.data.payload.evidence.integrityHash,/^[a-f0-9]{64}$/);
  const own=await s.execute(r,{context:ctx("46704-list"),payload:{operation:"listByRequirement",tenantId:"wave-05-ch467",requirementId:"REQ-46704"}});
  assert.equal(own.data.payload.evidence.length,1);
  const other=await s.execute(r,{context:{...ctx("46704-other"),tenantId:"other-tenant"},payload:{operation:"listByRequirement",tenantId:"other-tenant",requirementId:"REQ-46704"}});
  assert.equal(other.data.payload.evidence.length,0);
});

test("REQ-46705 / SRS-FR-2351: controlled exception lifecycle", async () => {
  const r=req("REQ-46705"); assert.equal(r.pattern,"XX05"); const s=new ExceptionHandlingService();
  await s.execute(r,{context:ctx("46705-create"),payload:{operation:"create",exception:{id:"46705-exception",tenantId:"wave-05-ch467",requirementId:"REQ-46705",code:"CONTROLLED_FAILURE",message:"Acceptance scenario",idempotencyKey:"46705-idempotency",createdAt:"2026-09-25T03:00:00.000Z"}}});
  const retry=await s.execute(r,{context:ctx("46705-retry"),payload:{operation:"transition",tenantId:"wave-05-ch467",id:"46705-exception",patch:{state:"RETRYING"}}});
  assert.equal(retry.data.payload.exception.state,"RETRYING");
  const resolved=await s.execute(r,{context:ctx("46705-resolve"),payload:{operation:"transition",tenantId:"wave-05-ch467",id:"46705-exception",patch:{state:"RESOLVED"}}});
  assert.equal(resolved.data.payload.exception.state,"RESOLVED");
  assert.throws(()=>s.execute(r,{context:ctx("46705-invalid"),payload:{operation:"transition",tenantId:"wave-05-ch467",id:"46705-exception",patch:{state:"RETRYING"}}}),/EXCEPTION_INVALID_TRANSITION/);
});

test("REQ-46706 / SRS-FR-2352: governed reporting", async () => {
  const r=req("REQ-46706"); assert.equal(r.pattern,"XX06"); const s=new GovernedReportingService();
  await s.execute(r,{context:ctx("46706-publish"),payload:{operation:"publish",row:{tenantId:"wave-05-ch467",reportId:"status-performance",values:{state:"OPEN",performance:99},sourceRequirementIds:["REQ-46706"],generatedAt:"2026-09-25T03:00:00.000Z"}}});
  const own=await s.execute(r,{context:ctx("46706-query"),payload:{operation:"query",request:{tenantId:"wave-05-ch467",reportId:"status-performance",filters:{state:"OPEN"},limit:10}}});
  assert.equal(own.data.payload.rows.length,1);
  const other=await s.execute(r,{context:{...ctx("46706-other"),tenantId:"other-tenant"},payload:{operation:"query",request:{tenantId:"other-tenant",reportId:"status-performance",limit:10}}});
  assert.equal(other.data.payload.rows.length,0);
});
