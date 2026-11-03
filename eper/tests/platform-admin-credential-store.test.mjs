import test from "node:test";
import assert from "node:assert/strict";
import {PostgresPlatformAdminCredentialStore} from "../dist/packages/identity/postgres-platform-admin-credential-store.js";
const ctx={actorId:"root-admin",correlationId:"credential-test-001",environment:"sandbox"};
function fixture({auditFailure=false}={}){
 const calls=[],rows=new Map();
 const client={async query(sql,v=[]){calls.push({sql,v});
  if(sql.includes("INSERT INTO eper_platform_admin_credentials")){rows.set(v[0],{credential_id:v[0],platform_actor_id:v[1],token_hash:v[2],permissions:JSON.parse(v[3]),expires_at:v[4],revoked_at:null});return {rows:[],rowCount:1};}
  if(sql.includes("FROM eper_platform_admin_credentials WHERE token_hash")){const row=[...rows.values()].find(x=>x.token_hash.equals(v[0])&&!x.revoked_at&&Date.parse(x.expires_at)>Date.now());return {rows:row?[{...row}]:[],rowCount:row?1:0};}
  if(sql.includes("UPDATE eper_platform_admin_credentials SET last_used_at"))return {rows:[],rowCount:1};
  if(sql.includes("UPDATE eper_platform_admin_credentials SET revoked_at")){const row=rows.get(v[0]);if(!row||row.revoked_at)return {rows:[],rowCount:0};row.revoked_at=new Date().toISOString();return {rows:[{credential_id:v[0]}],rowCount:1};}
  if(auditFailure&&sql.includes("INSERT INTO eper_audit_events"))throw new Error("AUDIT_WRITE_FAILED");
  if(sql.includes("SELECT last_event_hash"))return {rows:[{last_event_hash:null}],rowCount:1};
  return {rows:[],rowCount:1};
 },release(){}};
 return {calls,rows,store:new PostgresPlatformAdminCredentialStore({async connect(){return client}},"test-build")};
}
test("issues a high-entropy bearer once and stores only its SHA-256 digest",async()=>{
 const {store,rows,calls}=fixture();
 const issued=await store.issue({...ctx,credentialId:"cred-001",platformActorId:"operator-01",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal(issued.bearerToken.length,43);
 const saved=rows.get("cred-001");assert.ok(saved.token_hash);assert.equal(saved.token_hash.length,32);
 assert.notEqual(saved.token_hash.toString("hex"),issued.bearerToken);
 assert.ok(calls.some(x=>x.sql==="COMMIT"));
});
test("resolves only active unexpired credential and returns server-stored permissions",async()=>{
 const {store}=fixture();
 const issued=await store.issue({...ctx,credentialId:"cred-002",platformActorId:"operator-02",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()+3600000).toISOString()});
 const resolved=await store.resolve(issued.bearerToken);
 assert.equal(resolved.platformActorId,"operator-02");assert.deepEqual(resolved.permissions,["provider_catalogue:manage"]);
 assert.equal(await store.resolve("short"),null);
});
test("revocation prevents subsequent credential resolution",async()=>{
 const {store}=fixture();
 const issued=await store.issue({...ctx,credentialId:"cred-003",platformActorId:"operator-03",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal(await store.revoke({...ctx,credentialId:issued.credentialId}),true);
 assert.equal(await store.resolve(issued.bearerToken),null);
 assert.equal(await store.revoke({...ctx,credentialId:issued.credentialId}),false);
});
test("audit failure rolls credential issuance back",async()=>{
 const {store,calls}=fixture({auditFailure:true});
 await assert.rejects(()=>store.issue({...ctx,credentialId:"cred-004",platformActorId:"operator-04",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()+3600000).toISOString()}),/AUDIT_WRITE_FAILED/);
 assert.ok(calls.some(x=>x.sql==="ROLLBACK"));assert.ok(!calls.some(x=>x.sql==="COMMIT"));
});
test("rejects invalid permissions and expired credentials before persistence",async()=>{
 const {store,calls}=fixture();
 await assert.rejects(()=>store.issue({...ctx,credentialId:"cred-005",platformActorId:"operator-05",permissions:["customer_admin:provision","root"],expiresAt:new Date(Date.now()+3600000).toISOString()}),/PERMISSIONS_INVALID/);
 await assert.rejects(()=>store.issue({...ctx,credentialId:"cred-006",platformActorId:"operator-06",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()-1000).toISOString()}),/EXPIRY_INVALID/);
 assert.equal(calls.length,0);
});
