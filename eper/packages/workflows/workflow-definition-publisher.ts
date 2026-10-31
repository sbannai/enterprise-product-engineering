import { createHash } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type { WorkflowDefinition } from "./workflow-configuration.js";

export interface WorkflowPublisherContext {
  tenantId: string;
  applicationId: string;
  principalId: string;
  correlationId: string;
  environment: AuditEnvironment;
  serviceVersion?: string;
}

export interface PublishedWorkflowDefinition {
  tenantId: string;
  applicationId: string;
  workflowId: string;
  definitionVersion: number;
  definitionDigest: string;
  definition: WorkflowDefinition;
  publishedBy: string;
  publishedAt: string;
}

export class WorkflowDefinitionPublishError extends Error {
  constructor(readonly code: string, readonly statusCode: number) {
    super(code);
    this.name = "WorkflowDefinitionPublishError";
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
      .join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

function validateContext(context: WorkflowPublisherContext): void {
  for (const [name, value] of Object.entries({
    tenantId: context.tenantId,
    applicationId: context.applicationId,
    principalId: context.principalId,
    correlationId: context.correlationId,
  })) {
    if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
      throw new WorkflowDefinitionPublishError("WORKFLOW_PUBLISH_INVALID_" + name.toUpperCase(), 400);
    }
  }
}

function validateDefinition(value: WorkflowDefinition): void {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.id !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(value.id) ||
      typeof value.name !== "string" || !value.name.trim() || value.name.length > 200 ||
      value.status !== "ACTIVE" || !Array.isArray(value.activities) ||
      value.activities.length < 1 || value.activities.length > 200) {
    throw new WorkflowDefinitionPublishError("WORKFLOW_PUBLISH_ACTIVE_DEFINITION_REQUIRED", 400);
  }
  const activityIds = new Set<string>();
  for (const activity of value.activities) {
    if (!activity || typeof activity.id !== "string" ||
        !/^[a-zA-Z0-9._-]{1,128}$/.test(activity.id) || activityIds.has(activity.id) ||
        typeof activity.title !== "string" || !activity.title.trim() ||
        !["TASK", "FORM", "APPROVAL"].includes(activity.type) ||
        typeof activity.roleId !== "string" || !activity.roleId.trim() ||
        !["workflow:act", "workflow:approve"].includes(activity.permission) ||
        (activity.type === "APPROVAL" && activity.permission !== "workflow:approve") ||
        (activity.type !== "APPROVAL" && activity.permission !== "workflow:act") ||
        !Array.isArray(activity.nextActivityIds) || !Array.isArray(activity.fields)) {
      throw new WorkflowDefinitionPublishError("WORKFLOW_PUBLISH_INVALID_ACTIVITY", 400);
    }
    activityIds.add(activity.id);
  }
  for (const activity of value.activities) {
    if (activity.nextActivityIds.some(id => !activityIds.has(id))) {
      throw new WorkflowDefinitionPublishError("WORKFLOW_PUBLISH_UNKNOWN_NEXT_ACTIVITY", 400);
    }
  }
}

type DefinitionRow = {
  definition_version: number | string;
  definition_digest: string;
  definition: WorkflowDefinition | string;
  published_by: string;
  published_at: string | Date;
};

/**
 * Publishes an immutable application-scoped workflow snapshot.
 * Tenant/application and actor/application assignments are checked under row
 * locks in the same transaction as the insert, so revocation cannot race publish.
 * All identity fields are supplied by trusted server-side middleware, never the body.
 */
export class WorkflowDefinitionPublisher {
  constructor(private readonly pool: AuditSqlPool) {}

  async publish(
    context: WorkflowPublisherContext,
    definition: WorkflowDefinition,
  ): Promise<PublishedWorkflowDefinition> {
    validateContext(context);
    validateDefinition(definition);
    const snapshot = structuredClone(definition);
    const definitionDigest = createHash("sha256").update(canonical(snapshot)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [context.tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [context.applicationId]);

      const tenantAssignment = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_tenant_application_assignment
         WHERE tenant_id = $1 AND application_id = $2 FOR SHARE`,
        [context.tenantId, context.applicationId],
      );
      if (tenantAssignment.rows[0]?.assignment_status !== "active") {
        throw new WorkflowDefinitionPublishError("WORKFLOW_PUBLISH_TENANT_APPLICATION_NOT_ASSIGNED", 403);
      }

      const actorAssignment = await client.query<{ assignment_status: string }>(
        `SELECT assignment_status FROM eper_actor_application_assignment
         WHERE tenant_id = $1 AND actor_id = $2 AND application_id = $3 FOR SHARE`,
        [context.tenantId, context.principalId, context.applicationId],
      );
      if (actorAssignment.rows[0]?.assignment_status !== "active") {
        throw new WorkflowDefinitionPublishError("WORKFLOW_PUBLISH_ACTOR_APPLICATION_NOT_ASSIGNED", 403);
      }

      // Every activity role and permission must exist in this application's durable role catalogue.
      // The row lock prevents a concurrent role disable or permission change from racing publication.
      const requiredRoleGrants = new Map<string, Set<string>>();
      for (const activity of snapshot.activities) {
        const permissions = requiredRoleGrants.get(activity.roleId) ?? new Set<string>();
        permissions.add(activity.permission);
        requiredRoleGrants.set(activity.roleId, permissions);
      }
      for (const [roleId, permissions] of requiredRoleGrants) {
        const role = await client.query<{ role_status: string; permissions: string[] | string }>(
          `SELECT role_status, permissions FROM eper_workflow_role_definition
            WHERE tenant_id = $1 AND application_id = $2 AND role_id = $3
            FOR SHARE`,
          [context.tenantId, context.applicationId, roleId],
        );
        const roleRow = role.rows[0];
        const granted = roleRow
          ? (typeof roleRow.permissions === "string" ? JSON.parse(roleRow.permissions) : roleRow.permissions)
          : [];
        if (roleRow?.role_status !== "active" || [...permissions].some(permission => !granted.includes(permission))) {
          throw new WorkflowDefinitionPublishError("WORKFLOW_PUBLISH_ROLE_PERMISSION_NOT_GRANTED", 403);
        }
      }

      // Serialize version allocation even when the workflow has no prior version row.
      // The transaction-scoped advisory lock closes the empty-result FOR UPDATE race.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify([context.tenantId, context.applicationId, snapshot.id])],
      );

      const latest = await client.query<{ definition_version: number | string }>(
        `SELECT definition_version FROM eper_workflow_definition_versions
         WHERE tenant_id = $1 AND application_id = $2 AND workflow_id = $3
         ORDER BY definition_version DESC LIMIT 1 FOR UPDATE`,
        [context.tenantId, context.applicationId, snapshot.id],
      );
      const definitionVersion = Number(latest.rows[0]?.definition_version ?? 0) + 1;
      const inserted = await client.query<DefinitionRow>(
        `INSERT INTO eper_workflow_definition_versions
         (tenant_id, application_id, workflow_id, definition_version, definition, definition_digest,
          publication_status, published_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'active', $7)
         RETURNING definition_version, definition_digest, definition, published_by, published_at`,
        [context.tenantId, context.applicationId, snapshot.id, definitionVersion,
          JSON.stringify(snapshot), definitionDigest, context.principalId],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("WORKFLOW_PUBLISH_INSERT_RETURNED_NO_ROW");
      await client.query(
        `INSERT INTO eper_workflow_publication_events
         (tenant_id, application_id, workflow_id, event_type, definition_version, actor_id, correlation_id)
         VALUES ($1, $2, $3, 'published', $4, $5, $6)`,
        [context.tenantId, context.applicationId, snapshot.id, definitionVersion,
          context.principalId, context.correlationId],
      );
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: context.tenantId,
        applicationId: context.applicationId,
        environment: context.environment,
        actorType: "human",
        actorId: context.principalId,
        action: "workflow.definition.publish",
        outcome: "success",
        resourceType: "workflow-definition",
        resourceId: snapshot.id,
        correlationId: context.correlationId,
        source: "api",
        operationName: "POST /applications/:applicationId/workflows/:workflowId/publish",
        serviceVersion: context.serviceVersion,
        afterHash: definitionDigest,
        payload: { workflowId: snapshot.id, definitionVersion, definitionDigest },
      });
      await client.query("COMMIT");
      const storedDefinition = typeof row.definition === "string" ? JSON.parse(row.definition) : row.definition;
      return {
        tenantId: context.tenantId,
        applicationId: context.applicationId,
        workflowId: snapshot.id,
        definitionVersion: Number(row.definition_version),
        definitionDigest: row.definition_digest.trim(),
        definition: storedDefinition,
        publishedBy: row.published_by,
        publishedAt: new Date(row.published_at).toISOString(),
      };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
