import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { sendApiSuccess, sendApiError, resolveApiRequestId } from "./api-response.js";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { executeIntegratedRequirement } from "../../packages/capability-router.js";
import { createCapabilityServices } from "../../packages/capabilities/index.js";
import { LocalizationService, type SupportedLocale, type SupportedCurrency } from "../../packages/localization/localization.js";
import { MarketPriceBookService, type MarketPriceEntry } from "../../packages/pricing/market-price-book.js";
import { WorkflowConfigurationService, WorkflowConfigurationError } from "../../packages/workflows/workflow-configuration.js";
import { AdminConfigurationConflictError, PostgresAdminConfigurationStore, type AdminConfigurationResource } from "../../packages/workflows/postgres-admin-configuration-store.js";
import { PostgresModuleEntitlementService } from "../../packages/workflows/postgres-module-entitlement-service.js";
import { adminPricingUiHtml, isAdminPricingUiRequest } from "./admin-pricing-ui.js";
import { wireframesUiHtml, isWireframesUiRequest } from "./wireframes-ui.js";
import { customerPortalPreviewHtml, isCustomerPortalPreviewRequest } from "./customer-portal-preview.js";
import { adminWorkflowUiHtml, isAdminWorkflowUiRequest } from "./admin-workflow-ui.js";
import { adminSupportTicketUiHtml, isAdminSupportTicketUiRequest } from "./admin-support-ticket-ui.js";
import { handlePaymentRoute, paymentTenantIdentityConfigured } from "./payments.js";
import type { TrustedInvoiceAmountSource } from "../../packages/payments/invoice-amount-authority.js";
import type { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import type { TrustedReceiptNumberSource } from "./payments.js";
import type { TrustedTransactionSnapshotSource } from "../../packages/payments/transaction-receipt-contract.js";
import { requirementBindings } from "../../packages/requirements/registry.js";
import { handleAgentRoute, type AgentAuditWriter } from "../../packages/agents/agent-workflows.js";
import { renderAgentConsole } from "./agent-console.js";
import { renderAgentToolsConfiguration } from "./agent-tools-config.js";
import { validateCreateTicketInput, TICKET_STATUSES, TICKET_SEVERITIES, TICKET_TYPES } from "../../packages/ticketing/ticketing-contract.js";
import type { PostgresTicketStore } from "../../packages/ticketing/postgres-ticket-store.js";


function sendJson(request: IncomingMessage, response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  // A versioned Accept value opts into the complete JSON envelope on shared sendJson routes.
  // Without it, legacy bodies stay byte-shape compatible for existing consumers.
  const acceptsV1 = (request.headers.accept ?? "")
    .split(",")
    .some((value) => value.trim().split(";")[0].trim().toLowerCase() === "application/vnd.eper.v1+json");

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

  const requestId = resolveApiRequestId(request);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  });
  response.end(JSON.stringify(body));
}



function sendMethodNotAllowed(request: IncomingMessage, response: ServerResponse, allow: string): void {
  const acceptsV1 = (request.headers.accept ?? "")
    .split(",")
    .some((value) => value.trim().split(";")[0].trim().toLowerCase() === "application/vnd.eper.v1+json");
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
    return { tenantId: record.tenantId, actorId: record.actorId, roleKey: record.roleKey };
  }
  return null;
}

interface TrustedAdminConfigIdentity {
  tenantId: string;
  actorId: string;
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
    return { tenantId: record.tenantId, actorId: record.actorId };
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
  const correlationHeader = request.headers["x-correlation-id"];
  const correlationId = typeof correlationHeader === "string" &&
    /^[a-zA-Z0-9._:-]{1,128}$/.test(correlationHeader) ? correlationHeader : randomUUID();
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

export function createAppServer(options: { capabilityPool?: Pool; invoiceAmountSource?: TrustedInvoiceAmountSource; paymentStore?: PostgresPaymentStore; receiptNumberSource?: TrustedReceiptNumberSource; transactionSnapshotSource?: TrustedTransactionSnapshotSource; allowLegacyPaymentLedgerForTests?: boolean; auditWriter?: AgentAuditWriter; ticketStore?: PostgresTicketStore; adminConfigurationStore?: PostgresAdminConfigurationStore; moduleEntitlementService?: PostgresModuleEntitlementService; adminConfigEnvironment?: "production" | "uat" | "sandbox"; serviceVersion?: string } = {}): Server {
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

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

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
      const allowed = new Set(["help-center", "growth-hub", "my-applications", "tickets-feedback", "settings"]);
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

    const adminConfigPath = requestUrl.pathname;
    if (["/admin/config/price-book", "/admin/config/payment-vendor", "/admin/config/workflows", "/admin/config/roles-access", "/admin/config/access-check"].includes(adminConfigPath)) {
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
    const ticketPathMatch = /^\/customer\/applications\/([^/]+)\/tickets(?:\/([^/]+))?$/.exec(requestUrl.pathname);
    if (ticketPathMatch && (request.method === "GET" || request.method === "POST")) {
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
      let applicationId: string;
      try { applicationId = decodeURIComponent(ticketPathMatch[1]); }
      catch { sendJson(request, response, 400, { error: "invalid_path_encoding" }); return; }
      if (!applicationId.trim() || applicationId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(applicationId)) {
        sendJson(request, response, 400, { error: "invalid_application_id" });
        return;
      }
      let assignments: unknown;
      try { assignments = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
      catch { assignments = null; }
      if (!assignments || typeof assignments !== "object" || Array.isArray(assignments) ||
          !Array.isArray((assignments as Record<string, unknown>)[identity.tenantId]) ||
          !((assignments as Record<string, unknown[]>)[identity.tenantId] as unknown[]).includes(applicationId)) {
        sendJson(request, response, 403, { error: "application_not_assigned_to_tenant" });
        return;
      }
      const correlationHeader = request.headers["x-correlation-id"];
      const correlationId = typeof correlationHeader === "string" &&
        /^[a-zA-Z0-9._:-]{1,128}$/.test(correlationHeader) ? correlationHeader : randomUUID();
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
        sendJson(request, response, 405, { error: "method_not_allowed" });
      } catch (error) {
        if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") {
          sendJson(request, response, 409, { error: "idempotency_key_conflict" });
        } else {
          sendJson(request, response, 503, { error: "ticket_operation_unavailable" });
        }
      }
      return;
    }


    // Tenant-scoped support-admin ticket queue and controlled lifecycle mutations.
    const adminTicketMatch = /^\/admin\/support\/tickets(?:\/([^/]+)\/(status|assignment))?$/.exec(requestUrl.pathname);
    if (adminTicketMatch && (request.method === "GET" || request.method === "PATCH")) {
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
      const correlationHeader = request.headers["x-correlation-id"];
      const correlationId = typeof correlationHeader === "string" &&
        /^[a-zA-Z0-9._:-]{1,128}$/.test(correlationHeader) ? correlationHeader : randomUUID();
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
          const limit = query.has("limit") ? Number(query.get("limit")) : 50;
          const offset = query.has("offset") ? Number(query.get("offset")) : 0;
          if ((status && !(TICKET_STATUSES as readonly string[]).includes(status)) ||
              (severity && !(TICKET_SEVERITIES as readonly string[]).includes(severity)) ||
              (type && !(TICKET_TYPES as readonly string[]).includes(type)) ||
              (applicationId && (!/^[a-zA-Z0-9._:-]{1,128}$/.test(applicationId))) ||
              !Number.isInteger(limit) || limit < 1 || limit > 100 ||
              !Number.isInteger(offset) || offset < 0) {
            sendJson(request, response, 400, { error: "invalid_ticket_filters" });
            return;
          }
          const tickets = await options.ticketStore.list({ tenantId: identity.tenantId }, {
            status: status as typeof TICKET_STATUSES[number] | undefined,
            severity: severity as typeof TICKET_SEVERITIES[number] | undefined,
            type: type as typeof TICKET_TYPES[number] | undefined, applicationId, limit, offset,
          });
          sendJson(request, response, 200, { tickets, limit, offset, tenantId: identity.tenantId });
          return;
        }
        if (request.method === "PATCH" && adminTicketMatch[1]) {
          let ticketId: string;
          try { ticketId = decodeURIComponent(adminTicketMatch[1]); }
          catch { sendJson(request, response, 400, { error: "invalid_ticket_id_encoding" }); return; }
          if (!/^[0-9a-f-]{36}$/i.test(ticketId)) {
            sendJson(request, response, 400, { error: "invalid_ticket_id" });
            return;
          }
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
      } catch {
        sendJson(request, response, 503, { error: "ticket_operation_unavailable" });
      }
      return;
    }

    // Authenticated customer application list. Assignment data is server-managed and tenant-scoped.
    if (request.method === "GET" && requestUrl.pathname === "/customer/applications") {
      if (process.env.EPER_CUSTOMER_PORTAL_API_ENABLED !== "true") {
        sendJson(request, response, 404, { error: "not_found" });
        return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
      }
      let assignments: unknown;
      try { assignments = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
      catch { assignments = null; }
      if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
        sendJson(request, response, 503, { error: "customer_applications_unavailable" });
        return;
      }
      const tenantAssignments = (assignments as Record<string, unknown>)[identity.tenantId];
      if (!Array.isArray(tenantAssignments) || tenantAssignments.some((item) =>
        typeof item !== "string" || item !== item.trim() || item.length < 1 || item.length > 128 ||
        !/^[a-zA-Z0-9._:-]+$/.test(item))) {
        sendJson(request, response, 503, { error: "customer_applications_unavailable" });
        return;
      }
      sendJson(request, response, 200, {
        applications: [...new Set(tenantAssignments as string[])].map((applicationId) => ({ applicationId })),
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
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) {
        sendJson(request, response, 401, { error: "unauthorized" });
        return;
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
      try { assignmentsConfig = JSON.parse(process.env.EPER_CUSTOMER_APPLICATION_ASSIGNMENTS_JSON ?? ""); }
      catch { assignmentsConfig = null; }
      const tenantAssignments = assignmentsConfig && typeof assignmentsConfig === "object" && !Array.isArray(assignmentsConfig)
        ? (assignmentsConfig as Record<string, unknown>)[identity.tenantId] : null;
      if (!Array.isArray(tenantAssignments) || !tenantAssignments.includes(applicationId)) {
        sendJson(request, response, 403, { error: "application_not_assigned_to_tenant" });
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

    if (await handleAgentRoute(request, response, requestUrl.pathname, options.auditWriter)) return;

    sendJson(request, response, 404, { error: "not_found" });
  });
}