import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handlePlatformPeripheralTypeCatalogueRoute } from "../dist/apps/api/platform-peripheral-type-catalogue-route.js";

const old={enabled:process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED,credentials:process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED};
const principal={credentialId:"peripheral-admin-01",platformActorId:"peripheral-admin",permissions:["peripheral_catalogue:manage"]};
function request(method,path,body,auth="Bearer durable-platform-token-000000000000"){
 const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);req.method=method;req.url=path;
 req.headers={authorization:auth,accept:"application/vnd.eper.v1+json","x-correlation-id":"peripheral-catalogue-test"};return req;
}
function response(){return {statusCode:0,headers:{},body:"",writeHead(s,h){this.statusCode=s;this.headers=h;},end(v){this.body=v;}};}
function fixture(overrides={}){
 const calls=[];const type={typeKey:"barcode.scanner",displayName:"Barcode scanner",lifecycleStatus:"ACTIVE",schemaVersion:1,adapterKey:"usb-hid",adapterVersion:"1.0.0",configurationSchema:{type:"object"},compatibility:{},schemaStatus:"DRAFT"};
 const repository={async list(limit){calls.push(["list",limit]);return [type];},async get(key){calls.push(["get",key]);return key===type.typeKey?type:null;},async create(input){calls.push(["create",input]);return {...type,...input};},async createSchemaVersion(input){calls.push(["createSchemaVersion",input]);return {...type,...input,schemaVersion:2,schemaStatus:"DRAFT"};},async publish(input){calls.push(["publish",input]);return {...type,schemaStatus:"PUBLISHED"};},async deprecate(input){calls.push(["deprecate",input]);return {...type,lifecycleStatus:"DEPRECATED",schemaStatus:"DEPRECATED"};}};
 return {calls,credentialStore:{async resolve(){return overrides.principal===undefined?principal:overrides.principal;}},repository,environment:"sandbox",serviceVersion:"test-build"};
}
test("peripheral catalogue list requires dedicated permission and returns versioned no-store response",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();await handlePlatformPeripheralTypeCatalogueRoute(request("GET","/platform/admin/peripheral-types?limit=20"),res,"/platform/admin/peripheral-types",deps);
 assert.equal(res.statusCode,200);assert.equal(res.headers["cache-control"],"no-store");assert.equal(JSON.parse(res.body).data.types[0].typeKey,"barcode.scanner");assert.deepEqual(deps.calls[0],["list",20]);
});
test("provider catalogue permission does not authorize peripheral catalogue",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture({principal:{...principal,permissions:["provider_catalogue:manage"]}}),res=response();
 await handlePlatformPeripheralTypeCatalogueRoute(request("GET","/platform/admin/peripheral-types"),res,"/platform/admin/peripheral-types",deps);
 assert.equal(res.statusCode,403);assert.equal(deps.calls.length,0);
});
test("catalogue creation derives actor and correlation from trusted credential and headers",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();await handlePlatformPeripheralTypeCatalogueRoute(request("POST","/platform/admin/peripheral-types",{typeKey:"barcode.scanner",displayName:"Barcode scanner",adapterKey:"usb-hid",adapterVersion:"1.0.0",configurationSchema:{type:"object"}}),res,"/platform/admin/peripheral-types",deps);
 assert.equal(res.statusCode,201);const input=deps.calls[0][1];assert.equal(input.actorId,"peripheral-admin");assert.equal(input.correlationId,"peripheral-catalogue-test");assert.equal(input.typeKey,"barcode.scanner");
});

test("new immutable schema version is created as a draft",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();await handlePlatformPeripheralTypeCatalogueRoute(request("POST","/platform/admin/peripheral-types/barcode.scanner/schemas",{adapterKey:"usb-hid",adapterVersion:"2.0.0",configurationSchema:{type:"object"}}),res,"/platform/admin/peripheral-types/barcode.scanner/schemas",deps);
 assert.equal(res.statusCode,201);assert.deepEqual(deps.calls[0],["createSchemaVersion",{actorId:"peripheral-admin",correlationId:"peripheral-catalogue-test",environment:"sandbox",typeKey:"barcode.scanner",adapterKey:"usb-hid",adapterVersion:"2.0.0",configurationSchema:{type:"object"}}]);
});

test("schema publication uses exact type and version",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();await handlePlatformPeripheralTypeCatalogueRoute(request("POST","/platform/admin/peripheral-types/barcode.scanner/schemas/3/publish",{}),res,"/platform/admin/peripheral-types/barcode.scanner/schemas/3/publish",deps);
 assert.equal(res.statusCode,200);assert.deepEqual(deps.calls[0],["publish",{actorId:"peripheral-admin",correlationId:"peripheral-catalogue-test",environment:"sandbox",typeKey:"barcode.scanner",schemaVersion:3}]);
});
test("DELETE deprecates a type through the repository and returns the resulting lifecycle",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),res=response();await handlePlatformPeripheralTypeCatalogueRoute(request("DELETE","/platform/admin/peripheral-types/barcode.scanner"),res,"/platform/admin/peripheral-types/barcode.scanner",deps);
 assert.equal(res.statusCode,200);assert.equal(JSON.parse(res.body).data.type.lifecycleStatus,"DEPRECATED");
 assert.deepEqual(deps.calls[0],["deprecate",{actorId:"peripheral-admin",correlationId:"peripheral-catalogue-test",environment:"sandbox",typeKey:"barcode.scanner"}]);
});

test("oversized mutation bodies return HTTP 413 instead of a service error",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const req=Readable.from([Buffer.alloc(24*1024+1,0x20)]);req.method="POST";req.url="/platform/admin/peripheral-types";
 req.headers={authorization:"Bearer durable-platform-token-000000000000",accept:"application/vnd.eper.v1+json"};
 const deps=fixture(),res=response();await handlePlatformPeripheralTypeCatalogueRoute(req,res,"/platform/admin/peripheral-types",deps);
 assert.equal(res.statusCode,413);assert.equal(JSON.parse(res.body).data.error,"payload_too_large");assert.equal(deps.calls.length,0);
});

test("unversioned media type and cross-origin mutation fail before repository access",async()=>{
 process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED="true";
 const deps=fixture(),r1=response(),req1=request("GET","/platform/admin/peripheral-types");req1.headers.accept="application/json";
 await handlePlatformPeripheralTypeCatalogueRoute(req1,r1,"/platform/admin/peripheral-types",deps);assert.equal(r1.statusCode,406);
 const r2=response(),req2=request("POST","/platform/admin/peripheral-types",{typeKey:"barcode.scanner",displayName:"Scanner",adapterKey:"usb-hid",adapterVersion:"1",configurationSchema:{type:"object"}});
 req2.headers.origin="https://attacker.example";req2.headers.host="eper.example";
 await handlePlatformPeripheralTypeCatalogueRoute(req2,r2,"/platform/admin/peripheral-types",deps);assert.equal(r2.statusCode,403);assert.equal(deps.calls.length,0);
});
test("catalogue route is disabled by default",async()=>{
 delete process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED;process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED="true";
 const deps=fixture(),res=response();await handlePlatformPeripheralTypeCatalogueRoute(request("GET","/platform/admin/peripheral-types"),res,"/platform/admin/peripheral-types",deps);assert.equal(res.statusCode,404);
});
test.after(()=>{for(const [k,v] of Object.entries({EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED:old.enabled,EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED:old.credentials})){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
