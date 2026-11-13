import type { ApplicationDataAdapter, ApplicationDataContext, ApplicationDataField, ApplicationDataModel, ApplicationDataRecord, ApplicationDataQuery } from "./contracts.js";

const ID = /^[a-zA-Z][a-zA-Z0-9._-]{1,127}$/;
function validId(value: string, code: string): void {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(code);
}
function clone<T>(value: T): T {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error();
    return JSON.parse(serialized) as T;
  } catch { throw new Error("APPLICATION_DATA_NOT_SERIALIZABLE"); }
}
function validateModel(model: ApplicationDataModel): void {
  validId(model.tenantId, "APPLICATION_DATA_TENANT_INVALID");
  validId(model.applicationId, "APPLICATION_DATA_APPLICATION_INVALID");
  validId(model.entityType, "APPLICATION_DATA_ENTITY_INVALID");
  if (!Number.isSafeInteger(model.version) || model.version < 1 || !["DRAFT", "ACTIVE", "RETIRED"].includes(model.status) ||
      !Array.isArray(model.fields) || model.fields.length > 300) throw new Error("APPLICATION_DATA_MODEL_INVALID");
  const ids = new Set<string>();
  for (const field of model.fields) {
    if (!field || !ID.test(field.id) || ids.has(field.id) ||
        !["string", "number", "boolean", "date", "object", "array"].includes(field.type) ||
        (field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 1000000)) ||
        (field.enum !== undefined && (!Array.isArray(field.enum) || field.enum.length > 500))) {
      throw new Error("APPLICATION_DATA_FIELD_INVALID");
    }
    ids.add(field.id);
  }
  for (const relation of model.relationships ?? []) {
    if (!ids.has(relation.field) || !ID.test(relation.targetEntity) || !["one", "many"].includes(relation.cardinality)) {
      throw new Error("APPLICATION_DATA_RELATIONSHIP_INVALID");
    }
  }
}
function validateData(fields: ApplicationDataField[], data: Record<string, unknown>): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("APPLICATION_DATA_PAYLOAD_INVALID");
  const allowed = new Map(fields.map(field => [field.id, field]));
  for (const key of Object.keys(data)) if (!allowed.has(key)) throw new Error("APPLICATION_DATA_UNKNOWN_FIELD:" + key);
  for (const field of fields) {
    const value = data[field.id];
    if (value === undefined) {
      if (field.required) throw new Error("APPLICATION_DATA_REQUIRED_FIELD:" + field.id);
      continue;
    }
    if (value === null) {
      if (!field.nullable) throw new Error("APPLICATION_DATA_NULL_NOT_ALLOWED:" + field.id);
      continue;
    }
    const valid = field.type === "string" ? typeof value === "string" && (field.maxLength === undefined || value.length <= field.maxLength)
      : field.type === "number" ? typeof value === "number" && Number.isFinite(value)
      : field.type === "boolean" ? typeof value === "boolean"
      : field.type === "date" ? typeof value === "string" && Number.isFinite(Date.parse(value))
      : field.type === "object" ? !!value && typeof value === "object" && !Array.isArray(value)
      : Array.isArray(value);
    if (!valid) throw new Error("APPLICATION_DATA_FIELD_TYPE_INVALID:" + field.id);
    if (field.enum && !field.enum.includes(value as string | number | boolean)) throw new Error("APPLICATION_DATA_ENUM_INVALID:" + field.id);
  }
  return clone(data);
}
export class ApplicationDataService {
  constructor(private readonly adapter: ApplicationDataAdapter) {}
  async registerModel(model: ApplicationDataModel): Promise<void> {
    validateModel(model);
    const existingVersion = await this.adapter.getModel(model.tenantId, model.applicationId, model.entityType, model.version);
    if (existingVersion) throw new Error("APPLICATION_DATA_SCHEMA_VERSION_IMMUTABLE");
    const current = await this.adapter.getModel(model.tenantId, model.applicationId, model.entityType);
    if (current && model.version !== current.version + 1) {
      throw new Error("APPLICATION_DATA_SCHEMA_VERSION_CONFLICT");
    }
    await this.adapter.putModel(clone(model));
  }
  private async activeModel(context: ApplicationDataContext, entityType: string): Promise<ApplicationDataModel> {
    this.validateContext(context); validId(entityType, "APPLICATION_DATA_ENTITY_INVALID");
    const model = await this.adapter.getModel(context.tenantId, context.applicationId, entityType);
    if (!model || model.status !== "ACTIVE") throw new Error("APPLICATION_DATA_MODEL_NOT_ACTIVE");
    return model;
  }
  private validateContext(context: ApplicationDataContext): void {
    if (!context || !context.tenantId?.trim() || !context.applicationId?.trim() ||
        !context.actorId?.trim() || !context.correlationId?.trim() || !context.requirementId?.trim()) {
      throw new Error("APPLICATION_DATA_CONTEXT_REQUIRED");
    }
  }
  async create(context: ApplicationDataContext, entityType: string, id: string, data: Record<string, unknown>): Promise<ApplicationDataRecord> {
    const model = await this.activeModel(context, entityType); validId(id, "APPLICATION_DATA_RECORD_ID_INVALID");
    const now = new Date().toISOString();
    return this.adapter.create({ tenantId: context.tenantId, applicationId: context.applicationId, entityType,
      id, schemaVersion: model.version, version: 1, state: "ACTIVE", data: validateData(model.fields, data), createdAt: now, updatedAt: now }, context);
  }
  async get(context: ApplicationDataContext, entityType: string, id: string): Promise<ApplicationDataRecord | undefined> {
    await this.activeModel(context, entityType); validId(id, "APPLICATION_DATA_RECORD_ID_INVALID");
    return this.adapter.get(context, entityType, id);
  }
  async update(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number,
    patch: { state?: ApplicationDataRecord["state"]; data?: Record<string, unknown> }): Promise<ApplicationDataRecord> {
    const model = await this.activeModel(context, entityType); validId(id, "APPLICATION_DATA_RECORD_ID_INVALID");
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("APPLICATION_DATA_EXPECTED_VERSION_INVALID");
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some(k => !["state", "data"].includes(k))) {
      throw new Error("APPLICATION_DATA_PATCH_INVALID");
    }
    const normalized = { ...patch, ...(patch.data === undefined ? {} : { data: validateData(model.fields, patch.data) }) };
    return this.adapter.update(context, entityType, id, expectedVersion, normalized, context);
  }
  async delete(context: ApplicationDataContext, entityType: string, id: string, expectedVersion: number): Promise<void> {
    await this.activeModel(context, entityType); validId(id, "APPLICATION_DATA_RECORD_ID_INVALID");
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("APPLICATION_DATA_EXPECTED_VERSION_INVALID");
    return this.adapter.delete(context, entityType, id, expectedVersion, context);
  }
  async query(context: ApplicationDataContext, entityType: string, query: ApplicationDataQuery = {}): Promise<ApplicationDataRecord[]> {
    await this.activeModel(context, entityType);
    const limit = query.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("APPLICATION_DATA_QUERY_LIMIT_INVALID");
    if (query.afterId !== undefined) validId(query.afterId, "APPLICATION_DATA_CURSOR_INVALID");
    return this.adapter.query(context, entityType, { ...query, limit });
  }
}
