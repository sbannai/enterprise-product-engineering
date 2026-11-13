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
  putModel(model: ApplicationDataModel): Promise<void>;
  create(record: ApplicationDataRecord, context: ApplicationDataContext): Promise<ApplicationDataRecord>;
  get(context: ApplicationDataContext, entityType: string, id: string): Promise<ApplicationDataRecord | undefined>;
  update(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number, patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }, contextForAudit: ApplicationDataContext): Promise<ApplicationDataRecord>;
  delete(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number, contextForAudit: ApplicationDataContext): Promise<void>;
  query(context: ApplicationDataContext, entityType: string, query: ApplicationDataQuery): Promise<ApplicationDataRecord[]>;
}
