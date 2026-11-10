import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";
import type { RemoteSessionMode, RemoteSessionStatus } from "./index.js";

export interface RemoteDesktopStoreScope {
  tenantId: string;
  applicationId: string;
  actorId: string;
  environment: AuditEnvironment;
  correlationId: string;
}

export interface RemoteDesktopSessionRecord {
  tenantId: string;
  applicationId: string;
  sessionId: string;
  requesterId: string;
  endpointId: string;
  status: RemoteSessionStatus;
  mode: RemoteSessionMode;
  consentGrantId: string | null;
  expiresAt: string;
  version: number;
}

type SessionRow = {
  tenant_id: string; application_id: string; session_id: string;
  requester_id: string; endpoint_id: string; status: RemoteSessionStatus;
  mode: RemoteSessionMode; consent_grant_id: string | null;
  expires_at: string | Date; version: number | string;
};

function validateId(value: string, name: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
    throw new Error("REMOTE_DESKTOP_INVALID_" + name.toUpperCase());
  }
}
function mapSession(row: SessionRow): RemoteDesktopSessionRecord {
  return {
    tenantId: row.tenant_id, applicationId: row.application_id,
    sessionId: row.session_id, requesterId: row.requester_id,
    endpointId: row.endpoint_id, status: row.status, mode: row.mode,
    consentGrantId: row.consent_grant_id,
    expiresAt: new Date(row.expires_at).toISOString(), version: Number(row.version),
  };
}

/**
 * Durable Remote Desktop Sharing persistence. Every data operation establishes
 * transaction-local tenant/application RLS context. Consent and lifecycle writes
 * share one transaction with append-only audit evidence. This store never starts
 * a transport, captures a screen, or grants endpoint access itself.
 */
export class PostgresRemoteDesktopSessionStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        sessions: string | null; consents: string | null;
        sessions_rls: boolean; sessions_force_rls: boolean;
        consents_rls: boolean; consents_force_rls: boolean;
        sessions_policy: boolean; consents_policy: boolean;
      }>(`
        SELECT to_regclass('public.eper_remote_desktop_session')::text AS sessions,
               to_regclass('public.eper_remote_desktop_consent')::text AS consents,
               COALESCE(s.relrowsecurity, false) AS sessions_rls,
               COALESCE(s.relforcerowsecurity, false) AS sessions_force_rls,
               COALESCE(c.relrowsecurity, false) AS consents_rls,
               COALESCE(c.relforcerowsecurity, false) AS consents_force_rls,
               EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
                 AND p.tablename='eper_remote_desktop_session'
                 AND p.policyname='eper_remote_desktop_session_scope') AS sessions_policy,
               EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
                 AND p.tablename='eper_remote_desktop_consent'
                 AND p.policyname='eper_remote_desktop_consent_scope') AS consents_policy
          FROM (SELECT 1) seed
          LEFT JOIN pg_class s ON s.oid=to_regclass('public.eper_remote_desktop_session')
          LEFT JOIN pg_class c ON c.oid=to_regclass('public.eper_remote_desktop_consent')
      `);
      const row = result.rows[0];
      if (!row?.sessions || !row.consents || !row.sessions_rls || !row.sessions_force_rls ||
          !row.consents_rls || !row.consents_force_rls || !row.sessions_policy || !row.consents_policy) {
        throw new Error("EPER_REMOTE_DESKTOP_SCHEMA_NOT_READY_WITH_TENANT_RLS");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_REMOTE_DESKTOP_SCHEMA_NOT_READY_WITH_TENANT_RLS") throw error;
      throw new Error("EPER_REMOTE_DESKTOP_SCHEMA_READINESS_FAILED", { cause: error });
    } finally { client.release(); }
  }

  async requestSession(input: RemoteDesktopStoreScope & {
    endpointId: string; expiresAt: string; sessionId?: string;
  }): Promise<RemoteDesktopSessionRecord> {
    this.validateScope(input);
    if (typeof input.endpointId !== "string" || !input.endpointId.trim() || input.endpointId.length > 160) {
      throw new Error("REMOTE_DESKTOP_ENDPOINT_ID_INVALID");
    }
    const expiry = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("REMOTE_DESKTOP_SESSION_EXPIRY_INVALID");
    const sessionId = input.sessionId ?? randomUUID();
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("REMOTE_DESKTOP_SESSION_ID_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setScope(client, input);
      const inserted = await client.query<SessionRow>(`
        INSERT INTO eper_remote_desktop_session
          (tenant_id, application_id, session_id, requester_id, endpoint_id, status, mode, expires_at)
        VALUES ($1,$2,$3,$4,$5,'REQUESTED','VIEW_ONLY',$6)
        RETURNING tenant_id, application_id, session_id, requester_id, endpoint_id,
          status, mode, consent_grant_id, expires_at, version
      `, [input.tenantId, input.applicationId, sessionId, input.actorId, input.endpointId, input.expiresAt]);
      const row = inserted.rows[0];
      if (!row) throw new Error("REMOTE_DESKTOP_SESSION_INSERT_RETURNED_NO_ROW");
      await this.audit(client, input, "remote_desktop.session.request", sessionId, {
        endpointId: input.endpointId, mode: "VIEW_ONLY", expiresAt: input.expiresAt,
      });
      await client.query("COMMIT");
      return mapSession(row);
    } catch (error) { await this.rollback(client); throw error; }
    finally { client.release(); }
  }

  /** Endpoint consent acceptance and session transition are atomic and audited. */
  async acceptWithConsent(input: RemoteDesktopStoreScope & {
    sessionId: string; expectedVersion: number; grantedMode: RemoteSessionMode;
    consentExpiresAt: string; consentGrantId?: string;
  }): Promise<RemoteDesktopSessionRecord> {
    this.validateScope(input);
    this.validateSessionId(input.sessionId);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new Error("REMOTE_DESKTOP_EXPECTED_VERSION_INVALID");
    }
    if (input.grantedMode !== "VIEW_ONLY" && input.grantedMode !== "REMOTE_CONTROL") {
      throw new Error("REMOTE_DESKTOP_CONSENT_MODE_INVALID");
    }
    const consentExpiry = Date.parse(input.consentExpiresAt);
    if (!Number.isFinite(consentExpiry) || consentExpiry <= Date.now()) {
      throw new Error("REMOTE_DESKTOP_CONSENT_EXPIRY_INVALID");
    }
    const consentGrantId = input.consentGrantId ?? randomUUID();
    if (!/^[0-9a-f-]{36}$/i.test(consentGrantId)) throw new Error("REMOTE_DESKTOP_CONSENT_ID_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setScope(client, input);
      const selected = await client.query<SessionRow>(`
        SELECT tenant_id, application_id, session_id, requester_id, endpoint_id,
          status, mode, consent_grant_id, expires_at, version
        FROM eper_remote_desktop_session
        WHERE tenant_id=$1 AND application_id=$2 AND session_id=$3
        FOR UPDATE
      `, [input.tenantId, input.applicationId, input.sessionId]);
      const current = selected.rows[0];
      if (!current) throw new Error("REMOTE_DESKTOP_SESSION_NOT_FOUND");
      if (Number(current.version) !== input.expectedVersion) throw new Error("REMOTE_DESKTOP_VERSION_CONFLICT");
      if (current.status !== "REQUESTED" || Date.parse(String(current.expires_at)) <= Date.now()) {
        throw new Error("REMOTE_DESKTOP_SESSION_NOT_ACCEPTABLE");
      }
      if (consentExpiry > Date.parse(String(current.expires_at))) {
        throw new Error("REMOTE_DESKTOP_CONSENT_EXCEEDS_SESSION_EXPIRY");
      }
      await client.query(`
        INSERT INTO eper_remote_desktop_consent
          (tenant_id, application_id, consent_grant_id, session_id, endpoint_id,
           subject_id, granted_mode, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [input.tenantId, input.applicationId, consentGrantId, input.sessionId,
        current.endpoint_id, input.actorId, input.grantedMode, input.consentExpiresAt]);
      const updated = await client.query<SessionRow>(`
        UPDATE eper_remote_desktop_session
        SET status='ACCEPTED', mode=$4, consent_grant_id=$5,
            version=version+1, updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND application_id=$2 AND session_id=$3
        RETURNING tenant_id, application_id, session_id, requester_id, endpoint_id,
          status, mode, consent_grant_id, expires_at, version
      `, [input.tenantId, input.applicationId, input.sessionId, input.grantedMode, consentGrantId]);
      const row = updated.rows[0];
      if (!row) throw new Error("REMOTE_DESKTOP_SESSION_ACCEPT_RETURNED_NO_ROW");
      await this.audit(client, input, "remote_desktop.consent.grant", input.sessionId, {
        consentGrantId, endpointId: current.endpoint_id, grantedMode: input.grantedMode,
      });
      await client.query("COMMIT");
      return mapSession(row);
    } catch (error) { await this.rollback(client); throw error; }
    finally { client.release(); }
  }

  async revokeConsent(input: RemoteDesktopStoreScope & {
    sessionId: string; expectedVersion: number;
  }): Promise<RemoteDesktopSessionRecord> {
    this.validateScope(input);
    this.validateSessionId(input.sessionId);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new Error("REMOTE_DESKTOP_EXPECTED_VERSION_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setScope(client, input);
      const selected = await client.query<SessionRow>(`
        SELECT tenant_id, application_id, session_id, requester_id, endpoint_id,
          status, mode, consent_grant_id, expires_at, version
        FROM eper_remote_desktop_session
        WHERE tenant_id=$1 AND application_id=$2 AND session_id=$3
        FOR UPDATE
      `, [input.tenantId, input.applicationId, input.sessionId]);
      const current = selected.rows[0];
      if (!current) throw new Error("REMOTE_DESKTOP_SESSION_NOT_FOUND");
      if (Number(current.version) !== input.expectedVersion) throw new Error("REMOTE_DESKTOP_VERSION_CONFLICT");
      if (!current.consent_grant_id || !["ACCEPTED", "ACTIVE"].includes(current.status)) {
        throw new Error("REMOTE_DESKTOP_ACTIVE_CONSENT_NOT_FOUND");
      }
      await client.query(`
        UPDATE eper_remote_desktop_consent SET revoked_at=clock_timestamp()
        WHERE tenant_id=$1 AND application_id=$2 AND consent_grant_id=$3 AND revoked_at IS NULL
      `, [input.tenantId, input.applicationId, current.consent_grant_id]);
      const updated = await client.query<SessionRow>(`
        UPDATE eper_remote_desktop_session
        SET status='REVOKED', version=version+1, updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND application_id=$2 AND session_id=$3
        RETURNING tenant_id, application_id, session_id, requester_id, endpoint_id,
          status, mode, consent_grant_id, expires_at, version
      `, [input.tenantId, input.applicationId, input.sessionId]);
      const row = updated.rows[0];
      if (!row) throw new Error("REMOTE_DESKTOP_SESSION_REVOKE_RETURNED_NO_ROW");
      await this.audit(client, input, "remote_desktop.consent.revoke", input.sessionId, {
        consentGrantId: current.consent_grant_id, endpointId: current.endpoint_id,
      });
      await client.query("COMMIT");
      return mapSession(row);
    } catch (error) { await this.rollback(client); throw error; }
    finally { client.release(); }
  }

  private async setScope(client: AuditSqlClient, scope: RemoteDesktopStoreScope): Promise<void> {
    await client.query(
      "SELECT set_config('eper.tenant_id',$1,true), set_config('eper.application_id',$2,true)",
      [scope.tenantId, scope.applicationId],
    );
  }
  private async audit(
    client: AuditSqlClient, input: RemoteDesktopStoreScope,
    action: string, sessionId: string, payload: Record<string, unknown>,
  ): Promise<void> {
    await appendAuditEventInTransaction(client, {
      tenantId: input.tenantId, applicationId: input.applicationId,
      environment: input.environment, actorType: "human", actorId: input.actorId,
      action, outcome: "success", resourceType: "remote-desktop-session",
      resourceId: sessionId, correlationId: input.correlationId,
      source: "api", operationName: action, payload,
    });
  }
  private validateScope(input: RemoteDesktopStoreScope): void {
    validateId(input.tenantId, "tenantId");
    validateId(input.applicationId, "applicationId");
    validateId(input.actorId, "actorId");
    if (!input.correlationId?.trim()) throw new Error("REMOTE_DESKTOP_CORRELATION_ID_REQUIRED");
    if (!["production", "uat", "sandbox"].includes(input.environment)) {
      throw new Error("REMOTE_DESKTOP_AUDIT_ENVIRONMENT_INVALID");
    }
  }
  private validateSessionId(value: string): void {
    if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("REMOTE_DESKTOP_SESSION_ID_INVALID");
  }
  private async rollback(client: AuditSqlClient): Promise<void> {
    try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
  }
}
