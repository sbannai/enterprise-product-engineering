import { createHash, randomUUID } from "node:crypto";
import { appendAuditEventInTransaction, type AuditEnvironment } from "../audit/audit-event-store.js";
import type { TicketIdentity, TicketRecord, CreateTicketInput, TicketStatus, TicketSeverity } from "./ticketing-contract.js";

export interface TicketSqlResult<Row = Record<string, unknown>> { rows: Row[]; rowCount: number | null; }
export interface TicketSqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<TicketSqlResult<Row>>;
  release(): void;
}
export interface TicketSqlPool { connect(): Promise<TicketSqlClient>; }
export interface TicketAuditEvent {
  tenantId: string;
  applicationId: string;
  actorId: string;
  correlationId: string;
  action: "ticket.created" | "ticket.status_changed" | "ticket.assigned" | "ticket.replied" | "ticket.severity_classified";
  ticketId: string;
  outcome: "success";
  payload: Record<string, unknown>;
}
/** The writer receives the active transaction client: ticket mutation and audit must commit together. */
export type TicketAuditWriter = (event: TicketAuditEvent, client: TicketSqlClient) => Promise<void>;

export interface TicketListFilter {
  status?: TicketStatus;
  severity?: TicketSeverity;
  type?: TicketRecord["type"];
  applicationId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function mapRecord(row: Record<string, unknown>): TicketRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), applicationId: String(row.application_id),
    createdBy: String(row.created_by), type: row.type as TicketRecord["type"], title: String(row.title),
    description: String(row.description), businessImpact: String(row.business_impact),
    ...(typeof row.evidence_reference === "string" ? { evidenceReference: row.evidence_reference } : {}),
    status: row.status as TicketStatus, severity: row.severity as TicketSeverity,
    assignedTo: typeof row.assigned_to === "string" ? row.assigned_to : null,
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export interface TicketReplyRecord {
  id: string;
  tenantId: string;
  applicationId: string;
  ticketId: string;
  authorId: string;
  authorRole: "customer" | "support";
  body: string;
  createdAt: string;
}

function mapReply(row: Record<string, unknown>): TicketReplyRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), applicationId: String(row.application_id),
    ticketId: String(row.ticket_id), authorId: String(row.author_id),
    authorRole: row.author_role as TicketReplyRecord["authorRole"], body: String(row.body),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

/** PostgreSQL persistence. Reads require tenant scope or an explicit privileged cross-tenant scope; mutations use trusted identity. */
export class PostgresTicketStore {
  constructor(private readonly pool: TicketSqlPool, private readonly audit: TicketAuditWriter) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT id, idempotency_key, request_hash FROM eper_support_tickets LIMIT 0");
    } finally { client.release(); }
  }

  async create(identity: TicketIdentity, input: CreateTicketInput, idempotencyKey?: string): Promise<TicketRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const id = randomUUID();
      const requestHash = createHash("sha256").update(JSON.stringify({
        type: input.type, title: input.title, description: input.description,
        businessImpact: input.businessImpact, evidenceReference: input.evidenceReference ?? null,
      })).digest("hex");
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO eper_support_tickets
          (id, tenant_id, application_id, created_by, type, title, description, business_impact, evidence_reference, status, severity, assigned_to, idempotency_key, request_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new','p3',NULL,$10,$11)
         ${idempotencyKey ? "ON CONFLICT (tenant_id, application_id, created_by, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING" : ""}
         RETURNING *`,
        [id, identity.tenantId, identity.applicationId, identity.actorId, input.type, input.title, input.description,
          input.businessImpact, input.evidenceReference ?? null, idempotencyKey ?? null, idempotencyKey ? requestHash : null],
      );
      if (!result.rows[0] && idempotencyKey) {
        const existing = await client.query<Record<string, unknown>>(
          "SELECT *, request_hash FROM eper_support_tickets WHERE tenant_id=$1 AND application_id=$2 AND created_by=$3 AND idempotency_key=$4 FOR UPDATE",
          [identity.tenantId, identity.applicationId, identity.actorId, idempotencyKey],
        );
        if (!existing.rows[0]) throw new Error("ticket_idempotency_lookup_failed");
        if (existing.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        await client.query("COMMIT");
        return mapRecord(existing.rows[0]);
      }
      if (!result.rows[0]) throw new Error("ticket_insert_returned_no_row");
      await this.audit({
        tenantId: identity.tenantId, applicationId: identity.applicationId, actorId: identity.actorId,
        correlationId: identity.correlationId, action: "ticket.created", ticketId: id, outcome: "success",
        payload: { type: input.type, initialStatus: "new", initialSeverity: "p3" },
      }, client);
      await client.query("COMMIT");
      return mapRecord(result.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original error */ }
      throw error;
    } finally { client.release(); }
  }

  async list(scope: { tenantId: string } | { crossTenant: true }, filter: TicketListFilter = {}): Promise<TicketRecord[]> {
    const tenantId = "tenantId" in scope ? scope.tenantId : undefined;
    if ("tenantId" in scope && (typeof tenantId !== "string" || !tenantId.trim() || tenantId !== tenantId.trim())) {
      throw new Error("ticket_tenant_scope_required");
    }
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 101 || !Number.isInteger(offset) || offset < 0) {
      throw new Error("invalid_ticket_pagination");
    }
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (tenantId !== undefined) { values.push(tenantId); clauses.push("tenant_id = $1"); }
    else if (!("crossTenant" in scope && scope.crossTenant === true)) throw new Error("ticket_tenant_scope_required");
    const add = (column: string, value: unknown) => { values.push(value); clauses.push(column + " = $" + values.length); };
    if (filter.status) add("status", filter.status);
    if (filter.severity) add("severity", filter.severity);
    if (filter.type) add("type", filter.type);
    if (filter.applicationId) add("application_id", filter.applicationId);
    if (filter.search?.trim()) {
      values.push(filter.search.trim());
      const searchParam = "$" + values.length;
      clauses.push("(position(lower(" + searchParam + ") in lower(id::text)) > 0 OR position(lower(" + searchParam + ") in lower(title)) > 0 OR position(lower(" + searchParam + ") in lower(description)) > 0 OR position(lower(" + searchParam + ") in lower(business_impact)) > 0 OR position(lower(" + searchParam + ") in lower(application_id)) > 0 OR position(lower(" + searchParam + ") in lower(coalesce(assigned_to, ''))) > 0)");
    }
    values.push(limit, offset);
    const result = await this.pool.connect().then(async client => {
      try {
        return await client.query<Record<string, unknown>>(
          `SELECT * FROM eper_support_tickets${clauses.length ? " WHERE " + clauses.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ${values.length - 1} OFFSET ${values.length}`, values,
        );
      } finally { client.release(); }
    });
    return result.rows.map(mapRecord);
  }

  /** Lists the thread only when the ticket is inside the trusted tenant/application scope. */
  async listReplies(identity: TicketIdentity, ticketId: string): Promise<TicketReplyRecord[] | null> {
    const client = await this.pool.connect();
    try {
      const ticket = await client.query<Record<string, unknown>>(
        "SELECT id FROM eper_support_tickets WHERE tenant_id = $1 AND id = $2 AND ($3 = 'eper' OR application_id = $3)",
        [identity.tenantId, ticketId, identity.applicationId],
      );
      if (!ticket.rows[0]) return null;
      const result = await client.query<Record<string, unknown>>(
        "SELECT * FROM eper_support_ticket_replies WHERE tenant_id = $1 AND ticket_id = $2 ORDER BY created_at ASC, id ASC",
        [identity.tenantId, ticketId],
      );
      return result.rows.map(mapReply);
    } finally { client.release(); }
  }

  /** Persists a reply and its audit event atomically; role and identity are server-derived. */
  async addReply(
    identity: TicketIdentity,
    ticketId: string,
    body: string,
    authorRole: "customer" | "support",
  ): Promise<TicketReplyRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const ticket = await client.query<Record<string, unknown>>(
        "SELECT application_id FROM eper_support_tickets WHERE tenant_id = $1 AND id = $2 AND ($3 = 'eper' OR application_id = $3) FOR UPDATE",
        [identity.tenantId, ticketId, identity.applicationId],
      );
      if (!ticket.rows[0]) { await client.query("ROLLBACK"); return null; }
      const applicationId = String(ticket.rows[0].application_id);
      const result = await client.query<Record<string, unknown>>(
        "INSERT INTO eper_support_ticket_replies (id, tenant_id, application_id, ticket_id, author_id, author_role, body) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [randomUUID(), identity.tenantId, applicationId, ticketId, identity.actorId, authorRole, body],
      );
      if (!result.rows[0]) throw new Error("ticket_reply_insert_returned_no_row");
      await this.audit({
        tenantId: identity.tenantId, applicationId, actorId: identity.actorId,
        correlationId: identity.correlationId, action: "ticket.replied", ticketId, outcome: "success",
        payload: { replyId: String(result.rows[0].id), authorRole },
      }, client);
      await client.query("COMMIT");
      return mapReply(result.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async changeStatus(identity: TicketIdentity, ticketId: string, status: TicketStatus): Promise<TicketRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Record<string, unknown>>(
        "UPDATE eper_support_tickets SET status = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *",
        [identity.tenantId, ticketId, status],
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      await this.audit({
        tenantId: identity.tenantId, applicationId: String(result.rows[0].application_id), actorId: identity.actorId,
        correlationId: identity.correlationId, action: "ticket.status_changed", ticketId, outcome: "success",
        payload: { newStatus: status },
      }, client);
      await client.query("COMMIT");
      return mapRecord(result.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  /** Classifies severity; P1 confirmation requires a substantive rationale and records the confirming actor/time. */
  async classifySeverity(
    identity: TicketIdentity,
    ticketId: string,
    severity: TicketSeverity,
    rationale?: string,
  ): Promise<TicketRecord | null> {
    if (!rationale || rationale.trim().length < 20 || rationale.trim().length > 1000) {
      throw new Error("ticket_severity_rationale_required");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<Record<string, unknown>>(
        "SELECT severity FROM eper_support_tickets WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
        [identity.tenantId, ticketId],
      );
      if (!current.rows[0]) { await client.query("ROLLBACK"); return null; }
      const previousSeverity = String(current.rows[0].severity);
      const result = await client.query<Record<string, unknown>>(
        `UPDATE eper_support_tickets
         SET severity = $3,
             p1_rationale = CASE WHEN $3 = 'p1_confirmed' THEN $4 ELSE NULL END,
             p1_confirmed_by = CASE WHEN $3 = 'p1_confirmed' THEN $5 ELSE NULL END,
             p1_confirmed_at = CASE WHEN $3 = 'p1_confirmed' THEN now() ELSE NULL END,
             updated_at = now()
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [identity.tenantId, ticketId, severity, rationale?.trim() ?? null, identity.actorId],
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      await this.audit({
        tenantId: identity.tenantId, applicationId: String(result.rows[0].application_id), actorId: identity.actorId,
        correlationId: identity.correlationId, action: "ticket.severity_classified", ticketId, outcome: "success",
        payload: { previousSeverity, severity, rationale: rationale.trim(), ...(severity === "p1_confirmed" ? { confirmedBy: identity.actorId } : {}) },
      }, client);
      await client.query("COMMIT");
      return mapRecord(result.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async assign(identity: TicketIdentity, ticketId: string, assignedTo: string | null): Promise<TicketRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<Record<string, unknown>>(
        "UPDATE eper_support_tickets SET assigned_to = $3::text, status = CASE WHEN $3::text IS NULL THEN status ELSE 'assigned' END, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *",
        [identity.tenantId, ticketId, assignedTo],
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      await this.audit({
        tenantId: identity.tenantId, applicationId: String(result.rows[0].application_id), actorId: identity.actorId,
        correlationId: identity.correlationId, action: "ticket.assigned", ticketId, outcome: "success",
        payload: { assignedTo },
      }, client);
      await client.query("COMMIT");
      return mapRecord(result.rows[0]);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
}


/**
 * Adapts ticket lifecycle events to EPER's canonical append-only audit chain.
 * It deliberately uses the caller's active SQL client so ticket changes and
 * audit evidence remain atomic. Audit schema readiness/migrations are managed
 * by the deployment gate, not by this adapter.
 */
export function createCanonicalTicketAuditWriter(
  environment: AuditEnvironment,
  serviceVersion?: string,
): TicketAuditWriter {
  return async (event, client) => {
    await appendAuditEventInTransaction(client, {
      tenantId: event.tenantId,
      applicationId: event.applicationId,
      environment,
      actorType: "human",
      actorId: event.actorId,
      action: event.action,
      outcome: event.outcome,
      resourceType: "support_ticket",
      resourceId: event.ticketId,
      correlationId: event.correlationId,
      source: "api",
      operationName: event.action,
      serviceVersion,
      payload: event.payload,
    });
  };
}
