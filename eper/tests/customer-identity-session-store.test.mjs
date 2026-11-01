import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PostgresCustomerIdentitySessionStore } from "../dist/packages/identity/postgres-customer-identity-session-store.js";

function fakePool({ binding = true, session = true, subject = true } = {}) {
  const calls=[];
  const client={
    async query(sql,values=[]) {
      calls.push({sql,values});
      if (/INSERT INTO eper_customer_oidc_subject_bindings/.test(sql)) return {rows:[{issuer:values[0],subject:values[1],tenant_id:values[2],actor_id:values[3],binding_status:"active",version:1}],rowCount:1};
      if (/SELECT issuer, subject, tenant_id, actor_id, binding_status, version FROM eper_customer_oidc_subject_bindings/.test(sql)) return {rows:subject?[{issuer:values[0],subject:values[1],tenant_id:"tenant-a",actor_id:"actor-a",binding_status:"active",version:1}]:[],rowCount:subject?1:0};
      if (/SELECT 1 FROM eper_customer_oidc_subject_bindings/.test(sql)) return {rows:[],rowCount:binding?1:0};
      if (/INSERT INTO eper_customer_browser_sessions/.test(sql)) return {rows:[{created_at:"2026-11-01T00:00:00.000Z",last_seen_at:values[5],idle_expires_at:values[6],absolute_expires_at:values[7]}],rowCount:1};
      if (/SELECT s\.tenant_id/.test(sql)) return {rows:session?[{tenant_id:"tenant-a",actor_id:"actor-a",issuer:"https://id.example",subject:"subject-a",created_at:"2026-11-01T00:00:00.000Z",last_seen_at:"2026-11-01T00:00:00.000Z",idle_expires_at:"2026-11-01T00:30:00.000Z",absolute_expires_at:"2026-11-01T08:00:00.000Z"}]:[],rowCount:session?1:0};
      if (/UPDATE eper_customer_browser_sessions SET revoked_at/.test(sql)) return {rows:[{tenant_id:"tenant-a",actor_id:"actor-a"}],rowCount:1};
      if (/UPDATE eper_customer_oidc_subject_bindings SET binding_status/.test(sql)) return {rows:[{tenant_id:"tenant-a",actor_id:"actor-a"}],rowCount:1};
      if (/to_regclass/.test(sql)) return {rows:[{bindings:"eper_customer_oidc_subject_bindings",sessions:"eper_customer_browser_sessions",events:"eper_customer_identity_events"}],rowCount:1};
      return {rows:[],rowCount:1};
    },
    release() {}
  };
  return {calls,pool:{async connect(){return client;}}};
}
const base={issuer:"https://id.example",subject:"subject-a",tenantId:"tenant-a",actorId:"actor-a",correlationId:"identity-test-001"};

test("subject binding is explicit, tenant/actor-bound and audited in the same transaction",async()=>{
  const {calls,pool}=fakePool(); const store=new PostgresCustomerIdentitySessionStore(pool);
  const binding=await store.bindSubject({...base,provisionedBy:"tenant-admin"});
  assert.equal(binding.status,"active"); assert.equal(binding.tenantId,"tenant-a"); assert.equal(binding.actorId,"actor-a");
  assert.equal(calls[0].sql,"BEGIN");
  assert.ok(calls.some(c=>/INSERT INTO eper_customer_identity_events/.test(c.sql)));
  assert.equal(calls.at(-1).sql,"COMMIT");
});

test("subject resolution returns only active server-side bindings",async()=>{
  const {pool}=fakePool(); const store=new PostgresCustomerIdentitySessionStore(pool);
  assert.equal((await store.resolveSubject(base.issuer,base.subject)).actorId,"actor-a");
  const denied=new PostgresCustomerIdentitySessionStore(fakePool({subject:false}).pool);
  assert.equal(await denied.resolveSubject(base.issuer,base.subject),null);
});

test("session creation stores only a hash and requires an active subject binding",async()=>{
  const {calls,pool}=fakePool(); const store=new PostgresCustomerIdentitySessionStore(pool);
  const now=Date.now();
  const created=await store.createSession({...base,idleExpiresAt:new Date(now+30*60_000),absoluteExpiresAt:new Date(now+8*60*60_000)});
  assert.ok(created.sessionToken.length>=40);
  const insert=calls.find(c=>/INSERT INTO eper_customer_browser_sessions/.test(c.sql));
  assert.notEqual(insert.values[0],created.sessionToken);
  assert.equal(insert.values[0],createHash("sha256").update(created.sessionToken).digest("hex"));
  assert.ok(calls.some(c=>/session.created/.test(c.sql)));
});

test("session creation fails closed when the subject binding is inactive",async()=>{
  const {pool}=fakePool({binding:false}); const store=new PostgresCustomerIdentitySessionStore(pool); const now=Date.now();
  await assert.rejects(()=>store.createSession({...base,idleExpiresAt:new Date(now+10000),absoluteExpiresAt:new Date(now+60000)}),{message:"EPER_CUSTOMER_SUBJECT_BINDING_INACTIVE"});
});

test("session resolution slides idle expiry but never beyond absolute expiry",async()=>{
  const {calls,pool}=fakePool(); const store=new PostgresCustomerIdentitySessionStore(pool);
  const token="test-session-token-value";
  const resolved=await store.resolveSession(token,new Date("2026-11-01T00:10:00.000Z"));
  assert.equal(resolved.tenantId,"tenant-a"); assert.equal(resolved.actorId,"actor-a");
  const lookup=calls.find(c=>/SELECT s\.tenant_id/.test(c.sql));
  assert.equal(lookup.values[0],createHash("sha256").update(token).digest("hex"));
  assert.ok(calls.some(c=>/UPDATE eper_customer_browser_sessions SET last_seen_at/.test(c.sql)));
});

test("session resolution denies missing, expired or revoked sessions",async()=>{
  const {pool}=fakePool({session:false}); const store=new PostgresCustomerIdentitySessionStore(pool);
  assert.equal(await store.resolveSession("test-session-token-value",new Date("2026-11-01T00:10:00.000Z")),null);
});

test("logout revokes the server-side session and records an identity event",async()=>{
  const {calls,pool}=fakePool(); const store=new PostgresCustomerIdentitySessionStore(pool);
  assert.equal(await store.revokeSession("test-session-token-value","logout",base.correlationId),true);
  assert.ok(calls.some(c=>/session.revoked/.test(c.sql)));
  assert.equal(calls.at(-1).sql,"COMMIT");
});

test("subject revocation revokes all sessions for that issuer and subject",async()=>{
  const {calls,pool}=fakePool(); const store=new PostgresCustomerIdentitySessionStore(pool);
  assert.equal(await store.revokeSubject({...base,revokedBy:"tenant-admin"}),true);
  assert.ok(calls.some(c=>/UPDATE eper_customer_browser_sessions SET revoked_at/.test(c.sql)));
  assert.ok(calls.some(c=>/subject.revoked/.test(c.sql)));
});
