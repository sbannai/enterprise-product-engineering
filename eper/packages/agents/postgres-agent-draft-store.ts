import { type AuditSqlPool } from "../audit/audit-event-store.js";

export type DurableAgentKind = "crm" | "sales" | "marketing";
export type DurableAgentDraftStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export interface DurableAgentDraft {
  id: string;
  tenantId: string;
  applicationId: string;
  createdBy: string;
  agent: DurableAgentKind;
  intent: string;
  content: Record<string, unknown>;
  status: DurableAgentDraftStatus;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}
export interface CreateAgentDraftInput extends Omit<DurableAgentDraft, "reviewedBy" | "reviewedAt" | "reviewNote"> {}
export type ReviewAgentDraftResult =
  | { outcome: "reviewed"; draft: DurableAgentDraft }
  | { outcome: "not_found" }
  | { outcome: "maker_checker" }
  | { outcome: "already_reviewed"; status: DurableAgentDraftStatus };

type DraftRow = {
  id: string; tenant_id: string; application_id: string; created_by: string; agent: DurableAgentKind;
  intent: string; content: Record<string, unknown> | string; status: DurableAgentDraftStatus;
  created_at: string | Date; reviewed_by: string | null; reviewed_at: string | Date | null; review_note: string | null;
};
function mapDraft(row: DraftRow): DurableAgentDraft {
  const content = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
  return {
    id: row.id, tenantId: row.tenant_id, applicationId: row.application_id, createdBy: row.created_by,
    agent: row.agent, intent: row.intent, content, status: row.status, createdAt: new Date(row.created_at).toISOString(),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.reviewed_at ? { reviewedAt: new Date(row.reviewed_at).toISOString() } : {}),
    ...(row.review_note ? { reviewNote: row.review_note } : {}),
  };
}

/** PostgreSQL persistence for agent drafts. Every query is scoped by trusted tenant and application identity. */
export class PostgresAgentDraftStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ drafts_table: string | null }>(
        "SELECT to_regclass('public.eper_agent_drafts')::text AS drafts_table",
      );
      if (!result.rows[0]?.drafts_table) throw new Error("EPER_AGENT_DRAFT_SCHEMA_NOT_APPLIED");
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_AGENT_DRAFT_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_AGENT_DRAFT_READINESS_CHECK_FAILED", { cause: error });
    } finally { client.release(); }
  }

  async create(input: CreateAgentDraftInput): Promise<DurableAgentDraft> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<DraftRow>(
        `INSERT INTO eper_agent_drafts
          (id, tenant_id, application_id, created_by, agent, intent, content, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
         RETURNING id, tenant_id, application_id, created_by, agent, intent, content, status, created_at,
                   reviewed_by, reviewed_at, review_note`,
        [input.id, input.tenantId, input.applicationId, input.createdBy, input.agent, input.intent,
          JSON.stringify(input.content), input.status, input.createdAt],
      );
      if (!result.rows[0]) throw new Error("AGENT_DRAFT_CREATE_FAILED");
      return mapDraft(result.rows[0]);
    } finally { client.release(); }
  }

  async list(tenantId: string, applicationId: string, status?: string): Promise<DurableAgentDraft[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<DraftRow>(
        `SELECT id, tenant_id, application_id, created_by, agent, intent, content, status, created_at,
                reviewed_by, reviewed_at, review_note
           FROM eper_agent_drafts
          WHERE tenant_id = $1 AND application_id = $2 AND ($3::varchar IS NULL OR status = $3)
          ORDER BY created_at DESC LIMIT 2000`,
        [tenantId, applicationId, status ?? null],
      );
      return result.rows.map(mapDraft);
    } finally { client.release(); }
  }

  async review(input: {
    id: string; tenantId: string; applicationId: string; reviewerId: string;
    status: "APPROVED" | "REJECTED"; note: string;
  }): Promise<ReviewAgentDraftResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<DraftRow>(
        `SELECT id, tenant_id, application_id, created_by, agent, intent, content, status, created_at,
                reviewed_by, reviewed_at, review_note
           FROM eper_agent_drafts
          WHERE id = $1 AND tenant_id = $2 AND application_id = $3
          FOR UPDATE`,
        [input.id, input.tenantId, input.applicationId],
      );
      const row = selected.rows[0];
      if (!row) { await client.query("COMMIT"); return { outcome: "not_found" }; }
      if (row.created_by === input.reviewerId) { await client.query("COMMIT"); return { outcome: "maker_checker" }; }
      if (row.status !== "PENDING_APPROVAL") {
        await client.query("COMMIT");
        return { outcome: "already_reviewed", status: row.status };
      }
      const updated = await client.query<DraftRow>(
        `UPDATE eper_agent_drafts
            SET status = $4, reviewed_by = $5, reviewed_at = now(), review_note = $6
          WHERE id = $1 AND tenant_id = $2 AND application_id = $3 AND status = 'PENDING_APPROVAL'
          RETURNING id, tenant_id, application_id, created_by, agent, intent, content, status, created_at,
                    reviewed_by, reviewed_at, review_note`,
        [input.id, input.tenantId, input.applicationId, input.status, input.reviewerId, input.note],
      );
      if (!updated.rows[0]) throw new Error("AGENT_DRAFT_REVIEW_RACE");
      await client.query("COMMIT");
      return { outcome: "reviewed", draft: mapDraft(updated.rows[0]) };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }
}
