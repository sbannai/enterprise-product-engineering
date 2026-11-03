import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createAppServer } from "../dist/apps/api/server.js";

const TOKEN = "provider-catalogue-product-admin-token-with-more-than-32-chars";
const keys = ["EPER_ADMIN_CONFIG_API_ENABLED","EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED","EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED"];
const previous = Object.fromEntries(keys.map(key=>[key,process.env[key]]));
Object.assign(process.env,{EPER_ADMIN_CONFIG_API_ENABLED:"true",EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED:"true",EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED:"true"});
const principal={credentialId:"product-admin-01",platformActorId:"product-admin",permissions:["provider_catalogue:manage"]};
const definition={providerKey:"mail-primary",displayName:"Primary Mail",adapterKey:"synthetic",adapterVersion:"1.0.0",capabilities:["email.send"],authModes:["synthetic"],configurationSchema:{type:"object"},status:"ACTIVE",version:1,createdAt:"2026-11-03T00:00:00.000Z",updatedAt:"2026-11-03T00:00:00.000Z",updatedBy:"product-admin"};
function dependencies(){
 const calls=[];
 const credentialStore={async resolve(token){assert.equal(token,TOKEN);return principal;}};
 const repository={
  async list(limit){calls.push(["list",limit]);return [definition];},
  async get(key){calls.push(["get",key]);return key===definition.providerKey?definition:null;},
  async create(input){calls.push(["create",input]);return {...definition,...input};},
  async update(input){calls.push(["update",input]);return {...definition,...input,version:2};},
  async setStatus(input){calls.push(["setStatus",input]);return {...definition,status:input.status,version:2};},
 };
 return {calls,credentialStore,platformAdminCredentialStore:credentialStore,providerCatalogueRepository:repository,adminConfigEnvironment:"sandbox"};
}
test("Product Admin provider catalogue UI and API are served with fail-closed feature flags",async()=>{
 const deps=dependencies(),server=createAppServer(deps);
 try{
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const address=server.address();assert.ok(address&&typeof address==="object");
  const base="http://127.0.0.1:"+address.port;
  const ui=await fetch(base+"/admin/provider-catalogue-ui");
  assert.equal(ui.status,200);assert.equal(ui.headers.get("cache-control"),"no-store");
  assert.equal(ui.headers.get("x-frame-options"),"DENY");
  const html=await ui.text();
  assert.match(html,/Provider Catalogue/);assert.match(html,/Product Admin bearer token/);
  assert.match(html,/provider_catalogue:manage/);assert.match(html,/Customer connections and application bindings are managed separately/);
  assert.match(html,/expectedVersion/);assert.match(html,/configurationSchema/);
  const scripts=html.split("<script>").slice(1).map(chunk=>chunk.split("</script>")[0]);
  assert.equal(scripts.length,1);assert.doesNotThrow(()=>new vm.Script(scripts[0]));
  const unauth=await fetch(base+"/platform/admin/provider-definitions",{headers:{accept:"application/vnd.eper.v1+json"}});
  assert.equal(unauth.status,401);
  const headers={authorization:"Bearer "+TOKEN,accept:"application/vnd.eper.v1+json","content-type":"application/json"};
  const list=await fetch(base+"/platform/admin/provider-definitions?limit=25",{headers});
  assert.equal(list.status,200);assert.equal((await list.json()).data.providers[0].providerKey,"mail-primary");
  assert.deepEqual(deps.calls.find(call=>call[0]==="list"),["list",25]);
  const create=await fetch(base+"/platform/admin/provider-definitions",{method:"POST",headers,body:JSON.stringify({
   providerKey:"sms-primary",displayName:"Primary SMS",adapterKey:"synthetic",adapterVersion:"1.0.0",
   capabilities:["sms.send"],authModes:["synthetic"],configurationSchema:{type:"object"},
  })});
  assert.equal(create.status,201);assert.equal(deps.calls.find(call=>call[0]==="create")[1].actorId,"product-admin");
  const suspend=await fetch(base+"/platform/admin/provider-definitions/mail-primary/suspend",{method:"POST",headers,body:JSON.stringify({expectedVersion:1})});
  assert.equal(suspend.status,200);assert.equal(deps.calls.find(call=>call[0]==="setStatus")[1].status,"SUSPENDED");
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test.after(()=>{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
