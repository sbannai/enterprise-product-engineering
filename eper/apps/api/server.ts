import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { sendApiSuccess, sendApiError, sendApiLegacyJson, resolveApiRequestId } from "./api-response.js";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { executeIntegratedRequirement } from "../../packages/capability-router.js";
import { createCapabilityServices } from "../../packages/capabilities/index.js";
import { LocalizationService, type SupportedLocale, type SupportedCurrency } from "../../packages/localization/localization.js";
import { MarketPriceBookService, type MarketPriceEntry } from "../../packages/pricing/market-price-book.js";
import { WorkflowConfigurationService, WorkflowConfigurationError } from "../../packages/workflows/workflow-configuration.js";
import { ACTION_SIDE_EFFECT_CLASSES, hashActionProposal } from "../../packages/approvals/action-approval-contracts.js";
import type { PostgresActionApprovalStore } from "../../packages/approvals/postgres-action-approval-store.js";
import type { ActionApprovalAuthorizer, ActionApprovalAuthorizationOperation } from "../../packages/approvals/action-approval-authorization.js";
import { PostgresWorkflowRoleDefinitionStore } from "../../packages/workflows/postgres-workflow-role-definition-store.js";
import { PostgresWorkflowActorRoleAssignmentStore } from "../../packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import { WorkflowDefinitionPublisher, WorkflowDefinitionPublishError } from "../../packages/workflows/workflow-definition-publisher.js";
import { PostgresWorkflowExecutionService, WorkflowExecutionError } from "../../packages/workflows/postgres-workflow-execution-service.js";
import { PostgresWorkflowOutboxStore } from "../../packages/workflows/postgres-workflow-outbox-store.js";
import { replayWorkflowOutboxDeadLetter, type WorkflowOutboxReplayContext } from "../../packages/workflows/workflow-outbox-dead-letter-replay.js";
import { AdminConfigurationConflictError, PostgresAdminConfigurationStore, type AdminConfigurationResource } from "../../packages/workflows/postgres-admin-configuration-store.js";
import { PostgresModuleEntitlementService } from "../../packages/workflows/postgres-module-entitlement-service.js";
import { PostgresCommercialTariffAdminStore, CommercialTariffAdminError } from "../../packages/pricing/postgres-commercial-tariff-admin-store.js";
import { adminPricingUiHtml, isAdminPricingUiRequest } from "./admin-pricing-ui.js";
import { wireframesUiHtml, isWireframesUiRequest } from "./wireframes-ui.js";
import { customerPortalPreviewHtml, isCustomerPortalPreviewRequest } from "./customer-portal-preview.js";
import { adminWorkflowUiHtml, isAdminWorkflowUiRequest } from "./admin-workflow-ui.js";
import { workflowOutboxAdminUiHtml, isWorkflowOutboxAdminUiRequest } from "./workflow-outbox-admin-ui.js";
import { adminSupportTicketUiHtml, isAdminSupportTicketUiRequest } from "./admin-support-ticket-ui.js";
import { adminActorApplicationAssignmentUiHtml, isAdminActorApplicationAssignmentUiRequest } from "./admin-actor-application-assignment-ui.js";
import type { PostgresTenantApplicationAssignmentStore } from "../../packages/identity/postgres-tenant-application-assignment-store.js";
import type { PostgresCustomerIdentitySessionStore } from "../../packages/identity/postgres-customer-identity-session-store.js";
import type { ProviderNeutralOidcClient } from "../../packages/identity/provider-neutral-oidc-client.js";
import { completeCustomerOidcBrowserLogin } from "../../packages/identity/customer-oidc-callback.js";
import { normalizeCustomerReturnPath, readCustomerOidcReturnPath, serializeCustomerOidcReturnCookie, serializeClearedCustomerOidcReturnCookie, serializeCustomerOidcStateCookie, serializeClearedCustomerOidcStateCookie } from "../../packages/identity/customer-oidc-browser-flow.js";
import { CUSTOMER_SESSION_COOKIE, createCustomerCsrfToken, serializeCustomerSessionCookie, serializeCustomerCsrfCookie, serializeClearedCustomerCookies } from "../../packages/identity/customer-browser-security.js";
import { resolveCustomerBrowserIdentity } from "../../packages/identity/customer-browser-session-authorization.js";
import { parseCookieHeader, verifyCustomerBrowserCsrf } from "../../packages/identity/customer-browser-security.js";
import { handlePaymentRoute, paymentTenantIdentityConfigured } from "./payments.js";
import { aiIntegrationsAdminHtml, isAiIntegrationsAdminRequest } from "./ai-integrations-admin-ui.js";
import type { TrustedInvoiceAmountSource } from "../../packages/payments/invoice-amount-authority.js";
import type { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import type { TrustedReceiptNumberSource } from "./payments.js";
import type { TrustedTransactionSnapshotSource } from "../../packages/payments/transaction-receipt-contract.js";
import { requirementBindings } from "../../packages/requirements/registry.js";
import { handleAgentRoute, type AgentAuditWriter, type AgentDraftStore } from "../../packages/agents/agent-workflows.js";
import { PostgresAgentStore, type AgentSqlPool } from "../../packages/agents/postgres-agent-store.js";
import { handleAgentJobRoute } from "./agent-job-routes.js";
import { appendAuditEvent, type AuditSqlPool } from "../../packages/audit/audit-event-store.js";
import { renderAgentConsole } from "./agent-console.js";
import { renderAgentToolsConfiguration } from "./agent-tools-config.js";
import { renderCampaignSchedulerConsole } from "./campaign-scheduler-ui.js";
import { validateCreateTicketInput, TICKET_STATUSES, TICKET_SEVERITIES, TICKET_TYPES } from "../../packages/ticketing/ticketing-contract.js";
import type { PostgresTicketStore } from "../../packages/ticketing/postgres-ticket-store.js";
import type { PostgresActorApplicationAssignmentStore } from "../../packages/identity/postgres-actor-application-assignment-store.js";
import type { PostgresCampaignSchedulerStore } from "../../packages/campaign-scheduler/postgres-campaign-scheduler-store.js";
import type { IntegrationPort } from "../../packages/integration/index.js";
import { createStorageDownloadAdapter } from "../../packages/assets/storage-download-adapter.js";


function acceptsVersionedJson(request: IncomingMessage): boolean {
  return (request.headers.accept ?? "").split(",").some((value) => {
    const [mediaType, ...parameters] = value.split(";");
    if (mediaType.trim().toLowerCase() !== "application/vnd.eper.v1+json") return false;
    const qualityParameter = parameters.map((parameter) => parameter.trim())
      .find((parameter) => /^q\s*=/i.test(parameter));
    if (!qualityParameter) return true;
    const quality = Number(qualityParameter.split("=")[1]?.trim());
    return Number.isFinite(quality) && quality > 0 && quality <= 1;
  });
}

function sendJson(request: IncomingMessage, response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  // A positively weighted versioned Accept value opts into the complete JSON envelope.
  // Without it, legacy bodies stay byte-shape compatible for existing consumers.
  const acceptsV1 = acceptsVersionedJson(request);

  if (acceptsV1 && statusCode >= 400 && statusCode <= 599) {
    const legacyCode = typeof body.error === "string" ? body.error : "request_failed";
    const normalizedCode = legacyCode.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
    const code = /^[A-Z][A-Z0-9_]{1,63}$/.test(normalizedCode) ? normalizedCode : "REQUEST_FAILED";
    const message = statusCode >= 500 ? "The service could not complete the request."
      : statusCode === 401 ? "Authentication is required."
      : statusCode === 403 ? "You are not allowed to perform this action."
      : statusCode === 404 ? "The requested resource was not found."
      : statusCode === 409 ? "The request conflicts with the current resource state."
      : statusCode === 429 ? "Too many requests. Try again later."
      : "The request could not be completed.";
    sendApiError(request, response, statusCode, code, message);
    return;
  }

  if (acceptsV1 && statusCode >= 200 && statusCode < 300) {
    // 204/205 are bodyless by HTTP contract; all other success payloads become data.
    sendApiSuccess(request, response, statusCode, statusCode === 204 || statusCode === 205 ? {} : body);
    return;
  }

  sendApiLegacyJson(request, response, statusCode, body);
}



function sendMethodNotAllowed(request: IncomingMessage, response: ServerResponse, allow: string): void {
  const acceptsV1 = acceptsVersionedJson(request);
  if (acceptsV1) {
    response.setHeader("allow", allow);
    sendJson(request, response, 405, { error: "method_not_allowed" });
    return;
  }
  response.writeHead(405, {
    allow,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": resolveApiRequestId(request),
  });
  response.end();
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON_OBJECT_REQUIRED");
  }
  return parsed as Record<string, unknown>;
}

function bearerMatches(request: IncomingMessage, expected: string): boolean {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) return false;
  const provided = Buffer.from(match[1], "utf8");
  const secret = Buffer.from(expected, "utf8");
  return provided.length === secret.length && timingSafeEqual(provided, secret);
}



interface TrustedCustomerAccessIdentity {
  tenantId: string;
  actorId: string;
  roleKey: string;
  /** Optional in the shared identity resolver; customer application routes fail closed without it. */
  applicationIds?: string[];
}

interface TrustedAgentJobIdentity extends TrustedCustomerAccessIdentity {
  applicationIds: string[];
}

/** Resolve customer identity only from server-side credential mapping; never from request JSON. */
function resolveCustomerAccessIdentity(request: IncomingMessage): TrustedCustomerAccessIdentity | null {
  const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? "");
  if (!match) return null;
  const supplied = Buffer.from(match[1], "utf8");
  let mapping: unknown;
  try { mapping = JSON.parse(process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON ?? ""); } catch { return null; }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
  for (const [credential, identity] of Object.entries(mapping as Record<string, unknown>)) {
    const expected = Buffer.from(credential, "utf8");
    if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) continue;
    if (!identity || typeof identity !== "object" || Array.isArray(identity)) return null;
    const record = identity as Record<string, unknown>;
    if (typeof record.tenantId !== "string" || !record.tenantId.trim() || record.tenantId !== record.tenantId.trim() || record.tenantId.length > 128 ||
        typeof record.actorId !== "string" || !record.actorId.trim() || record.actorId !== record.actorId.trim() || record.actorId.length > 128 ||
        typeof record.roleKey !== "string" || !record.roleKey.trim() || record.roleKey !== record.roleKey.trim() || record.roleKey.length > 128) return null;
    const rawApplicationIds = record.applicationIds;
    const applicationIds = Array.isArray(rawApplicationIds) &&
      rawApplicationIds.length > 0 &&
      rawApplicationIds.every((id) => typeof id === "string" && /^[a-zA-Z0-9._-]{2,100}$/.test(id))
      ? [...new Set(rawApplicationIds as string[])]
      : undefined;
    return { tenantId: record.tenantId, actorId: record.actorId, roleKey: record.roleKey, applicationIds };
  }
  return null;
}

/** Agent job access additionally requires an explicit server-side application assignment. */
function resolveAgentJobIdentity(request: IncomingMessage): TrustedAgentJobIdentity | null {
  const base = resolveCustomerAccessIdentity(request);
  if (!base) return null;
  const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? "");
  if (!match) return null;
  let mapping: unknown;
  try { mapping = JSON.parse(process.env.EPER_CUSTOMER_ACCESS_IDENTITIES_JSON ?? ""); } catch { return null; }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
  const supplied = Buffer.from(match[1], "utf8");
  for (const [credential, identity] of Object.entries(mapping as Record<string, unknown>)) {
    const expected = Buffer.from(credential, "utf8");
    if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) continue;
    if (!identity || typeof identity !== "object" || Array.isArray(identity)) return null;
    const applications = (identity as Record<string, unknown>).applicationIds;
    if (Array.isArray(applications) && applications.length > 0 &&
        applications.every((id) => typeof id === "string" && /^[a-zA-Z0-9._-]{2,100}$/.test(id))) {
      return { ...base, applicationIds: [...new Set(applications as string[])] };
    }
    // In durable assignment mode, application membership is resolved from PostgreSQL per request.
    if (process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE === "postgres") return { ...base, applicationIds: [] };
    return null;
  }
  return null;
}

export type CustomerAssetDownloadRequest = { tenantId: string; actorId: string; applicationId: string; assetId: string; accessReference: string; fileName: string; mimeType?: string };
export type CustomerAssetDownloadResolver = (input: CustomerAssetDownloadRequest, requestId: string) => Promise<{ url: string; expiresAt: string } | null>;
export type CustomerAssetAuditRecord = { tenantId: string; actorId: string; action: "customer.asset.download"; outcome: "success" | "denied" | "failure"; applicationId: string; assetId: string; requestId: string };
export type CustomerAssetAuditWriter = (record: CustomerAssetAuditRecord) => Promise<void>;

interface TrustedAdminConfigIdentity {
  tenantId: string;
  actorId: string;
  roleKey?: string;
}

/** Maps individual bearer credentials to trusted tenant/actor identities configured server-side. */
function resolveAdminConfigIdentity(request: IncomingMessage): TrustedAdminConfigIdentity | null {
  const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? "");
  if (!match) return null;
  const supplied = Buffer.from(match[1], "utf8");
  const raw = process.env.EPER_ADMIN_CONFIG_IDENTITIES_JSON ?? "";
  let mapping: unknown;
  try { mapping = JSON.parse(raw); } catch { return null; }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
  for (const [credential, identity] of Object.entries(mapping as Record<string, unknown>)) {
    const expected = Buffer.from(credential, "utf8");
    if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) continue;
    if (!identity || typeof identity !== "object" || Array.isArray(identity)) return null;
    const record = identity as Record<string, unknown>;
    if (typeof record.tenantId !== "string" || !record.tenantId.trim() || record.tenantId.length > 128 ||
        typeof record.actorId !== "string" || !record.actorId.trim() || record.actorId.length > 128) return null;
    return { tenantId: record.tenantId, actorId: record.actorId, ...(typeof record.roleKey === "string" ? { roleKey: record.roleKey } : {}) };
  }
  return null;
}

async function handleDurableAdminConfig(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  store: PostgresAdminConfigurationStore,
  identity: TrustedAdminConfigIdentity,
  environment: "production" | "uat" | "sandbox",
  serviceVersion?: string,
  initialPriceEntries: MarketPriceEntry[] = [],
): Promise<void> {
  const correlationId = resolveApiRequestId(request);
  const loadedConfigVersions = new Map<AdminConfigurationResource, number>();
  const getConfig = async (resource: AdminConfigurationResource) => {
    const saved = await store.get(identity.tenantId, resource);
    loadedConfigVersions.set(resource, saved?.version ?? 0);
    return saved;
  };
  const saveConfig = async (resourceType: AdminConfigurationResource, config: unknown, expectedVersion: unknown) => {
    if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0) {
      throw new Error("ADMIN_CONFIGURATION_EXPECTED_VERSION_REQUIRED");
    }
    const relatedResourceType: AdminConfigurationResource | undefined =
      resourceType === "workflows" ? "roles-access" :
      resourceType === "roles-access" ? "workflows" : undefined;
    return store.replace({
      tenantId: identity.tenantId, actorId: identity.actorId, resourceType, config,
      expectedVersion: Number(expectedVersion), correlationId, environment, serviceVersion,
      ...(relatedResourceType ? {
        relatedResourceType,
        // Compare the exact snapshot used by validation against the version in the write transaction.
        expectedRelatedVersion: loadedConfigVersions.get(relatedResourceType) ?? 0,
      } : {}),
    });
  };
  const loadWorkflowService = async (needWorkflows = true): Promise<WorkflowConfigurationService> => {
    const service = new WorkflowConfigurationService();
    const roles = await getConfig("roles-access");
    if (roles) service.replaceRoles(roles.config);
    if (needWorkflows) {
      const workflows = await getConfig("workflows");
      if (workflows) service.replaceWorkflows(workflows.config);
    }
    return service;
  };

  if (path === "/admin/config/workflows" && request.method === "GET") {
    const saved = await getConfig("workflows");
    sendJson(request, response, 200, { workflows: saved?.config ?? [], version: saved?.version ?? 0, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/workflows" && request.method === "PUT") {
    const body = await readJson(request);
    const validator = await loadWorkflowService(false);
    const workflows = validator.replaceWorkflows(body.workflows);
    const saved = await saveConfig("workflows", workflows, body.expectedVersion);
    sendJson(request, response, 200, { workflows: saved.config, version: saved.version, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/roles-access" && request.method === "GET") {
    const saved = await getConfig("roles-access");
    sendJson(request, response, 200, { roles: saved?.config ?? [], version: saved?.version ?? 0, availablePermissions: WorkflowConfigurationService.PERMISSIONS, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/roles-access" && request.method === "PUT") {
    const body = await readJson(request);
    const validator = await loadWorkflowService(true);
    const roles = validator.replaceRoles(body.roles);
    const saved = await saveConfig("roles-access", roles, body.expectedVersion);
    sendJson(request, response, 200, { roles: saved.config, version: saved.version, availablePermissions: WorkflowConfigurationService.PERMISSIONS, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/access-check" && request.method === "POST") {
    const body = await readJson(request);
    if (typeof body.principalId !== "string" || !body.principalId.trim() || body.principalId.length > 128 ||
        typeof body.permission !== "string" ||
        !(WorkflowConfigurationService.PERMISSIONS as readonly string[]).includes(body.permission) ||
        (body.workflowId !== undefined && (typeof body.workflowId !== "string" || body.workflowId.length > 128))) {
      sendJson(request, response, 400, { error: "principalId_and_supported_permission_required" });
      return;
    }
    const validator = await loadWorkflowService(true);
    sendJson(request, response, 200, { ...validator.checkAccess(
      body.principalId,
      body.permission as import("../../packages/workflows/workflow-configuration.js").WorkflowPermission,
      body.workflowId as string | undefined,
    ) });
    return;
  }
  if (path === "/admin/config/price-book" && request.method === "GET") {
    const saved = await getConfig("price-book");
    sendJson(request, response, 200, { entries: saved?.config ?? initialPriceEntries, version: saved?.version ?? 0, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/price-book" && request.method === "PUT") {
    const body = await readJson(request);
    const candidate = body.entry;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      sendJson(request, response, 400, { error: "entry_object_required" });
      return;
    }
    const savedBefore = await getConfig("price-book");
    const entries = (savedBefore?.config ?? initialPriceEntries) as MarketPriceEntry[];
    const entry = candidate as MarketPriceEntry;
    const nextEntries = entries.filter((current) =>
      !(current.productId === entry.productId && current.marketId === entry.marketId &&
        current.priceBookId === entry.priceBookId && current.priceBookVersion === entry.priceBookVersion));
    if (nextEntries.length >= 10_000) throw new Error("MARKET_PRICE_BOOK_CAPACITY_EXCEEDED");
    nextEntries.push(entry);
    const nextService = new MarketPriceBookService(nextEntries);
    void nextService;
    const saved = await saveConfig("price-book", nextEntries, body.expectedVersion);
    sendJson(request, response, 200, { entries: saved.config, version: saved.version, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/payment-vendor" && request.method === "GET") {
    const saved = await getConfig("payment-vendor");
    const config = (saved?.config ?? {
      provider: process.env.EPER_PAYMENT_PROVIDER ?? "sandbox",
      mode: "sandbox",
      sandboxEnabled: process.env.EPER_PAYMENT_SANDBOX_ENABLED === "true",
    }) as { provider: string; mode: string; sandboxEnabled: boolean };
    const provider = config.provider;
    const providerKeyConfigured = provider === "razorpay"
      ? Boolean(process.env.EPER_RAZORPAY_KEY_ID && process.env.EPER_RAZORPAY_KEY_SECRET)
      : provider === "stripe" ? Boolean(process.env.EPER_STRIPE_SECRET_KEY)
      : provider === "adyen" ? Boolean(process.env.EPER_ADYEN_API_KEY && process.env.EPER_ADYEN_MERCHANT_ACCOUNT)
      : Boolean(process.env.EPER_PAYMENT_SANDBOX_TOKEN && process.env.EPER_PAYMENT_SANDBOX_TENANT_ID && process.env.EPER_PAYMENT_SANDBOX_PRINCIPAL_ID);
    const webhookSecretConfigured = provider === "razorpay"
      ? Boolean(process.env.EPER_RAZORPAY_WEBHOOK_SECRET)
      : provider === "stripe" ? Boolean(process.env.EPER_STRIPE_WEBHOOK_SECRET)
      : provider === "adyen" ? Boolean(process.env.EPER_ADYEN_HMAC_KEY) : false;
    sendJson(request, response, 200, {
      ...config, version: saved?.version ?? 0, productionEnabled: false, adapterAvailable: provider === "sandbox",
      credentials: { providerKeyConfigured, webhookSecretConfigured }, persistence: "postgres",
      message: provider === "sandbox" ? "Sandbox adapter selected; no live charges can be made." : "Provider selection is planning-only; no live payment adapter is enabled.",
    });
    return;
  }
  if (path === "/admin/config/ai-integrations" && request.method === "GET") {
    const saved = await getConfig("ai-integrations");
    sendJson(request, response, 200, { config: saved?.config ?? { applications: {} }, version: saved?.version ?? 0, persistence: "postgres" });
    return;
  }
  if (path === "/admin/config/ai-integrations" && request.method === "PUT") {
    const body = await readJson(request);
    const candidate = body.config;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      sendJson(request, response, 400, { error: "ai_integrations_config_invalid" }); return;
    }
    const candidateRecord = candidate as Record<string, unknown>;
    const applicationConfig = candidateRecord.applications;
    if (!applicationConfig || typeof applicationConfig !== "object" || Array.isArray(applicationConfig)) {
      sendJson(request, response, 400, { error: "ai_integrations_config_invalid" }); return;
    }
    const applications = applicationConfig as Record<string, unknown>;
    if (Object.keys(applications).length > 500) { sendJson(request, response, 400, { error: "ai_integrations_application_limit_exceeded" }); return; }
    const normalized: Record<string, { enabled: boolean; provider: string }> = {};
    for (const [applicationId, raw] of Object.entries(applications)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(applicationId) || !raw || typeof raw !== "object" || Array.isArray(raw)) {
        sendJson(request, response, 400, { error: "ai_integrations_application_invalid" }); return;
      }
      const setting = raw as Record<string, unknown>;
      const providers = ["none", "openai", "azure-openai", "google", "anthropic", "provider-neutral"];
      if (typeof setting.enabled !== "boolean" || typeof setting.provider !== "string" || !providers.includes(setting.provider) ||
          (setting.enabled && setting.provider === "none")) {
        sendJson(request, response, 400, { error: "ai_integrations_setting_invalid" }); return;
      }
      normalized[applicationId] = { enabled: setting.enabled, provider: setting.enabled ? setting.provider : "none" };
    }
    const saved = await saveConfig("ai-integrations", { applications: normalized }, body.expectedVersion);
    sendJson(request, response, 200, { config: saved.config, version: saved.version, persistence: "postgres" });
    return;
  }
  if (path === "/admin/config/payment-vendor" && request.method === "PUT") {
    const body = await readJson(request);
    const allowedProviders = ["sandbox", "razorpay", "stripe", "adyen"];
    if (typeof body.provider !== "string" || !allowedProviders.includes(body.provider) ||
        body.mode !== "sandbox" || typeof body.sandboxEnabled !== "boolean") {
      sendJson(request, response, 400, { error: "provider must be supported; mode must remain sandbox; sandboxEnabled must be boolean" });
      return;
    }
    const config = {
      provider: body.provider, mode: "sandbox",
      sandboxEnabled: body.sandboxEnabled && body.provider === "sandbox" && process.env.EPER_PAYMENT_SANDBOX_ENABLED === "true",
    };
    const saved = await saveConfig("payment-vendor", config, body.expectedVersion);
    sendJson(request, response, 200, { ...config, version: saved.version, productionEnabled: false, adapterAvailable: config.provider === "sandbox", persistence: "postgres", message: config.provider === "sandbox" ? "Sandbox configuration updated; server-side sandbox opt-in and tenant settings are still required." : "Provider selection is planning-only; no live adapter is enabled." });
    return;
  }
  sendMethodNotAllowed(request, response, path === "/admin/config/access-check" ? "POST" : "GET, PUT");
}

/**
 * Health endpoint plus an explicitly opt-in local capability execution route.
 * The local route is disabled by default and is not a production identity system.
 * Do not enable it on a publicly reachable deployment.
 */
function createConfiguredCapabilityServices(postgresPool?: Pool) {
  const persistence = process.env.EPER_CAPABILITY_PERSISTENCE;
  if (persistence === undefined || persistence === "memory") {
    return createCapabilityServices();
  }
  if (persistence === "postgres") {
    if (!postgresPool) throw new Error("EPER_CAPABILITY_POSTGRES_POOL_REQUIRED");
    if (process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
      throw new Error("EPER_CAPABILITY_POSTGRES_REQUIRES_DURABLE_AUDIT");
    }
    return createCapabilityServices({ persistence: "postgres", postgresPool });
  }
  if (persistence !== "json-file") {
    throw new Error("EPER_CAPABILITY_PERSISTENCE_UNSUPPORTED");
  }
  const dataDirectory = process.env.EPER_CAPABILITY_DATA_DIRECTORY;
  if (!dataDirectory?.trim()) {
    throw new Error("EPER_CAPABILITY_DATA_DIRECTORY_REQUIRED");
  }
  return createCapabilityServices({ persistence: "json-file", dataDirectory });
}

export function createAppServer(options: { capabilityPool?: Pool; invoiceAmountSource?: TrustedInvoiceAmountSource; paymentStore?: PostgresPaymentStore; receiptNumberSource?: TrustedReceiptNumberSource; transactionSnapshotSource?: TrustedTransactionSnapshotSource; allowLegacyPaymentLedgerForTests?: boolean; auditWriter?: AgentAuditWriter; agentDraftStore?: AgentDraftStore; assetDownloadResolver?: CustomerAssetDownloadResolver; assetStoragePort?: IntegrationPort<CustomerAssetDownloadRequest, { url: string; expiresAt: string }>; assetAuditWriter?: CustomerAssetAuditWriter; ticketStore?: PostgresTicketStore; actorApplicationAssignmentStore?: PostgresActorApplicationAssignmentStore; tenantApplicationAssignmentStore?: PostgresTenantApplicationAssignmentStore; customerIdentitySessionStore?: PostgresCustomerIdentitySessionStore; customerOidcClient?: ProviderNeutralOidcClient; customerOidcPublicOrigin?: string; customerCsrfSecret?: string; adminConfigurationStore?: PostgresAdminConfigurationStore; commercialTariffAdminStore?: PostgresCommercialTariffAdminStore; moduleEntitlementService?: PostgresModuleEntitlementService; adminConfigEnvironment?: "production" | "uat" | "sandbox"; serviceVersion?: string; campaignSchedulerStore?: PostgresCampaignSchedulerStore; workflowRoleDefinitionStore?: PostgresWorkflowRoleDefinitionStore; workflowActorRoleAssignmentStore?: PostgresWorkflowActorRoleAssignmentStore; workflowDefinitionPublisher?: WorkflowDefinitionPublisher; workflowExecutionService?: PostgresWorkflowExecutionService; workflowOutboxStore?: Pick<PostgresWorkflowOutboxStore, "listDeadLetters">; workflowOutboxReplay?: typeof replayWorkflowOutboxDeadLetter; actionApprovalStore?: PostgresActionApprovalStore; actionApprovalAuthorizer?: ActionApprovalAuthorizer } = {}): Server {
  // Durable mode must never fall back to credential-embedded applicationIds.
  // main.ts wires and readiness-checks this store; keep the API factory fail-closed
  // as well for tests, alternate entry points, and future embedding scenarios.
  if (process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE === "postgres" && !options.customerIdentitySessionStore) {
    throw new Error("CUSTOMER_IDENTITY_SESSION_STORE_REQUIRED_IN_POSTGRES_MODE");
  }
  if (process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE === "postgres" &&
      (!options.tenantApplicationAssignmentStore || !options.actorApplicationAssignmentStore)) {
    throw new Error("CUSTOMER_IDENTITY_REQUIRES_DURABLE_TENANT_AND_ACTOR_APPLICATION_ASSIGNMENT_STORES");
  }
  if (process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE === "postgres") {
    if (!options.actorApplicationAssignmentStore) {
      throw new Error("CUSTOMER_ACTOR_ASSIGNMENT_STORE_REQUIRED_IN_POSTGRES_MODE");
    }
    if (!options.tenantApplicationAssignmentStore) {
      throw new Error("TENANT_APPLICATION_ASSIGNMENT_STORE_REQUIRED_IN_POSTGRES_MODE");
    }
  }
  if (process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED === "true" &&
      (!options.workflowRoleDefinitionStore || !options.workflowActorRoleAssignmentStore ||
       !options.workflowDefinitionPublisher || !options.workflowExecutionService ||
       !options.tenantApplicationAssignmentStore)) {
    throw new Error("WORKFLOW_EXECUTION_SERVICES_REQUIRED_WHEN_ENABLED");
  }
  if (process.env.EPER_ACTION_APPROVAL_API_ENABLED === "true" &&
      (process.env.EPER_ACTION_APPROVAL_PERSISTENCE !== "postgres" ||
       process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
       process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
       process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres" ||
       process.env.EPER_AUDIT_PERSISTENCE !== "postgres" ||
       !options.actionApprovalStore || !options.actionApprovalAuthorizer ||
       !options.tenantApplicationAssignmentStore || !options.actorApplicationAssignmentStore)) {
    throw new Error("ACTION_APPROVAL_API_REQUIRES_POSTGRES_AUDIT_ASSIGNMENTS_AND_HOST_AUTHORIZER");
  }
  const services = createConfiguredCapabilityServices(options.capabilityPool);
  const localizationService = new LocalizationService();
  const rawPriceBook = process.env.EPER_MARKET_PRICE_BOOK_JSON;
  let marketPriceEntries: MarketPriceEntry[] = [];
  if (rawPriceBook !== undefined) {
    const parsed: unknown = JSON.parse(rawPriceBook);
    if (!Array.isArray(parsed)) throw new Error("MARKET_PRICE_BOOK_JSON_ARRAY_REQUIRED");
    if (parsed.length > 10_000) throw new Error("MARKET_PRICE_BOOK_CAPACITY_EXCEEDED");
    marketPriceEntries = parsed as MarketPriceEntry[];
  }
  let marketPriceBook = new MarketPriceBookService(marketPriceEntries);
  let paymentVendorConfig = {
    provider: process.env.EPER_PAYMENT_PROVIDER ?? "sandbox",
    mode: "sandbox",
    sandboxEnabled: process.env.EPER_PAYMENT_SANDBOX_ENABLED === "true",
  };
  const workflowConfig = new WorkflowConfigurationService();
  let configuredAssetStorageHosts: string[] = [];
  try {
    const parsedHosts: unknown = JSON.parse(process.env.EPER_ASSET_STORAGE_ALLOWED_HOSTS_JSON ?? "null");
    if (Array.isArray(parsedHosts) && parsedHosts.every((host) => typeof host === "string" && host.trim() === host && host.length > 0)) {
      configuredAssetStorageHosts = parsedHosts;
    }
  } catch {
    configuredAssetStorageHosts = [];
  }
  const assetDownloadResolver: CustomerAssetDownloadResolver | undefined = options.assetDownloadResolver ?? (
    options.assetStoragePort && configuredAssetStorageHosts.length > 0
      ? createStorageDownloadAdapter(options.assetStoragePort, { allowedHosts: configuredAssetStorageHosts })
      : undefined
  );
  const assetAuditWriter: CustomerAssetAuditWriter | undefined = options.assetAuditWriter ?? (
    process.env.EPER_AUDIT_PERSISTENCE === "postgres" && options.capabilityPool
      ? async (record) => {
          const configuredEnvironment = process.env.EPER_AUDIT_ENVIRONMENT;
          if (configuredEnvironment !== "production" && configuredEnvironment !== "uat" && configuredEnvironment !== "sandbox") {
            throw new Error("EPER_AUDIT_ENVIRONMENT_REQUIRED");
          }
          await appendAuditEvent(options.capabilityPool as unknown as AuditSqlPool, {
            tenantId: record.tenantId,
            applicationId: record.applicationId,
            environment: configuredEnvironment,
            actorType: "human",
            actorId: record.actorId,
            action: record.action,
            outcome: record.outcome,
            reasonCode: record.outcome === "denied" ? "ASSET_ACCESS_DENIED" : record.outcome === "failure" ? "ASSET_DOWNLOAD_FAILED" : undefined,
            resourceType: "client-asset",
            resourceId: record.assetId,
            operationId: record.requestId,
            requestId: record.requestId,
            source: "api",
            operationName: "customer.asset.download",
            serviceVersion: process.env.EPER_BUILD_ID,
            payload: { applicationId: record.applicationId },
          });
        }
      : undefined
  );

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    const oidcStore = options.customerIdentitySessionStore;
    const oidcEnabled = process.env.EPER_CUSTOMER_OIDC_ENABLED === "true";
    if (requestUrl.pathname === "/customer/auth/oidc/start" && request.method === "GET") {
      if (!oidcEnabled || !options.customerOidcClient || !oidcStore || !options.customerOidcPublicOrigin) {
        sendApiError(request, response, 503, "CUSTOMER_OIDC_UNAVAILABLE", "Customer login is not configured."); return;
      }
      try {
        const login = await options.customerOidcClient.beginLogin(oidcStore);
        const returnCookie = serializeCustomerOidcReturnCookie(requestUrl.searchParams.get("returnTo") ?? undefined, options.customerOidcPublicOrigin);
        response.writeHead(302, { location: login.authorizationUrl, "cache-control": "no-store",
          "set-cookie": [serializeCustomerOidcStateCookie(login.state), returnCookie] });
        response.end(); return;
      } catch {
        sendApiError(request, response, 503, "CUSTOMER_OIDC_START_FAILED", "Customer login could not be started."); return;
      }
    }
    if (requestUrl.pathname === "/customer/auth/oidc/callback" && request.method === "GET") {
      if (!oidcEnabled || !options.customerOidcClient || !oidcStore || !options.customerOidcPublicOrigin || !options.customerCsrfSecret) {
        sendApiError(request, response, 503, "CUSTOMER_OIDC_UNAVAILABLE", "Customer login is not configured."); return;
      }
      const code = requestUrl.searchParams.get("code") ?? "";
      const state = requestUrl.searchParams.get("state") ?? "";
      try {
        const login = await completeCustomerOidcBrowserLogin({ client: options.customerOidcClient, store: oidcStore,
          cookieHeader: request.headers.cookie, code, state, correlationId: resolveApiRequestId(request) });
        const csrf = createCustomerCsrfToken(login.sessionToken, options.customerCsrfSecret);
        const returnPath = readCustomerOidcReturnPath(request.headers.cookie, options.customerOidcPublicOrigin);
        response.writeHead(302, { location: normalizeCustomerReturnPath(returnPath, options.customerOidcPublicOrigin), "cache-control": "no-store",
          "set-cookie": [serializeCustomerSessionCookie(login.sessionToken, 8 * 60 * 60), serializeCustomerCsrfCookie(csrf, 8 * 60 * 60),
            serializeClearedCustomerOidcStateCookie(), serializeClearedCustomerOidcReturnCookie()] });
        response.end(); return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const safeCode = /^EPER_[A-Z0-9_]{3,100}$/.test(message) ? message : "CUSTOMER_OIDC_CALLBACK_FAILED";
        response.writeHead(302, { location: "/?authentication_error=" + encodeURIComponent(safeCode), "cache-control": "no-store",
          "set-cookie": [serializeClearedCustomerOidcStateCookie(), serializeClearedCustomerOidcReturnCookie()] });
        response.end(); return;
      }
    }
    if (requestUrl.pathname === "/customer/auth/logout" && request.method === "POST") {
      if (!oidcEnabled || !oidcStore || !options.customerOidcPublicOrigin || !options.customerCsrfSecret) {
        sendApiError(request, response, 503, "CUSTOMER_OIDC_UNAVAILABLE", "Customer login is not configured."); return;
      }
      const cookies = parseCookieHeader(request.headers.cookie);
      const sessionToken = cookies.get(CUSTOMER_SESSION_COOKIE);
      if (!sessionToken) {
        response.writeHead(204, { "set-cookie": serializeClearedCustomerCookies(), "cache-control": "no-store" }); response.end(); return;
      }
      if (!verifyCustomerBrowserCsrf({ method: request.method, origin: request.headers.origin, expectedOrigin: options.customerOidcPublicOrigin,
        cookieHeader: request.headers.cookie, csrfHeader: typeof request.headers["x-csrf-token"] === "string" ? request.headers["x-csrf-token"] : undefined, sessionToken, secret: options.customerCsrfSecret })) {
        sendApiError(request, response, 403, "CSRF_VALIDATION_FAILED", "The logout request could not be validated."); return;
      }
      try {
        await oidcStore.revokeSession(sessionToken, "user_logout", resolveApiRequestId(request));
        response.writeHead(204, { "set-cookie": serializeClearedCustomerCookies(), "cache-control": "no-store" }); response.end(); return;
      } catch {
        sendApiError(request, response, 503, "CUSTOMER_LOGOUT_FAILED", "The session could not be revoked."); return;
      }
    }

    const workflowRoleCollection = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflow-roles$/.exec(requestUrl.pathname);
    const workflowRoleDetail = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflow-roles\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(requestUrl.pathname);
    const workflowRoleAssignments = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflow-role-assignments$/.exec(requestUrl.pathname);
    const workflowPublishRoute = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflows\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/publish$/.exec(requestUrl.pathname);
    const workflowStartRoute = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflows\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/instances$/.exec(requestUrl.pathname);
    const workflowTransitionRoute = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflow-instances\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/transitions$/i.exec(requestUrl.pathname);
    const workflowOutboxDeadLetters = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflow-outbox\/dead-letters$/.exec(requestUrl.pathname);
    const workflowOutboxReplayRoute = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/workflow-outbox\/dead-letters\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/replay$/i.exec(requestUrl.pathname);
    const actionProposalCollection = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/action-proposals$/.exec(requestUrl.pathname);
    const actionProposalDetail = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/action-proposals\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(requestUrl.pathname);
    const actionProposalDecisions = /^\/admin\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/action-proposals\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/decisions$/.exec(requestUrl.pathname);

    const workflowError = (error: unknown): void => {
      const message = error instanceof Error ? error.message : "WORKFLOW_OPERATION_FAILED";
      if (error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED") {
        sendApiError(request, response, 400, "INVALID_JSON_BODY", "A valid JSON object is required."); return;
      }
      if (message === "REQUEST_BODY_TOO_LARGE") {
        sendApiError(request, response, 413, "REQUEST_BODY_TOO_LARGE", "The request body is too large."); return;
      }
      if (error instanceof WorkflowExecutionError || error instanceof WorkflowDefinitionPublishError) {
        sendApiError(request, response, error.statusCode, error.code, "The workflow operation could not be completed.");
        return;
      }
      const conflict = /VERSION_CONFLICT|IDEMPOTENCY_CONFLICT/.test(message);
      const notFound = /NOT_FOUND/.test(message);
      const forbidden = /NOT_ACTIVE|PERMISSION_DENIED/.test(message);
      const invalid = /INVALID|REQUIRED/.test(message);
      const status = conflict ? 409 : notFound ? 404 : forbidden ? 403 : invalid ? 400 : 503;
      const code = message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "WORKFLOW_OPERATION_FAILED";
      sendApiError(request, response, status, code, "The workflow operation could not be completed.");
    };
    const allowedBodyKeys = (body: Record<string, unknown>, allowed: string[]): boolean =>
      Object.keys(body).every(key => allowed.includes(key));

    if (actionProposalCollection || actionProposalDetail || actionProposalDecisions) {
      if (process.env.EPER_ACTION_APPROVAL_API_ENABLED !== "true" ||
          process.env.EPER_ACTION_APPROVAL_PERSISTENCE !== "postgres" ||
          process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
          process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres" ||
          process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveAdminConfigIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      const store = options.actionApprovalStore;
      const authorizer = options.actionApprovalAuthorizer;
      if (!store || !authorizer || !options.tenantApplicationAssignmentStore || !options.actorApplicationAssignmentStore) {
        sendApiError(request, response, 503, "ACTION_APPROVAL_UNAVAILABLE", "Action approval is not configured."); return;
      }
      const applicationId = (actionProposalCollection ?? actionProposalDetail ?? actionProposalDecisions)![1];
      const proposalId = actionProposalDetail?.[2] ?? actionProposalDecisions?.[2];
      const environment = options.adminConfigEnvironment ?? "sandbox";
      const correlationId = resolveApiRequestId(request);
      const auditContext = {
        tenantId: identity.tenantId, applicationId, actorId: identity.actorId, actorType: "human" as const,
        environment, source: "api" as const, operationName: "action-approval.api",
        correlationId, serviceVersion: options.serviceVersion,
      };
      const authorize = async (
        operation: ActionApprovalAuthorizationOperation,
        proposal?: { proposalId?: string; proposalVersion?: number; proposalHash?: string; approvalId?: string; actionType?: string; sideEffectClass?: string; targetType?: string; targetId?: string },
      ) => authorizer({
        tenantId: identity.tenantId, applicationId, actorId: identity.actorId, operation,
        ...(proposal ? proposal : {}),
      });
      try {
        const activeApplications = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
        if (!activeApplications.includes(applicationId)) {
          sendApiError(request, response, 404, "APPLICATION_NOT_FOUND", "The application was not found."); return;
        }
        if (!(await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId))) {
          sendApiError(request, response, 403, "ADMIN_NOT_ASSIGNED_TO_APPLICATION", "The administrator is not assigned to this application."); return;
        }

        if (actionProposalCollection && request.method === "GET") {
          const permission = await authorize("view_queue");
          if (!permission.allowed) { sendApiError(request, response, 403, "ACTION_APPROVAL_ACCESS_DENIED", "You are not allowed to view this approval queue."); return; }
          const rawLimit = requestUrl.searchParams.get("limit");
          const limit = rawLimit === null ? 50 : Number(rawLimit);
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            sendApiError(request, response, 400, "ACTION_PROPOSAL_LIST_LIMIT_INVALID", "The queue limit must be between 1 and 100."); return;
          }
          const proposals = await store.listProposals({ tenantId: identity.tenantId, applicationId }, limit);
          sendApiSuccess(request, response, 200, { proposals }); return;
        }

        if (actionProposalCollection && request.method === "POST") {
          const body = await readJson(request);
          if (!allowedBodyKeys(body, ["actionType", "sideEffectClass", "targetType", "targetId", "payload", "idempotencyKey"])) {
            sendApiError(request, response, 400, "INVALID_ACTION_PROPOSAL_BODY", "Only action, target, payload and idempotency fields are accepted."); return;
          }
          if (typeof body.actionType !== "string" || !body.actionType.trim() || body.actionType !== body.actionType.trim() ||
              typeof body.sideEffectClass !== "string" || !ACTION_SIDE_EFFECT_CLASSES.includes(body.sideEffectClass as typeof ACTION_SIDE_EFFECT_CLASSES[number]) ||
              typeof body.targetType !== "string" || !body.targetType.trim() || body.targetType !== body.targetType.trim() ||
              typeof body.targetId !== "string" || !body.targetId.trim() || body.targetId !== body.targetId.trim() ||
              !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload) ||
              typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 16 || body.idempotencyKey !== body.idempotencyKey.trim() || body.idempotencyKey.length > 128) {
            sendApiError(request, response, 400, "ACTION_PROPOSAL_INVALID", "The action proposal fields are invalid."); return;
          }
          const permission = await authorize("create_proposal", {
            actionType: body.actionType, sideEffectClass: body.sideEffectClass,
            targetType: body.targetType, targetId: body.targetId,
          });
          if (!permission.allowed) { sendApiError(request, response, 403, "ACTION_PROPOSAL_CREATE_DENIED", "You are not allowed to create this action proposal."); return; }
          if (!permission.proposalExpiresAt || !Number.isFinite(Date.parse(permission.proposalExpiresAt)) ||
              new Date(Date.parse(permission.proposalExpiresAt)).toISOString() !== permission.proposalExpiresAt ||
              Date.parse(permission.proposalExpiresAt) <= Date.now()) {
            sendApiError(request, response, 503, "ACTION_APPROVAL_POLICY_INCOMPLETE", "The host approval policy did not supply a valid proposal expiry."); return;
          }
          const envelope = {
            proposalId: randomUUID(), proposalVersion: 1, tenantId: identity.tenantId, applicationId,
            actionType: body.actionType, sideEffectClass: body.sideEffectClass as typeof ACTION_SIDE_EFFECT_CLASSES[number],
            targetType: body.targetType, targetId: body.targetId, requestedBy: identity.actorId,
            requesterType: "human" as const, payload: body.payload as Record<string, unknown>,
            idempotencyKey: body.idempotencyKey, createdAt: new Date().toISOString(),
            expiresAt: permission.proposalExpiresAt, correlationId,
          };
          const proposal = { ...envelope, payloadHash: hashActionProposal(envelope) };
          const created = await store.createProposal(proposal, auditContext);
          sendApiSuccess(request, response, created.replayed ? 200 : 201, { proposal: created.proposal, replayed: created.replayed }); return;
        }

        if (actionProposalDetail && request.method === "GET") {
          const version = Number(requestUrl.searchParams.get("version") ?? "1");
          if (!Number.isSafeInteger(version) || version < 1) {
            sendApiError(request, response, 400, "ACTION_PROPOSAL_VERSION_INVALID", "A positive proposal version is required."); return;
          }
          const proposal = await store.getProposal({ tenantId: identity.tenantId, applicationId, proposalId: proposalId!, proposalVersion: version });
          if (!proposal) { sendApiError(request, response, 404, "ACTION_PROPOSAL_NOT_FOUND", "The action proposal was not found."); return; }
          const permission = await authorize("view_proposal", {
            proposalId: proposal.proposalId, proposalVersion: proposal.proposalVersion,
            proposalHash: proposal.payloadHash, actionType: proposal.actionType,
            sideEffectClass: proposal.sideEffectClass, targetType: proposal.targetType, targetId: proposal.targetId,
          });
          if (!permission.allowed) { sendApiError(request, response, 403, "ACTION_APPROVAL_ACCESS_DENIED", "You are not allowed to view this proposal."); return; }
          sendApiSuccess(request, response, 200, { proposal }); return;
        }

        if (actionProposalDecisions && request.method === "POST") {
          const body = await readJson(request);
          if (!allowedBodyKeys(body, ["decision", "approvalId", "reasonCode"])) {
            sendApiError(request, response, 400, "INVALID_ACTION_APPROVAL_DECISION_BODY", "Only decision, approvalId and reasonCode are accepted."); return;
          }
          if (body.decision !== "approve" && body.decision !== "reject" && body.decision !== "revoke") {
            sendApiError(request, response, 400, "ACTION_APPROVAL_DECISION_INVALID", "Decision must be approve, reject or revoke."); return;
          }
          if (body.decision === "revoke" && (typeof body.approvalId !== "string" || !body.approvalId.trim())) {
            sendApiError(request, response, 400, "ACTION_APPROVAL_ID_REQUIRED", "A grant approvalId is required for revocation."); return;
          }
          const version = Number(requestUrl.searchParams.get("version") ?? "1");
          if (!Number.isSafeInteger(version) || version < 1) {
            sendApiError(request, response, 400, "ACTION_PROPOSAL_VERSION_INVALID", "A positive proposal version is required."); return;
          }
          const proposal = await store.getProposal({ tenantId: identity.tenantId, applicationId, proposalId: proposalId!, proposalVersion: version });
          if (!proposal) { sendApiError(request, response, 404, "ACTION_PROPOSAL_NOT_FOUND", "The action proposal was not found."); return; }
          if (body.decision === "approve" && identity.actorId === proposal.requestedBy) {
            sendApiError(request, response, 403, "MAKER_CHECKER_SEPARATION_REQUIRED", "The proposal creator cannot approve their own action."); return;
          }
          const operation: ActionApprovalAuthorizationOperation = body.decision === "approve" ? "approve_proposal"
            : body.decision === "reject" ? "reject_proposal" : "revoke_approval";
          const permission = await authorize(operation, {
            proposalId: proposal.proposalId, proposalVersion: proposal.proposalVersion,
            proposalHash: proposal.payloadHash, approvalId: body.decision === "revoke" ? body.approvalId as string : undefined,
            actionType: proposal.actionType,
            sideEffectClass: proposal.sideEffectClass, targetType: proposal.targetType, targetId: proposal.targetId,
          });
          if (!permission.allowed) { sendApiError(request, response, 403, "ACTION_APPROVAL_DECISION_DENIED", "You are not allowed to record this decision."); return; }
          if (!permission.policyVersion?.trim()) {
            sendApiError(request, response, 503, "ACTION_APPROVAL_POLICY_INCOMPLETE", "The host approval policy did not supply a policy version."); return;
          }
          if (body.decision === "approve" && (!permission.approvalExpiresAt ||
              !Number.isFinite(Date.parse(permission.approvalExpiresAt)) ||
              new Date(Date.parse(permission.approvalExpiresAt)).toISOString() !== permission.approvalExpiresAt ||
              Date.parse(permission.approvalExpiresAt) <= Date.now() ||
              Date.parse(permission.approvalExpiresAt) > Date.parse(proposal.expiresAt))) {
            sendApiError(request, response, 503, "ACTION_APPROVAL_POLICY_INCOMPLETE", "The host approval policy did not supply a valid approval expiry."); return;
          }
          const result = await store.recordDecision({
            ...auditContext, proposalId: proposal.proposalId, proposalVersion: proposal.proposalVersion,
            decision: body.decision, approvalId: body.decision === "approve" ? randomUUID()
              : body.decision === "revoke" ? body.approvalId as string : undefined,
            decidedAt: new Date().toISOString(),
            expiresAt: body.decision === "approve" ? permission.approvalExpiresAt : undefined,
            policyVersion: permission.policyVersion,
            reasonCode: typeof body.reasonCode === "string" ? body.reasonCode.slice(0, 128) : undefined,
          });
          sendApiSuccess(request, response, 201, { decision: result }); return;
        }
        sendMethodNotAllowed(request, response,
          actionProposalCollection ? "GET, POST" : actionProposalDetail ? "GET" : "POST");
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "ACTION_APPROVAL_OPERATION_FAILED";
        if (error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED") {
          sendApiError(request, response, 400, "INVALID_JSON_BODY", "A valid JSON object is required."); return;
        }
        if (message === "REQUEST_BODY_TOO_LARGE") {
          sendApiError(request, response, 413, "REQUEST_BODY_TOO_LARGE", "The request body is too large."); return;
        }
        const status = /NOT_FOUND/.test(message) ? 404
          : /CONFLICT|IDEMPOTENCY|ALREADY_CLAIMED/.test(message) ? 409
          : /INVALID|REQUIRED/.test(message) ? 400
          : 503;
        const code = message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "ACTION_APPROVAL_OPERATION_FAILED";
        sendApiError(request, response, status, code, "The action approval operation could not be completed."); return;
      }
    }

    if (workflowRoleCollection || workflowRoleDetail || workflowRoleAssignments || workflowPublishRoute) {
      if (process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveAdminConfigIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      if (!options.tenantApplicationAssignmentStore || !options.actorApplicationAssignmentStore ||
          !options.workflowRoleDefinitionStore || !options.workflowActorRoleAssignmentStore ||
          !options.workflowDefinitionPublisher) {
        sendApiError(request, response, 503, "WORKFLOW_ADMIN_UNAVAILABLE", "Workflow administration is not configured."); return;
      }
      const applicationId = (workflowRoleCollection ?? workflowRoleDetail ?? workflowRoleAssignments ?? workflowPublishRoute)![1];
      try {
        const tenantApplications = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
        if (!tenantApplications.includes(applicationId)) {
          sendApiError(request, response, 404, "APPLICATION_NOT_FOUND", "The application was not found."); return;
        }
        if (!(await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId))) {
          sendApiError(request, response, 403, "ADMIN_NOT_ASSIGNED_TO_APPLICATION", "The administrator is not assigned to this application."); return;
        }
        const environment = options.adminConfigEnvironment ?? "sandbox";
        const correlationId = resolveApiRequestId(request);
        if (workflowRoleCollection) {
          if (request.method === "GET") {
            const roles = await options.workflowRoleDefinitionStore.list(identity.tenantId, applicationId);
            sendApiSuccess(request, response, 200, { roles }); return;
          }
          sendMethodNotAllowed(request, response, "GET"); return;
        }
        if (workflowRoleDetail) {
          if (request.method !== "PUT") { sendMethodNotAllowed(request, response, "PUT"); return; }
          const body = await readJson(request);
          if (!allowedBodyKeys(body, ["name", "description", "permissions", "status", "expectedVersion"])) {
            sendApiError(request, response, 400, "INVALID_WORKFLOW_ROLE_BODY", "Only role definition fields are accepted."); return;
          }
          const role = await options.workflowRoleDefinitionStore.replace({
            tenantId: identity.tenantId, applicationId, roleId: workflowRoleDetail[2],
            name: body.name as string, description: body.description as string | undefined,
            permissions: body.permissions as import("../../packages/workflows/postgres-workflow-role-definition-store.js").WorkflowRolePermission[],
            status: body.status as "active" | "disabled", expectedVersion: body.expectedVersion as number,
            changedBy: identity.actorId, environment, correlationId, serviceVersion: options.serviceVersion,
          });
          sendApiSuccess(request, response, 200, { role }); return;
        }
        if (workflowRoleAssignments) {
          if (request.method === "GET") {
            const actorId = requestUrl.searchParams.get("actorId") ?? "";
            if (!/^[a-zA-Z0-9._-]{2,128}$/.test(actorId)) {
              sendApiError(request, response, 400, "INVALID_ACTOR_ID", "A valid actorId query parameter is required."); return;
            }
            const roleIds = await options.workflowActorRoleAssignmentStore.listActiveRoleIds(identity.tenantId, applicationId, actorId);
            sendApiSuccess(request, response, 200, { actorId, roleIds }); return;
          }
          if (request.method !== "POST" && request.method !== "DELETE") {
            sendMethodNotAllowed(request, response, "GET, POST, DELETE"); return;
          }
          const body = await readJson(request);
          if (!allowedBodyKeys(body, ["actorId", "roleId", "expectedVersion"]) ||
              typeof body.actorId !== "string" || typeof body.roleId !== "string") {
            sendApiError(request, response, 400, "INVALID_WORKFLOW_ROLE_ASSIGNMENT_BODY", "actorId, roleId and expectedVersion are required."); return;
          }
          const input = {
            tenantId: identity.tenantId, applicationId, actorId: body.actorId, roleId: body.roleId,
            changedBy: identity.actorId, expectedVersion: body.expectedVersion as number,
            environment, correlationId, serviceVersion: options.serviceVersion,
          };
          const assignment = request.method === "POST"
            ? await options.workflowActorRoleAssignmentStore.assign(input)
            : await options.workflowActorRoleAssignmentStore.revoke(input);
          sendApiSuccess(request, response, request.method === "POST" ? 201 : 200, { assignment }); return;
        }
        if (workflowPublishRoute) {
          if (request.method !== "POST") { sendMethodNotAllowed(request, response, "POST"); return; }
          const body = await readJson(request);
          if (!allowedBodyKeys(body, ["definition"]) || !body.definition ||
              typeof body.definition !== "object" || Array.isArray(body.definition)) {
            sendApiError(request, response, 400, "INVALID_WORKFLOW_DEFINITION_BODY", "A definition object is required."); return;
          }
          const published = await options.workflowDefinitionPublisher.publish({
            tenantId: identity.tenantId, applicationId, principalId: identity.actorId,
            correlationId, environment, serviceVersion: options.serviceVersion,
          }, body.definition as import("../../packages/workflows/workflow-configuration.js").WorkflowDefinition);
          sendApiSuccess(request, response, 201, { published }); return;
        }
      } catch (error) { workflowError(error); return; }
    }


    if (workflowOutboxDeadLetters || workflowOutboxReplayRoute) {
      if (process.env.EPER_WORKFLOW_OUTBOX_ADMIN_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
          process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres" ||
          process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveAdminConfigIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      if (!options.tenantApplicationAssignmentStore || !options.actorApplicationAssignmentStore ||
          !options.workflowActorRoleAssignmentStore) {
        sendApiError(request, response, 503, "WORKFLOW_OUTBOX_ADMIN_UNAVAILABLE", "Workflow outbox administration is not configured."); return;
      }
      const applicationId = (workflowOutboxDeadLetters ?? workflowOutboxReplayRoute)![1];
      const outboxStore = options.workflowOutboxStore ??
        (options.capabilityPool ? new PostgresWorkflowOutboxStore(options.capabilityPool as unknown as AuditSqlPool) : undefined);
      const replay = options.workflowOutboxReplay ??
        (options.capabilityPool ? replayWorkflowOutboxDeadLetter : undefined);
      if (!outboxStore || (workflowOutboxReplayRoute && !replay)) {
        sendApiError(request, response, 503, "WORKFLOW_OUTBOX_ADMIN_UNAVAILABLE", "Workflow outbox persistence is not configured."); return;
      }
      try {
        const tenantApplications = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
        if (!tenantApplications.includes(applicationId)) {
          sendApiError(request, response, 404, "APPLICATION_NOT_FOUND", "The application was not found."); return;
        }
        if (!(await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId))) {
          sendApiError(request, response, 403, "ADMIN_NOT_ASSIGNED_TO_APPLICATION", "The administrator is not assigned to this application."); return;
        }
        const roleIds = await options.workflowActorRoleAssignmentStore.listActiveRoleIds(identity.tenantId, applicationId, identity.actorId);
        let isWorkflowAdmin = false;
        for (const roleId of roleIds) {
          if (await options.workflowActorRoleAssignmentStore.hasPermission(identity.tenantId, applicationId, identity.actorId, roleId, "workflow:admin")) {
            isWorkflowAdmin = true; break;
          }
        }
        if (!isWorkflowAdmin) {
          sendApiError(request, response, 403, "WORKFLOW_OUTBOX_ADMIN_PERMISSION_REQUIRED", "The workflow administrator permission is required."); return;
        }
        if (workflowOutboxDeadLetters) {
          if (request.method !== "GET") { sendMethodNotAllowed(request, response, "GET"); return; }
          const rawLimit = requestUrl.searchParams.get("limit");
          const limit = rawLimit === null ? 50 : Number(rawLimit);
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
            sendApiError(request, response, 400, "WORKFLOW_OUTBOX_DEAD_LETTER_LIMIT_INVALID", "The list limit must be between 1 and 200."); return;
          }
          const deadLetters = await outboxStore.listDeadLetters({ tenantId: identity.tenantId, applicationId }, limit);
          sendApiSuccess(request, response, 200, { deadLetters }); return;
        }
        if (request.method !== "POST") { sendMethodNotAllowed(request, response, "POST"); return; }
        const body = await readJson(request);
        if (!allowedBodyKeys(body, ["reason", "idempotencyKey"]) ||
            typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 2000 ||
            typeof body.idempotencyKey !== "string" || body.idempotencyKey.trim().length < 16 ||
            body.idempotencyKey !== body.idempotencyKey.trim() || body.idempotencyKey.length > 128) {
          sendApiError(request, response, 400, "WORKFLOW_OUTBOX_REPLAY_INPUT_INVALID", "A reason and unique idempotency key are required."); return;
        }
        const environment = options.adminConfigEnvironment ?? "sandbox";
        const context: WorkflowOutboxReplayContext = {
          tenantId: identity.tenantId, applicationId, actorId: identity.actorId,
          correlationId: resolveApiRequestId(request), environment,
        };
        const result = await replay!(options.capabilityPool as unknown as AuditSqlPool, context, {
          eventId: workflowOutboxReplayRoute![2], workerId: "operator-" + randomUUID(),
          reason: body.reason, idempotencyKey: body.idempotencyKey,
        });
        sendApiSuccess(request, response, result.alreadyApplied ? 200 : 202, { replay: result }); return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "WORKFLOW_OUTBOX_ADMIN_FAILED";
        if (error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED") {
          sendApiError(request, response, 400, "INVALID_JSON_BODY", "A valid JSON object is required."); return;
        }
        if (message === "REQUEST_BODY_TOO_LARGE") {
          sendApiError(request, response, 413, "REQUEST_BODY_TOO_LARGE", "The request body is too large."); return;
        }
        const status = /NOT_FOUND/.test(message) ? 404
          : /PERMISSION_DENIED/.test(message) ? 403
          : /CONFLICT|IDEMPOTENCY|STATE_CONFLICT/.test(message) ? 409
          : /INVALID|REQUIRED/.test(message) ? 400 : 503;
        const code = message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "WORKFLOW_OUTBOX_ADMIN_FAILED";
        sendApiError(request, response, status, code, "The workflow outbox operation could not be completed."); return;
      }
    }

    if (workflowStartRoute || workflowTransitionRoute) {
      if (process.env.EPER_WORKFLOW_EXECUTION_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      if (!options.workflowExecutionService) {
        sendApiError(request, response, 503, "WORKFLOW_EXECUTION_UNAVAILABLE", "Workflow execution is not configured."); return;
      }
      if (request.method !== "POST") { sendMethodNotAllowed(request, response, "POST"); return; }
      try {
        const body = await readJson(request);
        const environment = options.adminConfigEnvironment ?? "sandbox";
        const correlationId = resolveApiRequestId(request);
        if (workflowStartRoute) {
          if (!allowedBodyKeys(body, ["idempotencyKey", "businessReference", "data"])) {
            sendApiError(request, response, 400, "INVALID_WORKFLOW_START_BODY", "Only idempotencyKey, businessReference and data are accepted."); return;
          }
          const instance = await options.workflowExecutionService.start({
            tenantId: identity.tenantId, applicationId: workflowStartRoute[1], actorId: identity.actorId,
            correlationId, environment, serviceVersion: options.serviceVersion,
            workflowId: workflowStartRoute[2], idempotencyKey: body.idempotencyKey as string,
            businessReference: body.businessReference as string | undefined,
            data: body.data as Record<string, unknown> | undefined,
          });
          sendApiSuccess(request, response, 200, { instance }); return;
        }
        const transitionRoute = workflowTransitionRoute!;
        if (!allowedBodyKeys(body, ["expectedVersion", "idempotencyKey", "action", "payload", "targetActivityId"])) {
          sendApiError(request, response, 400, "INVALID_WORKFLOW_TRANSITION_BODY", "Only transition fields are accepted."); return;
        }
        const instance = await options.workflowExecutionService.transition({
          tenantId: identity.tenantId, applicationId: transitionRoute[1], actorId: identity.actorId,
          correlationId, environment, serviceVersion: options.serviceVersion,
          instanceId: transitionRoute[2], expectedVersion: body.expectedVersion as number,
          idempotencyKey: body.idempotencyKey as string, action: body.action as "submit" | "approve" | "reject" | "cancel",
          payload: body.payload as Record<string, unknown> | undefined,
          targetActivityId: body.targetActivityId as string | undefined,
        });
        sendApiSuccess(request, response, 200, { instance }); return;
      } catch (error) { workflowError(error); return; }
    }

    if (isAdminActorApplicationAssignmentUiRequest(request)) {
      if (process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
          process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "same-origin",
      });
      response.end(adminActorApplicationAssignmentUiHtml);
      return;
    }

    // Durable administrator provisioning for actor-to-application membership.
    if (requestUrl.pathname === "/admin/actor-application-assignments") {
      if (process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
          process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      if (!options.actorApplicationAssignmentStore) {
        sendJson(request, response, 503, { error: "actor_application_assignment_store_unavailable" });
        return;
      }
      const adminIdentity = resolveAdminConfigIdentity(request);
      if (!adminIdentity) {
        sendJson(request, response, 401, { error: "unauthorized_or_unmapped_admin_identity" });
        return;
      }
      try {
        if (request.method === "GET") {
          const actorId = requestUrl.searchParams.get("actorId") ?? "";
          if (!/^[a-zA-Z0-9._-]{2,128}$/.test(actorId)) {
            sendJson(request, response, 400, { error: "invalid_actor_id" });
            return;
          }
          const assignments = await options.actorApplicationAssignmentStore.listAssignments(adminIdentity.tenantId, actorId);
          sendJson(request, response, 200, { tenantId: adminIdentity.tenantId, actorId, assignments });
          return;
        }
        if (request.method === "POST" || request.method === "DELETE") {
          const body = await readJson(request);
          const actorId = typeof body.actorId === "string" ? body.actorId : "";
          const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
          const expectedVersion = body.expectedVersion;
          if (!/^[a-zA-Z0-9._-]{2,128}$/.test(actorId) ||
              !/^[a-zA-Z0-9._-]{2,128}$/.test(applicationId) ||
              !Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0) {
            sendJson(request, response, 400, { error: "invalid_assignment_input" });
            return;
          }
          let tenantAssignments: unknown;
          if (options.tenantApplicationAssignmentStore) {
            tenantAssignments = await options.tenantApplicationAssignmentStore.listActive(adminIdentity.tenantId);
          } else {
            try {
              const parsed: unknown = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? "");
              tenantAssignments = parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)[adminIdentity.tenantId] : null;
            } catch { tenantAssignments = null; }
          }
          if (!Array.isArray(tenantAssignments) || !tenantAssignments.includes(applicationId)) {
            sendJson(request, response, 403, { error: "application_not_assigned_to_tenant" });
            return;
          }
          const change = {
            tenantId: adminIdentity.tenantId,
            actorId,
            applicationId,
            changedBy: adminIdentity.actorId,
            expectedVersion: expectedVersion as number,
            environment: options.adminConfigEnvironment ?? "uat",
            correlationId: resolveApiRequestId(request),
            serviceVersion: options.serviceVersion,
          };
          const assignment = request.method === "POST"
            ? await options.actorApplicationAssignmentStore.assign(change)
            : await options.actorApplicationAssignmentStore.revoke(change);
          sendJson(request, response, request.method === "POST" ? 201 : 200, { assignment });
          return;
        }
        sendMethodNotAllowed(request, response, "GET, POST, DELETE");
      } catch (error) {
        if (error instanceof Error && error.message === "ACTOR_APPLICATION_ASSIGNMENT_VERSION_CONFLICT") {
          sendJson(request, response, 409, { error: error.message });
        } else if (error instanceof Error && error.message === "ACTOR_APPLICATION_ASSIGNMENT_NOT_FOUND") {
          sendJson(request, response, 404, { error: error.message });
        } else if (error instanceof SyntaxError || error instanceof Error && (error.message === "JSON_OBJECT_REQUIRED" || error.message.startsWith("ACTOR_APPLICATION_ASSIGNMENT_INVALID_") || error.message === "ACTOR_APPLICATION_ASSIGNMENT_EXPECTED_VERSION_INVALID" || error.message === "ACTOR_APPLICATION_ASSIGNMENT_CORRELATION_ID_REQUIRED")) {
          sendJson(request, response, 400, { error: error.message === "JSON_OBJECT_REQUIRED" || error instanceof SyntaxError ? "invalid_json" : error.message });
        } else {
          sendJson(request, response, 503, { error: "actor_application_assignment_operation_failed" });
        }
      }
      return;
    }

    if (requestUrl.pathname === "/customer/commercial-tariff") {
      if (process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE !== "postgres" ||
          process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres" ||
          process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
          process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "A trusted customer credential is required."); return; }
      if (request.method === "GET") {
        if (!options.tenantApplicationAssignmentStore || !options.commercialTariffAdminStore) {
          sendJson(request, response, 503, { error: "customer_tariff_catalogue_unavailable" }); return;
        }
        try {
          const [assignment, applicationAssignments, records] = await Promise.all([
            options.tenantApplicationAssignmentStore.getCustomerTariffAssignment(identity.tenantId),
            options.tenantApplicationAssignmentStore.listAssignments(identity.tenantId),
            options.commercialTariffAdminStore.list({ tenantId: identity.tenantId, actorId: identity.actorId,
              correlationId: resolveApiRequestId(request), environment: options.adminConfigEnvironment ?? "sandbox",
              serviceVersion: options.serviceVersion }),
          ]);
          const now=Date.now();
          const tariffs=records.filter(record=>record.tariffStatus==="active" &&
            Date.parse(record.effectiveFrom)<=now && (!record.effectiveTo || Date.parse(record.effectiveTo)>now))
            .map(({tariffKey,tariffVersion,billingBasis,maxApplications,amount,currency,billingInterval,effectiveFrom,effectiveTo})=>
              ({tariffKey,tariffVersion,billingBasis,maxApplications,amount,currency,billingInterval,effectiveFrom,effectiveTo}));
          sendJson(request,response,200,{assignment,applicationAssignments:applicationAssignments.filter(item=>item.status==="active").map(({applicationId,status,version})=>({applicationId,status,version})),tariffs});
        } catch {
          sendJson(request,response,503,{error:"customer_tariff_catalogue_unavailable"});
        }
        return;
      }
      if (request.method !== "POST") { sendMethodNotAllowed(request, response, "GET, POST"); return; }
      if (identity.roleKey !== "customer-admin") {
        sendApiError(request, response, 403, "CUSTOMER_TARIFF_SWITCH_FORBIDDEN", "A customer administrator role is required."); return;
      }
      if (!options.tenantApplicationAssignmentStore) {
        sendJson(request, response, 503, { error: "tenant_application_assignment_store_unavailable" }); return;
      }
      try {
        const body = await readJson(request);
        if (body.accepted !== true || typeof body.acceptanceReference !== "string" ||
            typeof body.tariffKey !== "string" || !Number.isSafeInteger(body.tariffVersion) ||
            !Number.isSafeInteger(body.expectedVersion) ||
            (body.revokeApplications !== undefined && (!Array.isArray(body.revokeApplications) ||
              body.revokeApplications.length > 500 || body.revokeApplications.some(item =>
                !item || typeof item.applicationId !== "string" || !Number.isSafeInteger(item.expectedVersion)))) ||
            Object.keys(body).some(key => !["accepted", "acceptanceReference", "tariffKey", "tariffVersion", "expectedVersion", "revokeApplications"].includes(key))) {
          sendJson(request, response, 400, { error: "CUSTOMER_TARIFF_ACCEPTANCE_REQUIRED" }); return;
        }
        const assignment = await options.tenantApplicationAssignmentStore.switchCustomerTariff({
          tenantId: identity.tenantId, changedBy: identity.actorId, tariffKey: body.tariffKey,
          tariffVersion: body.tariffVersion as number, expectedVersion: body.expectedVersion as number,
          acceptanceReference: body.acceptanceReference, revokeApplications: body.revokeApplications as Array<{applicationId:string;expectedVersion:number}> | undefined, environment: options.adminConfigEnvironment ?? "sandbox",
          correlationId: resolveApiRequestId(request), serviceVersion: options.serviceVersion,
        });
        sendJson(request, response, 200, { assignment });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const status = message.includes("VERSION_CONFLICT") ? 409 :
          message.includes("NOT_FOUND") ? 404 :
          message.includes("INVALID") || message.includes("REQUIRED") ? 400 :
          message.includes("NOT_ACTIVE") || message.includes("NOT_EFFECTIVE") || message.includes("NOT_APPROVED") ? 409 :
          message.includes("APPLICATION_SELECTION") ? 409 : 503;
        sendJson(request, response, status, { error: message || "customer_tariff_switch_failed" });
      }
      return;
    }

    if (requestUrl.pathname === "/admin/tenant-application-assignments") {
      if (process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
          process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      if (!options.tenantApplicationAssignmentStore) {
        sendJson(request, response, 503, { error: "tenant_application_assignment_store_unavailable" });
        return;
      }
      const adminIdentity = resolveAdminConfigIdentity(request);
      if (!adminIdentity) {
        sendJson(request, response, 401, { error: "unauthorized_or_unmapped_admin_identity" });
        return;
      }
      try {
        if (request.method === "GET") {
          const assignments = await options.tenantApplicationAssignmentStore.listAssignments(adminIdentity.tenantId);
          sendJson(request, response, 200, { tenantId: adminIdentity.tenantId, assignments });
          return;
        }
        if (request.method === "POST" || request.method === "DELETE") {
          const body = await readJson(request);
          const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
          const expectedVersion = body.expectedVersion;
          if (!/^[a-zA-Z0-9._-]{2,128}$/.test(applicationId) ||
              !Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0) {
            sendJson(request, response, 400, { error: "invalid_assignment_input" });
            return;
          }
          const change = {
            tenantId: adminIdentity.tenantId, applicationId, changedBy: adminIdentity.actorId,
            expectedVersion: expectedVersion as number,
            environment: options.adminConfigEnvironment ?? "uat",
            correlationId: resolveApiRequestId(request), serviceVersion: options.serviceVersion,
          };
          const assignment = request.method === "POST"
            ? await options.tenantApplicationAssignmentStore.assign(change)
            : await options.tenantApplicationAssignmentStore.revoke(change);
          sendJson(request, response, request.method === "POST" ? 201 : 200, { assignment });
          return;
        }
        sendMethodNotAllowed(request, response, "GET, POST, DELETE");
      } catch (error) {
        if (error instanceof Error && error.message === "TENANT_APPLICATION_ASSIGNMENT_VERSION_CONFLICT") {
          sendJson(request, response, 409, { error: error.message });
        } else if (error instanceof Error && error.message === "TENANT_APPLICATION_ASSIGNMENT_NOT_FOUND") {
          sendJson(request, response, 404, { error: error.message });
        } else if (error instanceof SyntaxError || error instanceof Error && (error.message === "JSON_OBJECT_REQUIRED" ||
          error.message.startsWith("TENANT_APPLICATION_ASSIGNMENT_INVALID_") ||
          error.message === "TENANT_APPLICATION_ASSIGNMENT_EXPECTED_VERSION_INVALID" ||
          error.message === "TENANT_APPLICATION_ASSIGNMENT_CORRELATION_ID_REQUIRED")) {
          sendJson(request, response, 400, { error: error instanceof SyntaxError || error.message === "JSON_OBJECT_REQUIRED" ? "invalid_json" : error.message });
        } else {
          sendJson(request, response, 503, { error: "tenant_application_assignment_operation_failed" });
        }
      }
      return;
    }

    // Browser-session context is application-scoped and uses durable authorization only.
    // This read-only endpoint deliberately does not fall back to bearer credential mappings.
    const browserSessionContext = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{1,99})\/session$/.exec(requestUrl.pathname);
    if (browserSessionContext && request.method === "GET") {
      if (process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE !== "postgres" ||
          !options.customerIdentitySessionStore || !options.tenantApplicationAssignmentStore ||
          !options.actorApplicationAssignmentStore) {
        sendApiError(request, response, 503, "CUSTOMER_BROWSER_IDENTITY_UNAVAILABLE",
          "Durable customer browser identity is not configured.");
        return;
      }
      const identity = await resolveCustomerBrowserIdentity({
        cookieHeader: request.headers.cookie,
        applicationId: browserSessionContext[1],
        sessionStore: options.customerIdentitySessionStore,
        tenantAssignments: options.tenantApplicationAssignmentStore,
        actorAssignments: options.actorApplicationAssignmentStore,
      });
      if (!identity) {
        sendApiError(request, response, 401, "UNAUTHENTICATED",
          "A valid browser session with active tenant and actor application assignments is required.");
        return;
      }
      sendApiSuccess(request, response, 200, {
        authenticated: true,
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        applicationId: identity.applicationId,
        authentication: "postgres-browser-session",
        authorization: "durable-tenant-and-actor-assignments",
      });
      return;
    }

    // Customer session introspection: identity is derived only from the server-side
    // credential map. This is an API boundary, not a substitute for a browser login UI.
    if (requestUrl.pathname === "/customer/session" && request.method === "GET") {
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) {
        sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required.");
        return;
      }
      sendApiSuccess(request, response, 200, {
        authenticated: true,
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        roleKey: identity.roleKey,
      });
      return;
    }

    // Safe, tenant/actor-scoped execution diagnostics; never expose execution payloads or provider data.
    const campaignExecutionDiagnostic = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/campaign-executions\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/.exec(requestUrl.pathname);
    if (campaignExecutionDiagnostic && ["GET", "HEAD"].includes(request.method ?? "")) {
      if (process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      if (!["customer-admin", "application-admin", "campaign-approver"].includes(identity.roleKey)) {
        sendApiError(request, response, 403, "CAMPAIGN_DIAGNOSTICS_FORBIDDEN", "A campaign operator role is required."); return;
      }
      if (!options.campaignSchedulerStore) {
        sendApiError(request, response, 503, "CAMPAIGN_SCHEDULER_UNAVAILABLE", "Campaign scheduling is not configured."); return;
      }
      const applicationId = campaignExecutionDiagnostic[1];
      if (process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE === "postgres" &&
          (!options.tenantApplicationAssignmentStore || !options.actorApplicationAssignmentStore)) {
        sendApiError(request, response, 503, "CAMPAIGN_DIAGNOSTICS_AUTHORIZATION_UNAVAILABLE",
          "Execution diagnostics authorization is not configured for durable assignments."); return;
      }
      let tenantAssigned = false;
      let actorAssigned = false;
      try {
        const tenantApplications = options.tenantApplicationAssignmentStore
          ? await options.tenantApplicationAssignmentStore.listActive(identity.tenantId)
          : (() => {
              try {
                const parsed: unknown = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? "");
                return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                  ? (parsed as Record<string, unknown>)[identity.tenantId] : [];
              } catch { return []; }
            })();
        tenantAssigned = Array.isArray(tenantApplications) && tenantApplications.includes(applicationId);
        actorAssigned = options.actorApplicationAssignmentStore
          ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
          : identity.applicationIds?.includes(applicationId) === true;
      } catch {
        sendApiError(request, response, 503, "CAMPAIGN_DIAGNOSTICS_AUTHORIZATION_UNAVAILABLE",
          "Execution diagnostics authorization is temporarily unavailable."); return;
      }
      if (!tenantAssigned || !actorAssigned) {
        sendApiError(request, response, 404, "APPLICATION_NOT_FOUND", "The application was not found."); return;
      }
      try {
        const diagnostics = await options.campaignSchedulerStore.getExecutionDiagnostics({
          tenantId: identity.tenantId, applicationId, executionId: campaignExecutionDiagnostic[2],
        });
        if (!diagnostics) { sendApiError(request, response, 404, "EXECUTION_NOT_FOUND", "The execution was not found."); return; }
        sendApiSuccess(request, response, 200, { execution: diagnostics }); return;
      } catch (error) {
        const invalid = error instanceof Error && error.message === "CAMPAIGN_EXECUTION_ID_INVALID";
        sendApiError(request, response, invalid ? 400 : 503,
          invalid ? "INVALID_EXECUTION_ID" : "CAMPAIGN_EXECUTION_DIAGNOSTICS_READ_FAILED",
          "Execution diagnostics could not be retrieved."); return;
      }
    }

    // Campaign schedule read APIs: tenant identity is server-derived, and application assignment
    // is checked independently before any database lookup.
    const campaignCollection = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/campaign-schedules$/.exec(requestUrl.pathname);
    const campaignDetail = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/campaign-schedules\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/.exec(requestUrl.pathname);
    const campaignLifecycle = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/campaign-schedules\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/(approve|pause|resume|cancel)$/.exec(requestUrl.pathname);
    if (campaignLifecycle && request.method === "POST") {
      if (process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      if (!["customer-admin", "application-admin", "campaign-approver"].includes(identity.roleKey)) {
        sendApiError(request, response, 403, "CAMPAIGN_LIFECYCLE_FORBIDDEN", "A campaign approver role is required."); return;
      }
      if (!options.campaignSchedulerStore) {
        sendApiError(request, response, 503, "CAMPAIGN_SCHEDULER_UNAVAILABLE", "Campaign scheduling is not configured."); return;
      }
      let assigned: unknown;
      if (options.tenantApplicationAssignmentStore) assigned = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
      else {
        let assignments: unknown;
        try { assignments = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); } catch { assignments = null; }
        assigned = assignments && typeof assignments === "object" && !Array.isArray(assignments)
          ? (assignments as Record<string, unknown>)[identity.tenantId] : null;
      }
      const applicationId = campaignLifecycle[1]!, scheduleId = campaignLifecycle[2]!, action = campaignLifecycle[3]!;
      const actorAssigned = options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
        : identity.applicationIds?.includes(applicationId) === true;
      if (!Array.isArray(assigned) || !assigned.includes(applicationId) || !actorAssigned) {
        sendApiError(request, response, 404, "APPLICATION_NOT_FOUND", "The application was not found."); return;
      }
      try {
        let schedule;
        if (action === "approve" || action === "resume") {
          let body: Record<string, unknown>;
          try { body = await readJson(request); }
          catch { sendApiError(request, response, 400, "INVALID_JSON_BODY", "A valid JSON object is required."); return; }
          const nextRunAt = typeof body.nextRunAt === "string" ? body.nextRunAt : "";
          const nextRunAtMs = nextRunAt ? Date.parse(nextRunAt) : Number.NaN;
          if (!Number.isFinite(nextRunAtMs) || nextRunAtMs <= Date.now()) {
            sendApiError(request, response, 400, "INVALID_NEXT_RUN_AT", "A valid future nextRunAt timestamp is required."); return;
          }
          schedule = await options.campaignSchedulerStore.approveAndSchedule({
            tenantId: identity.tenantId, applicationId, scheduleId, actorId: identity.actorId,
            nextRunAt, operation: action === "resume" ? "resume" : "approve",
          });
        } else if (action === "pause" || action === "cancel") {
          schedule = await options.campaignSchedulerStore.pauseOrCancel({
            tenantId: identity.tenantId, applicationId, scheduleId, actorId: identity.actorId, action,
          });
        }
        if (!schedule) {
          sendApiError(request, response, 400, "CAMPAIGN_ACTION_INVALID", "The requested campaign lifecycle action is not supported."); return;
        }
        sendApiSuccess(request, response, 200, { schedule });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const invalid = message === "CAMPAIGN_SCHEDULE_ID_INVALID" || message === "CAMPAIGN_NEXT_RUN_MUST_BE_FUTURE";
        const auditUnavailable = message === "CAMPAIGN_AUDIT_PERSISTENCE_FAILED";
        const dispatchStarted = message === "CAMPAIGN_DISPATCH_ALREADY_STARTED";
        sendApiError(request, response, auditUnavailable ? 503 : invalid ? 400 : message.includes("NOT_FOUND") ? 404 : 409,
          auditUnavailable ? message : invalid ? message : dispatchStarted ? message : message.includes("NOT_FOUND") ? "SCHEDULE_NOT_FOUND" : "CAMPAIGN_LIFECYCLE_CONFLICT",
          auditUnavailable ? "The schedule change was rolled back because audit persistence failed."
            : dispatchStarted ? "Dispatch has already started; this campaign cannot be cancelled safely."
            : "The campaign schedule could not be updated.");
      }
      return;
    }
    if (campaignCollection && request.method === "POST") {
      if (process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      if (!["customer-admin", "application-admin", "campaign-approver"].includes(identity.roleKey)) {
        sendApiError(request, response, 403, "CAMPAIGN_CREATE_FORBIDDEN", "A campaign management role is required to create schedules."); return;
      }
      if (!options.campaignSchedulerStore) {
        sendApiError(request, response, 503, "CAMPAIGN_SCHEDULER_UNAVAILABLE", "Campaign scheduling is not configured."); return;
      }
      let assigned: unknown;
      if (options.tenantApplicationAssignmentStore) assigned = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
      else {
        let assignments: unknown;
        try { assignments = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); } catch { assignments = null; }
        assigned = assignments && typeof assignments === "object" && !Array.isArray(assignments)
          ? (assignments as Record<string, unknown>)[identity.tenantId] : null;
      }
      const applicationId = campaignCollection[1];
      const actorAssigned = options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
        : identity.applicationIds?.includes(applicationId) === true;
      if (!Array.isArray(assigned) || !assigned.includes(applicationId) || !actorAssigned) {
        sendApiError(request, response, 404, "APPLICATION_NOT_FOUND", "The application was not found."); return;
      }
      let body: Record<string, unknown>;
      try { body = await readJson(request); }
      catch { sendApiError(request, response, 400, "INVALID_JSON_BODY", "A valid JSON object is required."); return; }
      const campaignId = body.campaignId;
      const triggerType = body.triggerType;
      const timezone = body.timezone;
      const scheduleDefinition = body.scheduleDefinition;
      if (typeof campaignId !== "string" || !campaignId.trim() || campaignId.length > 128 ||
          !["once", "recurring", "event"].includes(String(triggerType)) ||
          typeof timezone !== "string" || !timezone.trim() || timezone.length > 128 ||
          !scheduleDefinition || typeof scheduleDefinition !== "object" || Array.isArray(scheduleDefinition)) {
        sendApiError(request, response, 400, "INVALID_CAMPAIGN_SCHEDULE", "Required schedule fields are missing or invalid."); return;
      }
      try {
        const schedule = await options.campaignSchedulerStore.createSchedule({
          tenantId: identity.tenantId,
          applicationId,
          campaignId: campaignId.trim(),
          triggerType: triggerType as "once" | "recurring" | "event" | "condition",
          timezone,
          scheduleDefinition: scheduleDefinition as Record<string, unknown>,
          createdBy: identity.actorId,
        });
        sendApiSuccess(request, response, 202, { scheduleId: schedule.id, status: schedule.status, approvalStatus: schedule.approvalStatus, schedule });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const code = message === "CAMPAIGN_AUDIT_PERSISTENCE_FAILED" ? message
          : /^CAMPAIGN_.*INVALID$/.test(message) ? message : "CAMPAIGN_SCHEDULE_CREATE_FAILED";
        const status = code === "CAMPAIGN_AUDIT_PERSISTENCE_FAILED" ? 503
          : code === "CAMPAIGN_SCHEDULE_CREATE_FAILED" ? 500 : 400;
        sendApiError(request, response, status, code, "The campaign schedule could not be created."); return;
      }
    }
    if ((campaignCollection || campaignDetail) && ["GET", "HEAD"].includes(request.method ?? "")) {
      if (process.env.EPER_CAMPAIGN_SCHEDULER_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      if (!options.campaignSchedulerStore) {
        sendApiError(request, response, 503, "CAMPAIGN_SCHEDULER_UNAVAILABLE", "Campaign scheduling is not configured."); return;
      }
      let assigned: unknown;
      if (options.tenantApplicationAssignmentStore) assigned = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
      else {
        let assignments: unknown;
        try { assignments = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); } catch { assignments = null; }
        assigned = assignments && typeof assignments === "object" && !Array.isArray(assignments)
          ? (assignments as Record<string, unknown>)[identity.tenantId] : null;
      }
      const applicationId = (campaignCollection ?? campaignDetail)![1];
      const actorAssigned = options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
        : identity.applicationIds?.includes(applicationId) === true;
      if (!Array.isArray(assigned) || !assigned.includes(applicationId) || !actorAssigned) {
        sendApiError(request, response, 404, "APPLICATION_NOT_FOUND", "The application was not found."); return;
      }
      try {
        if (campaignCollection) {
          const rawLimit = requestUrl.searchParams.get("limit");
          const rawOffset = requestUrl.searchParams.get("offset");
          const limit = rawLimit === null ? 25 : Number(rawLimit);
          const offset = rawOffset === null ? 0 : Number(rawOffset);
          if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000000) {
            sendApiError(request, response, 400, "INVALID_PAGINATION", "Pagination parameters are invalid."); return;
          }
          const schedules = await options.campaignSchedulerStore.listSchedules({ tenantId: identity.tenantId, applicationId, limit, offset });
          sendApiSuccess(request, response, 200, { schedules, pagination: { limit, offset } }); return;
        }
        const schedule = await options.campaignSchedulerStore.getSchedule({ tenantId: identity.tenantId, applicationId, scheduleId: campaignDetail![2] });
        if (!schedule) { sendApiError(request, response, 404, "SCHEDULE_NOT_FOUND", "The schedule was not found."); return; }
        sendApiSuccess(request, response, 200, { schedule }); return;
      } catch (error) {
        const code = error instanceof Error && error.message === "CAMPAIGN_SCHEDULE_ID_INVALID" ? "INVALID_SCHEDULE_ID" : "CAMPAIGN_SCHEDULER_READ_FAILED";
        sendApiError(request, response, code === "INVALID_SCHEDULE_ID" ? 400 : 500, code, "The campaign schedule could not be retrieved."); return;
      }
    }
    if ((campaignCollection || campaignDetail) && request.method !== "GET" && request.method !== "HEAD") {
      sendMethodNotAllowed(request, response, "GET, HEAD"); return;
    }


    // Single-call client asset manifest across every application assigned to this customer.
    // Returns safe metadata and opaque storage references only; binary content is fetched separately.
    if (requestUrl.pathname === "/customer/assets") {
      if (process.env.EPER_CUSTOMER_ASSETS_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      if (request.method !== "GET") { sendMethodNotAllowed(request, response, "GET"); return; }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendJson(request, response, 401, { error: "unauthorized" }); return; }
      let modulesConfig: unknown;
      let assignmentsConfig: unknown;
      let assetsConfig: unknown;
      try {
        modulesConfig = JSON.parse(process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON ?? "");
        if (!options.tenantApplicationAssignmentStore) assignmentsConfig = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? "");
        assetsConfig = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON ?? "");
      } catch {
        sendJson(request, response, 503, { error: "customer_assets_unavailable" }); return;
      }
      const tenantModules = modulesConfig && typeof modulesConfig === "object" && !Array.isArray(modulesConfig)
        ? (modulesConfig as Record<string, unknown>)[identity.tenantId] : null;
      if (!Array.isArray(tenantModules) || !tenantModules.includes("client-assets")) {
        sendJson(request, response, 403, { error: "customer_assets_not_enabled" }); return;
      }
      const tenantAssignments = options.tenantApplicationAssignmentStore
        ? await options.tenantApplicationAssignmentStore.listActive(identity.tenantId)
        : assignmentsConfig && typeof assignmentsConfig === "object" && !Array.isArray(assignmentsConfig)
          ? (assignmentsConfig as Record<string, unknown>)[identity.tenantId] : null;
      if (!Array.isArray(tenantAssignments) || tenantAssignments.some((id) =>
        typeof id !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(id))) {
        sendJson(request, response, 503, { error: "customer_assets_unavailable" }); return;
      }
      const actorAssignments = options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.listActive(identity.tenantId, identity.actorId)
        : identity.applicationIds ?? [];
      const actorApplicationSet = new Set(actorAssignments);
      const tenantAssets = assetsConfig && typeof assetsConfig === "object" && !Array.isArray(assetsConfig)
        ? (assetsConfig as Record<string, unknown>)[identity.tenantId] : null;
      if (!tenantAssets || typeof tenantAssets !== "object" || Array.isArray(tenantAssets)) {
        sendJson(request, response, 503, { error: "customer_assets_unavailable" }); return;
      }
      const allAssets: Record<string, unknown>[] = [];
      const applicationsWithAssets = new Set<string>();
      for (const assignedId of [...new Set(tenantAssignments as string[])].filter((id) => actorApplicationSet.has(id))) {
        const applicationAssets = (tenantAssets as Record<string, unknown>)[assignedId];
        if (applicationAssets === undefined) continue;
        if (!Array.isArray(applicationAssets) || applicationAssets.length > 10000) {
          sendJson(request, response, 503, { error: "customer_assets_unavailable" }); return;
        }
        for (const item of applicationAssets) {
          if (!item || typeof item !== "object" || Array.isArray(item)) continue;
          const asset = item as Record<string, unknown>;
          if (typeof asset.id !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(asset.id) ||
              typeof asset.name !== "string" || !asset.name.trim() || asset.name.length > 200 ||
              typeof asset.type !== "string" || !["document", "video", "image", "audio", "other"].includes(asset.type) ||
              typeof asset.accessReference !== "string" || !asset.accessReference.trim() || asset.accessReference.length > 2048) continue;
          if (requestUrl.searchParams.get("all") === "true" && allAssets.length >= 10000) {
            sendJson(request, response, 413, { error: "customer_asset_manifest_too_large" }); return;
          }
          applicationsWithAssets.add(assignedId);
          allAssets.push({
            id: asset.id, applicationId: assignedId, name: asset.name, type: asset.type,
            ...(typeof asset.mimeType === "string" && asset.mimeType.length <= 128 ? { mimeType: asset.mimeType } : {}),
            ...(typeof asset.sizeBytes === "number" && Number.isSafeInteger(asset.sizeBytes) && asset.sizeBytes >= 0 ? { sizeBytes: asset.sizeBytes } : {}),
            ...(typeof asset.updatedAt === "string" && asset.updatedAt.length <= 40 ? { updatedAt: asset.updatedAt } : {}),
            ...(Array.isArray(asset.tags) ? { tags: asset.tags.filter((tag): tag is string => typeof tag === "string" && tag.length <= 64).slice(0, 20) } : {}),
            // Storage references stay server-side until an authorized download endpoint exists.
          });
        }
      }
      const includeAll = requestUrl.searchParams.get("all") === "true";
      const pageSize = 100;
      const rawCursor = requestUrl.searchParams.get("cursor") ?? "0";
      if (!/^(0|[1-9][0-9]{0,5})$/.test(rawCursor)) {
        sendJson(request, response, 400, { error: "invalid_cursor" }); return;
      }
      if (includeAll && requestUrl.searchParams.has("cursor")) {
        sendJson(request, response, 400, { error: "cursor_not_allowed_with_all" }); return;
      }
      const offset = Number(rawCursor);
      if (offset > allAssets.length) { sendJson(request, response, 400, { error: "invalid_cursor" }); return; }
      const assets = includeAll ? allAssets : allAssets.slice(offset, offset + pageSize);
      const nextOffset = offset + pageSize;
      sendJson(request, response, 200, {
        assets, total: allAssets.length,
        applicationCount: applicationsWithAssets.size,
        nextCursor: !includeAll && nextOffset < allAssets.length ? String(nextOffset) : null,
      });
      return;
    }

    // A download is authorized independently of the manifest request. Storage access is
    // delegated to an injected provider adapter; missing provider/audit adapters fail closed.
    const assetDownloadMatch = /^\/customer\/applications\/([a-zA-Z0-9._:-]{1,128})\/assets\/([a-zA-Z0-9._:-]{1,128})\/download$/.exec(requestUrl.pathname);
    if (assetDownloadMatch) {
      if (process.env.EPER_CUSTOMER_ASSETS_API_ENABLED !== "true") { sendJson(request, response, 404, { error: "not_found" }); return; }
      if (request.method !== "GET") { sendMethodNotAllowed(request, response, "GET"); return; }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendJson(request, response, 401, { error: "unauthorized" }); return; }
      const [applicationId, assetId] = [assetDownloadMatch[1], assetDownloadMatch[2]];
      const requestId = resolveApiRequestId(request);
      const audit = async (outcome: CustomerAssetAuditRecord["outcome"]) => {
        if (!assetAuditWriter) throw new Error("ASSET_AUDIT_UNAVAILABLE");
        await assetAuditWriter({ tenantId: identity.tenantId, actorId: identity.actorId, action: "customer.asset.download", outcome, applicationId, assetId, requestId });
      };
      try {
        if (!assetAuditWriter) {
          // Downloads are high-risk reads: never issue a URL when audit persistence is unavailable.
          sendJson(request, response, 503, { error: "asset_audit_or_storage_unavailable" }); return;
        }
        if (!assetDownloadResolver) {
          // Preserve the failed attempt in the audit trail even when no provider is configured.
          await audit("failure");
          sendJson(request, response, 503, { error: "asset_storage_provider_unavailable" }); return;
        }
        let modulesConfig: unknown, assignmentsConfig: unknown, assetsConfig: unknown;
        try {
          modulesConfig = JSON.parse(process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON ?? "");
          if (!options.tenantApplicationAssignmentStore) assignmentsConfig = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? "");
          assetsConfig = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSETS_JSON ?? "");
        } catch { sendJson(request, response, 503, { error: "customer_assets_unavailable" }); return; }
        const objectRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
        const modules = objectRecord(modulesConfig)?.[identity.tenantId];
        const assignments = options.tenantApplicationAssignmentStore
          ? await options.tenantApplicationAssignmentStore.listActive(identity.tenantId)
          : objectRecord(assignmentsConfig)?.[identity.tenantId];
        const actorAssigned = options.actorApplicationAssignmentStore
          ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
          : identity.applicationIds?.includes(applicationId) === true;
        const tenantAssets = objectRecord(objectRecord(assetsConfig)?.[identity.tenantId]);
        if (!Array.isArray(modules) || !modules.includes("client-assets") || !Array.isArray(assignments) ||
            !assignments.includes(applicationId) || !actorAssigned || !tenantAssets) {
          await audit("denied"); sendJson(request, response, 404, { error: "asset_not_found" }); return;
        }
        const applicationAssets = tenantAssets[applicationId];
        const asset = Array.isArray(applicationAssets) ? applicationAssets.find((item) => item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).id === assetId) as Record<string, unknown> | undefined : undefined;
        if (!asset || typeof asset.accessReference !== "string" || !asset.accessReference.trim() || typeof asset.name !== "string") {
          await audit("denied"); sendJson(request, response, 404, { error: "asset_not_found" }); return;
        }
        const result = await assetDownloadResolver({ tenantId: identity.tenantId, actorId: identity.actorId, applicationId, assetId, accessReference: asset.accessReference, fileName: asset.name, ...(typeof asset.mimeType === "string" ? { mimeType: asset.mimeType } : {}) }, requestId);
        if (!result || typeof result.url !== "string" || !result.url || typeof result.expiresAt !== "string") {
          await audit("failure"); sendJson(request, response, 503, { error: "asset_storage_provider_unavailable" }); return;
        }
        let url: URL; const expiresAt = Date.parse(result.expiresAt); const now = Date.now();
        try { url = new URL(result.url); } catch { url = new URL("about:blank"); }
        if (url.protocol !== "https:" || url.username || url.password || !configuredAssetStorageHosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase()) || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 15 * 60 * 1000) {
          await audit("failure"); sendJson(request, response, 503, { error: "asset_storage_provider_unavailable" }); return;
        }
        await audit("success");
        sendJson(request, response, 200, { downloadUrl: url.toString(), expiresAt: new Date(expiresAt).toISOString(), fileName: asset.name });
      } catch {
        try { await audit("failure"); } catch { /* Audit failure is intentionally fail-closed. */ }
        sendJson(request, response, 503, { error: "asset_audit_or_storage_unavailable" });
      }
      return;
    }

    // Tenant-scoped customer workspace module discovery; malformed configuration fails closed.
    if (requestUrl.pathname === "/customer/workspace/modules" && request.method === "GET") {
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      let tenantModules: unknown;
      try { tenantModules = JSON.parse(process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON ?? ""); }
      catch { tenantModules = null; }
      if (!tenantModules || typeof tenantModules !== "object" || Array.isArray(tenantModules)) {
        sendApiSuccess(request, response, 200, { modules: [] }); return;
      }
      const configured = (tenantModules as Record<string, unknown>)[identity.tenantId];
      const allowed = new Set(["help-center", "growth-hub", "my-applications", "tickets-feedback", "settings", "client-assets"]);
      if (!Array.isArray(configured) || configured.some((item) => typeof item !== "string")) {
        sendApiSuccess(request, response, 200, { modules: [] }); return;
      }
      const modules = [...new Set(configured.filter((item): item is string => allowed.has(item)))];
      sendApiSuccess(request, response, 200, { modules });
      return;
    }
    // Customer-facing read-only content is configured per tenant; no admin settings or secrets are exposed.
    const customerContentRoute = /^\/customer\/(help-center|growth-hub)\/content$/.exec(requestUrl.pathname);
    if (customerContentRoute && request.method === "GET") {
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) { sendApiError(request, response, 401, "UNAUTHENTICATED", "Authentication is required."); return; }
      const moduleKey = customerContentRoute[1] === "help-center" ? "help-center" : "growth-hub";
      let tenantModules: unknown;
      try { tenantModules = JSON.parse(process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON ?? ""); }
      catch { tenantModules = null; }
      const configuredModules = tenantModules && typeof tenantModules === "object" && !Array.isArray(tenantModules)
        ? (tenantModules as Record<string, unknown>)[identity.tenantId] : null;
      if (!Array.isArray(configuredModules) || !configuredModules.includes(moduleKey)) {
        sendApiError(request, response, 403, "FORBIDDEN", "This customer module is not enabled."); return;
      }
      const contentEnv = moduleKey === "help-center" ? "EPER_CUSTOMER_HELP_CONTENT_JSON" : "EPER_CUSTOMER_GROWTH_CONTENT_JSON";
      let tenantContent: unknown;
      try { tenantContent = JSON.parse(process.env[contentEnv] ?? ""); }
      catch { tenantContent = null; }
      const content = tenantContent && typeof tenantContent === "object" && !Array.isArray(tenantContent)
        ? (tenantContent as Record<string, unknown>)[identity.tenantId] : null;
      if (!Array.isArray(content)) { sendApiSuccess(request, response, 200, { module: moduleKey, items: [] }); return; }
      const items = content.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
        .filter((item) => typeof item.title === "string" && item.title.length <= 200 && typeof item.body === "string" && item.body.length <= 10000)
        .slice(0, 100).map((item) => ({ title: item.title, body: item.body }));
      sendApiSuccess(request, response, 200, { module: moduleKey, items });
      return;
    }
    if (isAiIntegrationsAdminRequest(request)) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "same-origin" });
      response.end(aiIntegrationsAdminHtml);
      return;
    }
    if (isCustomerPortalPreviewRequest(request)) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(customerPortalPreviewHtml);
      return;
    }

    if (isWireframesUiRequest(request)) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
      });
      response.end(wireframesUiHtml);
      return;
    }

    if (isAdminSupportTicketUiRequest(request)) {
      if (process.env.EPER_TICKETING_API_ENABLED !== "true") {
        response.writeHead(404, { "cache-control": "no-store" });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(adminSupportTicketUiHtml);
      return;
    }

    if (isWorkflowOutboxAdminUiRequest(request)) {
      if (process.env.EPER_WORKFLOW_OUTBOX_ADMIN_API_ENABLED !== "true") {
        response.writeHead(404, { "cache-control": "no-store" });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(workflowOutboxAdminUiHtml);
      return;
    }

    if (isAdminWorkflowUiRequest(request)) {
      if (process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true") {
        response.writeHead(404, { "cache-control": "no-store" });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=(), microphone=(), geolocation=()",
        "cross-origin-resource-policy": "same-origin",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(adminWorkflowUiHtml);
      return;
    }

    if (isAdminPricingUiRequest(request)) {
      if (process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true") {
        response.writeHead(404, { "cache-control": "no-store" });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "same-origin",
      });
      response.end(adminPricingUiHtml);
      return;
    }

    // Platform Product Admin tariff catalogue: durable, versioned and audit-backed only.
    if (requestUrl.pathname === "/admin/commercial-tariffs" ||
        /^\/admin\/commercial-tariffs\/[^/]+\/\d+\/(?:approve|publish)$/.test(requestUrl.pathname)) {
      if (process.env.EPER_COMMERCIAL_TARIFF_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true" ||
          process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres" ||
          process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
        sendJson(request, response, 404, { error: "not_found" }); return;
      }
      const identity = resolveAdminConfigIdentity(request);
      if (!identity) { sendJson(request, response, 401, { error: "unauthorized_or_unmapped_admin_identity" }); return; }
      if (!["product_admin", "platform_admin"].includes(identity.roleKey ?? "")) {
        sendJson(request, response, 403, { error: "PRODUCT_ADMIN_ROLE_REQUIRED" }); return;
      }
      const store = options.commercialTariffAdminStore;
      if (!store) { sendJson(request, response, 503, { error: "COMMERCIAL_TARIFF_ADMIN_UNAVAILABLE" }); return; }
      const context = {
        tenantId: identity.tenantId, actorId: identity.actorId, correlationId: resolveApiRequestId(request),
        environment: options.adminConfigEnvironment ?? "sandbox", serviceVersion: options.serviceVersion,
      };
      try {
        if (requestUrl.pathname === "/admin/commercial-tariffs" && request.method === "GET") {
          sendApiSuccess(request, response, 200, { tariffs: await store.list(context), persistence: "postgres" }); return;
        }
        if (requestUrl.pathname === "/admin/commercial-tariffs" && request.method === "POST") {
          const body = await readJson(request);
          const allowed = ["tariffKey", "billingBasis", "maxApplications", "amount", "currency", "billingInterval", "effectiveFrom", "effectiveTo", "changeReason", "approvalRequired"];
          if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.approvalRequired !== "boolean" ||
              typeof body.tariffKey !== "string" || typeof body.billingBasis !== "string" ||
              typeof body.maxApplications !== "number" || typeof body.amount !== "string" ||
              typeof body.currency !== "string" || typeof body.billingInterval !== "string" ||
              typeof body.effectiveFrom !== "string" || typeof body.changeReason !== "string") {
            sendApiError(request, response, 400, "INVALID_TARIFF_BODY", "Only tariff catalogue fields are accepted."); return;
          }
          const created = await store.createDraft({
            tariffKey: body.tariffKey as string, billingBasis: body.billingBasis as "single_application" | "multi_application",
            maxApplications: body.maxApplications as number, amount: body.amount as string,
            currency: body.currency as string, billingInterval: body.billingInterval as "monthly" | "annual" | "one_time",
            effectiveFrom: body.effectiveFrom as string, effectiveTo: body.effectiveTo as string | null | undefined,
            changeReason: body.changeReason as string, approvalRequired: body.approvalRequired as boolean,
          }, context);
          sendApiSuccess(request, response, 201, { tariff: created }); return;
        }
        const match = /^\/admin\/commercial-tariffs\/([^/]+)\/(\d+)\/(approve|publish)$/.exec(requestUrl.pathname);
        if (match && request.method === "POST") {
          const tariffKey = decodeURIComponent(match[1]);
          const tariffVersion = Number(match[2]);
          const body = await readJson(request);
          if (match[3] === "approve") {
            if (Object.keys(body).some((key) => key !== "approvalReference") || typeof body.approvalReference !== "string") {
              sendApiError(request, response, 400, "TARIFF_APPROVAL_REFERENCE_REQUIRED", "An approval reference is required."); return;
            }
            const tariff = await store.approve({ tariffKey, tariffVersion, approvalReference: body.approvalReference }, context);
            sendApiSuccess(request, response, 200, { tariff }); return;
          }
          if (Object.keys(body).length) {
            sendApiError(request, response, 400, "PUBLISH_BODY_MUST_BE_EMPTY", "Publishing accepts no mutable tariff fields."); return;
          }
          const tariff = await store.publish({ tariffKey, tariffVersion }, context);
          sendApiSuccess(request, response, 200, { tariff }); return;
        }
        sendMethodNotAllowed(request, response, requestUrl.pathname === "/admin/commercial-tariffs" ? "GET, POST" : "POST");
        return;
      } catch (error) {
        if (error instanceof CommercialTariffAdminError) {
          sendApiError(request, response, error.status, error.code, "The tariff catalogue operation could not be completed."); return;
        }
        const message = error instanceof Error ? error.message : "";
        const status = /CONFLICT|IMMUTABLE|APPROVAL/.test(message) ? 409 : /INVALID|REQUIRED/.test(message) ? 400 : 503;
        const code = message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 64) || "COMMERCIAL_TARIFF_OPERATION_FAILED";
        sendApiError(request, response, status, code, "The tariff catalogue operation could not be completed."); return;
      }
    }

    const adminConfigPath = requestUrl.pathname;
    if (["/admin/config/price-book", "/admin/config/payment-vendor", "/admin/config/workflows", "/admin/config/roles-access", "/admin/config/access-check", "/admin/config/ai-integrations"].includes(adminConfigPath)) {
      if (process.env.EPER_ADMIN_CONFIG_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      const durableAdminMode = process.env.EPER_ADMIN_CONFIG_PERSISTENCE === "postgres";
      let adminIdentity: TrustedAdminConfigIdentity | null = null;
      if (durableAdminMode) {
        if (!options.adminConfigurationStore) {
          sendJson(request, response, 503, { error: "admin_config_durable_store_unconfigured" });
          return;
        }
        adminIdentity = resolveAdminConfigIdentity(request);
        if (!adminIdentity) {
          sendJson(request, response, 401, { error: "unauthorized_or_unmapped_admin_identity" });
          return;
        }
      } else {
        const adminToken = process.env.EPER_ADMIN_CONFIG_API_TOKEN ?? "";
        if (adminToken.length < 32) {
          sendJson(request, response, 503, { error: "admin_config_api_unconfigured" });
          return;
        }
        if (!bearerMatches(request, adminToken)) {
          sendJson(request, response, 401, { error: "unauthorized" });
          return;
        }
      }
      try {
        if (durableAdminMode && options.adminConfigurationStore && adminIdentity) {
          const environment = options.adminConfigEnvironment ?? "uat";
          await handleDurableAdminConfig(
            request, response, adminConfigPath, options.adminConfigurationStore, adminIdentity,
            environment, options.serviceVersion, marketPriceEntries,
          );
          return;
        }
        if (adminConfigPath === "/admin/config/workflows" && request.method === "GET") {
          sendJson(request, response, 200, { workflows: workflowConfig.listWorkflows(), persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/workflows" && request.method === "PUT") {
          const body = await readJson(request);
          const workflows = workflowConfig.replaceWorkflows(body.workflows);
          sendJson(request, response, 200, { workflows, persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/roles-access" && request.method === "GET") {
          sendJson(request, response, 200, {
            roles: workflowConfig.listRoles(),
            availablePermissions: WorkflowConfigurationService.PERMISSIONS,
            persistence: "process-memory",
            restartPersistence: false,
          });
          return;
        }
        if (adminConfigPath === "/admin/config/roles-access" && request.method === "PUT") {
          const body = await readJson(request);
          const roles = workflowConfig.replaceRoles(body.roles);
          sendJson(request, response, 200, { roles, availablePermissions: WorkflowConfigurationService.PERMISSIONS, persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/access-check" && request.method === "POST") {
          const body = await readJson(request);
          if (typeof body.principalId !== "string" || !body.principalId.trim() || body.principalId.length > 128 ||
              typeof body.permission !== "string" ||
              !(WorkflowConfigurationService.PERMISSIONS as readonly string[]).includes(body.permission) ||
              (body.workflowId !== undefined && (typeof body.workflowId !== "string" || body.workflowId.length > 128))) {
            sendJson(request, response, 400, { error: "principalId_and_supported_permission_required" });
            return;
          }
          const decision = workflowConfig.checkAccess(
            body.principalId,
            body.permission as import("../../packages/workflows/workflow-configuration.js").WorkflowPermission,
            body.workflowId as string | undefined,
          );
          sendJson(request, response, 200, { ...decision });
          return;
        }
        if (["/admin/config/workflows", "/admin/config/roles-access", "/admin/config/access-check"].includes(adminConfigPath)) {
          sendMethodNotAllowed(request, response, adminConfigPath === "/admin/config/access-check" ? "POST" : "GET, PUT");
          return;
        }
        if (adminConfigPath === "/admin/config/price-book" && request.method === "GET") {
          sendJson(request, response, 200, { entries: marketPriceEntries, persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/price-book" && request.method === "PUT") {
          const body = await readJson(request);
          const candidate = body.entry;
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            sendJson(request, response, 400, { error: "entry_object_required" });
            return;
          }
          const entry = candidate as MarketPriceEntry;
          const nextEntries = marketPriceEntries.filter((current) =>
            !(current.productId === entry.productId && current.marketId === entry.marketId &&
              current.priceBookId === entry.priceBookId && current.priceBookVersion === entry.priceBookVersion));
          if (nextEntries.length >= 10_000) {
            sendJson(request, response, 503, { error: "MARKET_PRICE_BOOK_CAPACITY_EXCEEDED" });
            return;
          }
          nextEntries.push(entry);
          const nextService = new MarketPriceBookService(nextEntries);
          marketPriceEntries = nextEntries;
          marketPriceBook = nextService;
          sendJson(request, response, 200, { entries: marketPriceEntries, persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/payment-vendor" && request.method === "GET") {
          const provider = paymentVendorConfig.provider;
          const providerKeyConfigured = provider === "razorpay"
            ? Boolean(process.env.EPER_RAZORPAY_KEY_ID && process.env.EPER_RAZORPAY_KEY_SECRET)
            : provider === "stripe" ? Boolean(process.env.EPER_STRIPE_SECRET_KEY)
            : provider === "adyen" ? Boolean(process.env.EPER_ADYEN_API_KEY && process.env.EPER_ADYEN_MERCHANT_ACCOUNT)
            : Boolean(process.env.EPER_PAYMENT_SANDBOX_TOKEN && process.env.EPER_PAYMENT_SANDBOX_TENANT_ID &&
              process.env.EPER_PAYMENT_SANDBOX_PRINCIPAL_ID);
          const webhookSecretConfigured = provider === "razorpay"
            ? Boolean(process.env.EPER_RAZORPAY_WEBHOOK_SECRET)
            : provider === "stripe" ? Boolean(process.env.EPER_STRIPE_WEBHOOK_SECRET)
            : provider === "adyen" ? Boolean(process.env.EPER_ADYEN_HMAC_KEY)
            : false;
          const adapterAvailable = provider === "sandbox";
          sendJson(request, response, 200, {
            provider, mode: paymentVendorConfig.mode, sandboxEnabled: paymentVendorConfig.sandboxEnabled,
            productionEnabled: false, adapterAvailable,
            credentials: { providerKeyConfigured, webhookSecretConfigured },
            persistence: "process-memory",
            message: adapterAvailable ? "Sandbox adapter selected; no live charges can be made." : "Provider selection saved as configuration only; adapter is not implemented and cannot process payments.",
          });
          return;
        }
        if (adminConfigPath === "/admin/config/payment-vendor" && request.method === "PUT") {
          const body = await readJson(request);
          const allowedProviders = ["sandbox", "razorpay", "stripe", "adyen"];
          if (typeof body.provider !== "string" || !allowedProviders.includes(body.provider) ||
              body.mode !== "sandbox" || typeof body.sandboxEnabled !== "boolean") {
            sendJson(request, response, 400, { error: "provider must be supported; mode must remain sandbox; sandboxEnabled must be boolean" });
            return;
          }
          paymentVendorConfig = {
            provider: body.provider,
            mode: "sandbox",
            sandboxEnabled: body.sandboxEnabled && body.provider === "sandbox" &&
              process.env.EPER_PAYMENT_SANDBOX_ENABLED === "true",
          };
          sendJson(request, response, 200, {
            provider: paymentVendorConfig.provider,
            mode: paymentVendorConfig.mode,
            sandboxEnabled: paymentVendorConfig.sandboxEnabled,
            productionEnabled: false,
            adapterAvailable: paymentVendorConfig.provider === "sandbox",
            persistence: "process-memory",
            message: paymentVendorConfig.provider === "sandbox"
              ? "Sandbox configuration updated. Server-side sandbox opt-in and tenant settings are still required."
              : "Provider selection recorded for planning only. Its adapter is not implemented; sandbox payment flow is disabled for this selection.",
          });
          return;
        }
        sendMethodNotAllowed(request, response, "GET, PUT");
      } catch (error) {
        const message = error instanceof Error ? error.message : "ADMIN_CONFIG_OPERATION_FAILED";
        const status = error instanceof WorkflowConfigurationError ? error.statusCode
          : error instanceof AdminConfigurationConflictError ? 409
          : message === "MARKET_PRICE_CONFIGURATION_AMBIGUOUS" ? 409
          : message.startsWith("MARKET_PRICE_") || message.startsWith("PRICE_") ||
            message === "MARKET_PRICE_REQUIRED_FIELDS_MISSING" ? 400
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : message === "ADMIN_CONFIGURATION_EXPECTED_VERSION_REQUIRED" ? 400
          : error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400
          // Unknown failures in durable mode are store/operational failures, not client input.
          : durableAdminMode ? 503
          : 422;
        sendJson(request, response, status, { error: status === 503 && durableAdminMode ? "admin_config_durable_store_unavailable" : message });
      }
      return;
    }

    // Market-specific pricing quotes. No FX conversion is performed; each
    // market/currency pair must be present in the approved price-book config.
    if (requestUrl.pathname === "/pricing/options" || requestUrl.pathname === "/pricing/quote") {
      if (process.env.EPER_PRICING_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      const durablePricingMode = process.env.EPER_ADMIN_CONFIG_PERSISTENCE === "postgres";
      let pricingIdentity: TrustedAdminConfigIdentity | null = null;
      if (durablePricingMode) {
        if (!options.adminConfigurationStore) {
          sendJson(request, response, 503, { error: "pricing_durable_store_unconfigured" });
          return;
        }
        // In durable mode, price lookup must use the same trusted tenant identity as
        // admin configuration. A shared pricing token cannot safely select a tenant.
        pricingIdentity = resolveAdminConfigIdentity(request);
        if (!pricingIdentity) {
          sendJson(request, response, 401, { error: "unauthorized_or_unmapped_pricing_identity" });
          return;
        }
      } else {
        const pricingToken = process.env.EPER_PRICING_API_TOKEN ?? "";
        if (pricingToken.length < 32) {
          sendJson(request, response, 503, { error: "pricing_api_unconfigured" });
          return;
        }
        if (!bearerMatches(request, pricingToken)) {
          sendJson(request, response, 401, { error: "unauthorized" });
          return;
        }
      }
      try {
        // Resolve the tenant's persisted price book on every request so successful
        // admin edits immediately affect quotes/options and survive process restarts.
        let requestPriceBook = marketPriceBook;
        if (durablePricingMode && options.adminConfigurationStore && pricingIdentity) {
          let savedPriceBook: { config?: unknown } | null;
          try {
            savedPriceBook = await options.adminConfigurationStore.get(pricingIdentity.tenantId, "price-book");
          } catch {
            // A durable-store outage is an operational failure, not bad client input.
            sendJson(request, response, 503, { error: "pricing_durable_store_unavailable" });
            return;
          }
          const entries = (savedPriceBook?.config ?? marketPriceEntries) as MarketPriceEntry[];
          requestPriceBook = new MarketPriceBookService(entries);
        }
        if (request.method === "GET" && requestUrl.pathname === "/pricing/options") {
          const productId = requestUrl.searchParams.get("productId") ?? "";
          sendJson(request, response, 200, { markets: requestPriceBook.listMarkets(productId) });
          return;
        }
        if (request.method === "POST" && requestUrl.pathname === "/pricing/quote") {
          const body = await readJson(request);
          if (typeof body.productId !== "string" || typeof body.marketId !== "string" ||
              (body.currency !== undefined && typeof body.currency !== "string")) {
            sendJson(request, response, 400, { error: "productId and marketId are required; currency must be a string when supplied" });
            return;
          }
          const quote = requestPriceBook.quote({
            productId: body.productId,
            marketId: body.marketId,
            ...(typeof body.currency === "string" ? { currency: body.currency } : {}),
          });
          sendJson(request, response, 200, { quote, amountMajor: quote.amountMinor / 100 });
          return;
        }
        sendMethodNotAllowed(request, response, "GET, POST");
      } catch (error) {
        const message = error instanceof Error ? error.message : "MARKET_PRICING_OPERATION_FAILED";
        const status = message === "APPROVED_MARKET_PRICE_NOT_FOUND" ? 404
          : message === "MARKET_PRICE_CONFIGURATION_AMBIGUOUS" ? 409
          : message === "MARKET_CURRENCY_MISMATCH" || message.startsWith("PRICE_") ||
            message.startsWith("MARKET_PRICE_") || message === "MARKET_PRICE_BOOK_JSON_ARRAY_REQUIRED" ? 400
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(request, response, status, { error: message });
      }
      return;
    }


    if (request.method === "GET" && requestUrl.pathname === "/localization/options") {
      sendJson(request, response, 200, { ...localizationService.options() });
      return;
    }

    if (requestUrl.pathname === "/localization/preferences") {
      if (process.env.EPER_LOCALIZATION_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      const localizationToken = process.env.EPER_LOCALIZATION_API_TOKEN ?? "";
      const localizationTenant = process.env.EPER_LOCALIZATION_TENANT_ID ?? "";
      const localizationPrincipal = process.env.EPER_LOCALIZATION_PRINCIPAL_ID ?? "";
      if (localizationToken.length < 32 || !localizationTenant || !localizationPrincipal) {
        sendJson(request, response, 503, { error: "localization_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, localizationToken)) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }
      try {
        if (request.method === "GET") {
          sendJson(request, response, 200, { preference: localizationService.getPreference(localizationTenant, localizationPrincipal) });
          return;
        }
        if (request.method === "PUT") {
          const body = await readJson(request);
          const preference = localizationService.setPreference(localizationTenant, localizationPrincipal, {
            ...(typeof body.locale === "string" ? { locale: body.locale as SupportedLocale } : {}),
            ...(typeof body.currency === "string" ? { currency: body.currency as SupportedCurrency } : {}),
            ...(typeof body.timeZone === "string" ? { timeZone: body.timeZone } : {}),
          });
          sendJson(request, response, 200, { preference });
          return;
        }
        sendMethodNotAllowed(request, response, "GET, PUT");
      } catch (error) {
        const message = error instanceof Error ? error.message : "LOCALIZATION_OPERATION_FAILED";
        const status = message === "LOCALIZATION_STORE_CAPACITY_REACHED" ? 503
          : message === "LOCALIZATION_ACTOR_REQUIRED" ? 400
          : message === "LOCALE_UNSUPPORTED" || message === "CURRENCY_UNSUPPORTED" || message === "TIME_ZONE_INVALID" ? 400
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(request, response, status, { error: message });
      }
      return;
    }


    if (request.method === "GET" && requestUrl.pathname === "/health") {
      const buildId = process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID || "";
      const buildIdIsCommit = /^[a-f0-9]{40}$/i.test(buildId);

      sendJson(request, response, buildIdIsCommit ? 200 : 503, {
        status: buildIdIsCommit ? "ok" : "unconfigured",
        service: "eper-api",
        buildId: buildIdIsCommit ? buildId : null,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/readyz/payments") {
      // Payment readiness is independent of general API health and never exposes secrets.
      const blockers: string[] = [];
      if (process.env.EPER_PAYMENT_PERSISTENCE !== "postgres" || !options.paymentStore) {
        blockers.push("durable_postgres_payment_store_unavailable");
      } else {
        try {
          if (typeof options.paymentStore.checkConnectivity !== "function" || !(await options.paymentStore.checkConnectivity())) {
            blockers.push("postgres_payment_database_unreachable");
          }
        } catch {
          blockers.push("postgres_payment_database_unreachable");
        }
      }
      if (!options.invoiceAmountSource || typeof options.invoiceAmountSource.findInvoice !== "function") {
        blockers.push("trusted_invoice_authority_unavailable");
      }
      if (typeof options.receiptNumberSource !== "function") {
        blockers.push("receipt_numbering_policy_unconfigured");
      }
      if (!options.transactionSnapshotSource || typeof options.transactionSnapshotSource.findTransaction !== "function") {
        blockers.push("trusted_transaction_authority_unavailable");
      }
      // Schema readiness is distinct from SELECT 1 connectivity. The real store checks
      // the immutable snapshot columns required by the payment/receipt contract.
      const schemaStore = options.paymentStore as (PostgresPaymentStore & { checkSchema?: () => Promise<boolean> }) | undefined;
      if (schemaStore && typeof schemaStore.checkSchema === "function") {
        try {
          if (!(await schemaStore.checkSchema())) blockers.push("postgres_payment_schema_unavailable");
        } catch {
          blockers.push("postgres_payment_schema_unavailable");
        }
      }
      if (blockers.length === 0 && process.env.NODE_ENV !== "production" &&
          process.env.EPER_PAYMENT_PERSISTENCE === "postgres" &&
          !paymentTenantIdentityConfigured()) {
        blockers.push("tenant_identity_unconfigured");
      }
      if (blockers.length === 0 && process.env.NODE_ENV !== "production") {
        const gatewayConfigured = Boolean(
          process.env.RAZORPAY_KEY_ID &&
          process.env.RAZORPAY_KEY_SECRET &&
          process.env.RAZORPAY_WEBHOOK_SECRET &&
          (process.env.EPER_PAYMENT_API_TOKEN ?? "").length >= 32
        );
        if (!gatewayConfigured) blockers.push("payment_gateway_unconfigured");
      }
      if (process.env.NODE_ENV === "production") {
        blockers.push("production_payment_enablement_requires_authorized_readiness_review");
      }
      const ready = blockers.length === 0;
      sendJson(request, response, ready ? 200 : 503, {
        status: ready ? "ready" : "blocked",
        subsystem: "payments",
        blockers,
      });
      return;
    }

    // Catch async payment failures at the HTTP request boundary so a rejected
    // createServer listener cannot terminate the process or leak internals.
    try {
      if (await handlePaymentRoute(request, response, requestUrl.pathname, options.invoiceAmountSource, options.paymentStore, options.receiptNumberSource, options.transactionSnapshotSource, options.allowLegacyPaymentLedgerForTests === true)) return;
    } catch {
      if (!response.headersSent) sendJson(request, response, 503, { error: "payment_operation_unavailable" });
      else response.destroy();
      return;
    }



    // Tenant-scoped customer ticket API. Disabled unless explicitly enabled and backed by
    // PostgreSQL plus the canonical transactional audit writer configured at startup.
    const ticketPathMatch = /^\/customer\/applications\/([^/]+)\/tickets(?:\/([^/]+)(?:\/(replies))?)?$/.exec(requestUrl.pathname);
    if (ticketPathMatch && (request.method === "GET" || request.method === "POST")) {
      if (process.env.EPER_TICKETING_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      if (!options.ticketStore) {
        sendJson(request, response, 503, { error: "ticketing_unavailable" });
        return;
      }
      let applicationId: string;
      try { applicationId = decodeURIComponent(ticketPathMatch[1]); }
      catch { sendJson(request, response, 400, { error: "invalid_path_encoding" }); return; }
      if (!applicationId.trim() || applicationId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(applicationId)) {
        sendJson(request, response, 400, { error: "invalid_application_id" });
        return;
      }
      let identity: TrustedCustomerAccessIdentity | null;
      if (process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE === "postgres") {
        if (!options.customerIdentitySessionStore || !options.tenantApplicationAssignmentStore ||
            !options.actorApplicationAssignmentStore) {
          sendApiError(request, response, 503, "CUSTOMER_BROWSER_IDENTITY_UNAVAILABLE",
            "Durable customer browser identity is not configured.");
          return;
        }
        const browserIdentity = await resolveCustomerBrowserIdentity({
          cookieHeader: request.headers.cookie, applicationId,
          sessionStore: options.customerIdentitySessionStore,
          tenantAssignments: options.tenantApplicationAssignmentStore,
          actorAssignments: options.actorApplicationAssignmentStore,
        });
        if (!browserIdentity) {
          sendApiError(request, response, 401, "UNAUTHENTICATED",
            "A valid browser session with active tenant and actor application assignments is required.");
          return;
        }
        if (request.method === "POST") {
          const cookies = parseCookieHeader(request.headers.cookie);
          const sessionToken = cookies.get("__Host-eper_session") ?? "";
          const csrfHeader = request.headers["x-csrf-token"];
          const csrfValid = verifyCustomerBrowserCsrf({
            method: request.method,
            origin: request.headers.origin,
            expectedOrigin: options.customerOidcPublicOrigin ?? process.env.EPER_CUSTOMER_BROWSER_ORIGIN ?? "",
            cookieHeader: request.headers.cookie,
            csrfHeader: typeof csrfHeader === "string" ? csrfHeader : undefined,
            sessionToken,
            secret: options.customerCsrfSecret ?? process.env.EPER_CUSTOMER_CSRF_SECRET ?? "",
          });
          if (!csrfValid) {
            sendApiError(request, response, 403, "CSRF_VALIDATION_FAILED",
              "A valid same-origin CSRF token is required for this browser request.");
            return;
          }
        }
        identity = {
          tenantId: browserIdentity.tenantId,
          actorId: browserIdentity.actorId,
          roleKey: "customer-user",
          applicationIds: [browserIdentity.applicationId],
        };
      } else {
        identity = resolveCustomerAccessIdentity(request);
        if (!identity) {
          sendJson(request, response, 401, { error: "unauthorized" });
          return;
        }
      }
      // Global ticketing enablement is insufficient: the tenant must have the
      // customer-facing Tickets & Feedback module enabled as well.
      let workspaceModules: unknown;
      try { workspaceModules = JSON.parse(process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON ?? ""); }
      catch { workspaceModules = null; }
      const tenantModules = workspaceModules && typeof workspaceModules === "object" && !Array.isArray(workspaceModules)
        ? (workspaceModules as Record<string, unknown>)[identity.tenantId]
        : undefined;
      if (!Array.isArray(tenantModules) || !tenantModules.includes("tickets-feedback")) {
        sendJson(request, response, 403, { error: "customer_ticketing_not_enabled" });
        return;
      }
      let tenantAssignments: unknown;
      if (options.tenantApplicationAssignmentStore) {
        tenantAssignments = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
      } else {
        let assignments: unknown;
        try { assignments = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
        catch { assignments = null; }
        tenantAssignments = assignments && typeof assignments === "object" && !Array.isArray(assignments)
          ? (assignments as Record<string, unknown>)[identity.tenantId] : null;
      }
      if (!Array.isArray(tenantAssignments) || !tenantAssignments.includes(applicationId)) {
        sendJson(request, response, 403, { error: "application_not_assigned_to_tenant" });
        return;
      }
      // Tenant ownership alone is not actor authorization. Require the credential's
      // explicit application allow-list before reading, creating, or replying to tickets.
      if (!(options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
        : process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE !== "postgres" &&
          identity.applicationIds?.includes(applicationId) === true)) {
        sendJson(request, response, 403, { error: "actor_not_assigned_to_application" });
        return;
      }
      const correlationId = resolveApiRequestId(request);
      try {
        if (request.method === "POST" && !ticketPathMatch[2]) {
          const body = await readJson(request);
          const validated = validateCreateTicketInput(body);
          if (!validated.valid) {
            sendJson(request, response, 400, { error: "invalid_ticket_input", details: validated.errors });
            return;
          }
          const idempotencyHeader = request.headers["idempotency-key"];
          const idempotencyKey = typeof idempotencyHeader === "string" ? idempotencyHeader : undefined;
          if (idempotencyKey !== undefined && !/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey)) {
            sendJson(request, response, 400, { error: "invalid_idempotency_key" });
            return;
          }
          const ticket = await options.ticketStore.create({
            tenantId: identity.tenantId, applicationId, actorId: identity.actorId, correlationId,
          }, validated.value, idempotencyKey);
          sendJson(request, response, 201, { ticket });
          return;
        }
        if (request.method === "GET" && !ticketPathMatch[2]) {
          const query = requestUrl.searchParams;
          const status = query.get("status") ?? undefined;
          const severity = query.get("severity") ?? undefined;
          const type = query.get("type") ?? undefined;
          const limit = query.has("limit") ? Number(query.get("limit")) : 50;
          const offset = query.has("offset") ? Number(query.get("offset")) : 0;
          if ((status && !(TICKET_STATUSES as readonly string[]).includes(status)) ||
              (severity && !(TICKET_SEVERITIES as readonly string[]).includes(severity)) ||
              (type && !(TICKET_TYPES as readonly string[]).includes(type)) ||
              !Number.isInteger(limit) || limit < 1 || limit > 100 ||
              !Number.isInteger(offset) || offset < 0) {
            sendJson(request, response, 400, { error: "invalid_ticket_filters" });
            return;
          }
          const tickets = await options.ticketStore.list({ tenantId: identity.tenantId }, {
            applicationId, status: status as typeof TICKET_STATUSES[number] | undefined,
            severity: severity as typeof TICKET_SEVERITIES[number] | undefined,
            type: type as typeof TICKET_TYPES[number] | undefined, limit, offset,
          });
          sendJson(request, response, 200, { tickets, limit, offset });
          return;
        }
        if (ticketPathMatch[2] && ticketPathMatch[3] === "replies" &&
            (request.method === "GET" || request.method === "POST")) {
          let ticketId: string;
          try { ticketId = decodeURIComponent(ticketPathMatch[2]); }
          catch { sendJson(request, response, 400, { error: "invalid_ticket_id_encoding" }); return; }
          if (!/^[0-9a-f-]{36}$/i.test(ticketId)) {
            sendJson(request, response, 400, { error: "invalid_ticket_id" }); return;
          }
          const scopedIdentity = { tenantId: identity.tenantId, applicationId, actorId: identity.actorId, correlationId };
          if (request.method === "GET") {
            const replies = await options.ticketStore.listReplies(scopedIdentity, ticketId, "customer");
            if (!replies) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
            sendJson(request, response, 200, { replies }); return;
          }
          const body = await readJson(request);
          if (typeof body.body !== "string" || !body.body.trim() || body.body.trim().length > 8000 ||
              Object.keys(body).some((key) => key !== "body")) {
            sendJson(request, response, 400, { error: "invalid_ticket_reply" }); return;
          }
          const reply = await options.ticketStore.addReply(scopedIdentity, ticketId, body.body.trim(), "customer");
          if (!reply) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
          sendJson(request, response, 201, { reply }); return;
        }
        sendJson(request, response, 405, { error: "method_not_allowed" });
      } catch (error) {
        if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") {
          sendJson(request, response, 409, { error: "idempotency_key_conflict" });
        } else if (error instanceof SyntaxError || error instanceof Error && error.message === "JSON_OBJECT_REQUIRED") {
          sendJson(request, response, 400, { error: "invalid_json" });
        } else if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") {
          sendJson(request, response, 413, { error: "request_body_too_large" });
        } else {
          sendJson(request, response, 503, { error: "ticket_operation_unavailable" });
        }
      }
      return;
    }


    // Tenant-scoped support-admin ticket queue and controlled lifecycle mutations.
    const adminTicketMatch = /^\/admin\/support\/tickets(?:\/([^/]+)\/(status|severity|duplicate-disposition|assignment|replies))?$/.exec(requestUrl.pathname);
    if (adminTicketMatch && (request.method === "GET" || request.method === "PATCH" || request.method === "POST")) {
      if (process.env.EPER_TICKETING_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      if (!options.ticketStore) {
        sendJson(request, response, 503, { error: "ticketing_unavailable" });
        return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }
      let allowedRoles: unknown;
      try { allowedRoles = JSON.parse(process.env.EPER_TICKETING_ADMIN_ROLE_KEYS_JSON ?? ""); }
      catch { allowedRoles = null; }
      if (!Array.isArray(allowedRoles) || allowedRoles.length === 0 ||
          allowedRoles.some((role) => typeof role !== "string" || !role.trim()) ||
          !allowedRoles.includes(identity.roleKey)) {
        sendJson(request, response, 403, { error: "ticket_admin_permission_required" });
        return;
      }
      const correlationId = resolveApiRequestId(request);
      let crossTenantRoles: unknown;
      try { crossTenantRoles = JSON.parse(process.env.EPER_TICKETING_CROSS_TENANT_ROLE_KEYS_JSON ?? "[]"); }
      catch { crossTenantRoles = null; }
      if (!Array.isArray(crossTenantRoles) ||
          crossTenantRoles.some((role) => typeof role !== "string" || !role.trim())) {
        sendJson(request, response, 503, { error: "ticket_scope_configuration_invalid" });
        return;
      }
      const canViewCrossTenant = crossTenantRoles.includes(identity.roleKey);
      const trustedIdentity = {
        tenantId: identity.tenantId,
        applicationId: "eper",
        actorId: identity.actorId,
        correlationId,
      };
      try {
        if (request.method === "GET" && !adminTicketMatch[1]) {
          const query = requestUrl.searchParams;
          const status = query.get("status") ?? undefined;
          const severity = query.get("severity") ?? undefined;
          const type = query.get("type") ?? undefined;
          const applicationId = query.get("applicationId") ?? undefined;
          const search = query.get("search")?.trim() || undefined;
          const limit = query.has("limit") ? Number(query.get("limit")) : 50;
          const offset = query.has("offset") ? Number(query.get("offset")) : 0;
          if ((status && !(TICKET_STATUSES as readonly string[]).includes(status)) ||
              (severity && !(TICKET_SEVERITIES as readonly string[]).includes(severity)) ||
              (type && !(TICKET_TYPES as readonly string[]).includes(type)) ||
              (applicationId && (!/^[a-zA-Z0-9._:-]{1,128}$/.test(applicationId))) ||
              (search !== undefined && search.length > 200) ||
              !Number.isInteger(limit) || limit < 1 || limit > 100 ||
              !Number.isInteger(offset) || offset < 0) {
            sendJson(request, response, 400, { error: "invalid_ticket_filters" });
            return;
          }
          const scope = canViewCrossTenant ? { crossTenant: true as const } : { tenantId: identity.tenantId };
          const page = await options.ticketStore.list(scope, {
          // Fetch one extra row so the UI can know whether another page truly exists.
            status: status as typeof TICKET_STATUSES[number] | undefined,
            severity: severity as typeof TICKET_SEVERITIES[number] | undefined,
            type: type as typeof TICKET_TYPES[number] | undefined, applicationId,
            ...(search !== undefined ? { search } : {}), limit: limit + 1, offset,
          });
          const hasMore = page.length > limit;
          const tickets = hasMore ? page.slice(0, limit) : page;
          const distinctConfirmedP1Count = !canViewCrossTenant && typeof options.ticketStore.countDistinctConfirmedP1 === "function"
            ? await options.ticketStore.countDistinctConfirmedP1(identity.tenantId) : null;
          sendJson(request, response, 200, {
            tickets, limit, offset, hasMore, distinctConfirmedP1Count,
            scope: canViewCrossTenant ? "authorized_platform" : "tenant",
            ...(canViewCrossTenant ? {} : { tenantId: identity.tenantId }),
          });
          return;
        }
        if ((request.method === "PATCH" || request.method === "POST" || request.method === "GET") && adminTicketMatch[1]) {
          let ticketId: string;
          try { ticketId = decodeURIComponent(adminTicketMatch[1]); }
          catch { sendJson(request, response, 400, { error: "invalid_ticket_id_encoding" }); return; }
          if (!/^[0-9a-f-]{36}$/i.test(ticketId)) {
            sendJson(request, response, 400, { error: "invalid_ticket_id" });
            return;
          }
          if (adminTicketMatch[2] === "replies" && (request.method === "GET" || request.method === "POST")) {
            const scopedIdentity = { ...trustedIdentity, applicationId: "eper" };
            if (request.method === "GET") {
              const replies = await options.ticketStore.listReplies(scopedIdentity, ticketId, "admin");
              if (!replies) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
              sendJson(request, response, 200, { replies }); return;
            }
            const replyBody = await readJson(request);
            const visibility = replyBody.visibility === undefined ? "customer_visible" : replyBody.visibility;
            if (typeof replyBody.body !== "string" || !replyBody.body.trim() || replyBody.body.trim().length > 8000 ||
                (visibility !== "customer_visible" && visibility !== "internal") ||
                Object.keys(replyBody).some((key) => key !== "body" && key !== "visibility")) {
              sendJson(request, response, 400, { error: "invalid_ticket_reply" }); return;
            }
            const reply = await options.ticketStore.addReply(scopedIdentity, ticketId, replyBody.body.trim(), "support", visibility);
            if (!reply) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
            sendJson(request, response, 201, { reply }); return;
          }
          if (request.method !== "PATCH") { sendJson(request, response, 405, { error: "method_not_allowed" }); return; }
          const body = await readJson(request);
          if (adminTicketMatch[2] === "status") {
            if (typeof body.status !== "string" || !(TICKET_STATUSES as readonly string[]).includes(body.status) ||
                Object.keys(body).some((key) => key !== "status")) {
              sendJson(request, response, 400, { error: "invalid_ticket_status_update" });
              return;
            }
            const ticket = await options.ticketStore.changeStatus(trustedIdentity, ticketId, body.status as typeof TICKET_STATUSES[number]);
            if (!ticket) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
            sendJson(request, response, 200, { ticket });
            return;
          }
          if (adminTicketMatch[2] === "severity") {
            const validSeverity = typeof body.severity === "string" &&
              (TICKET_SEVERITIES as readonly string[]).includes(body.severity);
            const validRationale = body.rationale === undefined ||
              (typeof body.rationale === "string" && body.rationale.trim().length <= 1000);
            if (!validSeverity || !validRationale ||
                Object.keys(body).some((key) => key !== "severity" && key !== "rationale") ||
                (typeof body.rationale !== "string" || body.rationale.trim().length < 20)) {
              sendJson(request, response, 400, { error: "invalid_ticket_severity_classification" });
              return;
            }
            const ticket = await options.ticketStore.classifySeverity(
              trustedIdentity, ticketId, body.severity as typeof TICKET_SEVERITIES[number],
              typeof body.rationale === "string" ? body.rationale.trim() : undefined,
            );
            if (!ticket) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
            sendJson(request, response, 200, { ticket });
            return;
          }
          if (adminTicketMatch[2] === "duplicate-disposition") {
            const validDisposition = body.disposition === "needs_review" || body.disposition === "distinct" || body.disposition === "duplicate";
            const canonicalTicketId = body.canonicalTicketId === undefined || body.canonicalTicketId === null
              ? null : body.canonicalTicketId;
            if (!validDisposition ||
                (canonicalTicketId !== null && (typeof canonicalTicketId !== "string" || !/^[0-9a-f-]{36}$/i.test(canonicalTicketId))) ||
                typeof body.rationale !== "string" || body.rationale.trim().length < 20 || body.rationale.trim().length > 1000 ||
                Object.keys(body).some((key) => !["disposition", "canonicalTicketId", "rationale"].includes(key))) {
              sendJson(request, response, 400, { error: "invalid_ticket_duplicate_disposition" });
              return;
            }
            const ticket = await options.ticketStore.setDuplicateDisposition(
              trustedIdentity, ticketId, body.disposition as "needs_review" | "distinct" | "duplicate", canonicalTicketId, body.rationale.trim(),
            );
            if (!ticket) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
            sendJson(request, response, 200, { ticket });
            return;
          }
          if (adminTicketMatch[2] === "assignment") {
            if (!(body.assignedTo === null || (typeof body.assignedTo === "string" && /^[a-zA-Z0-9._:@-]{1,128}$/.test(body.assignedTo))) ||
                Object.keys(body).some((key) => key !== "assignedTo")) {
              sendJson(request, response, 400, { error: "invalid_ticket_assignment" });
              return;
            }
            const ticket = await options.ticketStore.assign(trustedIdentity, ticketId, body.assignedTo as string | null);
            if (!ticket) { sendJson(request, response, 404, { error: "ticket_not_found" }); return; }
            sendJson(request, response, 200, { ticket });
            return;
          }
        }
        sendJson(request, response, 405, { error: "method_not_allowed" });
      } catch (error) {
        if (error instanceof Error && error.message === "ticket_duplicate_canonical_invalid") {
          sendJson(request, response, 409, { error: "ticket_duplicate_canonical_invalid" });
        } else if (error instanceof Error && error.message === "ticket_p1_evidence_required") {
          sendJson(request, response, 409, { error: "ticket_p1_evidence_required" });
        } else if (error instanceof SyntaxError || error instanceof Error && error.message === "JSON_OBJECT_REQUIRED") {
          sendJson(request, response, 400, { error: "invalid_json" });
        } else if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") {
          sendJson(request, response, 413, { error: "request_body_too_large" });
        } else {
          sendJson(request, response, 503, { error: "ticket_operation_unavailable" });
        }
      }
      return;
    }

    // Authenticated customer application list. Assignment data is server-managed and tenant-scoped.
    if (request.method === "GET" && requestUrl.pathname === "/customer/applications") {
      if (process.env.EPER_CUSTOMER_PORTAL_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      let identity: TrustedCustomerAccessIdentity | null;
      if (process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE === "postgres") {
        if (!options.customerIdentitySessionStore || !options.tenantApplicationAssignmentStore ||
            !options.actorApplicationAssignmentStore) {
          sendApiError(request, response, 503, "CUSTOMER_BROWSER_IDENTITY_UNAVAILABLE",
            "Durable customer browser identity and assignment stores are required.");
          return;
        }
        const sessionToken = parseCookieHeader(request.headers.cookie).get("__Host-eper_session");
        const session = sessionToken
          ? await options.customerIdentitySessionStore.resolveSession(sessionToken)
          : null;
        if (!session) {
          sendApiError(request, response, 401, "UNAUTHENTICATED",
            "A valid customer browser session is required.");
          return;
        }
        identity = { tenantId: session.tenantId, actorId: session.actorId, roleKey: "customer-user" };
      } else {
        identity = resolveCustomerAccessIdentity(request);
        if (!identity) {
          sendJson(request, response, 401, { error: "unauthorized" });
          return;
        }
      }
      let assignments: unknown;
      try { assignments = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
      catch { assignments = null; }
      if (!options.tenantApplicationAssignmentStore && (!assignments || typeof assignments !== "object" || Array.isArray(assignments))) {
        sendJson(request, response, 503, { error: "customer_applications_unavailable" });
        return;
      }
      const tenantAssignments = options.tenantApplicationAssignmentStore
        ? await options.tenantApplicationAssignmentStore.listActive(identity.tenantId)
        : (assignments as Record<string, unknown>)[identity.tenantId];
      if (!Array.isArray(tenantAssignments) || tenantAssignments.some((item) =>
        typeof item !== "string" || item !== item.trim() || item.length < 1 || item.length > 128 ||
        !/^[a-zA-Z0-9._:-]+$/.test(item))) {
        sendJson(request, response, 503, { error: "customer_applications_unavailable" });
        return;
      }
      // Tenant assignment is necessary but not sufficient: each actor receives
      // only the applications explicitly mapped to their trusted identity.
      const actorApplications = new Set(options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.listActive(identity.tenantId, identity.actorId)
        : identity.applicationIds ?? []);
      sendJson(request, response, 200, {
        applications: [...new Set(tenantAssignments as string[])]
          .filter((applicationId) => actorApplications.has(applicationId))
          .map((applicationId) => ({ applicationId })),
      });
      return;
    }

    // Read-only, tenant- and application-scoped customer settings. Only explicitly safe
    // presentation preferences are returned; secrets and administrative configuration never leave the server.
    if (request.method === "GET" && requestUrl.pathname === "/customer/settings") {
      if (process.env.EPER_CUSTOMER_PORTAL_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      let identity: TrustedCustomerAccessIdentity | null;
      if (process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE === "postgres") {
        if (!options.customerIdentitySessionStore || !options.tenantApplicationAssignmentStore ||
            !options.actorApplicationAssignmentStore) {
          sendApiError(request, response, 503, "CUSTOMER_BROWSER_IDENTITY_UNAVAILABLE",
            "Durable customer browser identity and assignment stores are required.");
          return;
        }
        const sessionToken = parseCookieHeader(request.headers.cookie).get("__Host-eper_session");
        const session = sessionToken
          ? await options.customerIdentitySessionStore.resolveSession(sessionToken)
          : null;
        if (!session) {
          sendApiError(request, response, 401, "UNAUTHENTICATED",
            "A valid customer browser session is required.");
          return;
        }
        identity = { tenantId: session.tenantId, actorId: session.actorId, roleKey: "customer-user" };
      } else {
        identity = resolveCustomerAccessIdentity(request);
        if (!identity) {
          sendJson(request, response, 401, { error: "unauthorized" });
          return;
        }
      }
      let modulesConfig: unknown;
      try { modulesConfig = JSON.parse(process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON ?? ""); }
      catch { modulesConfig = null; }
      const tenantModules = modulesConfig && typeof modulesConfig === "object" && !Array.isArray(modulesConfig)
        ? (modulesConfig as Record<string, unknown>)[identity.tenantId] : null;
      if (!Array.isArray(tenantModules) || !tenantModules.includes("settings")) {
        sendJson(request, response, 403, { error: "customer_settings_not_enabled" });
        return;
      }
      const applicationId = requestUrl.searchParams.get("applicationId") ?? "";
      if (!applicationId || applicationId !== applicationId.trim() || applicationId.length > 128 ||
          !/^[a-zA-Z0-9._:-]+$/.test(applicationId)) {
        sendJson(request, response, 400, { error: "invalid_application_id" });
        return;
      }
      let assignmentsConfig: unknown;
      if (!options.tenantApplicationAssignmentStore && process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE !== "postgres") {
        try { assignmentsConfig = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
        catch { assignmentsConfig = null; }
      }
      const tenantAssignments = options.tenantApplicationAssignmentStore
        ? await options.tenantApplicationAssignmentStore.listActive(identity.tenantId)
        : process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE !== "postgres" &&
          assignmentsConfig && typeof assignmentsConfig === "object" && !Array.isArray(assignmentsConfig)
          ? (assignmentsConfig as Record<string, unknown>)[identity.tenantId] : null;
      if (!Array.isArray(tenantAssignments) || !tenantAssignments.includes(applicationId)) {
        sendJson(request, response, 403, { error: "application_not_assigned_to_tenant" });
        return;
      }
      if (!(options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
        : identity.applicationIds?.includes(applicationId) === true)) {
        sendJson(request, response, 403, { error: "actor_not_assigned_to_application" });
        return;
      }
      let settingsConfig: unknown;
      try { settingsConfig = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_SETTINGS_JSON ?? ""); }
      catch { settingsConfig = null; }
      if (!settingsConfig || typeof settingsConfig !== "object" || Array.isArray(settingsConfig)) {
        sendJson(request, response, 503, { error: "customer_settings_unavailable" });
        return;
      }
      const tenantSettings = (settingsConfig as Record<string, unknown>)[identity.tenantId];
      const applicationSettings = tenantSettings && typeof tenantSettings === "object" && !Array.isArray(tenantSettings)
        ? (tenantSettings as Record<string, unknown>)[applicationId] : null;
      if (!applicationSettings || typeof applicationSettings !== "object" || Array.isArray(applicationSettings)) {
        sendJson(request, response, 503, { error: "customer_settings_unavailable" });
        return;
      }
      const source = applicationSettings as Record<string, unknown>;
      const safeSettings: Record<string, string> = {};
      const displayName = source.displayName;
      if (typeof displayName === "string" && displayName.length >= 1 && displayName.length <= 80 && displayName === displayName.trim()) {
        safeSettings.displayName = displayName;
      }
      const locale = source.locale;
      if (typeof locale === "string" && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) safeSettings.locale = locale;
      const currency = source.currency;
      if (typeof currency === "string" && /^[A-Z]{3}$/.test(currency)) safeSettings.currency = currency;
      const timeZone = source.timeZone;
      if (typeof timeZone === "string" && timeZone.length <= 100 && timeZone === timeZone.trim()) {
        try {
          new Intl.DateTimeFormat("en", { timeZone }).format(0);
          safeSettings.timeZone = timeZone;
        } catch { /* Invalid time zones are omitted rather than exposed as usable preferences. */ }
      }
      const theme = source.theme;
      if (theme === "light" || theme === "dark" || theme === "system") safeSettings.theme = theme;
      sendJson(request, response, 200, { applicationId, settings: safeSettings });
      return;
    }

    // Authenticated customer portal context. Identity comes only from server-side bearer mapping.
    if (request.method === "GET" && requestUrl.pathname === "/customer/portal/context") {
      if (process.env.EPER_CUSTOMER_PORTAL_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }
      // Navigation is derived from the same server-side tenant module allowlist used by
      // customer content routes. A missing or malformed configuration fails closed to Home.
      let tenantModules: unknown;
      try { tenantModules = JSON.parse(process.env.EPER_CUSTOMER_WORKSPACE_MODULES_JSON ?? ""); }
      catch { tenantModules = null; }
      const configured = tenantModules && typeof tenantModules === "object" && !Array.isArray(tenantModules)
        ? (tenantModules as Record<string, unknown>)[identity.tenantId] : null;
      const enabledModules = new Set(
        Array.isArray(configured)
          ? configured.filter((item): item is string => typeof item === "string")
          : [],
      );
      const availableNavigation = [
        { key: "home", label: "Home", path: "/customer-portal-preview", module: null },
        { key: "help-center", label: "Help Center", path: "/customer/help", module: "help-center" },
        { key: "growth-hub", label: "Growth Hub", path: "/customer/growth", module: "growth-hub" },
        { key: "applications", label: "My Applications", path: "/customer/applications", module: "my-applications" },
        { key: "tickets-feedback", label: "Tickets & Feedback", path: "/customer/tickets", module: "tickets-feedback" },
        { key: "settings", label: "Settings", path: "/customer/settings", module: "settings" },
      ];
      sendJson(request, response, 200, {
        tenantId: identity.tenantId,
        actorId: identity.actorId,
        roleKey: identity.roleKey,
        navigation: availableNavigation
          .filter((item) => item.module === null || enabledModules.has(item.module))
          .map(({ key, label, path }) => ({ key, label, path })),
        status: "identity_resolved_navigation_only",
        note: "Navigation is tenant-module scoped; routes and data must still enforce authorization independently."
      });
      return;
    }

    // Customer-side module/add-on access check. This endpoint is diagnostic; the same
    // policy must also be invoked at protected capability entry points before UAT.
    const customerAccessMatch = /^\/customer\/applications\/([^/]+)\/access\/(modules|addons)\/([^/]+)$/.exec(requestUrl.pathname);
    if (request.method === "GET" && customerAccessMatch) {
      if (process.env.EPER_CUSTOMER_ACCESS_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      if (!options.moduleEntitlementService) {
        sendJson(request, response, 503, { error: "customer_access_policy_unavailable" });
        return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }
      let applicationId: string;
      let itemKey: string;
      try {
        applicationId = decodeURIComponent(customerAccessMatch[1]);
        itemKey = decodeURIComponent(customerAccessMatch[3]);
      } catch {
        sendJson(request, response, 400, { error: "invalid_path_encoding" });
        return;
      }
      const permissionKey = requestUrl.searchParams.get("permission") ?? "module.use";
      if (!applicationId.trim() || applicationId.length > 128 || !itemKey.trim() || itemKey.length > 128 ||
          !/^[a-zA-Z0-9._:-]{1,128}$/.test(permissionKey)) {
        sendJson(request, response, 400, { error: "invalid_access_query" });
        return;
      }
      // The entitlement diagnostic is a protected customer API too: entitlement
      // must never be evaluated for an application outside both assignment boundaries.
      const tenantApplications = options.tenantApplicationAssignmentStore
        ? await options.tenantApplicationAssignmentStore.listActive(identity.tenantId)
        : (() => {
            try {
              const parsed: unknown = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? "");
              return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)[identity.tenantId] : [];
            } catch { return []; }
          })();
      if (!Array.isArray(tenantApplications) || !tenantApplications.includes(applicationId)) {
        sendJson(request, response, 403, { error: "application_not_assigned_to_tenant" });
        return;
      }
      const actorAssigned = options.actorApplicationAssignmentStore
        ? await options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId)
        : identity.applicationIds?.includes(applicationId) === true;
      if (!actorAssigned) {
        sendJson(request, response, 403, { error: "actor_not_assigned_to_application" });
        return;
      }
      try {
        const context = {
          tenantId: identity.tenantId,
          applicationId,
          roleKey: identity.roleKey,
          permissionKey,
        };
        const decision = customerAccessMatch[2] === "modules"
          ? await options.moduleEntitlementService.checkModule(context, itemKey)
          : await options.moduleEntitlementService.checkApplicationAddon(context, itemKey);
        sendJson(request, response, 200, { applicationId, itemKey, kind: customerAccessMatch[2], ...decision });
      } catch {
        sendJson(request, response, 503, { error: "customer_access_check_failed" });
      }
      return;
    }

    // Opt-in read-only API over the canonical requirement registry.
    const registryMatch = /^\/v1\/requirements(?:\/([^/]+))?$/.exec(requestUrl.pathname);
    if (request.method === "GET" && registryMatch) {
      if (process.env.EPER_REQUIREMENTS_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      const registryToken = process.env.EPER_REQUIREMENTS_API_TOKEN ?? "";
      if (registryToken.length < 32) {
        sendJson(request, response, 503, { error: "requirements_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, registryToken)) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }
      if (registryMatch[1] !== undefined) {
        let requirementId: string;
        try {
          requirementId = decodeURIComponent(registryMatch[1]);
        } catch {
          sendJson(request, response, 400, { error: "invalid_requirement_id_encoding" });
          return;
        }
        const requirement = requirementBindings.find((binding) => binding.id === requirementId);
        if (!requirement) {
          sendJson(request, response, 404, { error: "requirement_not_found" });
          return;
        }
        sendJson(request, response, 200, { apiVersion: "1.0.0", source: "requirement-registry", requirement });
        return;
      }
      const query = requestUrl.searchParams;
      const q = query.get("q") ?? "";
      const rawLimit = query.get("limit");
      const rawOffset = query.get("offset");
      const rawChapter = query.get("chapter");
      const limit = rawLimit === null ? 25 : Number(rawLimit);
      const offset = rawOffset === null ? 0 : Number(rawOffset);
      const chapter = rawChapter === null ? null : Number(rawChapter);
      if (
        q.length > 200 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(offset) || offset < 0 ||
        (chapter !== null && (!Number.isSafeInteger(chapter) || chapter < 1))
      ) {
        sendJson(request, response, 400, { error: "invalid_query_parameters" });
        return;
      }
      const capability = query.get("capability");
      const pattern = query.get("pattern");
      const srs = query.get("srs");
      const supportedPatterns = new Set(["XX01", "XX02", "XX03", "XX04", "XX05", "XX06"]);
      if (pattern !== null && !supportedPatterns.has(pattern)) {
        sendJson(request, response, 400, { error: "invalid_pattern", supportedPatterns: [...supportedPatterns] });
        return;
      }
      const needle = q.trim().toLowerCase();
      const requirements = [...requirementBindings]
        .sort((left, right) => left.chapter - right.chapter || left.sequence - right.sequence)
        .filter((binding) => chapter === null || binding.chapter === chapter)
        .filter((binding) => capability === null || binding.capability === capability)
        .filter((binding) => pattern === null || binding.pattern === pattern)
        .filter((binding) => srs === null || binding.srs === srs)
        .filter((binding) => !needle || [
          binding.id, binding.brd, binding.srs, binding.capability, binding.service,
          binding.pattern, binding.dataContract, binding.apiContract, binding.eventContract,
        ].some((value) => value.toLowerCase().includes(needle)));
      sendJson(request, response, 200, {
        apiVersion: "1.0.0",
        source: "requirement-registry",
        total: requirements.length,
        limit,
        offset,
        requirements: requirements.slice(offset, offset + limit),
      });
      return;
    }

    // Publicly reachable, controlled UAT route. It is separate from the local-only route below.
    const uatCapabilityMatch = /^\/uat\/requirements\/([^/]+)\/execute$/.exec(requestUrl.pathname);
    if (request.method === "POST" && uatCapabilityMatch) {
      if (process.env.EPER_UAT_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }

      const token = process.env.EPER_UAT_API_TOKEN ?? "";
      const tenantId = process.env.EPER_UAT_TENANT_ID ?? "";
      const principalId = process.env.EPER_UAT_PRINCIPAL_ID ?? "";
      const publicAck = process.env.EPER_UAT_PUBLIC_ENDPOINT_ACK ?? "";
      if (token.length < 32 || !tenantId || !principalId || publicAck !== "I_ACCEPT_PUBLIC_BEARER_UAT_RISK") {
        sendJson(request, response, 503, { error: "uat_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, token)) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }

      let requirementId: string;
      try {
        requirementId = decodeURIComponent(uatCapabilityMatch[1]);
      } catch {
        sendJson(request, response, 400, { error: "invalid_requirement_id_encoding" });
        return;
      }
      const requirement = requirementBindings.find((binding) => binding.id === requirementId);
      if (!requirement) {
        sendJson(request, response, 404, { error: "requirement_not_found" });
        return;
      }

      if (process.env.EPER_CAPABILITY_ENTITLEMENTS_REQUIRED === "true") {
        const entitlementService = options.moduleEntitlementService;
        const applicationId = process.env.EPER_UAT_APPLICATION_ID ?? "";
        const roleKey = process.env.EPER_UAT_ROLE_KEY ?? "";
        let moduleMap: unknown;
        try { moduleMap = JSON.parse(process.env.EPER_REQUIREMENT_MODULE_MAP_JSON ?? ""); } catch { moduleMap = null; }
        const moduleKey = moduleMap && typeof moduleMap === "object" && !Array.isArray(moduleMap)
          ? (moduleMap as Record<string, unknown>)[requirement.id]
          : undefined;
        if (!entitlementService || !applicationId.trim() || !roleKey.trim() ||
            typeof moduleKey !== "string" || !moduleKey.trim()) {
          sendJson(request, response, 503, { error: "capability_entitlement_enforcement_unconfigured" });
          return;
        }
        try {
          const decision = await entitlementService.checkModule({
            tenantId, applicationId, roleKey, permissionKey: "capability.execute",
          }, moduleKey);
          if (!decision.allowed) {
            sendJson(request, response, 403, { error: "capability_entitlement_denied", reason: decision.reason });
            return;
          }
        } catch {
          sendJson(request, response, 503, { error: "capability_entitlement_check_failed" });
          return;
        }
      }

      try {
        const body = await readJson(request);
        if (!Object.prototype.hasOwnProperty.call(body, "payload")) {
          sendJson(request, response, 400, { error: "payload_required" });
          return;
        }
        const result = await executeIntegratedRequirement(requirement, {
          context: { tenantId, principalId, correlationId: randomUUID() },
          payload: body.payload,
        }, services);
        sendJson(request, response, 200, { result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "CAPABILITY_EXECUTION_FAILED";
        const status = message === "REQUEST_BODY_TOO_LARGE" ? 413
          : message === "TENANT_CONTEXT_MISMATCH" ? 403
          : error instanceof SyntaxError || message === "CAPABILITY_OPERATION_REQUIRED" || message.endsWith("_UNSUPPORTED") || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(request, response, status, { error: status === 422 ? "capability_execution_failed" : message });
      }
      return;
    }

    const capabilityMatch = /^\/internal\/requirements\/([^/]+)\/execute$/.exec(requestUrl.pathname);
    if (request.method === "POST" && capabilityMatch) {
      if (process.env.EPER_LOCAL_CAPABILITY_API !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }

      const token = process.env.EPER_LOCAL_CAPABILITY_TOKEN ?? "";
      const tenantId = process.env.EPER_LOCAL_TENANT_ID ?? "";
      const principalId = process.env.EPER_LOCAL_PRINCIPAL_ID ?? "";
      if (token.length < 32 || !tenantId || !principalId) {
        sendJson(request, response, 503, { error: "local_capability_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, token)) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }

      let requirementId: string;
      try {
        requirementId = decodeURIComponent(capabilityMatch[1]);
      } catch {
        sendJson(request, response, 400, { error: "invalid_requirement_id_encoding" });
        return;
      }
      const requirement = requirementBindings.find((binding) => binding.id === requirementId);
      if (!requirement) {
        sendJson(request, response, 404, { error: "requirement_not_found" });
        return;
      }

      // If entitlement enforcement is globally enabled, the local execution path must
      // fail closed too; it must not become a bypass around the UAT route's policy gate.
      if (process.env.EPER_CAPABILITY_ENTITLEMENTS_REQUIRED === "true") {
        const entitlementService = options.moduleEntitlementService;
        const applicationId = process.env.EPER_LOCAL_APPLICATION_ID ?? "";
        const roleKey = process.env.EPER_LOCAL_ROLE_KEY ?? "";
        let moduleMap: unknown;
        try { moduleMap = JSON.parse(process.env.EPER_REQUIREMENT_MODULE_MAP_JSON ?? ""); } catch { moduleMap = null; }
        const moduleKey = moduleMap && typeof moduleMap === "object" && !Array.isArray(moduleMap)
          ? (moduleMap as Record<string, unknown>)[requirement.id]
          : undefined;
        if (!entitlementService || !applicationId.trim() || !roleKey.trim() ||
            typeof moduleKey !== "string" || !moduleKey.trim()) {
          sendJson(request, response, 503, { error: "capability_entitlement_enforcement_unconfigured" });
          return;
        }
        try {
          const decision = await entitlementService.checkModule({
            tenantId, applicationId, roleKey, permissionKey: "capability.execute",
          }, moduleKey);
          if (!decision.allowed) {
            sendJson(request, response, 403, { error: "capability_entitlement_denied", reason: decision.reason });
            return;
          }
        } catch {
          sendJson(request, response, 503, { error: "capability_entitlement_check_failed" });
          return;
        }
      }

      try {
        const body = await readJson(request);
        if (!Object.prototype.hasOwnProperty.call(body, "payload")) {
          sendJson(request, response, 400, { error: "payload_required" });
          return;
        }
        const result = await executeIntegratedRequirement(requirement, {
          context: { tenantId, principalId, correlationId: randomUUID() },
          payload: body.payload,
        }, services);
        sendJson(request, response, 200, { result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "CAPABILITY_EXECUTION_FAILED";
        const status = message === "REQUEST_BODY_TOO_LARGE" ? 413
          : message === "TENANT_CONTEXT_MISMATCH" ? 403
          : error instanceof SyntaxError || message === "CAPABILITY_OPERATION_REQUIRED" || message.endsWith("_UNSUPPORTED") || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(request, response, status, { error: status === 422 ? "capability_execution_failed" : message });
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/customer/campaign-schedules-ui") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
      });
      response.end(renderCampaignSchedulerConsole());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/agents-ui") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer" });
      response.end(renderAgentConsole());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/agents-tools") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer" });
      response.end(renderAgentToolsConfiguration());
      return;
    }

    if (requestUrl.pathname.startsWith("/v1/agent-jobs") || requestUrl.pathname.startsWith("/v1/agent-drafts")) {
      if (process.env.EPER_AGENTS_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
    }
    const agentStore = options.capabilityPool ? new PostgresAgentStore(options.capabilityPool as unknown as AgentSqlPool) : undefined;
    if (await handleAgentJobRoute(request, response, requestUrl.pathname, {
      store: agentStore, resolveIdentity: resolveAgentJobIdentity,
      authorizeApplication: async (identity, applicationId) => {
        if (!/^[a-zA-Z0-9._-]{2,100}$/.test(applicationId)) return false;
        if (options.tenantApplicationAssignmentStore && options.actorApplicationAssignmentStore &&
            process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE === "postgres") {
          const tenantApplications = await options.tenantApplicationAssignmentStore.listActive(identity.tenantId);
          if (!tenantApplications.includes(applicationId)) return false;
          return options.actorApplicationAssignmentStore.isAssigned(identity.tenantId, identity.actorId, applicationId);
        }
        return identity.applicationIds.includes(applicationId);
      },
      environment: options.adminConfigEnvironment ?? "sandbox",
    })) return;

    // Application-level AI controls are always enforced for agent endpoints. Do not make
    // the customer's OFF switch depend on a deployment opt-in environment variable.
    const aiIntegrationGuard = async (
      agentRequest: IncomingMessage,
      _pathname: string,
      identity: { tenantId: string; principalId: string },
    ) => {
      const agentUrl = new URL(agentRequest.url ?? "/", "http://localhost");
      const applicationId = agentUrl.searchParams.get("applicationId") ?? "";
      const tenantId = identity.tenantId;
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(applicationId)) {
        return { allowed: false, statusCode: 400, error: "application_id_required_for_ai_integration_policy" };
      }
      if (process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE === "postgres") {
        if (!options.tenantApplicationAssignmentStore || !options.actorApplicationAssignmentStore) {
          return { allowed: false, statusCode: 503, error: "agent_application_assignment_store_unavailable" };
        }
        const tenantApplications = await options.tenantApplicationAssignmentStore.listActive(tenantId);
        if (!tenantApplications.includes(applicationId)) {
          return { allowed: false, statusCode: 403, error: "application_not_assigned_to_tenant" };
        }
        let principalActors: unknown;
        try { principalActors = JSON.parse(process.env.EPER_AGENTS_PRINCIPAL_ACTORS_JSON ?? ""); } catch { principalActors = null; }
        const actorId = principalActors && typeof principalActors === "object" && !Array.isArray(principalActors)
          ? (principalActors as Record<string, unknown>)[identity.principalId] : undefined;
        if (typeof actorId !== "string" || !actorId.trim() || actorId !== actorId.trim() || actorId.length > 128) {
          return { allowed: false, statusCode: 503, error: "agents_principal_actor_mapping_unconfigured" };
        }
        if (!await options.actorApplicationAssignmentStore.isAssigned(tenantId, actorId, applicationId)) {
          return { allowed: false, statusCode: 403, error: "actor_not_assigned_to_application" };
        }
      }
      if (!tenantId || !options.adminConfigurationStore || process.env.EPER_ADMIN_CONFIG_PERSISTENCE !== "postgres") {
        return { allowed: false, statusCode: 503, error: "ai_integration_policy_store_unconfigured" };
      }
      try {
        const saved = await options.adminConfigurationStore.get(tenantId, "ai-integrations");
        const config = saved?.config as { applications?: Record<string, { enabled?: boolean; provider?: string }> } | undefined;
        const application = config?.applications?.[applicationId];
        if (application?.enabled !== true) {
          return { allowed: false, statusCode: 403, error: "ai_integration_disabled_for_application" };
        }
        if (!application.provider || application.provider === "none") {
          return { allowed: false, statusCode: 403, error: "ai_integration_provider_not_configured" };
        }
        return { allowed: true };
      } catch {
        // Configuration-store failures must never turn into an AI-policy bypass.
        return { allowed: false, statusCode: 503, error: "ai_integration_policy_unavailable" };
      }
    };
    if (await handleAgentRoute(request, response, requestUrl.pathname, options.auditWriter, aiIntegrationGuard, options.agentDraftStore)) return;

    sendJson(request, response, 404, { error: "not_found" });
  });
}