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
