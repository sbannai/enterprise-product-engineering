import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import type { ApplicationDataWorkflowActivity } from "../../packages/application-data/workflow-binding.js";
import type { AuditSqlClient, AuditSqlPool, AuditSqlResult } from "../../packages/audit/audit-event-store.js";
import { ApplicationDataActivityIntentWorker } from "../../packages/workflows/application-data-activity-intent-worker.js";
import { ApplicationDataActivityIntentProcess } from "../../packages/workflows/application-data-activity-intent-process.js";
import { PostgresWorkflowOutboxContextSource } from "../../packages/workflows/postgres-workflow-outbox-context-source.js";
import { readApplicationDataExecutorWorkerConfig } from "../../packages/workflows/application-data-executor-worker-config.js";
import { resolveApplicationDataActivityRealPath } from "../../packages/workflows/application-data-activity-module.js";

interface ActivityModule {
 createApplicationDataWorkflowActivity(input:{pool:Pool;env:NodeJS.ProcessEnv}):Promise<ApplicationDataWorkflowActivity>|ApplicationDataWorkflowActivity;
}
function safeErrorCode(error:unknown):string {
 const message=error instanceof Error?error.message:"";
 return /^[A-Z][A-Z0-9_]{1,95}$/.test(message)?message:"APPLICATION_DATA_EXECUTOR_RUNTIME_ERROR";
}
function createAuditSqlPoolAdapter(pool:Pool):AuditSqlPool {
 return {async connect():Promise<AuditSqlClient>{
  const client=await pool.connect();
  return {
   async query<Row=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<AuditSqlResult<Row>>{
    const result=await client.query(sql,values as never[]|undefined);
    return {rows:result.rows as Row[],rowCount:result.rowCount};
   },
   release(){client.release();},
  };
 }};
}
async function assertExecutorSchemaReady(pool:Pool):Promise<void>{
 const result=await pool.query<Record<string,string|null>>( `
 SELECT to_regclass('public.eper_workflow_application_data_intents')::text AS intents_table,
        to_regclass('public.eper_application_data_models')::text AS models_table,
        to_regclass('public.eper_application_data_records')::text AS records_table,
        to_regclass('public.eper_application_data_idempotency')::text AS idempotency_table,
        to_regclass('public.audit_evidence')::text AS evidence_table,
        to_regclass('public.transactional_outbox')::text AS outbox_table
 `);
 const row=result.rows[0];
 if(!row||Object.values(row).some(value=>!value)) throw new Error("APPLICATION_DATA_EXECUTOR_SCHEMA_NOT_READY");
}
async function main():Promise<void>{
 const config=readApplicationDataExecutorWorkerConfig(process.env);
 const require=createRequire(import.meta.url);
 const pg=require("pg") as {Pool:new(options:{connectionString:string;max:number;connectionTimeoutMillis:number;idleTimeoutMillis:number;application_name:string})=>Pool};
 const pool=new pg.Pool({connectionString:config.databaseUrl,max:6,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,application_name:"eper-application-data-executor"});
 const controller=new AbortController();
 let stopping=false;
 const handlers=new Map<"SIGINT"|"SIGTERM",()=>void>();
 const shutdown=(signal:string)=>{
  if(stopping)return;
  stopping=true;
  console.log(JSON.stringify({event:"application_data_executor_shutdown_requested",signal}));
  controller.abort();
 };
 for(const signal of ["SIGINT","SIGTERM"] as const){const handler=()=>shutdown(signal);handlers.set(signal,handler);process.once(signal,handler);}
 try{
  const identity=await pool.query<{role_name:string;can_login:boolean;is_superuser:boolean;can_create_database:boolean;can_create_role:boolean;can_replicate:boolean;bypasses_rls:boolean;has_executor_access:boolean;inherits_role_privileges:boolean}>(`
   SELECT current_user::text AS role_name,r.rolcanlogin AS can_login,r.rolsuper AS is_superuser,
          r.rolcreatedb AS can_create_database,r.rolcreaterole AS can_create_role,
          r.rolreplication AS can_replicate,r.rolbypassrls AS bypasses_rls,r.rolinherit AS inherits_role_privileges,
          pg_has_role(current_user,'eper_application_data_executor_access','USAGE') AS has_executor_access
     FROM pg_roles r WHERE r.rolname=current_user
  `);
  const role=identity.rows[0];
  if(!role||role.role_name!==config.expectedDatabaseRole||!role.can_login||role.is_superuser||
     role.can_create_database||role.can_create_role||role.can_replicate||role.bypasses_rls||!role.has_executor_access||!role.inherits_role_privileges){
   throw new Error("APPLICATION_DATA_EXECUTOR_DATABASE_ROLE_INVALID");
  }
  await assertExecutorSchemaReady(pool);
  const modulePath=await resolveApplicationDataActivityRealPath(config.activityModulePath);
  const module=await import(pathToFileURL(modulePath).href) as ActivityModule;
  if(typeof module.createApplicationDataWorkflowActivity!=="function") throw new Error("APPLICATION_DATA_ACTIVITY_FACTORY_REQUIRED");
  const activity=await module.createApplicationDataWorkflowActivity({pool,env:process.env});
  if(!activity||typeof activity.execute!=="function") throw new Error("APPLICATION_DATA_ACTIVITY_FACTORY_INVALID");
  const auditPool=createAuditSqlPoolAdapter(pool);
  const contexts=new PostgresWorkflowOutboxContextSource(auditPool,config.maxContexts);
  const worker=new ApplicationDataActivityIntentWorker(auditPool,activity,{
   workerId:config.workerId,leaseMilliseconds:config.leaseMilliseconds,maxAttempts:config.maxAttempts,
  });
  const executorProcess=new ApplicationDataActivityIntentProcess(worker,contexts,{
   idlePollMs:config.idlePollMs,maxContextsPerPass:config.maxContexts,
   onPass(result){console.log(JSON.stringify({event:"application_data_executor_pass",workerId:config.workerId,...result}));},
   onError(error,context){console.error(JSON.stringify({event:"application_data_executor_error",workerId:config.workerId,code:safeErrorCode(error),tenantId:context?.tenantId,applicationId:context?.applicationId}));},
  });
  console.log(JSON.stringify({event:"application_data_executor_worker_started",workerId:config.workerId,databaseRole:config.expectedDatabaseRole,maxContexts:config.maxContexts,idlePollMs:config.idlePollMs}));
  await executorProcess.run(controller.signal);
 }finally{
  for(const [signal,handler] of handlers)process.removeListener(signal,handler);
  await pool.end();
 }
}
await main().catch(error=>{console.error(JSON.stringify({event:"application_data_executor_worker_fatal",code:safeErrorCode(error)}));process.exitCode=1;});
