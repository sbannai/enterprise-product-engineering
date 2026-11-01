import { createHash, randomBytes } from "node:crypto";
import type { AuditSqlPool, AuditSqlClient } from "../audit/audit-event-store.js";

export interface CustomerOidcSubjectBinding {
  issuer: string; subject: string; tenantId: string; actorId: string;
  status: "active" | "revoked"; version: number;
}
export interface CustomerBrowserSession {
  tenantId: string; actorId: string; issuer: string; subject: string;
  createdAt: string; lastSeenAt: string; idleExpiresAt: string; absoluteExpiresAt: string;
}
export interface CreateCustomerBrowserSessionInput {
  issuer: string; subject: string; tenantId: string; actorId: string;
  idleExpiresAt: Date; absoluteExpiresAt: Date; correlationId: string;
}
function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function validId(value: string, name: string, max = 128): void {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max) throw new Error("EPER_CUSTOMER_IDENTITY_INVALID_" + name.toUpperCase());
}
function iso(value: string | Date): string { return new Date(value).toISOString(); }

/** Durable OIDC subject binding and opaque browser-session store.
 * Raw session identifiers are returned once; only their SHA-256 hashes are persisted.
 * Callers must resolve active actor/application assignments on every protected request.
 */
export class PostgresCustomerIdentitySessionStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const result = await client.query<{ bindings: string | null; sessions: string | null; events: string | null }>(
        "SELECT to_regclass('public.eper_customer_oidc_subject_bindings')::text AS bindings, to_regclass('public.eper_customer_browser_sessions')::text AS sessions, to_regclass('public.eper_customer_identity_events')::text AS events",
      );
      if (!result.rows[0]?.bindings || !result.rows[0]?.sessions || !result.rows[0]?.events) throw new Error("EPER_CUSTOMER_IDENTITY_SCHEMA_NOT_APPLIED");
      await client.query("COMMIT");
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }

  async bindSubject(input: { issuer: string; subject: string; tenantId: string; actorId: string; provisionedBy: string; correlationId: string }): Promise<CustomerOidcSubjectBinding> {
    validId(input.issuer, "issuer", 2048); validId(input.subject, "subject", 512);
    validId(input.tenantId, "tenantId"); validId(input.actorId, "actorId"); validId(input.provisionedBy, "provisionedBy");
    validId(input.correlationId, "correlationId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const saved = await client.query<Record<string, unknown>>(
        `INSERT INTO eper_customer_oidc_subject_bindings (issuer, subject, tenant_id, actor_id, binding_status, version, created_by)
         VALUES ($1,$2,$3,$4,'active',1,$5) RETURNING *`,
        [input.issuer, input.subject, input.tenantId, input.actorId, input.provisionedBy],
      );
      await client.query(
        "INSERT INTO eper_customer_identity_events (tenant_id, actor_id, action, outcome, correlation_id, metadata) VALUES ($1,$2,'subject.bound','success',$3,$4::jsonb)",
        [input.tenantId, input.actorId, input.correlationId, JSON.stringify({ issuer: input.issuer, subjectHash: hash(input.subject), provisionedBy: input.provisionedBy })],
      );
      await client.query("COMMIT");
      const row = saved.rows[0];
      return { issuer: String(row.issuer), subject: String(row.subject), tenantId: String(row.tenant_id), actorId: String(row.actor_id), status: row.binding_status as "active" | "revoked", version: Number(row.version) };
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }

  async resolveSubject(issuer: string, subject: string): Promise<CustomerOidcSubjectBinding | null> {
    validId(issuer, "issuer", 2048); validId(subject, "subject", 512);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const result = await client.query<Record<string, unknown>>(
        "SELECT issuer, subject, tenant_id, actor_id, binding_status, version FROM eper_customer_oidc_subject_bindings WHERE issuer=$1 AND subject=$2",
        [issuer, subject],
      );
      const row = result.rows[0];
      await client.query("COMMIT");
      if (!row || row.binding_status !== "active") return null;
      return { issuer: String(row.issuer), subject: String(row.subject), tenantId: String(row.tenant_id), actorId: String(row.actor_id), status: "active", version: Number(row.version) };
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }

  async revokeSubject(input: { issuer: string; subject: string; revokedBy: string; correlationId: string }): Promise<boolean> {
    validId(input.issuer, "issuer", 2048); validId(input.subject, "subject", 512);
    validId(input.revokedBy, "revokedBy"); validId(input.correlationId, "correlationId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const result = await client.query<Record<string, unknown>>(
        "UPDATE eper_customer_oidc_subject_bindings SET binding_status='revoked', version=version+1, revoked_at=NOW(), revoked_by=$3, updated_at=NOW() WHERE issuer=$1 AND subject=$2 AND binding_status='active' RETURNING tenant_id, actor_id",
        [input.issuer, input.subject, input.revokedBy],
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return false; }
      const row = result.rows[0];
      await client.query("UPDATE eper_customer_browser_sessions SET revoked_at=NOW(), revoked_reason='subject_revoked' WHERE issuer=$1 AND subject=$2 AND revoked_at IS NULL", [input.issuer, input.subject]);
      await client.query(
        "INSERT INTO eper_customer_identity_events (tenant_id, actor_id, action, outcome, correlation_id, metadata) VALUES ($1,$2,'subject.revoked','success',$3,$4::jsonb)",
        [row.tenant_id, row.actor_id, input.correlationId, JSON.stringify({ issuer: input.issuer, subjectHash: hash(input.subject), revokedBy: input.revokedBy })],
      );
      await client.query("COMMIT"); return true;
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }

  async createSession(input: CreateCustomerBrowserSessionInput): Promise<{ sessionToken: string; session: CustomerBrowserSession }> {
    validId(input.issuer, "issuer", 2048); validId(input.subject, "subject", 512);
    validId(input.tenantId, "tenantId"); validId(input.actorId, "actorId"); validId(input.correlationId, "correlationId");
    const now = new Date();
    if (!(input.idleExpiresAt instanceof Date) || !(input.absoluteExpiresAt instanceof Date) ||
        input.idleExpiresAt <= now || input.absoluteExpiresAt <= now || input.idleExpiresAt > input.absoluteExpiresAt) {
      throw new Error("EPER_CUSTOMER_SESSION_EXPIRY_INVALID");
    }
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionHash = hash(sessionToken);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const binding = await client.query(
        "SELECT 1 FROM eper_customer_oidc_subject_bindings WHERE issuer=$1 AND subject=$2 AND tenant_id=$3 AND actor_id=$4 AND binding_status='active'",
        [input.issuer, input.subject, input.tenantId, input.actorId],
      );
      if (!binding.rowCount) throw new Error("EPER_CUSTOMER_SUBJECT_BINDING_INACTIVE");
      const saved = await client.query<Record<string, unknown>>(
        "INSERT INTO eper_customer_browser_sessions (session_hash,issuer,subject,tenant_id,actor_id,last_seen_at,idle_expires_at,absolute_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at,last_seen_at,idle_expires_at,absolute_expires_at",
        [sessionHash,input.issuer,input.subject,input.tenantId,input.actorId,now,input.idleExpiresAt,input.absoluteExpiresAt],
      );
      await client.query(
        "INSERT INTO eper_customer_identity_events (tenant_id,actor_id,action,outcome,resource_hash,correlation_id,metadata) VALUES ($1,$2,'session.created','success',$3,$4,'{}'::jsonb)",
        [input.tenantId,input.actorId,sessionHash,input.correlationId],
      );
      await client.query("COMMIT");
      const row=saved.rows[0];
      return { sessionToken, session: { tenantId:input.tenantId,actorId:input.actorId,issuer:input.issuer,subject:input.subject,createdAt:iso(row.created_at as string|Date),lastSeenAt:iso(row.last_seen_at as string|Date),idleExpiresAt:iso(row.idle_expires_at as string|Date),absoluteExpiresAt:iso(row.absolute_expires_at as string|Date) } };
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }

  async resolveSession(sessionToken: string, now = new Date()): Promise<CustomerBrowserSession | null> {
    validId(sessionToken, "sessionToken", 256);
    const sessionHash = hash(sessionToken);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const result = await client.query<Record<string, unknown>>(
        `SELECT s.tenant_id,s.actor_id,s.issuer,s.subject,s.created_at,s.last_seen_at,s.idle_expires_at,s.absolute_expires_at
         FROM eper_customer_browser_sessions s
         JOIN eper_customer_oidc_subject_bindings b ON b.issuer=s.issuer AND b.subject=s.subject
         WHERE s.session_hash=$1 AND s.revoked_at IS NULL AND s.idle_expires_at>$2 AND s.absolute_expires_at>$2 AND b.binding_status='active'
         FOR UPDATE OF s`,
        [sessionHash,now],
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
      const row=result.rows[0];
      const idleExpiry = new Date(Math.min(new Date(row.absolute_expires_at as string|Date).getTime(), now.getTime()+30*60*1000));
      await client.query("UPDATE eper_customer_browser_sessions SET last_seen_at=$2,idle_expires_at=$3 WHERE session_hash=$1",[sessionHash,now,idleExpiry]);
      await client.query("COMMIT");
      return { tenantId:String(row.tenant_id),actorId:String(row.actor_id),issuer:String(row.issuer),subject:String(row.subject),createdAt:iso(row.created_at as string|Date),lastSeenAt:now.toISOString(),idleExpiresAt:idleExpiry.toISOString(),absoluteExpiresAt:iso(row.absolute_expires_at as string|Date) };
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }

  async revokeSession(sessionToken: string, reason: string, correlationId: string): Promise<boolean> {
    validId(sessionToken, "sessionToken", 256); validId(reason, "reason", 64); validId(correlationId, "correlationId");
    const sessionHash = hash(sessionToken);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('eper.identity_service', 'true', true)");
      const result = await client.query<Record<string, unknown>>(
        "UPDATE eper_customer_browser_sessions SET revoked_at=NOW(),revoked_reason=$2 WHERE session_hash=$1 AND revoked_at IS NULL RETURNING tenant_id,actor_id",
        [sessionHash,reason],
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return false; }
      await client.query(
        "INSERT INTO eper_customer_identity_events (tenant_id,actor_id,action,outcome,resource_hash,correlation_id,metadata) VALUES ($1,$2,'session.revoked','success',$3,$4,$5::jsonb)",
        [result.rows[0].tenant_id,result.rows[0].actor_id,sessionHash,correlationId,JSON.stringify({reason})],
      );
      await client.query("COMMIT"); return true;
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }
}
