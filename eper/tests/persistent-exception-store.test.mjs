import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileExceptionStore } from "../dist/packages/capabilities/json-file-exception-store.js";

const input = {
  id: "exception-1", tenantId: "tenant-a", requirementId: "REQ-46305",
  code: "TEST_FAILURE", message: "A test failure", idempotencyKey: "idem-1",
  createdAt: "2026-10-09T00:00:00.000Z",
};

test("exception state and idempotency survive adapter recreation", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-exception-store-")); const path=join(dir,"exceptions.json");
  try {
    const store=new JsonFileExceptionStore(path);
    const created=store.create(input);
    assert.equal(created.state,"OPEN");
    const recreated=new JsonFileExceptionStore(path);
    assert.equal(recreated.get("tenant-a","exception-1")?.state,"OPEN");
    assert.equal(recreated.create(input).id,"exception-1");
    assert.throws(()=>recreated.create({...input,message:"different request"}),/IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST/);
    assert.equal(recreated.get("tenant-b","exception-1"),undefined);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("exception transitions persist and reject invalid lifecycle transitions", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-exception-store-")); const path=join(dir,"exceptions.json");
  try {
    const store=new JsonFileExceptionStore(path);
    store.create(input);
    const retry=store.transition("tenant-a","exception-1",{state:"RETRYING"});
    assert.equal(retry.retryCount,1);
    assert.equal(new JsonFileExceptionStore(path).get("tenant-a","exception-1")?.state,"RETRYING");
    const resolved=store.transition("tenant-a","exception-1",{state:"RESOLVED"});
    assert.equal(resolved.state,"RESOLVED");
    assert.throws(()=>store.transition("tenant-a","exception-1",{state:"RETRYING"}),/EXCEPTION_INVALID_TRANSITION/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { ExceptionHandlingService } from "../dist/packages/capabilities/services.js";

test("exception lifecycle evidence and state survive recreation in the same file-backed store", async () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-exception-audit-")); const path=join(dir,"state.json");
  try {
    const store=new JsonFileExceptionStore(path);
    const service=new ExceptionHandlingService(store,store);
    const requirement=requirementBindings.find(r=>r.pattern==="XX05");
    const context={tenantId:"tenant-a",principalId:"operator-a",correlationId:"atomic-lifecycle"};
    await service.execute(requirement,{context,payload:{operation:"create",exception:{
      id:"exception-atomic",tenantId:"tenant-a",requirementId:requirement.id,code:"TEST",
      message:"Test atomic lifecycle persistence",idempotencyKey:"idem-atomic",createdAt:"2026-10-09T00:00:00.000Z"
    }}});
    await service.execute(requirement,{context,payload:{operation:"transition",tenantId:"tenant-a",id:"exception-atomic",patch:{state:"RETRYING"}}});
    const reopened=new JsonFileExceptionStore(path);
    const reopenedService=new ExceptionHandlingService(reopened,reopened);
    assert.equal(reopenedService.getException("tenant-a","exception-atomic")?.state,"RETRYING");
    const events=reopenedService.listLifecycleEvidence("tenant-a",requirement.id);
    assert.equal(events.length,2);
    assert.deepEqual(events.map(e=>e.action),["EXCEPTION_CREATED","EXCEPTION_TRANSITIONED"]);
    assert.equal(events.every(e=>reopenedService.verifyLifecycleEvidence(e)),true);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
