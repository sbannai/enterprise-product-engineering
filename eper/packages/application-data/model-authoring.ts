import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { withTenantTransaction, enqueueOutboxEvent } from "../capabilities/postgres-transaction.js";
import { appendAuditEventInTransaction, type AuditSqlClient, type AuditEnvironment } from "../audit/audit-event-store.js";
import type { ApplicationDataField, ApplicationDataModel, ApplicationDataRelationship } from "./contracts.js";

export interface ApplicationDataModelAuthoringContext {
  tenantId: string;
  applicationId: string;
  actorId: string;
  roleId: string;
  correlationId: string;
  requirementId: string;
  environment: AuditEnvironment;
  serviceVersion?: string;
}

export interface ApplicationDataModelDraftInput {
  entityType: string;
  fields: ApplicationDataField[];
  relationships?: ApplicationDataRelationship[];
  expectedVersion: number;
}

const ID = /^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/;

function required(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 256 ||
      [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(code);
  }
}

function validateModelShape(entityType: string, fields: ApplicationDataField[], relationships: ApplicationDataRelationship[]): void {
  if (!ID.test(entityType) || !Array.isArray(fields) || fields.length > 300 ||
      !Array.isArray(relationships) || relationships.length > 300) {
    throw new Error("APPLICATION_DATA_MODEL_INVALID");
  }
  const fieldIds = new Set<string>();
  for (const field of fields) {
    if (!field || !ID.test(field.id) || fieldIds.has(field.id) ||
        !["string", "number", "boolean", "date", "object", "array"].includes(field.type) ||
        (field.required !== undefined && typeof field.required !== "boolean") ||
        (field.nullable !== undefined && typeof field.nullable !== "boolean") ||
        (field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 1_000_000)) ||
        (field.enum !== undefined && (!Array.isArray(field.enum) || field.enum.length > 500 ||
          field.enum.some(value => !["string", "number", "boolean"].includes(typeof value))))) {
      throw new Error("APPLICATION_DATA_FIELD_INVALID");
    }
    fieldIds.add(field.id);
  }
  const relationFields = new Set<string>();
  for (const relation of relationships) {
    const field = fields.find(item => item.id === relation.field);
    if (!field || relationFields.has(relation.field) || !ID.test(relation.targetEntity) ||
        !["one", "many"].includes(relation.cardinality) ||
        (relation.cardinality === "one" && field.type !== "string") ||
        (relation.cardinality === "many" && field.type !== "array")) {
      throw new Error("APPLICATION_DATA_RELATIONSHIP_INVALID");
    }
    relationFields.add(relation.field);
  }
}

/**
 * Policy-backed model authoring. This is deliberately separate from record
 * CRUD: a caller cannot publish a schema merely by holding a data adapter.
 * Authorization, model mutation, integrity-chain audit and outbox event share
 * one PostgreSQL transaction.
 */
export class PostgresApplicationDataModelAuthoringService {
  constructor(private readonly pool: Pool) {}

  private validateContext(context: ApplicationDataModelAuthoringContext): void {
    for (const [key, value] of Object.entries({
      tenantId: context?.tenantId, applicationId: context?.applicationId, actorId: context?.actorId,
      roleId: context?.roleId, correlationId: context?.correlationId, requirementId: context?.requirementId,
    })) required(value, "APPLICATION_DATA_MODEL_AUTHORING_CONTEXT_INVALID:" + key);
    if (!["production", "uat", "sandbox"].includes(context.environment)) {
      throw new Error("APPLICATION_DATA_MODEL_AUTHORING_ENVIRONMENT_INVALID");
    }
  }

  private async authorize(client: PoolClient, context: ApplicationDataModelAuthoringContext): Promise<void> {
    const result = await client.query<{ role_id: string }>(`
      SELECT r.role_id
        FROM eper_workflow_actor_role_assignment r
        JOIN eper_actor_application_assignment aa
          ON aa.tenant_id=r.tenant_id AND aa.application_id=r.application_id
         AND aa.actor_id=r.actor_id AND aa.assignment_status='active'
        JOIN eper_tenant_application_assignment ta
          ON ta.tenant_id=r.tenant_id AND ta.application_id=r.application_id
         AND ta.assignment_status='active'
        JOIN eper_workflow_role_definition rd
          ON rd.tenant_id=r.tenant_id AND rd.application_id=r.application_id
         AND rd.role_id=r.role_id AND rd.role_status='active'
       WHERE r.tenant_id=$1 AND r.application_id=$2 AND r.actor_id=$3
         AND r.role_id=$4 AND r.assignment_status='active'
         AND rd.permissions ? 'workflow:admin'
       LIMIT 1
       FOR SHARE OF r, aa, ta, rd
    `, [context.tenantId, context.applicationId, context.actorId, context.roleId]);
    if (!result.rows[0]) throw new Error("APPLICATION_DATA_MODEL_MANAGE_FORBIDDEN");
  }

  private async audit(
    client: PoolClient,
    context: ApplicationDataModelAuthoringContext,
    action: string,
    model: ApplicationDataModel,
  ): Promise<void> {
    const resourceId = model.entityType + ":" + model.version;
    const payload = { entityType: model.entityType, version: model.version, status: model.status,
      fieldCount: model.fields.length, relationshipCount: model.relationships?.length ?? 0 };
    const audit = await appendAuditEventInTransaction(client as unknown as AuditSqlClient, {
      tenantId: context.tenantId, applicationId: context.applicationId, environment: context.environment,
      actorType: "human", actorId: context.actorId, effectiveRoles: [context.roleId],
      action, outcome: "success", resourceType: "application_data_model", resourceId,
      operationId: context.correlationId, correlationId: context.correlationId,
      source: "api", operationName: "application_data_model_authoring",
      serviceVersion: context.serviceVersion, payload,
    });
    await enqueueOutboxEvent({ tenantId: context.tenantId, client }, {
      eventId: randomUUID(), tenantId: context.tenantId, aggregateType: "application_data_model",
      aggregateId: resourceId, eventType: action, correlationId: context.correlationId,
      causationId: audit.eventId, payload,
    });
  }

  async createDraft(context: ApplicationDataModelAuthoringContext, input: ApplicationDataModelDraftInput): Promise<ApplicationDataModel> {
    this.validateContext(context);
    if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0) {
      throw new Error("APPLICATION_DATA_SCHEMA_VERSION_INVALID");
    }
    const relationships = input.relationships ?? [];
    validateModelShape(input.entityType, input.fields, relationships);
    return withTenantTransaction(this.pool, context.tenantId, async ({ client }) => {
      await client.query("SELECT set_config('eper.application_id',$1,true)", [context.applicationId]);
      await this.authorize(client, context);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "application-data-model:" + context.tenantId + ":" + context.applicationId + ":" + input.entityType,
      ]);
      const latest = await client.query<{ version: number }>(`
        SELECT version FROM eper_application_data_models
         WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3
         ORDER BY version DESC LIMIT 1 FOR UPDATE
      `, [context.tenantId, context.applicationId, input.entityType]);
      const currentVersion = Number(latest.rows[0]?.version ?? 0);
      if (currentVersion !== input.expectedVersion) throw new Error("APPLICATION_DATA_SCHEMA_VERSION_CONFLICT");
      const model: ApplicationDataModel = {
        tenantId: context.tenantId, applicationId: context.applicationId, entityType: input.entityType,
        version: currentVersion + 1, status: "DRAFT", fields: structuredClone(input.fields),
        relationships: structuredClone(relationships),
      };
      await client.query(`
        INSERT INTO eper_application_data_models
          (tenant_id,application_id,entity_type,version,status,fields,relationships)
        VALUES ($1,$2,$3,$4,'DRAFT',$5::jsonb,$6::jsonb)
      `, [model.tenantId, model.applicationId, model.entityType, model.version,
        JSON.stringify(model.fields), JSON.stringify(model.relationships)]);
      await this.audit(client, context, "APPLICATION_DATA_MODEL_DRAFT_CREATED", model);
      return model;
    });
  }

  async activate(context: ApplicationDataModelAuthoringContext, entityType: string, version: number): Promise<void> {
    await this.transition(context, entityType, version, "DRAFT", "ACTIVE");
  }

  async retire(context: ApplicationDataModelAuthoringContext, entityType: string, version: number): Promise<void> {
    await this.transition(context, entityType, version, "ACTIVE", "RETIRED");
  }

  private async transition(
    context: ApplicationDataModelAuthoringContext, entityType: string, version: number,
    from: ApplicationDataModel["status"], to: ApplicationDataModel["status"],
  ): Promise<void> {
    this.validateContext(context);
    if (!ID.test(entityType) || !Number.isSafeInteger(version) || version < 1) {
      throw new Error("APPLICATION_DATA_SCHEMA_TRANSITION_INVALID");
    }
    await withTenantTransaction(this.pool, context.tenantId, async ({ client }) => {
      await client.query("SELECT set_config('eper.application_id',$1,true)", [context.applicationId]);
      await this.authorize(client, context);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "application-data-model:" + context.tenantId + ":" + context.applicationId + ":" + entityType,
      ]);
      const selected = await client.query<{ tenant_id: string; application_id: string; entity_type: string;
        version: number; status: ApplicationDataModel["status"]; fields: ApplicationDataField[];
        relationships: ApplicationDataRelationship[] }>(`
        SELECT tenant_id,application_id,entity_type,version,status,fields,relationships
          FROM eper_application_data_models
         WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND version=$4
         FOR UPDATE
      `, [context.tenantId, context.applicationId, entityType, version]);
      const row = selected.rows[0];
      if (!row || row.status !== from) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_CONFLICT");
      if (to === "ACTIVE") {
        await client.query(`
          UPDATE eper_application_data_models SET status='RETIRED',updated_at=now()
           WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND status='ACTIVE'
        `, [context.tenantId, context.applicationId, entityType]);
      }
      const changed = await client.query(`
        UPDATE eper_application_data_models SET status=$5,updated_at=now()
         WHERE tenant_id=$1 AND application_id=$2 AND entity_type=$3 AND version=$4 AND status=$6
      `, [context.tenantId, context.applicationId, entityType, version, to, from]);
      if (changed.rowCount !== 1) throw new Error("APPLICATION_DATA_SCHEMA_STATUS_TRANSITION_CONFLICT");
      await this.audit(client, context, to === "ACTIVE"
        ? "APPLICATION_DATA_MODEL_ACTIVATED" : "APPLICATION_DATA_MODEL_RETIRED", {
          tenantId: row.tenant_id, applicationId: row.application_id, entityType: row.entity_type,
          version: Number(row.version), status: to, fields: row.fields,
          relationships: row.relationships ?? [],
        });
    });
  }
}
