import { randomUUID } from "node:crypto";
import type { ApplicationDataActorContext, ApplicationDataModel, ApplicationDataRecord, ApplicationDataScope, ApplicationDataStore } from "./types.js";
import { validateApplicationDataScope, validateEntityModel, validateRecordData } from "./validation.js";

export class ApplicationDataService {
  constructor(private readonly store: ApplicationDataStore) {}

  async saveModel(scope: ApplicationDataScope, input: {entityType:string;fields:ApplicationDataModel["fields"];relationships?:ApplicationDataModel["relationships"]},
    expectedVersion:number, context:ApplicationDataActorContext):Promise<ApplicationDataModel>{
    validateApplicationDataScope(scope);validateEntityModel(input);
    return this.store.saveModel(scope,{entityType:input.entityType,fields:input.fields,relationships:input.relationships??[],createdBy:context.actorId},expectedVersion,context);
  }

  async publishModel(scope:ApplicationDataScope,entityType:string,expectedVersion:number,context:ApplicationDataActorContext):Promise<ApplicationDataModel>{
    const model=await this.store.getModel(scope,entityType,expectedVersion);
    if(!model)throw new Error("APPLICATION_DATA_MODEL_NOT_FOUND");
    validateEntityModel(model);
    return this.store.publishModel(scope,entityType,expectedVersion,context);
  }

  async createRecord(scope:ApplicationDataScope,entityType:string,data:Record<string,unknown>,context:ApplicationDataActorContext):Promise<ApplicationDataRecord>{
    const model=await this.store.getModel(scope,entityType);
    if(!model)throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
    validateRecordData(model,data);
    return this.store.createRecord(scope,entityType,data,context);
  }

  async updateRecord(scope:ApplicationDataScope,entityType:string,recordId:string,expectedVersion:number,data:Record<string,unknown>,context:ApplicationDataActorContext):Promise<ApplicationDataRecord>{
    const model=await this.store.getModel(scope,entityType);
    if(!model)throw new Error("APPLICATION_DATA_PUBLISHED_MODEL_REQUIRED");
    validateRecordData(model,data);
    return this.store.updateRecord(scope,entityType,recordId,expectedVersion,data,context);
  }

  getRecord(scope:ApplicationDataScope,entityType:string,recordId:string){return this.store.getRecord(scope,entityType,recordId);}
  listRecords(scope:ApplicationDataScope,entityType:string,filter?:Parameters<ApplicationDataStore["listRecords"]>[2]){return this.store.listRecords(scope,entityType,filter);}
  listModels(scope:ApplicationDataScope){return this.store.listModels(scope);}
  archiveRecord(scope:ApplicationDataScope,entityType:string,recordId:string,expectedVersion:number,context:ApplicationDataActorContext){return this.store.deleteRecord(scope,entityType,recordId,expectedVersion,context);}
  newIdempotencyKey():string{return randomUUID();}
}
