import type { IncomingMessage, ServerResponse } from "node:http";
import { sendApiError, sendApiSuccess, resolveApiRequestId } from "./api-response.js";
import { validateCreateAgentJobRequest } from "../../packages/agents/agent-contracts.js";
import { PostgresAgentStore } from "../../packages/agents/postgres-agent-store.js";
import type { AuditEnvironment } from "../../packages/audit/audit-event-store.js";

export interface AgentJobTrustedIdentity {
  tenantId: string;
  actorId: string;
  roleKey: string;
  applicationIds: string[];
}
export type AgentJobIdentityResolver = (request: IncomingMessage) => AgentJobTrustedIdentity | null;

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 64 * 1024) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(part);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON_OBJECT_REQUIRED");
  return parsed as Record<string, unknown>;
}

function sendError(request: IncomingMessage, response: ServerResponse, status: number, code: string, message: string): void {
  sendApiError(request, response, status, code, message);
}

/** Durable job API. Tenant and actor come only from trusted server-side auth; application access is allowlisted. */
export async function handleAgentJobRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  options: { store?: PostgresAgentStore; resolveIdentity: AgentJobIdentityResolver; environment: AuditEnvironment },
): Promise<boolean> {
  if (pathname !== "/v1/agent-jobs" && !/^\/v1\/agent-jobs\/[0-9a-f-]+$/.test(pathname) && !/^\/v1\/agent-drafts\/[0-9a-f-]+(?:\/(approve|reject))?$/.test(pathname)) return false;
  if (!options.store) {
    sendError(request, response, 503, "AGENT_PERSISTENCE_UNAVAILABLE", "Durable agent job storage is not configured.");
    return true;
  }
  const identity = options.resolveIdentity(request);
  if (!identity) {
    sendError(request, response, 401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    return true;
  }
  const requestId = resolveApiRequestId(request);
  try {
    const reviewMatch = /^\/v1\/agent-drafts\/([0-9a-f-]+)\/(approve|reject)$/.exec(pathname);
    const draftMatch = /^\/v1\/agent-drafts\/([0-9a-f-]+)$/.exec(pathname);
    if (request.method === "GET" && draftMatch) {
      const applicationId = new URL(request.url ?? pathname, "http://localhost").searchParams.get("applicationId") ?? "";
      if (!/^[a-zA-Z0-9._-]{2,100}$/.test(applicationId) || !identity.applicationIds.includes(applicationId)) {
        sendError(request, response, 403, "APPLICATION_ACCESS_DENIED", "A permitted applicationId is required.");
        return true;
      }
      const draft = await options.store.getDraft({ tenantId: identity.tenantId, applicationId, draftId: draftMatch[1] });
      if (!draft) {
        sendError(request, response, 404, "AGENT_DRAFT_NOT_FOUND", "The requested draft was not found.");
        return true;
      }
      sendApiSuccess(request, response, 200, { draft, execution: "NOT_EXECUTED" });
      return true;
    }
    if (request.method === "POST" && reviewMatch) {
      const reviewerRoles = new Set((process.env.EPER_AGENT_REVIEWER_ROLE_KEYS ?? "")
        .split(";").map((role) => role.trim()).filter(Boolean));
      if (!reviewerRoles.has(identity.roleKey)) {
        sendError(request, response, 403, "AGENT_REVIEWER_ROLE_REQUIRED", "This role is not authorized to review agent drafts.");
        return true;
      }
      const body = await readBody(request);
      const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
      if (!/^[a-zA-Z0-9._-]{2,100}$/.test(applicationId) || !identity.applicationIds.includes(applicationId)) {
        sendError(request, response, 403, "APPLICATION_ACCESS_DENIED", "A permitted applicationId is required.");
        return true;
      }
      if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1 ||
          typeof body.expectedContentHash !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedContentHash)) {
        sendError(request, response, 400, "INVALID_DRAFT_REVIEW_VERSION_OR_HASH", "A valid expectedVersion and expectedContentHash are required.");
        return true;
      }
      const result = await options.store.reviewDraft({
        tenantId: identity.tenantId, applicationId, draftId: reviewMatch[1],
        reviewerId: identity.actorId, reviewerRole: identity.roleKey,
        action: reviewMatch[2] === "approve" ? "approve" : "reject",
        expectedVersion: body.expectedVersion as number, expectedContentHash: body.expectedContentHash,
        note: typeof body.note === "string" ? body.note : undefined,
        correlationId: requestId, environment: options.environment,
      });
      sendApiSuccess(request, response, 200, { review: result, execution: "NOT_EXECUTED" });
      return true;
    }
    if (request.method === "POST" && pathname === "/v1/agent-jobs") {
      const body = await readBody(request);
      const validated = validateCreateAgentJobRequest(body);
      if (!identity.applicationIds.includes(validated.applicationId)) {
        sendError(request, response, 403, "APPLICATION_ACCESS_DENIED", "This identity is not assigned to the requested application.");
        return true;
      }
      const result = await options.store.enqueueJob({
        tenantId: identity.tenantId,
        applicationId: validated.applicationId,
        requestedBy: identity.actorId,
        agentId: validated.agentId,
        intent: validated.intent,
        input: validated.input,
        idempotencyKey: validated.idempotencyKey,
        deadlineSeconds: validated.deadlineSeconds,
        correlationId: requestId,
        environment: options.environment,
      });
      if (result.kind === "idempotency_conflict") {
        sendError(request, response, 409, "IDEMPOTENCY_KEY_CONFLICT", "The idempotency key was already used for a different request.");
        return true;
      }
      sendApiSuccess(request, response, result.kind === "created" ? 202 : 200, {
        job: result.job,
        replayed: result.kind === "existing",
        statusUrl: "/v1/agent-jobs/" + result.job.jobId + "?applicationId=" + encodeURIComponent(validated.applicationId),
      });
      return true;
    }
    const match = /^\/v1\/agent-jobs\/([0-9a-f-]+)$/.exec(pathname);
    if (request.method === "GET" && match) {
      const applicationId = new URL(request.url ?? pathname, "http://localhost").searchParams.get("applicationId") ?? "";
      if (!/^[a-zA-Z0-9._-]{2,100}$/.test(applicationId) || !identity.applicationIds.includes(applicationId)) {
        sendError(request, response, 403, "APPLICATION_ACCESS_DENIED", "A permitted applicationId is required.");
        return true;
      }
      const job = await options.store.getJob({ tenantId: identity.tenantId, applicationId, jobId: match[1] });
      if (!job) {
        sendError(request, response, 404, "AGENT_JOB_NOT_FOUND", "The requested job was not found.");
        return true;
      }
      sendApiSuccess(request, response, 200, { job, statusUrl: "/v1/agent-jobs/" + job.jobId + "?applicationId=" + encodeURIComponent(applicationId) });
      return true;
    }
    response.setHeader("allow", pathname === "/v1/agent-jobs" ? "POST" : /^\/v1\/agent-drafts\/[0-9a-f-]+\/(approve|reject)$/.test(pathname) ? "POST" : pathname.startsWith("/v1/agent-drafts/") ? "GET" : "GET");
    sendError(request, response, 405, "METHOD_NOT_ALLOWED", "This HTTP method is not supported for the agent job resource.");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AGENT_JOB_REQUEST_FAILED";
    if (message === "REQUEST_BODY_TOO_LARGE") sendError(request, response, 413, "REQUEST_BODY_TOO_LARGE", "The request body exceeds the permitted size.");
    else if (message === "JSON_OBJECT_REQUIRED" || message.startsWith("INVALID_")) sendError(request, response, 400, message.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64), "The agent job request is invalid.");
    else if (message === "AGENT_DRAFT_NOT_FOUND") sendError(request, response, 404, message, "The requested agent draft was not found.");
    else if (["AGENT_DRAFT_ALREADY_REVIEWED","AGENT_DRAFT_JOB_NOT_AWAITING_APPROVAL","STALE_DRAFT_VERSION","STALE_DRAFT_HASH","MAKER_CHECKER_SEPARATION_REQUIRED"].includes(message)) sendError(request, response, 409, message, "The draft changed or is no longer eligible for review.");
    else sendError(request, response, 503, "AGENT_JOB_SERVICE_UNAVAILABLE", "The agent job service could not complete the request.");
    return true;
  }
}
