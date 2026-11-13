export type ApplicationDataFieldType = "string" | "number" | "boolean" | "date" | "object" | "array" | "reference";
export type ApplicationDataModelStatus = "DRAFT" | "PUBLISHED";

export interface ApplicationDataField {
  id: string;
  label: string;
  type: ApplicationDataFieldType;
  required?: boolean;
  nullable?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: Array<string | number | boolean>;
  itemType?: Exclude<ApplicationDataFieldType, "reference" | "array">;
  referenceEntity?: string;
  many?: boolean;
}

export interface ApplicationDataRelationship {
  id: string;
  label: string;
  targetEntity: string;
  cardinality: "one" | "many";
  required?: boolean;
}

export interface ApplicationDataModel {
  tenantId: string;
  applicationId: string;
  entityType: string;
  schemaVersion: number;
  status: ApplicationDataModelStatus;
  fields: ApplicationDataField[];
  relationships: ApplicationDataRelationship[];
  digest: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
  publishedBy?: string;
}

export interface ApplicationDataScope {
  tenantId: string;
  applicationId: string;
}

export interface ApplicationDataActorContext extends ApplicationDataScope {
  actorId: string;
  correlationId: string;
  requirementId: string;
  idempotencyKey: string;
}

export interface ApplicationDataRecord {
  tenantId: string;
  applicationId: string;
  entityType: string;
  recordId: string;
  schemaVersion: number;
  version: number;
  status: "ACTIVE" | "ARCHIVED";
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ApplicationDataAuditEntry {
  auditId: string;
  tenantId: string;
  applicationId: string;
  entityType: string;
  recordId?: string;
  action: string;
  actorId: string;
  correlationId: string;
  requirementId: string;
  occurredAt: string;
  beforeVersion?: number;
  afterVersion?: number;
  payloadDigest: string;
}

export interface ApplicationDataOutboxEvent {
  eventId: string;
  tenantId: string;
  applicationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  correlationId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface ApplicationDataRecordFilter {
  equals?: Record<string, string | number | boolean | null>;
  limit?: number;
  afterRecordId?: string;
}

export interface ApplicationDataStore {
  getModel(scope: ApplicationDataScope, entityType: string, schemaVersion?: number): Promise<ApplicationDataModel | null>;
  listModels(scope: ApplicationDataScope): Promise<ApplicationDataModel[]>;
  saveModel(scope: ApplicationDataScope, model: Omit<ApplicationDataModel, "tenantId" | "applicationId" | "schemaVersion" | "status" | "digest" | "createdAt" | "updatedAt" | "publishedAt" | "publishedBy">, expectedVersion: number, context: ApplicationDataActorContext): Promise<ApplicationDataModel>;
  publishModel(scope: ApplicationDataScope, entityType: string, expectedVersion: number, context: ApplicationDataActorContext): Promise<ApplicationDataModel>;
  getRecord(scope: ApplicationDataScope, entityType: string, recordId: string): Promise<ApplicationDataRecord | null>;
  listRecords(scope: ApplicationDataScope, entityType: string, filter?: ApplicationDataRecordFilter): Promise<ApplicationDataRecord[]>;
  createRecord(scope: ApplicationDataScope, entityType: string, data: Record<string, unknown>, context: ApplicationDataActorContext): Promise<ApplicationDataRecord>;
  updateRecord(scope: ApplicationDataScope, entityType: string, recordId: string, expectedVersion: number, data: Record<string, unknown>, context: ApplicationDataActorContext): Promise<ApplicationDataRecord>;
  deleteRecord(scope: ApplicationDataScope, entityType: string, recordId: string, expectedVersion: number, context: ApplicationDataActorContext): Promise<void>;
}

export interface ApplicationDataState {
  models: ApplicationDataModel[];
  records: ApplicationDataRecord[];
  audit: ApplicationDataAuditEntry[];
  outbox: ApplicationDataOutboxEvent[];
  idempotency: Array<{ tenantId: string; applicationId: string; key: string; fingerprint: string; result: unknown }>;
}
