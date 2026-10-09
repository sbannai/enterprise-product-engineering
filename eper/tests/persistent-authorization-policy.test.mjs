import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuthorizationPolicyStore } from "../dist/packages/capabilities/json-file-authorization-policy-store.js";

test("authorization policies survive adapter recreation and stay tenant scoped", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-auth-store-")); const path=join(dir,"policies.json");
  try {
    const store=new JsonFileAuthorizationPolicyStore(path);
    store.addPolicy({tenantId:"tenant-a",principalId:"user-a",actions:["read"],resources:["student:1"],effect:"ALLOW"});
    const recreated=new JsonFileAuthorizationPolicyStore(path);
    assert.equal(recreated.snapshot().length,1);
    assert.equal(recreated.decide({tenantId:"tenant-a",principalId:"user-a",action:"read",resource:"student:1"}).effect,"ALLOW");
    assert.equal(recreated.decide({tenantId:"tenant-b",principalId:"user-a",action:"read",resource:"student:1"}).effect,"DENY");
    assert.equal(recreated.decide({tenantId:"tenant-a",principalId:"user-b",action:"read",resource:"student:1"}).effect,"DENY");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("explicit deny takes precedence and invalid policy writes are rejected", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-auth-store-")); const path=join(dir,"policies.json");
  try {
    const store=new JsonFileAuthorizationPolicyStore(path);
    store.addPolicy({tenantId:"tenant-a",actions:["delete"],resources:["record:1"],effect:"ALLOW"});
    store.addPolicy({tenantId:"tenant-a",principalId:"user-a",actions:["delete"],resources:["record:1"],effect:"DENY"});
    assert.equal(store.decide({tenantId:"tenant-a",principalId:"user-a",action:"delete",resource:"record:1"}).reason,"EXPLICIT_DENY_POLICY");
    assert.throws(()=>store.addPolicy({tenantId:"",actions:[],resources:[],effect:"ALLOW"}),/AUTHORIZATION_POLICY_INVALID/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
