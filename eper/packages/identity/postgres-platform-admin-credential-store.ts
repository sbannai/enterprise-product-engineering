import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { appendAuditEventInTransaction, assertAuditStoreReady, type AuditEnvironment, type AuditSqlClient, type AuditSqlPool } from "../audit/audit-event-store.js";

export const PLATFORM_ADMIN_CREDENTIAL_PERMISSIONS = [
  "customer_admin:provision", "customer_admin:recover", "application:remediate", "provider_catalogue:manage", "platform_admin:credentials:manage",
] as const;
export type PlatformAdminCredentialPermission = typeof PLATFORM_ADMIN_CREDENTIAL_PERMISSIONS[number];
export interface PlatformAdminCredentialContext {
  actorId: string; correlationId: string; environment: AuditEnvironment; serviceVersion?: string;
}
export interface IssuedPlatformAdminCredential {
  credentialId: string; platformActorId: string; permissions: PlatformAdminCredentialPermission[];
  expiresAt: string; bearerToken: string;
}
export interface ResolvedPlatformAdminCredential {
  credentialId: string; platformActorId: string; permissions: PlatformAdminCredentialPermission[];
}
type CredentialRow = { credential_id:string; platform_actor_id:string; permissions:PlatformAdminCredentialPermission[]|string; expires_at:Date|string; revoked_at:Date|string|null };
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const tokenHash=(token:string)=>createHash("sha256").update(token,"utf8").digest();
function validPermissions(value:unknown): value is PlatformAdminCredentialPermission[] {
 return Array.isArray(value)&&value.length>0&&value.length<=PLATFORM_ADMIN_CREDENTIAL_PERMISSIONS.length&&
  value.every(x=>typeof x==="string"&&(PLATFORM_ADMIN_CREDENTIAL_PERMISSIONS as readonly string[]).includes(x))&&new Set(value).size===value.length;
}
function parsePermissions(value:CredentialRow["permissions"]):PlatformAdminCredentialPermission[] {
 const parsed=typeof value==="string"?JSON.parse(value):value;
 if(!validPermissions(parsed))throw new Error("PLATFORM_ADMIN_CREDENTIAL_PERMISSIONS_INVALID");
 return [...parsed];
}
/** Durable hashed bearer credentials. Use only with a dedicated least-privilege platform-admin pool. */
export class PostgresPlatformAdminCredentialStore {
 constructor(private readonly pool:AuditSqlPool,private readonly serviceVersion?:string){}
 async assertReady():Promise<void>{
  await assertAuditStoreReady(this.pool);
  const c=await this.pool.connect();
  try{
   const r=await c.query<{column_name:string}>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='eper_platform_admin_credentials'`);
   const columns=new Set(r.rows.map(x=>x.column_name));
   for(const name of ["credential_id","platform_actor_id","token_hash","permissions","expires_at","revoked_at","created_at","created_by","last_used_at"])
    if(!columns.has(name))throw new Error("PLATFORM_ADMIN_CREDENTIAL_SCHEMA_UNSUPPORTED");
  }finally{c.release();}
 }
 async issue(input:PlatformAdminCredentialContext&{credentialId:string;platformActorId:string;permissions:PlatformAdminCredentialPermission[];expiresAt:string}):Promise<IssuedPlatformAdminCredential>{
  if(!idPattern.test(input.credentialId)||!idPattern.test(input.platformActorId)||!idPattern.test(input.actorId)||!input.correlationId?.trim()||input.correlationId.length>128)
   throw new Error("PLATFORM_ADMIN_CREDENTIAL_INPUT_INVALID");
  if(!validPermissions(input.permissions))throw new Error("PLATFORM_ADMIN_CREDENTIAL_PERMISSIONS_INVALID");
  const expiry=Date.parse(input.expiresAt);
  if(!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+30*24*60*60*1000)throw new Error("PLATFORM_ADMIN_CREDENTIAL_EXPIRY_INVALID");
  const bearerToken=randomBytes(32).toString("base64url"),hash=tokenHash(bearerToken),c=await this.pool.connect();
  try{
   await c.query("BEGIN");
   await c.query(`INSERT INTO eper_platform_admin_credentials(credential_id,platform_actor_id,token_hash,permissions,expires_at,created_by)
    VALUES($1,$2,$3,$4::jsonb,$5,$6)`,[input.credentialId,input.platformActorId,hash,JSON.stringify([...input.permissions].sort()),new Date(expiry).toISOString(),input.actorId]);
   await appendAuditEventInTransaction(c,{tenantId:"platform",applicationId:"platform-admin",environment:input.environment,actorType:"human",actorId:input.actorId,action:"platform_admin.credential.issue",outcome:"success",resourceType:"platform-admin-credential",resourceId:input.credentialId,correlationId:input.correlationId,source:"platform",operationName:"platform_admin.credential.issue",serviceVersion:input.serviceVersion??this.serviceVersion,afterHash:createHash("sha256").update(JSON.stringify({credentialId:input.credentialId,platformActorId:input.platformActorId,permissions:input.permissions,expiresAt:new Date(expiry).toISOString()})).digest("hex"),payload:{credentialId:input.credentialId,platformActorId:input.platformActorId,permissions:input.permissions,expiresAt:new Date(expiry).toISOString()}});
   await c.query("COMMIT");
   return {credentialId:input.credentialId,platformActorId:input.platformActorId,permissions:[...input.permissions],expiresAt:new Date(expiry).toISOString(),bearerToken};
  }catch(error){await c.query("ROLLBACK").catch(()=>undefined);throw error;}finally{c.release();}
 }
 async resolve(bearerToken:string):Promise<ResolvedPlatformAdminCredential|null>{
  if(typeof bearerToken!=="string"||bearerToken.length<32||bearerToken.length>256)return null;
  const supplied=tokenHash(bearerToken),c=await this.pool.connect();
  try{
   const r=await c.query<CredentialRow>(`SELECT credential_id,platform_actor_id,permissions,expires_at,revoked_at
    FROM eper_platform_admin_credentials WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1`,[supplied]);
   const row=r.rows[0];if(!row)return null;
   const permissions=parsePermissions(row.permissions);
   await c.query("UPDATE eper_platform_admin_credentials SET last_used_at=NOW() WHERE credential_id=$1 AND revoked_at IS NULL AND expires_at>NOW()",[row.credential_id]);
   return {credentialId:row.credential_id,platformActorId:row.platform_actor_id,permissions};
  }finally{c.release();}
 }
 async revoke(input:PlatformAdminCredentialContext&{credentialId:string}):Promise<boolean>{
  if(!idPattern.test(input.credentialId)||!idPattern.test(input.actorId)||!input.correlationId?.trim()||input.correlationId.length>128)
   throw new Error("PLATFORM_ADMIN_CREDENTIAL_INPUT_INVALID");
  const c=await this.pool.connect();
  try{
   await c.query("BEGIN");
   const r=await c.query<{credential_id:string}>(`UPDATE eper_platform_admin_credentials SET revoked_at=NOW()
    WHERE credential_id=$1 AND revoked_at IS NULL RETURNING credential_id`,[input.credentialId]);
   if(r.rows[0])await appendAuditEventInTransaction(c,{tenantId:"platform",applicationId:"platform-admin",environment:input.environment,actorType:"human",actorId:input.actorId,action:"platform_admin.credential.revoke",outcome:"success",resourceType:"platform-admin-credential",resourceId:input.credentialId,correlationId:input.correlationId,source:"platform",operationName:"platform_admin.credential.revoke",serviceVersion:input.serviceVersion??this.serviceVersion,payload:{credentialId:input.credentialId}});
   await c.query("COMMIT");return Boolean(r.rows[0]);
  }catch(error){await c.query("ROLLBACK").catch(()=>undefined);throw error;}finally{c.release();}
 }
}
