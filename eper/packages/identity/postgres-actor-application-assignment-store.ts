import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export interface ActorApplicationAssignment {
  tenantId: string; actorId: string; applicationId: string;
  status: "active" | "revoked"; version: number;
  assignedAt: string; assignedBy: string; revokedAt: string | null; revokedBy: string | null;
  updatedAt: string; updatedBy: string;
}
export interface ChangeActorApplicationAssignmentInput {
  tenantId: string; actorId: string; applicationId: string; changedBy: string;
  expectedVersion: number; environment: AuditEnvironment; correlationId: string; serviceVersion?: string;
}
type Row = Record<string, unknown> & { tenant_id: string; actor_id: string; application_id: string;
  assignment_status: "active" | "revoked"; version: number | string; assigned_at: string | Date;
  assigned_by: string; revoked_at: string | Date | null; revoked_by: string | null;
  updated_at: string | Date; updated_by: string };

export class ActorApplicationAssignmentVersionConflictError extends Error {
  constructor(readonly currentVersion: number) { super("ACTOR_APPLICATION_ASSIGNMENT_VERSION_CONFLICT"); this.name = "ActorApplicationAssignmentVersionConflictError"; }
}
function mapRow(row: Row): ActorApplicationAssignment {
  return { tenantId: row.tenant_id, actorId: row.actor_id, applicationId: row.application_id,
    status: row.assignment_status, version: Number(row.version), assignedAt: new Date(row.assigned_at).toISOString(),
    assignedBy: row.assigned_by, revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    revokedBy: row.revoked_by, updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.updated_by };
}

/** Durable membership store. Mutations must be called only after administrator authorization. */
export class PostgresActorApplicationAssignmentStore {
  constructor(private readonly pool: AuditSqlPool) {}
  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ assignment_table: string | null }>("SELECT to_regclass('public.eper_actor_application_assignment')::text AS assignment_table");
      if (!result.rows[0]?.assignment_table) throw new Error("EPER_ACTOR_APPLICATION_ASSIGNMENT_SCHEMA_NOT_APPLIED");
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_ACTOR_APPLICATION_ASSIGNMENT_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_ACTOR_APPLICATION_ASSIGNMENT_READINESS_FAILED", { cause: error });
    } finally { client.release(); }
  }
  async listAssignments(tenantId: string, actorId: string): Promise<ActorApplicationAssignment[]> {
    this.validateId(tenantId, "tenantId"); this.validateId(actorId, "actorId");
    const client = await this.pool.connect();
    try {
      const result = await client.query<Row>("SELECT * FROM eper_actor_application_assignment WHERE tenant_id = $1 AND actor_id = $2 ORDER BY application_id", [tenantId, actorId]);
      return result.rows.map(mapRow);
    } finally { client.release(); }
  }
  async listActiveAssignments(tenantId: string, actorId: string): Promise<ActorApplicationAssignment[]> {
    return (await this.listAssignments(tenantId, actorId)).filter(row => row.status === "active");
  }
  async listActive(tenantId: string, actorId: string): Promise<string[]> {
    return (await this.listActiveAssignments(tenantId, actorId)).map(row => row.applicationId);
  }
  async isAssigned(tenantId: string, actorId: string, applicationId: string): Promise<boolean> {
    this.validateId(tenantId, "tenantId"); this.validateId(actorId, "actorId"); this.validateId(applicationId, "applicationId");
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ allowed: boolean }>("SELECT EXISTS (SELECT 1 FROM eper_actor_application_assignment WHERE tenant_id = $1 AND actor_id = $2 AND application_id = $3 AND assignment_status = 'active') AS allowed", [tenantId, actorId, applicationId]);
      return result.rows[0]?.allowed === true;
    } finally { client.release(); }
  }
  async assign(input: ChangeActorApplicationAssignmentInput): Promise<ActorApplicationAssignment> { return this.change(input, "active"); }
  async revoke(input: ChangeActorApplicationAssignmentInput): Promise<ActorApplicationAssignment> { return this.change(input, "revoked"); }
  private async change(input: ChangeActorApplicationAssignmentInput, status: "active" | "revoked"): Promise<ActorApplicationAssignment> {
    this.validateId(input.tenantId, "tenantId"); this.validateId(input.actorId, "actorId");
    this.validateId(input.applicationId, "applicationId"); this.validateId(input.changedBy, "changedBy");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("ACTOR_APPLICATION_ASSIGNMENT_EXPECTED_VERSION_INVALID");
    if (!input.correlationId?.trim() || input.correlationId.length > 128) throw new Error("ACTOR_APPLICATION_ASSIGNMENT_CORRELATION_ID_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["eper-actor-application:" + input.tenantId + ":" + input.actorId + ":" + input.applicationId]);
      const prior = await client.query<Row>("SELECT * FROM eper_actor_application_assignment WHERE tenant_id = $1 AND actor_id = $2 AND application_id = $3 FOR UPDATE", [input.tenantId, input.actorId, input.applicationId]);
      const currentVersion = prior.rows[0] ? Number(prior.rows[0].version) : 0;
      if (currentVersion !== input.expectedVersion) throw new ActorApplicationAssignmentVersionConflictError(currentVersion);
      const saved = await client.query<Row>(`INSERT INTO eper_actor_application_assignment (tenant_id, actor_id, application_id, assignment_status, version, assigned_at, assigned_by, revoked_at, revoked_by, updated_at, updated_by)
        VALUES ($1, $2, $3, $4, 1, CASE WHEN $4 = 'active' THEN NOW() ELSE NULL END, $5, CASE WHEN $4 = 'revoked' THEN NOW() ELSE NULL END, CASE WHEN $4 = 'revoked' THEN $5 ELSE NULL END, NOW(), $5)
        ON CONFLICT (tenant_id, actor_id, application_id) DO UPDATE SET assignment_status = EXCLUDED.assignment_status,
        version = eper_actor_application_assignment.version + 1,
        assigned_at = CASE WHEN EXCLUDED.assignment_status = 'active' THEN NOW() ELSE eper_actor_application_assignment.assigned_at END,
        assigned_by = CASE WHEN EXCLUDED.assignment_status = 'active' THEN EXCLUDED.assigned_by ELSE eper_actor_application_assignment.assigned_by END,
        revoked_at = CASE WHEN EXCLUDED.assignment_status = 'revoked' THEN NOW() ELSE NULL END,
        revoked_by = CASE WHEN EXCLUDED.assignment_status = 'revoked' THEN EXCLUDED.revoked_by ELSE NULL END,
        updated_at = NOW(), updated_by = EXCLUDED.updated_by RETURNING *`, [input.tenantId, input.actorId, input.applicationId, status, input.changedBy]);
      if (!saved.rows[0]) throw new Error("ACTOR_APPLICATION_ASSIGNMENT_WRITE_RETURNED_NO_ROW");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.changedBy,
        action: status === "active" ? "identity.application_assignment.grant" : "identity.application_assignment.revoke",
        outcome: "success", resourceType: "actor-application-assignment", resourceId: input.actorId,
        correlationId: input.correlationId, source: "api",
        operationName: status === "active" ? "POST /admin/actor-application-assignments" : "DELETE /admin/actor-application-assignments",
        serviceVersion: input.serviceVersion,
        payload: { actorId: input.actorId, applicationId: input.applicationId, status, version: Number(saved.rows[0].version) },
      });
      await client.query("COMMIT"); return mapRow(saved.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
  private validateId(value: string, name: string): void {
    if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) throw new Error("ACTOR_APPLICATION_ASSIGNMENT_INVALID_" + name.toUpperCase());
  }
}