import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuthoritativeRecordStore } from "../dist/packages/capabilities/json-file-authoritative-record-store.js";
import { JsonFileAuthorizationPolicyStore } from "../dist/packages/capabilities/json-file-authorization-policy-store.js";
import { JsonFileExceptionStore } from "../dist/packages/capabilities/json-file-exception-store.js";

test("authoritative records persist across adapter recreation and enforce tenant/version boundaries", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-record-persist-")); const path=join(dir,"records.json");
  try {
    const first=new JsonFileAuthoritativeRecordStore(path);
    first.create({id:"record-1",tenantId:"tenant-a",version:1,state:"OPEN",data:{source:"test"}});
    const recreated=new JsonFileAuthoritativeRecordStore(path);
    assert.equal(recreated.get("tenant-a","record-1")?.data.source,"test");
    assert.equal(recreated.get("tenant-b","record-1"),undefined);
    assert.throws(()=>recreated.update("tenant-a","record-1",9,{state:"CLOSED"}),/RECORD_VERSION_CONFLICT/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("authorization policies persist and preserve deny precedence", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-policy-persist-")); const path=join(dir,"policies.json");
  try {
    const first=new JsonFileAuthorizationPolicyStore(path);
    first.addPolicy({tenantId:"tenant-a",principalId:"user-1",actions:["record.update"],resources:["record"],effect:"ALLOW"});
    first.addPolicy({tenantId:"tenant-a",principalId:"user-1",actions:["record.update"],resources:["record"],effect:"DENY"});
    const recreated=new JsonFileAuthorizationPolicyStore(path);
    const decision=recreated.decide({tenantId:"tenant-a",principalId:"user-1",action:"record.update",resource:"record"});
    assert.equal(decision.effect,"DENY");
    assert.equal(recreated.decide({tenantId:"tenant-b",principalId:"user-1",action:"record.update",resource:"record"}).effect,"DENY");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("exception state and lifecycle audit evidence persist together across adapter recreation", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-exception-persist-")); const path=join(dir,"exceptions.json");
  try {
    const first=new JsonFileExceptionStore(path);
    first.create({id:"exception-1",tenantId:"tenant-a",requirementId:"REQ-46305",code:"TEST_FAILURE",message:"restart test",idempotencyKey:"idem-1",createdAt:"2026-10-14T00:00:00.000Z"}, created => {
      first.append({id:"lifecycle-1",tenantId:created.tenantId,requirementId:created.requirementId,action:"EXCEPTION_CREATED",principalId:"user-1",correlationId:"corr-1",occurredAt:created.updatedAt,payload:{exceptionId:created.id,state:created.state}});
    });
    const recreated=new JsonFileExceptionStore(path);
    assert.equal(recreated.get("tenant-a","exception-1")?.state,"OPEN");
    const evidence=recreated.listByRequirement("tenant-a","REQ-46305");
    assert.equal(evidence.length,1);
    assert.equal(recreated.verify(evidence[0]),true);
    assert.equal(recreated.get("tenant-b","exception-1"),undefined);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
