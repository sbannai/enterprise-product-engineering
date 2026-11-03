import test from "node:test";
import assert from "node:assert/strict";
import { PlatformAdminCredentialService } from "../dist/packages/identity/platform-admin-credential-service.js";

const context={correlationId:"credential-service-test",environment:"sandbox"};
const issuer={platformActorId:"root-operator",credentialId:"root-credential",
  permissions:["platform_admin:credentials:manage","provider_catalogue:manage","application:remediate"]};
function fixture(){
 const calls=[];
 const store={
  async issue(input){calls.push({method:"issue",input});return {...input,bearerToken:"one-time-token"};},
  async revoke(input){calls.push({method:"revoke",input});return true;}
 };
 return {calls,service:new PlatformAdminCredentialService(store)};
}
test("issues only grants within authenticated issuer ceiling and derives issuer identity",async()=>{
 const {calls,service}=fixture();
 const result=await service.issue(issuer,{platformActorId:"catalogue-operator",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()+3600000).toISOString()},context);
 assert.equal(result.bearerToken,"one-time-token");
 assert.equal(calls[0].input.actorId,"root-operator");
 assert.equal(calls[0].input.platformActorId,"catalogue-operator");
 assert.ok(calls[0].input.credentialId);
});
test("rejects issuance without credential-management permission",async()=>{
 const {calls,service}=fixture();
 await assert.rejects(()=>service.issue({...issuer,permissions:["provider_catalogue:manage"]},{platformActorId:"other",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()+3600000).toISOString()},context),/MANAGEMENT_FORBIDDEN/);
 assert.equal(calls.length,0);
});
test("rejects privilege escalation beyond issuer permission ceiling",async()=>{
 const {calls,service}=fixture();
 await assert.rejects(()=>service.issue(issuer,{platformActorId:"other",permissions:["customer_admin:provision"],expiresAt:new Date(Date.now()+3600000).toISOString()},context),/GRANT_EXCEEDS_ISSUER_AUTHORITY/);
 assert.equal(calls.length,0);
});
test("rejects excessive credential lifetime",async()=>{
 const {calls,service}=fixture();
 await assert.rejects(()=>service.issue(issuer,{platformActorId:"other",permissions:["provider_catalogue:manage"],expiresAt:new Date(Date.now()+31*24*60*60*1000).toISOString()},context),/EXPIRY_INVALID/);
 assert.equal(calls.length,0);
});
test("derives revocation audit actor from authenticated issuer",async()=>{
 const {calls,service}=fixture();
 assert.equal(await service.revoke(issuer,"credential-123",context),true);
 assert.deepEqual(calls[0],{method:"revoke",input:{...context,actorId:"root-operator",credentialId:"credential-123"}});
});
