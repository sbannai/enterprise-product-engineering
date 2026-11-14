import { isAbsolute, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

export interface ApplicationDataExecutorWorkerConfig {
  databaseUrl: string;
  expectedDatabaseRole: string;
  workerId: string;
  activityModulePath: string;
  idlePollMs: number;
  maxContexts: number;
  leaseMilliseconds: number;
  maxAttempts: number;
}
function required(env: Readonly<Record<string,string|undefined>>, name: string): string {
  const value=env[name]?.trim();
  if(!value) throw new Error(name+"_REQUIRED");
  return value;
}
function bounded(env: Readonly<Record<string,string|undefined>>,name:string,fallback:number,min:number,max:number):number {
  const raw=env[name]?.trim();
  if(!raw) return fallback;
  if(!/^[0-9]+$/.test(raw)) throw new Error(name+"_INVALID");
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max) throw new Error(name+"_OUT_OF_RANGE");
  return value;
}
export function resolveApplicationDataActivityModulePath(value:string,cwd=process.cwd()):string {
  const root=resolve(cwd,"dist/apps/worker/application-data-activities");
  const candidate=resolve(cwd,value);
  const relativePath=relative(root,candidate);
  if(!value.startsWith("./dist/apps/worker/application-data-activities/") ||
     !relativePath || relativePath==="." || relativePath===".." ||
     relativePath.startsWith(".."+sep) || isAbsolute(relativePath) || !candidate.endsWith(".js")) {
    throw new Error("APPLICATION_DATA_ACTIVITY_MODULE_PATH_INVALID");
  }
  return candidate;
}
export function readApplicationDataExecutorWorkerConfig(
 env:Readonly<Record<string,string|undefined>>,cwd=process.cwd(),
):ApplicationDataExecutorWorkerConfig {
 if(env.EPER_APPLICATION_DATA_EXECUTOR_WORKER_ENABLED!=="true") throw new Error("EPER_APPLICATION_DATA_EXECUTOR_WORKER_DISABLED");
 const databaseUrl=required(env,"EPER_APPLICATION_DATA_EXECUTOR_DATABASE_URL");
 let parsed:URL;
 try{parsed=new URL(databaseUrl);}catch{throw new Error("APPLICATION_DATA_EXECUTOR_DATABASE_URL_INVALID");}
 if(!["postgres:","postgresql:"].includes(parsed.protocol)||!parsed.username) throw new Error("APPLICATION_DATA_EXECUTOR_DATABASE_URL_INVALID");
 let urlRole:string;
 try{urlRole=decodeURIComponent(parsed.username);}catch{throw new Error("APPLICATION_DATA_EXECUTOR_DATABASE_URL_INVALID");}
 const expectedDatabaseRole=required(env,"EPER_APPLICATION_DATA_EXECUTOR_EXPECTED_DATABASE_ROLE");
 if(!/^[a-z_][a-z0-9_]{2,62}$/.test(expectedDatabaseRole)||expectedDatabaseRole==="eper"||urlRole!==expectedDatabaseRole) {
  throw new Error("APPLICATION_DATA_EXECUTOR_DATABASE_ROLE_MISMATCH");
 }
 const workerId=env.EPER_APPLICATION_DATA_EXECUTOR_WORKER_ID?.trim()||"eper-data-executor-"+randomUUID();
 if(!/^[a-zA-Z0-9._:-]{8,128}$/.test(workerId)) throw new Error("APPLICATION_DATA_EXECUTOR_WORKER_ID_INVALID");
 return {
  databaseUrl,expectedDatabaseRole,workerId,
  activityModulePath:resolveApplicationDataActivityModulePath(required(env,"EPER_APPLICATION_DATA_ACTIVITY_MODULE"),cwd),
  idlePollMs:bounded(env,"EPER_APPLICATION_DATA_EXECUTOR_IDLE_POLL_MS",1000,50,60000),
  maxContexts:bounded(env,"EPER_APPLICATION_DATA_EXECUTOR_MAX_CONTEXTS",1000,1,10000),
  leaseMilliseconds:bounded(env,"EPER_APPLICATION_DATA_EXECUTOR_LEASE_MS",60000,1000,3600000),
  maxAttempts:bounded(env,"EPER_APPLICATION_DATA_EXECUTOR_MAX_ATTEMPTS",8,1,100),
 };
}
