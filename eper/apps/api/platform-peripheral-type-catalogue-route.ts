import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlatformAdminPrincipalFromStore } from "../../packages/identity/platform-admin-principal.js";
import type { PostgresPlatformAdminCredentialStore } from "../../packages/identity/postgres-platform-admin-credential-store.js";
import { PeripheralCatalogueConflictError, type PostgresPeripheralTypeCatalogueRepository } from "../../packages/peripherals/postgres-peripheral-type-catalogue-repository.js";

const ROOT="/platform/admin/peripheral-types";
const VERSIONED_JSON="application/vnd.eper.v1+json";
function respond(req:IncomingMessage,res:ServerResponse,status:number,body:Record<string,unknown>):void{
 const versioned=(req.headers.accept??"").split(",").some(v=>v.split(";")[0].trim().toLowerCase()===VERSIONED_JSON);
 res.writeHead(status,{"content-type":versioned?VERSIONED_JSON:"application/json; charset=utf-8","cache-control":"no-store","pragma":"no-cache","x-content-type-options":"nosniff"});
 res.end(JSON.stringify(versioned?{data:body}:body));
}
async function readBody(req:IncomingMessage):Promise<Record<string,unknown>>{
 const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>24*1024)throw new Error("PERIPHERAL_CATALOGUE_BODY_TOO_LARGE");chunks.push(b);}
 let parsed:unknown;try{parsed=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new Error("PERIPHERAL_CATALOGUE_INVALID_JSON");}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("PERIPHERAL_CATALOGUE_JSON_OBJECT_REQUIRED");return parsed as Record<string,unknown>;
}
const exact=(body:Record<string,unknown>,keys:string[])=>Object.keys(body).every(k=>keys.includes(k));
function correlation(req:IncomingMessage):string{const v=req.headers["x-correlation-id"];return typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v)?v:randomUUID();}
function crossOrigin(req:IncomingMessage):boolean{
 if(!["POST","PATCH","PUT","DELETE"].includes(req.method??""))return false;const origin=req.headers.origin;if(origin===undefined)return false;
 const host=req.headers.host;if(typeof origin!=="string"||typeof host!=="string")return true;
 try{const u=new URL(origin);return !["http:","https:"].includes(u.protocol)||u.host.toLowerCase()!==host.toLowerCase();}catch{return true;}
}
export async function handlePlatformPeripheralTypeCatalogueRoute(req:IncomingMessage,res:ServerResponse,pathname:string,deps:{
 credentialStore?:PostgresPlatformAdminCredentialStore;repository?:PostgresPeripheralTypeCatalogueRepository;
 environment?:"production"|"uat"|"sandbox";serviceVersion?:string;
}):Promise<boolean>{
 if(pathname!==ROOT&&!pathname.startsWith(ROOT+"/"))return false;
 if(!pathname.startsWith(ROOT))return false;
 if(!(req.headers.accept??"").split(",").some(v=>v.split(";")[0].trim().toLowerCase()===VERSIONED_JSON)){respond(req,res,406,{error:"versioned_api_accept_required"});return true;}
 const suffix=pathname.slice(ROOT.length);const publish=/^\/([^/]+)\/schemas\/(\d+)\/publish$/.exec(suffix);
 const item=/^\/([^/]+)$/.exec(suffix);
 if(suffix&&!publish&&!item){respond(req,res,404,{error:"not_found"});return true;}
 if(process.env.EPER_PERIPHERAL_CATALOGUE_ADMIN_API_ENABLED!=="true"||process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED!=="true"||!deps.credentialStore||!deps.repository||!deps.environment){respond(req,res,404,{error:"not_found"});return true;}
 const method=!suffix?(req.method==="GET"?"GET":"POST"):(publish||schemaDraft)?"POST":req.method==="GET"?"GET":"UNSUPPORTED";
 if(req.method!==method){respond(req,res,405,{error:"method_not_allowed"});return true;}
 if(crossOrigin(req)){respond(req,res,403,{error:"cross_origin_mutation_forbidden"});return true;}
 try{
  const principal=await resolvePlatformAdminPrincipalFromStore(req.headers.authorization,deps.credentialStore);
  if(!principal){respond(req,res,401,{error:"unauthorized"});return true;}
  if(!principal.permissions.includes("peripheral_catalogue:manage")){respond(req,res,403,{error:"peripheral_catalogue_forbidden"});return true;}
  const context={actorId:principal.platformActorId,correlationId:correlation(req),environment:deps.environment};
  if(!suffix){
   if(req.method==="GET"){const u=new URL(req.url??ROOT,"http://localhost");const raw=u.searchParams.get("limit");const limit=raw===null?50:Number(raw);const types=await deps.repository.list(limit);respond(req,res,200,{types});return true;}
   const body=await readBody(req);const keys=["typeKey","displayName","adapterKey","adapterVersion","configurationSchema","compatibility"];
   if(!exact(body,keys)||keys.slice(0,5).some(k=>body[k]===undefined)){respond(req,res,400,{error:"peripheral_catalogue_create_fields_invalid"});return true;}
   const type=await deps.repository.create({...context,typeKey:body.typeKey as string,displayName:body.displayName as string,adapterKey:body.adapterKey as string,adapterVersion:body.adapterVersion as string,configurationSchema:body.configurationSchema as Record<string,unknown>,...(body.compatibility===undefined?{}:{compatibility:body.compatibility as Record<string,unknown>})});
   respond(req,res,201,{type});return true;
  }
  let typeKey:string;try{typeKey=decodeURIComponent((publish??schemaDraft??item)![1]);}catch{respond(req,res,400,{error:"peripheral_catalogue_type_key_encoding_invalid"});return true;}
  if(!/^[a-z][a-z0-9_.-]{1,95}$/.test(typeKey)){respond(req,res,400,{error:"peripheral_catalogue_type_key_invalid"});return true;}
  if(item&&req.method==="GET"){const type=await deps.repository.get(typeKey);respond(req,res,type?200:404,type?{type}:{error:"peripheral_catalogue_type_not_found"});return true;}
  const body=await readBody(req);
  if(schemaDraft){
   const keys=["adapterKey","adapterVersion","configurationSchema","compatibility"];
   if(!exact(body,keys)||keys.slice(0,3).some(k=>body[k]===undefined)){respond(req,res,400,{error:"peripheral_catalogue_schema_fields_invalid"});return true;}
   const type=await deps.repository.createSchemaVersion({...context,typeKey,adapterKey:body.adapterKey as string,adapterVersion:body.adapterVersion as string,configurationSchema:body.configurationSchema as Record<string,unknown>,...(body.compatibility===undefined?{}:{compatibility:body.compatibility as Record<string,unknown>})});
   respond(req,res,201,{type});return true;
  }
  if(publish){if(!exact(body,[])&&Object.keys(body).length!==0){respond(req,res,400,{error:"peripheral_catalogue_publish_body_invalid"});return true;}
   const type=await deps.repository.publish({...context,typeKey,schemaVersion:Number(publish[2])});respond(req,res,200,{type});return true;}
  respond(req,res,405,{error:"method_not_allowed"});return true;
 }catch(error){
  const msg=error instanceof Error?error.message:"PERIPHERAL_CATALOGUE_OPERATION_FAILED";
  const conflict=error instanceof PeripheralCatalogueConflictError;
  const notFound=msg.includes("NOT_FOUND");
  const invalid=msg.includes("INVALID")||msg.includes("UNSUPPORTED")||msg.includes("FIELD_")||msg.includes("SCHEMA_")||msg.includes("TERMINAL");
  const status=conflict?409:notFound?404:invalid?400:503;
  respond(req,res,status,{error:conflict?"peripheral_catalogue_conflict":notFound?"peripheral_catalogue_not_found":invalid?"peripheral_catalogue_input_invalid":"peripheral_catalogue_operation_failed"});return true;
 }
}
