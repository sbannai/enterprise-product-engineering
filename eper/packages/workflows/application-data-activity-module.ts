import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Resolve only an existing trusted JavaScript module physically inside the deployment bundle. */
export async function resolveApplicationDataActivityRealPath(candidatePath:string,cwd=process.cwd()):Promise<string>{
 let root:string,candidate:string;
 try{
  root=await realpath(resolve(cwd,"dist/apps/worker/application-data-activities"));
  candidate=await realpath(candidatePath);
 }catch{throw new Error("APPLICATION_DATA_ACTIVITY_MODULE_NOT_FOUND");}
 const relativePath=relative(root,candidate);
 if(!relativePath||relativePath==="."||relativePath===".."||relativePath.startsWith(".."+sep)||
    isAbsolute(relativePath)||!candidate.endsWith(".js")) throw new Error("APPLICATION_DATA_ACTIVITY_MODULE_PATH_INVALID");
 const metadata=await stat(candidate);
 if(!metadata.isFile()) throw new Error("APPLICATION_DATA_ACTIVITY_MODULE_NOT_FILE");
 return candidate;
}
