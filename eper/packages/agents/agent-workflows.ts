import { randomUUID, timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";

type AgentKind = "crm" | "sales" | "marketing";
type DraftStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
type Draft = {
  id: string; tenantId: string; createdBy: string; agent: AgentKind; intent: string;
  content: Record<string, unknown>; status: DraftStatus; createdAt: string;
  reviewedBy?: string; reviewedAt?: string; reviewNote?: string;
};
const drafts = new Map<string, Draft>();
const MAX_DRAFTS = 2000;

function send(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
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
function authenticatedPrincipal(request: IncomingMessage, credentials: Map<string, string>): string | null {
  const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? "");
  if (!match) return null;
  const presented = Buffer.from(match[1]);
  let principal: string | null = null;
  // Check every configured credential without early-exit timing differences.
  for (const [id, token] of credentials) {
    const expected = Buffer.from(token);
    const matches = presented.length === expected.length && timingSafeEqual(presented, expected);
    if (matches) principal = id;
  }
  return principal;
}
function cleanText(value: unknown, field: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`INVALID_${field.toUpperCase()}`);
  return value.trim();
}
function buildDraft(agent: AgentKind, intent: string, input: Record<string, unknown>): Record<string, unknown> {
  const context = typeof input.context === "string" ? input.context.trim().slice(0, 4000) : "";
  const objective = typeof input.objective === "string" ? input.objective.trim().slice(0, 1000) : intent;
  const audience = typeof input.audience === "string" ? input.audience.trim().slice(0, 300) : "the intended customer";
  const offer = typeof input.offer === "string" ? input.offer.trim().slice(0, 500) : "";
  if (agent === "crm") {
    if (intent === "lead-qualification") return {
      title: "Lead qualification draft",
      qualification: { fit: "REVIEW_REQUIRED", intent: "REVIEW_REQUIRED", timing: "REVIEW_REQUIRED", authority: "REVIEW_REQUIRED" },
      recommendedNextStep: "Confirm missing qualification fields with the owner before changing lead status.",
      suggestedCrmChanges: [],
      evidenceUsed: context ? ["User-supplied context"] : [],
      warnings: ["No CRM records were read or modified; verify facts against the system of record."],
    };
    if (intent === "contact-summary") return {
      title: "Contact/account summary draft", summary: context || "No source context supplied.",
      openQuestions: ["Confirm current owner", "Confirm last interaction and next commitment"],
      suggestedCrmChanges: [], warnings: ["Summary is based only on user-supplied context."],
    };
    if (intent === "next-action") return {
      title: "CRM next-action draft", recommendedAction: objective,
      ownerConfirmationRequired: true, dueDate: null, suggestedCrmChanges: [],
      warnings: ["No CRM write was performed; owner and due date require confirmation."],
    };
    throw new Error("AGENT_INTENT_UNSUPPORTED");
  }
  if (agent === "sales") {
    if (intent === "follow-up") return {
      title: "Sales follow-up draft", subject: `Following up on ${objective}`,
      message: `Hi ${audience},\n\nI wanted to follow up on ${objective}.${context ? ` Based on our notes: ${context}` : ""}\n\nWould a short discussion to confirm priorities and next steps be useful?\n\nBest,\nYour team`,
      nextStep: "Review customer facts, personalize, and obtain approval before sending.",
      sendEnabled: false, warnings: ["Draft only; no email, message, quote, or CRM update was sent."],
    };
    if (intent === "opportunity-plan") return {
      title: "Opportunity plan draft", objective,
      stages: ["Confirm needs and decision process", "Validate fit and stakeholders", "Prepare reviewed proposal", "Confirm decision and next step"],
      discoveryQuestions: ["What outcome matters most?", "Who participates in the decision?", "What timing and constraints apply?"],
      risksToValidate: context ? [context] : ["Budget, timeline, authority, and solution fit are unverified"],
      crmChanges: [], warnings: ["Stages and questions are suggestions, not authoritative CRM stage changes."],
    };
    if (intent === "proposal-outline") return {
      title: "Proposal outline draft", objective, customerContext: context || "Needs confirmation",
      sections: ["Customer goals", "Proposed scope", "Deliverables and exclusions", "Implementation approach", "Commercial terms (owner approval required)", "Risks and assumptions", "Acceptance criteria", "Next steps"],
      commercialTermsApproved: false, warnings: ["No price, discount, commitment, or contractual term has been invented."],
    };
    throw new Error("AGENT_INTENT_UNSUPPORTED");
  }
  if (intent === "campaign-brief") return {
    title: "Marketing campaign brief draft", objective, audience,
    offer: offer || "Offer requires owner confirmation",
    channels: ["Email (draft only)", "Website content (draft only)", "Social content (draft only)"],
    successMetrics: ["Reach", "Qualified engagement", "Conversion"], budget: null,
    complianceChecks: ["Audience consent", "Claims substantiation", "Brand review", "Unsubscribe/privacy requirements"],
    warnings: ["No campaign was scheduled or published; budget and metrics targets require approval."],
  };
  if (intent === "email-copy") return {
    title: "Marketing email draft", subject: objective,
    body: `Hello ${audience},\n\n${context || objective}\n\n${offer ? `Learn more: ${offer}\n\n` : ""}If this is relevant to your needs, we'd be happy to share more information.\n\nRegards,\nYour team`,
    requiresConsentCheck: true, sendEnabled: false,
    warnings: ["Confirm claims, audience consent, sender identity, and unsubscribe handling before use."],
  };
  if (intent === "social-copy") return {
    title: "Social content draft", variants: [
      { tone: "informative", copy: `${objective}. Share what matters to ${audience}, with clear evidence and a useful next step.` },
      { tone: "conversational", copy: `Working on ${objective}? Here's one idea worth considering. What would you add?` },
    ],
    publishEnabled: false, warnings: ["Review factual claims, brand voice, and platform requirements before publishing."],
  };
  throw new Error("AGENT_INTENT_UNSUPPORTED");
}
function errorStatus(message: string): number {
  return message === "REQUEST_BODY_TOO_LARGE" ? 413
    : message === "JSON_OBJECT_REQUIRED" || message.startsWith("INVALID_") || message === "AGENT_INTENT_UNSUPPORTED" ? 400
    : 422;
}

/**
 * Opt-in, provider-neutral agent workflow API. Drafts are tenant-scoped, volatile,
 * and never send messages, publish campaigns, or write CRM records. Approval is a
 * separate human action by a different allowlisted principal.
 */
export async function handleAgentRoute(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (!pathname.startsWith("/v1/agents/")) return false;
  if (process.env.EPER_AGENTS_API_ENABLED !== "true") { send(response, 404, { error: "not_found" }); return true; }
  const tenantId = process.env.EPER_AGENTS_TENANT_ID?.trim() ?? "";
  // Each principal has a distinct bearer credential. Never trust a principal ID supplied by the caller.
  // Format: EPER_AGENTS_PRINCIPAL_TOKENS="maker-a=<32+ chars>;reviewer-b=<32+ chars>"
  const credentials = new Map<string, string>();
  for (const entry of (process.env.EPER_AGENTS_PRINCIPAL_TOKENS ?? "").split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 1) continue;
    const id = entry.slice(0, separator).trim();
    const token = entry.slice(separator + 1).trim();
    if (/^[a-zA-Z0-9._-]{1,100}$/.test(id) && token.length >= 32) credentials.set(id, token);
  }
  if (!tenantId || credentials.size < 2) {
    send(response, 503, { error: "agents_api_unconfigured", required: ["EPER_AGENTS_TENANT_ID", "EPER_AGENTS_PRINCIPAL_TOKENS (at least two distinct principal=32+ character tokens separated by semicolons)"] }); return true;
  }
  const principalId = authenticatedPrincipal(request, credentials);
  if (!principalId) { send(response, 401, { error: "unauthorized" }); return true; }

  try {
    const draftMatch = /^\/v1\/agents\/(crm|sales|marketing)\/drafts$/.exec(pathname);
    if (request.method === "POST" && draftMatch) {
      if (drafts.size >= MAX_DRAFTS) { send(response, 503, { error: "agent_draft_capacity_reached" }); return true; }
      const body = await readBody(request);
      const intent = cleanText(body.intent, "intent", 80);
      if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) throw new Error("INVALID_INPUT");
      const content = buildDraft(draftMatch[1] as AgentKind, intent, body.input as Record<string, unknown>);
      const draft: Draft = { id: randomUUID(), tenantId, createdBy: principalId, agent: draftMatch[1] as AgentKind, intent, content, status: "PENDING_APPROVAL", createdAt: new Date().toISOString() };
      drafts.set(draft.id, draft);
      send(response, 201, { draft, controls: { externalActionsExecuted: false, crmWritesExecuted: false, humanApprovalRequired: true } }); return true;
    }
    if (request.method === "GET" && pathname === "/v1/agents/drafts") {
      const status = new URL(request.url ?? "/", "http://localhost").searchParams.get("status");
      const items = [...drafts.values()].filter((d) => d.tenantId === tenantId && (!status || d.status === status)).map((d) => ({ ...d }));
      send(response, 200, { drafts: items, total: items.length, persistence: "process-memory" }); return true;
    }
    const reviewMatch = /^\/v1\/agents\/drafts\/([0-9a-f-]+)\/(approve|reject)$/.exec(pathname);
    if (request.method === "POST" && reviewMatch) {
      const draft = drafts.get(reviewMatch[1]);
      if (!draft || draft.tenantId !== tenantId) { send(response, 404, { error: "draft_not_found" }); return true; }
      if (draft.createdBy === principalId) { send(response, 403, { error: "maker_checker_separation_required" }); return true; }
      if (draft.status !== "PENDING_APPROVAL") { send(response, 409, { error: "draft_already_reviewed", status: draft.status }); return true; }
      const body = await readBody(request);
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
      draft.status = reviewMatch[2] === "approve" ? "APPROVED" : "REJECTED";
      draft.reviewedBy = principalId; draft.reviewedAt = new Date().toISOString(); draft.reviewNote = note;
      send(response, 200, { draft, execution: "NOT_EXECUTED", nextStep: "Approved drafts require a separately authorized execution adapter." }); return true;
    }
    send(response, 404, { error: "not_found" }); return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "AGENT_OPERATION_FAILED";
    send(response, errorStatus(message), { error: message }); return true;
  }
}
