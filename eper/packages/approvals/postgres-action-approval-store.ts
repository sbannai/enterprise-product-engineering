import { randomUUID } from "node:crypto";
import { appendAuditEventInTransaction, type AuditEnvironment, type AuditSource, type AuditSqlClient, type AuditSqlPool } from "../audit/audit-event-store.js";
import {
  evaluateActionApprovalGate,
  hashActionProposal,
  type ActionApprovalGateResult,
  type ActionProposal,
  type ApprovalActorType,
  type ApprovalDecisionRecord,
} from "./action-approval-contracts.js";

export interface ActionApprovalScope {
  tenantId: string;
  applicationId: string;
}

export interface ActionApprovalAuditContext extends ActionApprovalScope {
  actorId: string;
  actorType: ApprovalActorType;
  environment: AuditEnvironment;
  source: AuditSource;
  operationName: string;
  correlationId: string;
  serviceVersion?: string;
}

export interface CreateActionProposalResult {
  proposal: ActionProposal;
  replayed: boolean;
}
export interface ActionProposalQueueItem {
  proposal: ActionProposal;
  status: "pending" | "approved" | "rejected" | "revoked" | "expired";
}

export interface RecordActionDecisionInput extends ActionApprovalAuditContext {
  proposalId: string;
  proposalVersion: number;
  decision: "approve" | "reject" | "revoke";
  approvalId?: string;
  decidedAt: string;
  expiresAt?: string;
  policyVersion: string;
  reasonCode?: string;
}

export interface RecordActionDecisionResult {
  decisionId: string;
  approvalId: string | null;
  decision: "approve" | "reject" | "revoke";
}

export interface ClaimActionExecutionInput extends ActionApprovalAuditContext {
  proposalId: string;
  proposalVersion: number;
  approvalId: string;
  workerId: string;
  leaseSeconds?: number;
  authorizationGranted: boolean;
  auditAvailable: boolean;
  consentAndIndependentControlsAllowed: boolean;
  now?: string;
}

export interface ActionExecutionClaim {
  executionId: string;
  approvalId: string;
  proposalId: string;
  proposalVersion: number;
  proposalHash: string;
  idempotencyKey: string;
  status: "processing" | "succeeded" | "failed";
  attemptCount: number;
  workerId: string;
  leaseExpiresAt: string | null;
  resultHash: string | null;
}

interface ProposalRow {
  proposal_id: string;
  proposal_version: number | string;
  tenant_id: string;
  application_id: string;
  action_type: string;
  side_effect_class: ActionProposal["sideEffectClass"];
  target_type: string;
  target_id: string;
  requested_by: string;
  requester_type: ApprovalActorType;
  payload: Record<string, unknown> | string;
  payload_hash: string;
  idempotency_key: string;
  correlation_id: string;
  created_at: string | Date;
  expires_at: string | Date;
}
interface ApprovalRow {
  approval_id: string;
  proposal_id: string;
  proposal_version: number | string;
  proposal_hash: string;
  tenant_id: string;
  application_id: string;
  approver_id: string;
  approver_type: ApprovalActorType;
  decided_at: string | Date;
  expires_at: string | Date;
  policy_version: string;
  revoked_at: string | Date | null;
}
interface ExecutionRow {
  execution_id: string;
  approval_id: string;
  proposal_id: string;
  proposal_version: number | string;
  proposal_hash: string;
  idempotency_key: string;
  execution_status: ActionExecutionClaim["status"];
  attempt_count: number | string;
  worker_id: string;
  lease_expires_at: string | Date | null;
  result_hash: string | null;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isCanonicalIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function validateScope(scope: ActionApprovalScope): void {
  if (!scope || !/^[A-Za-z0-9._-]{2,128}$/.test(scope.tenantId) ||
      !/^[A-Za-z0-9._-]{2,128}$/.test(scope.applicationId)) {
    throw new Error("ACTION_APPROVAL_SCOPE_INVALID");
  }
}
function parsePayload(value: Record<string, unknown> | string): Record<string, unknown> {
  const payload = typeof value === "string" ? JSON.parse(value) : value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("ACTION_PROPOSAL_PAYLOAD_INVALID");
  }
  return payload as Record<string, unknown>;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
function timestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("ACTION_APPROVAL_DATABASE_TIMESTAMP_INVALID");
  return date.toISOString();
}
function mapProposal(row: ProposalRow): ActionProposal {
  const proposal: ActionProposal = {
    proposalId: row.proposal_id,
    proposalVersion: Number(row.proposal_version),
    tenantId: row.tenant_id,
    applicationId: row.application_id,
    actionType: row.action_type,
    sideEffectClass: row.side_effect_class,
    targetType: row.target_type,
    targetId: row.target_id,
    requestedBy: row.requested_by,
    requesterType: row.requester_type,
    payload: parsePayload(row.payload),
    payloadHash: row.payload_hash.trim(),
    idempotencyKey: row.idempotency_key,
    createdAt: timestamp(row.created_at),
    expiresAt: timestamp(row.expires_at),
    correlationId: row.correlation_id,
  };
  if (hashActionProposal(proposal) !== proposal.payloadHash) {
    throw new Error("ACTION_PROPOSAL_STORED_HASH_MISMATCH");
  }
  return proposal;
}
function mapApproval(row: ApprovalRow): ApprovalDecisionRecord {
  const record: ApprovalDecisionRecord = {
    approvalId: row.approval_id,
    proposalId: row.proposal_id,
    proposalVersion: Number(row.proposal_version),
    proposalHash: row.proposal_hash.trim(),
    tenantId: row.tenant_id,
    applicationId: row.application_id,
    approverId: row.approver_id,
    approverType: row.approver_type,
    decision: "approve",
    decidedAt: timestamp(row.decided_at),
    expiresAt: timestamp(row.expires_at),
    policyVersion: row.policy_version,
  };
  if (row.revoked_at !== null) record.revokedAt = timestamp(row.revoked_at);
  return record;
}
function mapExecution(row: ExecutionRow): ActionExecutionClaim {
  return {
    executionId: row.execution_id,
    approvalId: row.approval_id,
    proposalId: row.proposal_id,
    proposalVersion: Number(row.proposal_version),
    proposalHash: row.proposal_hash.trim(),
    idempotencyKey: row.idempotency_key,
    status: row.execution_status,
    attemptCount: Number(row.attempt_count),
    workerId: row.worker_id,
    leaseExpiresAt: row.lease_expires_at === null ? null : timestamp(row.lease_expires_at),
    resultHash: row.result_hash?.trim() ?? null,
  };
}
async function setRls(client: AuditSqlClient, scope: ActionApprovalScope): Promise<void> {
  validateScope(scope);
  await client.query("SELECT set_config('eper.tenant_id', $1, true)", [scope.tenantId]);
  await client.query("SELECT set_config('eper.application_id', $1, true)", [scope.applicationId]);
}
async function appendAudit(
  client: AuditSqlClient,
  context: ActionApprovalAuditContext,
  action: string,
  outcome: "success" | "denied" | "failure",
  resourceType: string,
  resourceId: string,
  approvalId?: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await appendAuditEventInTransaction(client, {
    tenantId: context.tenantId,
    applicationId: context.applicationId,
    environment: context.environment,
    actorType: context.actorType,
    actorId: context.actorId,
    action,
    outcome,
    resourceType,
    resourceId,
    operationId: context.correlationId,
    correlationId: context.correlationId,
    source: context.source,
    operationName: context.operationName,
    serviceVersion: context.serviceVersion,
    approvalId,
    payload,
  });
}

/**
 * Durable approval and execution repository.
 * Every state-changing method is tenant/application scoped, transactional and audited.
 * This store never dispatches an external action.
 */
export class PostgresActionApprovalStore {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        table_name: string | null;
        has_rls: boolean;
        has_force_rls: boolean;
      }>(`
        SELECT c.relname AS table_name, c.relrowsecurity AS has_rls,
               c.relforcerowsecurity AS has_force_rls
          FROM pg_class c
         WHERE c.relnamespace = 'public'::regnamespace
           AND c.relname = ANY($1::text[])
      `, [[
        "eper_action_proposals", "eper_action_approval_grants",
        "eper_action_approval_decisions", "eper_action_execution_claims",
        "eper_action_execution_events",
      ]]);
      if (result.rows.length !== 5 || result.rows.some(row => !row.has_rls || !row.has_force_rls)) {
        throw new Error("EPER_ACTION_APPROVAL_SCHEMA_NOT_READY");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_ACTION_APPROVAL_SCHEMA_NOT_READY") throw error;
      throw new Error("EPER_ACTION_APPROVAL_SCHEMA_NOT_READY", { cause: error });
    } finally {
      client.release();
    }
  }

  async createProposal(
    proposal: ActionProposal,
    audit: ActionApprovalAuditContext,
  ): Promise<CreateActionProposalResult> {
    validateScope(audit);
    if (proposal.tenantId !== audit.tenantId || proposal.applicationId !== audit.applicationId ||
        !isCanonicalIsoTimestamp(proposal.createdAt) || !isCanonicalIsoTimestamp(proposal.expiresAt) ||
        hashActionProposal(proposal) !== proposal.payloadHash) {
      throw new Error("ACTION_PROPOSAL_SCOPE_OR_HASH_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, audit);
      const inserted = await client.query<ProposalRow>(
        `INSERT INTO eper_action_proposals (
          tenant_id, application_id, proposal_id, proposal_version, action_type,
          side_effect_class, target_type, target_id, requested_by, requester_type,
          payload, payload_hash, idempotency_key, correlation_id, created_at, expires_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)
        ON CONFLICT DO NOTHING
        RETURNING proposal_id, proposal_version, tenant_id, application_id, action_type,
          side_effect_class, target_type, target_id, requested_by, requester_type,
          payload, payload_hash, idempotency_key, correlation_id, created_at, expires_at`,
        [
          proposal.tenantId, proposal.applicationId, proposal.proposalId, proposal.proposalVersion,
          proposal.actionType, proposal.sideEffectClass, proposal.targetType, proposal.targetId,
          proposal.requestedBy, proposal.requesterType, JSON.stringify(proposal.payload),
          proposal.payloadHash, proposal.idempotencyKey, proposal.correlationId,
          proposal.createdAt, proposal.expiresAt,
        ],
      );
      if (inserted.rows[0]) {
        await appendAudit(client, audit, "action.proposal.created", "success", "action-proposal",
          proposal.proposalId, undefined, { proposalVersion: proposal.proposalVersion, proposalHash: proposal.payloadHash });
        await client.query("COMMIT");
        return { proposal: mapProposal(inserted.rows[0]), replayed: false };
      }
      const existing = await client.query<ProposalRow>(
        `SELECT proposal_id, proposal_version, tenant_id, application_id, action_type,
                side_effect_class, target_type, target_id, requested_by, requester_type,
                payload, payload_hash, idempotency_key, correlation_id, created_at, expires_at
           FROM eper_action_proposals
          WHERE tenant_id = $1 AND application_id = $2 AND idempotency_key = $3
          FOR UPDATE`,
        [proposal.tenantId, proposal.applicationId, proposal.idempotencyKey],
      );
      if (!existing.rows[0]) throw new Error("ACTION_PROPOSAL_CONFLICT");
      const stored = mapProposal(existing.rows[0]);
      if (stored.actionType !== proposal.actionType || stored.sideEffectClass !== proposal.sideEffectClass ||
          stored.targetType !== proposal.targetType || stored.targetId !== proposal.targetId ||
          stored.requestedBy !== proposal.requestedBy || stored.requesterType !== proposal.requesterType ||
          stableJson(stored.payload) !== stableJson(proposal.payload)) {
        throw new Error("ACTION_PROPOSAL_IDEMPOTENCY_CONFLICT");
      }
      await client.query("COMMIT");
      return { proposal: stored, replayed: true };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async getProposal(
    scope: ActionApprovalScope & { proposalId: string; proposalVersion: number },
  ): Promise<ActionProposal | null> {
    validateScope(scope);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, scope);
      const result = await client.query<ProposalRow>(
        `SELECT proposal_id, proposal_version, tenant_id, application_id, action_type,
                side_effect_class, target_type, target_id, requested_by, requester_type,
                payload, payload_hash, idempotency_key, correlation_id, created_at, expires_at
           FROM eper_action_proposals
          WHERE tenant_id = $1 AND application_id = $2
            AND proposal_id = $3 AND proposal_version = $4`,
        [scope.tenantId, scope.applicationId, scope.proposalId, scope.proposalVersion],
      );
      await client.query("COMMIT");
      return result.rows[0] ? mapProposal(result.rows[0]) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async listProposals(
    scope: ActionApprovalScope,
    limit = 50,
  ): Promise<ActionProposalQueueItem[]> {
    validateScope(scope);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("ACTION_PROPOSAL_LIST_LIMIT_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, scope);
      const result = await client.query<ProposalRow & { approval_status: ActionProposalQueueItem["status"] }>(
        `SELECT p.proposal_id, p.proposal_version, p.tenant_id, p.application_id, p.action_type,
                p.side_effect_class, p.target_type, p.target_id, p.requested_by, p.requester_type,
                p.payload, p.payload_hash, p.idempotency_key, p.correlation_id, p.created_at, p.expires_at,
                CASE
                  WHEN p.expires_at <= NOW() THEN 'expired'
                  WHEN EXISTS (
                    SELECT 1 FROM eper_action_approval_grants g
                     WHERE g.tenant_id = p.tenant_id AND g.application_id = p.application_id
                       AND g.proposal_id = p.proposal_id AND g.proposal_version = p.proposal_version
                       AND g.expires_at > NOW()
                       AND NOT EXISTS (
                         SELECT 1 FROM eper_action_approval_decisions d
                          WHERE d.tenant_id = g.tenant_id AND d.application_id = g.application_id
                            AND d.approval_id = g.approval_id AND d.decision = 'revoke'
                       )
                  ) THEN 'approved'
                  WHEN EXISTS (
                    SELECT 1 FROM eper_action_approval_grants g
                     WHERE g.tenant_id = p.tenant_id AND g.application_id = p.application_id
                       AND g.proposal_id = p.proposal_id AND g.proposal_version = p.proposal_version
                       AND NOT EXISTS (
                         SELECT 1 FROM eper_action_approval_decisions d
                          WHERE d.tenant_id = g.tenant_id AND d.application_id = g.application_id
                            AND d.approval_id = g.approval_id AND d.decision = 'revoke'
                       )
                  ) THEN 'approved'
                  WHEN EXISTS (
                    SELECT 1 FROM eper_action_approval_grants g
                     WHERE g.tenant_id = p.tenant_id AND g.application_id = p.application_id
                       AND g.proposal_id = p.proposal_id AND g.proposal_version = p.proposal_version
                       AND g.expires_at <= NOW()
                  ) THEN 'expired'
                  WHEN EXISTS (
                    SELECT 1 FROM eper_action_approval_grants g
                     WHERE g.tenant_id = p.tenant_id AND g.application_id = p.application_id
                       AND g.proposal_id = p.proposal_id AND g.proposal_version = p.proposal_version
                  ) THEN 'revoked'
                  WHEN EXISTS (
                    SELECT 1 FROM eper_action_approval_decisions d
                     WHERE d.tenant_id = p.tenant_id AND d.application_id = p.application_id
                       AND d.proposal_id = p.proposal_id AND d.proposal_version = p.proposal_version
                       AND d.decision = 'reject'
                  ) THEN 'rejected'
                  ELSE 'pending'
                END AS approval_status
           FROM eper_action_proposals p
          WHERE p.tenant_id = $1 AND p.application_id = $2
          ORDER BY p.created_at DESC, p.proposal_id, p.proposal_version DESC
          LIMIT $3`,
        [scope.tenantId, scope.applicationId, limit],
      );
      await client.query("COMMIT");
      return result.rows.map(row => ({ proposal: mapProposal(row), status: row.approval_status }));
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async recordDecision(
    input: RecordActionDecisionInput,
  ): Promise<RecordActionDecisionResult> {
    validateScope(input);
    if (!validText(input.proposalId) || !Number.isSafeInteger(input.proposalVersion) ||
        input.proposalVersion < 1 || !validText(input.actorId) || !validText(input.policyVersion) ||
        !Number.isFinite(Date.parse(input.decidedAt))) {
      throw new Error("ACTION_APPROVAL_DECISION_INVALID");
    }
    if (input.decision === "approve" && (!validText(input.approvalId) || input.actorType !== "human" ||
        !validText(input.expiresAt) || !Number.isFinite(Date.parse(input.expiresAt)))) {
      throw new Error("ACTION_APPROVAL_GRANT_INVALID");
    }
    if (input.decision === "revoke" && (!validText(input.approvalId) || input.actorType !== "human")) {
      throw new Error("ACTION_APPROVAL_REVOCATION_INVALID");
    }
    const client = await this.pool.connect();
    const decisionId = randomUUID();
    try {
      await client.query("BEGIN");
      await setRls(client, input);
      const proposalResult = await client.query<ProposalRow>(
        `SELECT proposal_id, proposal_version, tenant_id, application_id, action_type,
                side_effect_class, target_type, target_id, requested_by, requester_type,
                payload, payload_hash, idempotency_key, correlation_id, created_at, expires_at
           FROM eper_action_proposals
          WHERE tenant_id = $1 AND application_id = $2 AND proposal_id = $3 AND proposal_version = $4
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.proposalId, input.proposalVersion],
      );
      if (!proposalResult.rows[0]) throw new Error("ACTION_PROPOSAL_NOT_FOUND");
      const proposal = mapProposal(proposalResult.rows[0]);
      if (input.decision === "approve" && Date.parse(proposal.expiresAt) <= Date.parse(input.decidedAt)) {
        throw new Error("ACTION_PROPOSAL_EXPIRED");
      }
      if (input.decision === "approve" && input.expiresAt && Date.parse(input.expiresAt) > Date.parse(proposal.expiresAt)) {
        throw new Error("ACTION_APPROVAL_EXPIRY_EXCEEDS_PROPOSAL");
      }
      let approvalId: string | null = null;
      if (input.decision === "approve") {
        approvalId = input.approvalId!;
        await client.query(
          `INSERT INTO eper_action_approval_grants (
            tenant_id, application_id, approval_id, proposal_id, proposal_version,
            proposal_hash, requested_by, approver_id, approver_type, decided_at, expires_at, policy_version
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'human',$9,$10,$11)`,
          [input.tenantId, input.applicationId, approvalId, proposal.proposalId, proposal.proposalVersion,
            proposal.payloadHash, proposal.requestedBy, input.actorId, input.decidedAt, input.expiresAt, input.policyVersion],
        );
      } else if (input.decision === "revoke") {
        approvalId = input.approvalId!;
      }
      await client.query(
        `INSERT INTO eper_action_approval_decisions (
          tenant_id, application_id, decision_id, proposal_id, proposal_version,
          proposal_hash, approval_id, decision, actor_id, actor_type, decided_at,
          expires_at, policy_version, reason_code
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [input.tenantId, input.applicationId, decisionId, proposal.proposalId, proposal.proposalVersion,
          proposal.payloadHash, approvalId, input.decision, input.actorId, input.actorType,
          input.decidedAt, input.decision === "approve" ? input.expiresAt : null,
          input.policyVersion, input.reasonCode ?? null],
      );
      await appendAudit(client, input, "action.approval." + input.decision, "success",
        "action-proposal", proposal.proposalId, approvalId ?? undefined,
        { proposalVersion: proposal.proposalVersion, proposalHash: proposal.payloadHash, decisionId });
      await client.query("COMMIT");
      return { decisionId, approvalId, decision: input.decision };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async getApproval(
    scope: ActionApprovalScope & { proposalId: string; proposalVersion: number; approvalId: string },
  ): Promise<ApprovalDecisionRecord | null> {
    validateScope(scope);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, scope);
      const result = await client.query<ApprovalRow>(
        `SELECT g.approval_id, g.proposal_id, g.proposal_version, g.proposal_hash,
                g.tenant_id, g.application_id, g.approver_id, g.approver_type,
                g.decided_at, g.expires_at, g.policy_version,
                (SELECT MIN(d.decided_at) FROM eper_action_approval_decisions d
                  WHERE d.tenant_id = g.tenant_id AND d.application_id = g.application_id
                    AND d.approval_id = g.approval_id AND d.decision = 'revoke') AS revoked_at
           FROM eper_action_approval_grants g
          WHERE g.tenant_id = $1 AND g.application_id = $2 AND g.proposal_id = $3
            AND g.proposal_version = $4 AND g.approval_id = $5`,
        [scope.tenantId, scope.applicationId, scope.proposalId, scope.proposalVersion, scope.approvalId],
      );
      await client.query("COMMIT");
      return result.rows[0] ? mapApproval(result.rows[0]) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async claimExecution(input: ClaimActionExecutionInput): Promise<ActionExecutionClaim> {
    validateScope(input);
    if (!validText(input.approvalId) || !validText(input.workerId)) {
      throw new Error("ACTION_EXECUTION_CLAIM_INVALID");
    }
    const leaseSeconds = input.leaseSeconds ?? 60;
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
      throw new Error("ACTION_EXECUTION_LEASE_INVALID");
    }
    const now = input.now ?? new Date().toISOString();
    if (!isCanonicalIsoTimestamp(now)) throw new Error("ACTION_EXECUTION_TIMESTAMP_INVALID");
    const leaseExpiresAt = new Date(Date.parse(now) + leaseSeconds * 1000).toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, input);
      const proposalResult = await client.query<ProposalRow>(
        `SELECT proposal_id, proposal_version, tenant_id, application_id, action_type,
                side_effect_class, target_type, target_id, requested_by, requester_type,
                payload, payload_hash, idempotency_key, correlation_id, created_at, expires_at
           FROM eper_action_proposals
          WHERE tenant_id = $1 AND application_id = $2 AND proposal_id = $3 AND proposal_version = $4
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.proposalId, input.proposalVersion],
      );
      if (!proposalResult.rows[0]) throw new Error("ACTION_PROPOSAL_NOT_FOUND");
      const proposal = mapProposal(proposalResult.rows[0]);
      const approvalResult = await client.query<ApprovalRow>(
        `SELECT g.approval_id, g.proposal_id, g.proposal_version, g.proposal_hash,
                g.tenant_id, g.application_id, g.approver_id, g.approver_type,
                g.decided_at, g.expires_at, g.policy_version,
                (SELECT MIN(d.decided_at) FROM eper_action_approval_decisions d
                  WHERE d.tenant_id = g.tenant_id AND d.application_id = g.application_id
                    AND d.approval_id = g.approval_id AND d.decision = 'revoke') AS revoked_at
           FROM eper_action_approval_grants g
          WHERE g.tenant_id = $1 AND g.application_id = $2 AND g.proposal_id = $3
            AND g.proposal_version = $4 AND g.approval_id = $5
          FOR UPDATE OF g`,
        [input.tenantId, input.applicationId, input.proposalId, input.proposalVersion, input.approvalId],
      );
      const approval = approvalResult.rows[0] ? mapApproval(approvalResult.rows[0]) : null;
      const gate: ActionApprovalGateResult = evaluateActionApprovalGate({
        proposal,
        approval,
        executionScope: { tenantId: input.tenantId, applicationId: input.applicationId },
        authorizationGranted: input.authorizationGranted,
        auditAvailable: input.auditAvailable,
        consentAndIndependentControlsAllowed: input.consentAndIndependentControlsAllowed,
        now,
      });
      if (!gate.allowed) throw new Error("ACTION_APPROVAL_GATE_DENIED:" + gate.reason);

      const existingResult = await client.query<ExecutionRow>(
        `SELECT execution_id, approval_id, proposal_id, proposal_version, proposal_hash,
                idempotency_key, execution_status, attempt_count, worker_id, lease_expires_at, result_hash
           FROM eper_action_execution_claims
          WHERE tenant_id = $1 AND application_id = $2
            AND (approval_id = $3 OR idempotency_key = $4)
          FOR UPDATE`,
        [input.tenantId, input.applicationId, input.approvalId, proposal.idempotencyKey],
      );
      let claim: ActionExecutionClaim;
      let eventType: "claimed" | "reclaimed" = "claimed";
      if (existingResult.rows[0]) {
        const existing = mapExecution(existingResult.rows[0]);
        if (existing.approvalId !== input.approvalId || existing.idempotencyKey !== proposal.idempotencyKey ||
            existing.proposalId !== proposal.proposalId || existing.proposalVersion !== proposal.proposalVersion ||
            existing.proposalHash !== proposal.payloadHash) {
          throw new Error("ACTION_EXECUTION_IDEMPOTENCY_CONFLICT");
        }
        if (existing.status === "succeeded") {
          await client.query("COMMIT");
          return existing;
        }
        if (existing.status === "processing" && existing.leaseExpiresAt && Date.parse(existing.leaseExpiresAt) > Date.parse(now)) {
          throw new Error("ACTION_EXECUTION_ALREADY_CLAIMED");
        }
        eventType = "reclaimed";
        const updated = await client.query<ExecutionRow>(
          `UPDATE eper_action_execution_claims
              SET execution_status = 'processing', attempt_count = attempt_count + 1,
                  worker_id = $4, lease_expires_at = $5, finished_at = NULL,
                  result_hash = NULL, last_error_code = NULL, updated_at = $6
            WHERE tenant_id = $1 AND application_id = $2 AND execution_id = $3
            RETURNING execution_id, approval_id, proposal_id, proposal_version, proposal_hash,
              idempotency_key, execution_status, attempt_count, worker_id, lease_expires_at, result_hash`,
          [input.tenantId, input.applicationId, existing.executionId, input.workerId, leaseExpiresAt, now],
        );
        claim = mapExecution(updated.rows[0]);
      } else {
        const inserted = await client.query<ExecutionRow>(
          `INSERT INTO eper_action_execution_claims (
            tenant_id, application_id, execution_id, proposal_id, proposal_version,
            proposal_hash, approval_id, idempotency_key, execution_status, attempt_count,
            worker_id, lease_expires_at, started_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing',1,$9,$10,$11,$11)
          RETURNING execution_id, approval_id, proposal_id, proposal_version, proposal_hash,
            idempotency_key, execution_status, attempt_count, worker_id, lease_expires_at, result_hash`,
          [input.tenantId, input.applicationId, randomUUID(), proposal.proposalId, proposal.proposalVersion,
            proposal.payloadHash, input.approvalId, proposal.idempotencyKey, input.workerId, leaseExpiresAt, now],
        );
        claim = mapExecution(inserted.rows[0]);
      }
      await client.query(
        `INSERT INTO eper_action_execution_events (
          tenant_id, application_id, event_id, execution_id, approval_id, event_type, worker_id, occurred_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.tenantId, input.applicationId, randomUUID(), claim.executionId, claim.approvalId,
          eventType, input.workerId, now],
      );
      await appendAudit(client, input, "action.execution." + eventType, "success",
        "action-execution", claim.executionId, claim.approvalId,
        { proposalId: claim.proposalId, proposalVersion: claim.proposalVersion, attemptCount: claim.attemptCount });
      await client.query("COMMIT");
      return claim;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async finishExecution(input: ActionApprovalAuditContext & {
    executionId: string;
    workerId: string;
    outcome: "succeeded" | "failed";
    now?: string;
    resultHash?: string;
    errorCode?: string;
  }): Promise<ActionExecutionClaim> {
    validateScope(input);
    if (!validText(input.executionId) || !validText(input.workerId)) {
      throw new Error("ACTION_EXECUTION_FINISH_INVALID");
    }
    if (input.outcome === "succeeded" && (!input.resultHash || !/^[a-f0-9]{64}$/.test(input.resultHash))) {
      throw new Error("ACTION_EXECUTION_RESULT_HASH_INVALID");
    }
    const now = input.now ?? new Date().toISOString();
    if (!isCanonicalIsoTimestamp(now)) throw new Error("ACTION_EXECUTION_TIMESTAMP_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await setRls(client, input);
      const result = await client.query<ExecutionRow>(
        `UPDATE eper_action_execution_claims
            SET execution_status = $5, lease_expires_at = NULL, finished_at = $6,
                result_hash = $7, last_error_code = $8, updated_at = $6
          WHERE tenant_id = $1 AND application_id = $2 AND execution_id = $3
            AND worker_id = $4 AND execution_status = 'processing'
            AND lease_expires_at > $6
          RETURNING execution_id, approval_id, proposal_id, proposal_version, proposal_hash,
            idempotency_key, execution_status, attempt_count, worker_id, lease_expires_at, result_hash`,
        [input.tenantId, input.applicationId, input.executionId, input.workerId, input.outcome,
          now, input.outcome === "succeeded" ? input.resultHash : null, input.outcome === "failed" ? input.errorCode ?? "ACTION_EXECUTION_FAILED" : null],
      );
      if (!result.rows[0]) throw new Error("ACTION_EXECUTION_LEASE_NOT_HELD");
      const claim = mapExecution(result.rows[0]);
      await client.query(
        `INSERT INTO eper_action_execution_events (
          tenant_id, application_id, event_id, execution_id, approval_id, event_type, worker_id, occurred_at, payload
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [input.tenantId, input.applicationId, randomUUID(), claim.executionId, claim.approvalId,
          input.outcome, input.workerId, now, JSON.stringify({ resultHash: claim.resultHash, errorCode: input.errorCode ?? null })],
      );
      await appendAudit(client, input, "action.execution." + input.outcome, "success",
        "action-execution", claim.executionId, claim.approvalId,
        { attemptCount: claim.attemptCount, resultHash: claim.resultHash });
      await client.query("COMMIT");
      return claim;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
