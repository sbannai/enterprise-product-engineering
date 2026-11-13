import type { ApplicationDataContext } from "./contracts.js";
import { ApplicationDataService } from "./service.js";

export type ApplicationDataWorkflowOperation = "create" | "get" | "update" | "delete" | "query";
export interface ApplicationDataWorkflowBinding {
  entityType: string;
  operation: ApplicationDataWorkflowOperation;
  recordIdField?: string;
  expectedVersionField?: string;
  dataField?: string;
  resultKey?: string;
}
export type ApplicationDataWorkflowAuthorizer = (
  context: ApplicationDataContext, entityType: string, operation: ApplicationDataWorkflowOperation,
) => Promise<void>;
/** Executes only platform-registered data operations; customer workflow JSON cannot select a collection or storage adapter. */
export class ApplicationDataWorkflowActivity {
  constructor(private readonly service: ApplicationDataService, private readonly authorize: ApplicationDataWorkflowAuthorizer) {}
  async execute(context: ApplicationDataContext, binding: ApplicationDataWorkflowBinding, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!binding || !/^[a-zA-Z][a-zA-Z0-9._-]{1,127}$/.test(binding.entityType) ||
        !["create","get","update","delete","query"].includes(binding.operation) ||
        !input || typeof input !== "object" || Array.isArray(input)) throw new Error("APPLICATION_DATA_WORKFLOW_BINDING_INVALID");
    if (["create", "update", "delete"].includes(binding.operation) &&
        (typeof context?.idempotencyKey !== "string" ||
         !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(context.idempotencyKey))) {
      throw new Error("APPLICATION_DATA_WORKFLOW_IDEMPOTENCY_KEY_REQUIRED");
    }
    await this.authorize(context,binding.entityType,binding.operation);
    const id = binding.recordIdField ? input[binding.recordIdField] : undefined;
    const data = binding.dataField ? input[binding.dataField] : undefined;
    const version = binding.expectedVersionField ? input[binding.expectedVersionField] : undefined;
    const key = binding.resultKey ?? "result";
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) throw new Error("APPLICATION_DATA_WORKFLOW_RESULT_KEY_INVALID");
    if (binding.operation === "create") {
      if (typeof id !== "string" || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("APPLICATION_DATA_WORKFLOW_INPUT_INVALID");
      return { [key]: await this.service.create(context,binding.entityType,id,data as Record<string,unknown>) };
    }
    if (binding.operation === "get") {
      if (typeof id !== "string") throw new Error("APPLICATION_DATA_WORKFLOW_INPUT_INVALID");
      return { [key]: await this.service.get(context,binding.entityType,id) ?? null };
    }
    if (binding.operation === "update") {
      if (typeof id !== "string" || !Number.isSafeInteger(version) ||
          !data || typeof data !== "object" || Array.isArray(data)) throw new Error("APPLICATION_DATA_WORKFLOW_INPUT_INVALID");
      return { [key]: await this.service.update(context,binding.entityType,id,version as number,{ data:data as Record<string,unknown> }) };
    }
    if (binding.operation === "delete") {
      if (typeof id !== "string" || !Number.isSafeInteger(version)) throw new Error("APPLICATION_DATA_WORKFLOW_INPUT_INVALID");
      await this.service.delete(context,binding.entityType,id,version as number); return { [key]: { deleted:true } };
    }
    return { [key]: await this.service.query(context,binding.entityType,{ limit: typeof input.limit === "number" ? input.limit : 50, afterId: typeof input.afterId === "string" ? input.afterId : undefined }) };
  }
}
