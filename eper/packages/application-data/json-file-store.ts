import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { StatefulApplicationDataStore } from "./state-store.js";
import type { ApplicationDataState } from "./types.js";

const EMPTY:ApplicationDataState={models:[],records:[],audit:[],outbox:[],idempotency:[]};

/** Async, single-process local adapter. It is deliberately not a multi-process production database. */
export class JsonFileApplicationDataStore extends StatefulApplicationDataStore {
  private constructor(private readonly filePath:string,state:ApplicationDataState){super(state);}
  static async open(filePath:string):Promise<JsonFileApplicationDataStore>{
    if(typeof filePath!=="string"||!filePath.trim())throw new Error("APPLICATION_DATA_FILE_PATH_REQUIRED");
    await mkdir(dirname(filePath),{recursive:true,mode:0o700});
    let state:ApplicationDataState;
    try{
      const parsed:unknown=JSON.parse(await readFile(filePath,"utf8"));
      if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("APPLICATION_DATA_FILE_INVALID");
      state=parsed as ApplicationDataState;
      for(const key of ["models","records","audit","outbox","idempotency"] as const)if(!Array.isArray(state[key]))throw new Error("APPLICATION_DATA_FILE_INVALID");
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=="ENOENT")throw new Error("APPLICATION_DATA_FILE_INVALID",{cause:error});
      state=structuredClone(EMPTY);
    }
    const store=new JsonFileApplicationDataStore(filePath,state);
    if(state===EMPTY)await store.persist(state);
    return store;
  }
  protected override async persist(next:ApplicationDataState):Promise<void>{
    const temporary=this.filePath+"."+randomUUID()+".tmp";
    let handle;
    try{
      handle=await open(temporary,"wx",0o600);
      await handle.writeFile(JSON.stringify(next),"utf8");
      await handle.sync();
      await handle.close();handle=undefined;
      await rename(temporary,this.filePath);
    }catch(error){
      if(handle)await handle.close().catch(()=>undefined);
      await rm(temporary,{force:true}).catch(()=>undefined);
      throw error;
    }
  }
}
