export type ApplicationDataFieldType = "string" | "number" | "boolean" | "date" | "object" | "array";
export interface ApplicationDataField {
  id: string;
  type: ApplicationDataFieldType;
  required?: boolean;
  nullable?: boolean;
  maxLength?: number;
  enum?: Array<string | number | boolean>;
}
export interface ApplicationDataRelationship {
  field: string;
  targetEntity: string;
  cardinality: "one" | "many";
}
export interface ApplicationDataModel {
  tenantId: string;
  applicationId: string;
  entityType: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  fields: ApplicationDataField[];
  relationships?: ApplicationDataRelationship[];
}
export interface ApplicationDataContext {
  tenantId: string;
  applicationId: string;
  actorId: string;
  correlationId: string;
  requirementId: string;
  /** Authorization captured at workflow transition and revalidated by the executor. */
  workflowRoleId?: string;
  workflowPermission?: "workflow:act" | "workflow:approve";
  /** Stable client/workflow key used to make create retries return the original result. */
  idempotencyKey?: string;
}
export interface ApplicationDataRecord {
  tenantId: string;
  applicationId: string;
  entityType: string;
  id: string;
  schemaVersion: number;
  version: number;
  state: "ACTIVE" | "ARCHIVED";
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface ApplicationDataQuery {
  state?: "ACTIVE" | "ARCHIVED";
  limit?: number;
  afterId?: string;
}
export interface ApplicationDataAdapter {
  getModel(tenantId: string, applicationId: string, entityType: string, version?: number): Promise<ApplicationDataModel | undefined>;
  getActiveModel(tenantId: string, applicationId: string, entityType: string): Promise<ApplicationDataModel | undefined>;
  putModel(model: ApplicationDataModel): Promise<void>;
  transitionModelStatus(tenantId: string, applicationId: string, entityType: string, version: number, from: ApplicationDataModel["status"], to: ApplicationDataModel["status"]): Promise<void>;
  getIdempotentCreate(context: ApplicationDataContext, entityType: string, id: string, data: Record<string, unknown>): Promise<ApplicationDataRecord | undefined>;
  getIdempotentUpdate(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord | undefined>;
  getIdempotentDelete(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number): Promise<boolean>;
  create(record: ApplicationDataRecord, context: ApplicationDataContext, relationships?: ApplicationDataRelationship[]): Promise<ApplicationDataRecord>;
  get(context: ApplicationDataContext, entityType: string, id: string): Promise<ApplicationDataRecord | undefined>;
  update(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }, relationships?: ApplicationDataRelationship[]): Promise<ApplicationDataRecord>;
  delete(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number): Promise<void>;
  query(context: ApplicationDataContext, entityType: string, query: ApplicationDataQuery): Promise<ApplicationDataRecord[]>;
}
