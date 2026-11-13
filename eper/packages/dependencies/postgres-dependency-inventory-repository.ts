import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type {
  DependencyComponentKind,
  DependencyDowngradePolicy,
  DependencyNoticeVerification,
  DependencyPolicy,
  DependencySupportState,
  DependencyVersionRange,
} from "./compatibility.js";

export interface DependencyScope { tenantId: string; applicationId: string; }
export interface DependencyAuditContext extends DependencyScope {
  actorId: string; environment: AuditEnvironment; correlationId: string; serviceVersion?: string;
}
export interface SaveDependencyPolicyInput extends DependencyAuditContext {
  policy: Omit<DependencyPolicy, "notice">;
  expectedVersion: number;
  notice?: { verification: DependencyNoticeVerification; source: string | null; reference: string | null; recordedAt?: string | null; effectiveAt?: string | null; requiredMinimumVersion?: string | null; evidenceDigest?: string | null; notes?: string | null };
}
export interface RecordDependencyInstallationInput extends DependencyAuditContext {
  dependencyId: string; installationId?: string;
  scopeType: "application" | "workstation" | "device" | "user" | "gateway";
  scopeId: string; installedVersion: string; operatingSystem: string; runtime: string;
  deviceModel?: string; installationStatus?: "observed" | "upgrade_pending" | "blocked" | "retired";
}
export interface StoredDependencyPolicy extends DependencyPolicy { version: number; policyStatus: "draft" | "active" | "retired"; }
type PolicyRow = {
  dependency_id:string; vendor:string; component_kind:DependencyComponentKind;
  supported_versions:DependencyVersionRange|string; required_minimum_version:string|null;
  support_state:DependencySupportState; mandatory_update:boolean; effective_at:Date|string|null;
  downgrade_policy:DependencyDowngradePolicy; compatible_operating_systems:string[]|string;
  compatible_runtimes:string[]|string; compatible_device_models:string[]|string;
  policy_status:"draft"|"active"|"retired"; version:number|string;
  notice_verification:DependencyNoticeVerification|null; notice_source:string|null;
  notice_reference:string|null; notice_recorded_at:Date|string|null;
};
const decode=<T>(value:T|string):T=>typeof value==="string"?JSON.parse(value) as T:value;
const iso=(value:Date|string|null):string|null=>value===null?null:new Date(value).toISOString();
const requiredText=(value:string,max:number,field:string):string=>{
 if(typeof value!=="string"||!value.trim()||value.trim().length>max)throw new Error("DEPENDENCY_"+field.toUpperCase()+"_INVALID");
 return value.trim();
};
const validDate=(value:string|undefined|null,field:string):string|null=>{
 if(value===undefined||value===null)return null;
 const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new Error("DEPENDENCY_"+field.toUpperCase()+"_INVALID");
 return new Date(parsed).toISOString();
};
function mapPolicy(row:PolicyRow):StoredDependencyPolicy {
 return {
  dependencyId:row.dependency_id,vendor:row.vendor,componentKind:row.component_kind,
  supportedVersions:decode(row.supported_versions),requiredMinimumVersion:row.required_minimum_version??undefined,
  supportState:row.support_state,mandatoryUpdate:row.mandatory_update,effectiveAt:iso(row.effective_at)??undefined,
  downgradePolicy:row.downgrade_policy,
  compatibleOperatingSystems:decode(row.compatible_operating_systems),
  compatibleRuntimes:decode(row.compatible_runtimes),compatibleDeviceModels:decode(row.compatible_device_models),
  notice:{verification:row.notice_verification??"not_provided",source:row.notice_source,reference:row.notice_reference,recordedAt:iso(row.notice_recorded_at)},
  version:Number(row.version),policyStatus:row.policy_status,
 };
}

/** Durable tenant/application dependency inventory. Mutations and audit events share one transaction. */
export class PostgresDependencyInventoryRepository {
 constructor(private readonly pool:AuditSqlPool,private readonly serviceVersion?:string){}
 async assertReady():Promise<void>{
  const c=await this.pool.connect();
  try{
   const r=await c.query<{policy:string|null;notice:string|null;installation:string|null;policy_rls:boolean;notice_rls:boolean;installation_rls:boolean}>(
    `SELECT to_regclass('public.eper_dependency_policy')::text policy,
      to_regclass('public.eper_dependency_notice_evidence')::text notice,
      to_regclass('public.eper_dependency_installation')::text installation,
      COALESCE((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=to_regclass('public.eper_dependency_policy')),false) policy_rls,
      COALESCE((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=to_regclass('public.eper_dependency_notice_evidence')),false) notice_rls,
      COALESCE((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=to_regclass('public.eper_dependency_installation')),false) installation_rls`);
   const s=r.rows[0];if(!s?.policy||!s.notice||!s.installation||!s.policy_rls||!s.notice_rls||!s.installation_rls)throw new Error("EPER_DEPENDENCY_INVENTORY_SCHEMA_NOT_READY");
  }catch(e){if(e instanceof Error&&e.message==="EPER_DEPENDENCY_INVENTORY_SCHEMA_NOT_READY")throw e;throw new Error("EPER_DEPENDENCY_INVENTORY_READINESS_FAILED",{cause:e});}
  finally{c.release();}
 }
 async list(scope:DependencyScope):Promise<StoredDependencyPolicy[]>{
  this.validateScope(scope);const c=await this.pool.connect();
  try{await c.query("BEGIN READ ONLY");await this.setScope(c,scope);
   const r=await c.query<PolicyRow>(this.policySelect()+` WHERE p.tenant_id=$1 AND p.application_id=$2 ORDER BY p.vendor,p.dependency_id`,[scope.tenantId,scope.applicationId]);
   await c.query("COMMIT");return r.rows.map(mapPolicy);
  }catch(e){await this.rollback(c);throw e;}finally{c.release();}
 }
 async get(scope:DependencyScope,dependencyId:string):Promise<StoredDependencyPolicy|null>{
  this.validateScope(scope);requiredText(dependencyId,160,"dependency_id");const c=await this.pool.connect();
  try{await c.query("BEGIN READ ONLY");await this.setScope(c,scope);
   const r=await c.query<PolicyRow>(this.policySelect()+` WHERE p.tenant_id=$1 AND p.application_id=$2 AND p.dependency_id=$3`,[scope.tenantId,scope.applicationId,dependencyId]);
   await c.query("COMMIT");return r.rows[0]?mapPolicy(r.rows[0]):null;
  }catch(e){await this.rollback(c);throw e;}finally{c.release();}
 }
 async savePolicy(input:SaveDependencyPolicyInput):Promise<StoredDependencyPolicy>{
  this.validateAudit(input);const p=input.policy;
  requiredText(p.dependencyId,160,"dependency_id");requiredText(p.vendor,160,"vendor");
  if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)throw new Error("DEPENDENCY_POLICY_VERSION_INVALID");
  if(!["plugin","dll","sdk","driver","firmware","gateway_agent","peripheral_adapter","runtime","other"].includes(p.componentKind)||
     !["supported","deprecated","unsupported","unknown"].includes(p.supportState)||
     !["allowed","vendor_prohibited"].includes(p.downgradePolicy))throw new Error("DEPENDENCY_POLICY_ENUM_INVALID");
  const effectiveAt=validDate(p.effectiveAt,"effective_at");
  if(p.mandatoryUpdate&&(!p.requiredMinimumVersion||!effectiveAt))throw new Error("DEPENDENCY_MANDATORY_UPDATE_EVIDENCE_REQUIRED");
  const notice=input.notice;
  if(p.mandatoryUpdate&&(!notice||notice.verification!=="verified"||!notice.source?.trim()||!notice.reference?.trim()))throw new Error("DEPENDENCY_VERIFIED_NOTICE_REQUIRED");
  const c=await this.pool.connect();
  try{await c.query("BEGIN");await this.setScope(c,input);
   const current=await c.query<{version:number|string}>(`SELECT version FROM eper_dependency_policy WHERE tenant_id=$1 AND application_id=$2 AND dependency_id=$3 FOR UPDATE`,[input.tenantId,input.applicationId,p.dependencyId]);
   const currentVersion=current.rows[0]?Number(current.rows[0].version):0;
   if(currentVersion!==input.expectedVersion)throw new Error("DEPENDENCY_POLICY_VERSION_CONFLICT");
   const next=await c.query<PolicyRow>(`INSERT INTO eper_dependency_policy
    (tenant_id,application_id,dependency_id,vendor,component_kind,supported_versions,required_minimum_version,
     support_state,mandatory_update,effective_at,downgrade_policy,compatible_operating_systems,
     compatible_runtimes,compatible_device_models,policy_status,version,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,'active',1,$15,$15)
    ON CONFLICT(tenant_id,application_id,dependency_id) DO UPDATE SET
     vendor=EXCLUDED.vendor,component_kind=EXCLUDED.component_kind,supported_versions=EXCLUDED.supported_versions,
     required_minimum_version=EXCLUDED.required_minimum_version,support_state=EXCLUDED.support_state,
     mandatory_update=EXCLUDED.mandatory_update,effective_at=EXCLUDED.effective_at,
     downgrade_policy=EXCLUDED.downgrade_policy,compatible_operating_systems=EXCLUDED.compatible_operating_systems,
     compatible_runtimes=EXCLUDED.compatible_runtimes,compatible_device_models=EXCLUDED.compatible_device_models,
     policy_status='active',version=eper_dependency_policy.version+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()
    RETURNING dependency_id,vendor,component_kind,supported_versions,required_minimum_version,support_state,
     mandatory_update,effective_at,downgrade_policy,compatible_operating_systems,compatible_runtimes,
     compatible_device_models,policy_status,version,NULL::text notice_verification,NULL::text notice_source,
     NULL::text notice_reference,NULL::timestamptz notice_recorded_at`,
    [input.tenantId,input.applicationId,p.dependencyId,p.vendor,p.componentKind,JSON.stringify(p.supportedVersions),
     p.requiredMinimumVersion??null,p.supportState,p.mandatoryUpdate,effectiveAt,p.downgradePolicy,
     JSON.stringify(p.compatibleOperatingSystems??[]),JSON.stringify(p.compatibleRuntimes??[]),
     JSON.stringify(p.compatibleDeviceModels??[]),input.actorId]);
   if(!next.rows[0])throw new Error("DEPENDENCY_POLICY_SAVE_EMPTY");
   if(notice)await this.insertNotice(c,input,p.dependencyId,{...notice,
    effectiveAt:notice.effectiveAt??effectiveAt,
    requiredMinimumVersion:notice.requiredMinimumVersion??p.requiredMinimumVersion??null});
   await this.audit(c,input,"dependency.policy.save",p.dependencyId,{version:Number(next.rows[0].version),mandatoryUpdate:p.mandatoryUpdate});
   const persisted=await c.query<PolicyRow>(this.policySelect()+` WHERE p.tenant_id=$1 AND p.application_id=$2 AND p.dependency_id=$3`,[input.tenantId,input.applicationId,p.dependencyId]);
   if(!persisted.rows[0])throw new Error("DEPENDENCY_POLICY_READ_AFTER_SAVE_FAILED");
   await c.query("COMMIT");
   return mapPolicy(persisted.rows[0]);
  }catch(e){await this.rollback(c);throw e;}finally{c.release();}
 }
 async recordInstallation(input:RecordDependencyInstallationInput):Promise<{installationId:string;version:number}>{
  this.validateAudit(input);requiredText(input.dependencyId,160,"dependency_id");
  const id=input.installationId??randomUUID();requiredText(id,160,"installation_id");
  for(const [v,k] of [[input.scopeId,"scope_id"],[input.installedVersion,"installed_version"],[input.operatingSystem,"operating_system"],[input.runtime,"runtime"]] as const)requiredText(v,160,k);
  const c=await this.pool.connect();
  try{await c.query("BEGIN");await this.setScope(c,input);
   const r=await c.query<{version:number|string}>(`INSERT INTO eper_dependency_installation
    (tenant_id,application_id,dependency_id,installation_id,scope_type,scope_id,installed_version,
     operating_system,runtime,device_model,installation_status,version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)
    ON CONFLICT(tenant_id,application_id,dependency_id,installation_id) DO UPDATE SET
     scope_type=EXCLUDED.scope_type,scope_id=EXCLUDED.scope_id,installed_version=EXCLUDED.installed_version,
     operating_system=EXCLUDED.operating_system,runtime=EXCLUDED.runtime,device_model=EXCLUDED.device_model,
     installation_status=EXCLUDED.installation_status,version=eper_dependency_installation.version+1,
     updated_at=clock_timestamp()
    RETURNING version`,[input.tenantId,input.applicationId,input.dependencyId,id,input.scopeType,input.scopeId,
     input.installedVersion,input.operatingSystem,input.runtime,input.deviceModel??null,input.installationStatus??"observed"]);
   if(!r.rows[0])throw new Error("DEPENDENCY_INSTALLATION_SAVE_EMPTY");
   await this.audit(c,input,"dependency.installation.record",id,{dependencyId:input.dependencyId,scopeType:input.scopeType,version:input.installedVersion});
   await c.query("COMMIT");return {installationId:id,version:Number(r.rows[0].version)};
  }catch(e){await this.rollback(c);throw e;}finally{c.release();}
 }
 private async insertNotice(c:AuditSqlClient,input:DependencyAuditContext,dependencyId:string,n:{verification:DependencyNoticeVerification;source:string|null;reference:string|null;recordedAt?:string|null;effectiveAt?:string|null;requiredMinimumVersion?:string|null;evidenceDigest?:string|null;notes?:string|null}):Promise<void>{
  if(n.verification==="verified"&&(!n.source?.trim()||!n.reference?.trim()))throw new Error("DEPENDENCY_VERIFIED_NOTICE_REQUIRED");
  if(n.evidenceDigest&&!/^[a-f0-9]{64}$/.test(n.evidenceDigest))throw new Error("DEPENDENCY_NOTICE_DIGEST_INVALID");
  await c.query(`INSERT INTO eper_dependency_notice_evidence
   (tenant_id,application_id,dependency_id,notice_id,verification_state,source,reference,recorded_at,recorded_by,effective_at,required_minimum_version,evidence_digest,notes)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
   [input.tenantId,input.applicationId,dependencyId,randomUUID(),n.verification,n.source,n.reference,
    validDate(n.recordedAt,"notice_recorded_at")??new Date().toISOString(),input.actorId,
    n.effectiveAt?validDate(n.effectiveAt,"notice_effective_at"):null,
    n.requiredMinimumVersion??null,n.evidenceDigest??null,n.notes??null]);
 }
 private policySelect():string{return `SELECT p.dependency_id,p.vendor,p.component_kind,p.supported_versions,p.required_minimum_version,
  p.support_state,p.mandatory_update,p.effective_at,p.downgrade_policy,p.compatible_operating_systems,
  p.compatible_runtimes,p.compatible_device_models,p.policy_status,p.version,
  n.verification_state notice_verification,n.source notice_source,n.reference notice_reference,n.recorded_at notice_recorded_at
  FROM eper_dependency_policy p LEFT JOIN LATERAL
   (SELECT verification_state,source,reference,recorded_at FROM eper_dependency_notice_evidence e
     WHERE e.tenant_id=p.tenant_id AND e.application_id=p.application_id AND e.dependency_id=p.dependency_id
     ORDER BY recorded_at DESC,notice_id DESC LIMIT 1) n ON true`;}
 private async audit(c:AuditSqlClient,i:DependencyAuditContext,action:string,id:string,payload:Record<string,unknown>):Promise<void>{
  await appendAuditEventInTransaction(c,{tenantId:i.tenantId,applicationId:i.applicationId,environment:i.environment,
   actorType:"human",actorId:i.actorId,action,outcome:"success",resourceType:"vendor_dependency",resourceId:id,
   correlationId:i.correlationId,source:"api",operationName:action,serviceVersion:i.serviceVersion??this.serviceVersion,payload});
 }
 private async setScope(c:AuditSqlClient,s:DependencyScope):Promise<void>{
  await c.query("SELECT set_config('eper.tenant_id',$1,true)",[s.tenantId]);
  await c.query("SELECT set_config('eper.application_id',$1,true)",[s.applicationId]);
 }
 private validateScope(s:DependencyScope):void{requiredText(s.tenantId,128,"tenant_id");requiredText(s.applicationId,128,"application_id");}
 private validateAudit(i:DependencyAuditContext):void{this.validateScope(i);requiredText(i.actorId,128,"actor_id");requiredText(i.correlationId,128,"correlation_id");}
 private async rollback(c:AuditSqlClient):Promise<void>{try{await c.query("ROLLBACK");}catch{/* preserve original error */}}
}
