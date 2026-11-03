import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handlePlatformProviderCatalogueRoute } from "../dist/apps/api/platform-provider-catalogue-route.js";

const previous = {
  catalogue: process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED,
  credentials: process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED,
};
const principal = { credentialId:"product-admin-01", platformActorId:"product-admin", permissions:["provider_catalogue:manage"] };
function request(method,path,body,authorization="Bearer durable-platform-token-000000000000") {
  const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);
  req.method=method;req.url=path;req.headers={authorization,accept:"application/vnd.eper.v1+json","x-correlation-id":"catalogue-api-test"};
  return req;
}
function response(){return {statusCode:0,headers:{},body:"",writeHead(s,h){this.statusCode=s;this.headers=h;},end(v){this.body=v;}};}
function fixture(overrides={}) {
 const calls=[];
 const store={async resolve(token){calls.push(["resolve",token]);return overrides.principal===undefined?principal:overrides.principal;}};
 const provider={providerKey:"mail-primary",displayName:"Primary Mail",adapterKey:"synthetic",adapterVersion:"1.0.0",capabilities:["email.send"],authModes:["synthetic"],configurationSchema:{type:"object"},status:"ACTIVE",version:1};
 const repository={
  async list(limit){calls.push(["list",limit]);return [provider];},
  async get(key){calls.push(["get",key]);return key===provider.providerKey?provider:null;},
  async create(input){calls.push(["create",input]);return {...provider,...input,version:1};},
  async update(input){calls.push(["update",input]);return {...provider,...input,version:2};},
  async setStatus(input){calls.push(["status",input]);return {...provider,status:input.status,version:2};},
 };
 return {calls,store,credentialStore:store,repository,environment:"sandbox",serviceVersion:"test-build"};
}
test("Product Admin catalogue list requires durable catalogue permission",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();
 await handlePlatformProviderCatalogueRoute(request("GET","/platform/admin/provider-definitions?limit=20"),res,"/platform/admin/provider-definitions",deps);
 assert.equal(res.statusCode,200);assert.equal(JSON.parse(res.body).data.providers[0].providerKey,"mail-primary");
 assert.deepEqual(deps.calls.find(x=>x[0]==="list"),["list",20]);
});
test("customer-only platform credential cannot access provider catalogue",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture({principal:{...principal,permissions:["customer_admin:provision"]}}),res=response();
 await handlePlatformProviderCatalogueRoute(request("GET","/platform/admin/provider-definitions"),res,"/platform/admin/provider-definitions",deps);
 assert.equal(res.statusCode,403);assert.equal(deps.calls.some(x=>x[0]==="list"),false);
});

test("catalogue item lookup uses exact provider key",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();
 await handlePlatformProviderCatalogueRoute(request("GET","/platform/admin/provider-definitions/mail-primary"),res,
  "/platform/admin/provider-definitions/mail-primary",deps);
 assert.equal(res.statusCode,200);
 assert.deepEqual(deps.calls.find(x=>x[0]==="get"),["get","mail-primary"]);
});

test("catalogue creation derives actor and correlation context from trusted server values",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();
 await handlePlatformProviderCatalogueRoute(request("POST","/platform/admin/provider-definitions",{
  providerKey:"mail-primary",displayName:"Primary Mail",adapterKey:"synthetic",adapterVersion:"1.0.0",
  capabilities:["email.send"],authModes:["synthetic"],configurationSchema:{type:"object"},
 }),res,"/platform/admin/provider-definitions",deps);
 assert.equal(res.statusCode,201);
 const input=deps.calls.find(x=>x[0]==="create")[1];
 assert.equal(input.actorId,"product-admin");assert.equal(input.correlationId,"catalogue-api-test");
 assert.equal(input.providerKey,"mail-primary");
});
test("catalogue update requires optimistic version and rejects caller-supplied actor",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();
 await handlePlatformProviderCatalogueRoute(request("PATCH","/platform/admin/provider-definitions/mail-primary",{
  expectedVersion:1,displayName:"Updated",actorId:"attacker",
 }),res,"/platform/admin/provider-definitions/mail-primary",deps);
 assert.equal(res.statusCode,400);assert.equal(deps.calls.some(x=>x[0]==="update"),false);
});
test("catalogue lifecycle transition requires expectedVersion and uses durable actor",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();
 await handlePlatformProviderCatalogueRoute(request("POST","/platform/admin/provider-definitions/mail-primary/suspend",{expectedVersion:1}),res,
  "/platform/admin/provider-definitions/mail-primary/suspend",deps);
 assert.equal(res.statusCode,200);
 assert.deepEqual(deps.calls.find(x=>x[0]==="status")[1],{
  actorId:"product-admin",correlationId:"catalogue-api-test",environment:"sandbox",
  providerKey:"mail-primary",expectedVersion:1,status:"SUSPENDED",
 });
});

test("catalogue API requires the versioned media type",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response(),req=request("GET","/platform/admin/provider-definitions");
 req.headers.accept="application/json";
 await handlePlatformProviderCatalogueRoute(req,res,"/platform/admin/provider-definitions",deps);
 assert.equal(res.statusCode,406);
 assert.equal(deps.calls.some(x=>x[0]==="list"),false);
});


test("browser-origin mutations reject cross-origin requests before repository writes",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response(),req=request("POST","/platform/admin/provider-definitions",{
  providerKey:"mail-other",displayName:"Other Mail",adapterKey:"synthetic",adapterVersion:"1.0.0",
  capabilities:["email.send"],authModes:["synthetic"],configurationSchema:{type:"object"},
 });
 req.headers.origin="https://attacker.example";req.headers.host="eper.example";
 await handlePlatformProviderCatalogueRoute(req,res,"/platform/admin/provider-definitions",deps);
 assert.equal(res.statusCode,403);assert.equal(deps.calls.some(x=>x[0]==="create"),false);
});

test("catalogue route fails closed when feature flag is disabled",async()=>{
 delete process.env.EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED;process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";
 const deps=fixture(),res=response();
 await handlePlatformProviderCatalogueRoute(request("GET","/platform/admin/provider-definitions"),res,"/platform/admin/provider-definitions",deps);
 assert.equal(res.statusCode,404);
});
test.after(()=>{
 for(const [key,value] of Object.entries({EPER_PROVIDER_CATALOGUE_ADMIN_API_ENABLED:previous.catalogue,EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED:previous.credentials})){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
