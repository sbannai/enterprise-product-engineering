import { randomUUID, timingSafeEqual } from "node:crypto";
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
import { adminWorkflowUiHtml, isAdminWorkflowUiRequest } from "./admin-workflow-ui.js";
import { handlePaymentRoute, paymentTenantIdentityConfigured } from "./payments.js";
import type { TrustedInvoiceAmountSource } from "../../packages/payments/invoice-amount-authority.js";
import type { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import type { TrustedReceiptNumberSource } from "./payments.js";
import type { TrustedTransactionSnapshotSource } from "../../packages/payments/transaction-receipt-contract.js";
import { requirementBindings } from "../../packages/requirements/registry.js";
import { handleAgentRoute, type AgentAuditWriter } from "../../packages/agents/agent-workflows.js";
import { renderAgentConsole } from "./agent-console.js";
import { renderAgentToolsConfiguration } from "./agent-tools-config.js";

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
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
    if (typeof record.tenantId !== "string" || !record.tenantId.trim() || record.tenantId.length > 128 ||
        typeof record.actorId !== "string" || !record.actorId.trim() || record.actorId.length > 128 ||
        typeof record.roleKey !== "string" || !record.roleKey.trim() || record.roleKey.length > 128) return null;
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
    sendJson(response, 200, { workflows: saved?.config ?? [], version: saved?.version ?? 0, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/workflows" && request.method === "PUT") {
    const body = await readJson(request);
    const validator = await loadWorkflowService(false);
    const workflows = validator.replaceWorkflows(body.workflows);
    const saved = await saveConfig("workflows", workflows, body.expectedVersion);
    sendJson(response, 200, { workflows: saved.config, version: saved.version, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/roles-access" && request.method === "GET") {
    const saved = await getConfig("roles-access");
    sendJson(response, 200, { roles: saved?.config ?? [], version: saved?.version ?? 0, availablePermissions: WorkflowConfigurationService.PERMISSIONS, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/roles-access" && request.method === "PUT") {
    const body = await readJson(request);
    const validator = await loadWorkflowService(true);
    const roles = validator.replaceRoles(body.roles);
    const saved = await saveConfig("roles-access", roles, body.expectedVersion);
    sendJson(response, 200, { roles: saved.config, version: saved.version, availablePermissions: WorkflowConfigurationService.PERMISSIONS, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/access-check" && request.method === "POST") {
    const body = await readJson(request);
    if (typeof body.principalId !== "string" || !body.principalId.trim() || body.principalId.length > 128 ||
        typeof body.permission !== "string" ||
        !(WorkflowConfigurationService.PERMISSIONS as readonly string[]).includes(body.permission) ||
        (body.workflowId !== undefined && (typeof body.workflowId !== "string" || body.workflowId.length > 128))) {
      sendJson(response, 400, { error: "principalId_and_supported_permission_required" });
      return;
    }
    const validator = await loadWorkflowService(true);
    sendJson(response, 200, { ...validator.checkAccess(
      body.principalId,
      body.permission as import("../../packages/workflows/workflow-configuration.js").WorkflowPermission,
      body.workflowId as string | undefined,
    ) });
    return;
  }
  if (path === "/admin/config/price-book" && request.method === "GET") {
    const saved = await getConfig("price-book");
    sendJson(response, 200, { entries: saved?.config ?? initialPriceEntries, version: saved?.version ?? 0, persistence: "postgres", restartPersistence: true });
    return;
  }
  if (path === "/admin/config/price-book" && request.method === "PUT") {
    const body = await readJson(request);
    const candidate = body.entry;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      sendJson(response, 400, { error: "entry_object_required" });
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
    sendJson(response, 200, { entries: saved.config, version: saved.version, persistence: "postgres", restartPersistence: true });
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
    sendJson(response, 200, {
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
      sendJson(response, 400, { error: "provider must be supported; mode must remain sandbox; sandboxEnabled must be boolean" });
      return;
    }
    const config = {
      provider: body.provider, mode: "sandbox",
      sandboxEnabled: body.sandboxEnabled && body.provider === "sandbox" && process.env.EPER_PAYMENT_SANDBOX_ENABLED === "true",
    };
    const saved = await saveConfig("payment-vendor", config, body.expectedVersion);
    sendJson(response, 200, { ...config, version: saved.version, productionEnabled: false, adapterAvailable: config.provider === "sandbox", persistence: "postgres", message: config.provider === "sandbox" ? "Sandbox configuration updated; server-side sandbox opt-in and tenant settings are still required." : "Provider selection is planning-only; no live adapter is enabled." });
    return;
  }
  response.writeHead(405, { allow: path === "/admin/config/access-check" ? "POST" : "GET, PUT", "cache-control": "no-store" });
  response.end();
}

/**
 * Health endpoint plus an explicitly opt-in local capability execution route.
 * The local route is disabled by default and is not a production identity system.
 * Do not enable it on a publicly reachable deployment.
 */
function createConfiguredCapabilityServices() {
  const persistence = process.env.EPER_CAPABILITY_PERSISTENCE;
  if (persistence === undefined || persistence === "memory") {
    return createCapabilityServices();
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

export function createAppServer(options: { invoiceAmountSource?: TrustedInvoiceAmountSource; paymentStore?: PostgresPaymentStore; receiptNumberSource?: TrustedReceiptNumberSource; transactionSnapshotSource?: TrustedTransactionSnapshotSource; allowLegacyPaymentLedgerForTests?: boolean; auditWriter?: AgentAuditWriter; adminConfigurationStore?: PostgresAdminConfigurationStore; moduleEntitlementService?: PostgresModuleEntitlementService; adminConfigEnvironment?: "production" | "uat" | "sandbox"; serviceVersion?: string } = {}): Server {
  const services = createConfiguredCapabilityServices();
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
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      const durableAdminMode = process.env.EPER_ADMIN_CONFIG_PERSISTENCE === "postgres";
      let adminIdentity: TrustedAdminConfigIdentity | null = null;
      if (durableAdminMode) {
        if (!options.adminConfigurationStore) {
          sendJson(response, 503, { error: "admin_config_durable_store_unconfigured" });
          return;
        }
        adminIdentity = resolveAdminConfigIdentity(request);
        if (!adminIdentity) {
          sendJson(response, 401, { error: "unauthorized_or_unmapped_admin_identity" });
          return;
        }
      } else {
        const adminToken = process.env.EPER_ADMIN_CONFIG_API_TOKEN ?? "";
        if (adminToken.length < 32) {
          sendJson(response, 503, { error: "admin_config_api_unconfigured" });
          return;
        }
        if (!bearerMatches(request, adminToken)) {
          sendJson(response, 401, { error: "unauthorized" });
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
          sendJson(response, 200, { workflows: workflowConfig.listWorkflows(), persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/workflows" && request.method === "PUT") {
          const body = await readJson(request);
          const workflows = workflowConfig.replaceWorkflows(body.workflows);
          sendJson(response, 200, { workflows, persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/roles-access" && request.method === "GET") {
          sendJson(response, 200, {
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
          sendJson(response, 200, { roles, availablePermissions: WorkflowConfigurationService.PERMISSIONS, persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/access-check" && request.method === "POST") {
          const body = await readJson(request);
          if (typeof body.principalId !== "string" || !body.principalId.trim() || body.principalId.length > 128 ||
              typeof body.permission !== "string" ||
              !(WorkflowConfigurationService.PERMISSIONS as readonly string[]).includes(body.permission) ||
              (body.workflowId !== undefined && (typeof body.workflowId !== "string" || body.workflowId.length > 128))) {
            sendJson(response, 400, { error: "principalId_and_supported_permission_required" });
            return;
          }
          const decision = workflowConfig.checkAccess(
            body.principalId,
            body.permission as import("../../packages/workflows/workflow-configuration.js").WorkflowPermission,
            body.workflowId as string | undefined,
          );
          sendJson(response, 200, { ...decision });
          return;
        }
        if (["/admin/config/workflows", "/admin/config/roles-access", "/admin/config/access-check"].includes(adminConfigPath)) {
          response.writeHead(405, { allow: adminConfigPath === "/admin/config/access-check" ? "POST" : "GET, PUT", "cache-control": "no-store" });
          response.end();
          return;
        }
        if (adminConfigPath === "/admin/config/price-book" && request.method === "GET") {
          sendJson(response, 200, { entries: marketPriceEntries, persistence: "process-memory", restartPersistence: false });
          return;
        }
        if (adminConfigPath === "/admin/config/price-book" && request.method === "PUT") {
          const body = await readJson(request);
          const candidate = body.entry;
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            sendJson(response, 400, { error: "entry_object_required" });
            return;
          }
          const entry = candidate as MarketPriceEntry;
          const nextEntries = marketPriceEntries.filter((current) =>
            !(current.productId === entry.productId && current.marketId === entry.marketId &&
              current.priceBookId === entry.priceBookId && current.priceBookVersion === entry.priceBookVersion));
          if (nextEntries.length >= 10_000) {
            sendJson(response, 503, { error: "MARKET_PRICE_BOOK_CAPACITY_EXCEEDED" });
            return;
          }
          nextEntries.push(entry);
          const nextService = new MarketPriceBookService(nextEntries);
          marketPriceEntries = nextEntries;
          marketPriceBook = nextService;
          sendJson(response, 200, { entries: marketPriceEntries, persistence: "process-memory", restartPersistence: false });
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
          sendJson(response, 200, {
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
            sendJson(response, 400, { error: "provider must be supported; mode must remain sandbox; sandboxEnabled must be boolean" });
            return;
          }
          paymentVendorConfig = {
            provider: body.provider,
            mode: "sandbox",
            sandboxEnabled: body.sandboxEnabled && body.provider === "sandbox" &&
              process.env.EPER_PAYMENT_SANDBOX_ENABLED === "true",
          };
          sendJson(response, 200, {
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
        response.writeHead(405, { allow: "GET, PUT", "cache-control": "no-store" });
        response.end();
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
        sendJson(response, status, { error: status === 503 && durableAdminMode ? "admin_config_durable_store_unavailable" : message });
      }
      return;
    }

    // Market-specific pricing quotes. No FX conversion is performed; each
    // market/currency pair must be present in the approved price-book config.
    if (requestUrl.pathname === "/pricing/options" || requestUrl.pathname === "/pricing/quote") {
      if (process.env.EPER_PRICING_API_ENABLED !== "true") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      const durablePricingMode = process.env.EPER_ADMIN_CONFIG_PERSISTENCE === "postgres";
      let pricingIdentity: TrustedAdminConfigIdentity | null = null;
      if (durablePricingMode) {
        if (!options.adminConfigurationStore) {
          sendJson(response, 503, { error: "pricing_durable_store_unconfigured" });
          return;
        }
        // In durable mode, price lookup must use the same trusted tenant identity as
        // admin configuration. A shared pricing token cannot safely select a tenant.
        pricingIdentity = resolveAdminConfigIdentity(request);
        if (!pricingIdentity) {
          sendJson(response, 401, { error: "unauthorized_or_unmapped_pricing_identity" });
          return;
        }
      } else {
        const pricingToken = process.env.EPER_PRICING_API_TOKEN ?? "";
        if (pricingToken.length < 32) {
          sendJson(response, 503, { error: "pricing_api_unconfigured" });
          return;
        }
        if (!bearerMatches(request, pricingToken)) {
          sendJson(response, 401, { error: "unauthorized" });
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
            sendJson(response, 503, { error: "pricing_durable_store_unavailable" });
            return;
          }
          const entries = (savedPriceBook?.config ?? marketPriceEntries) as MarketPriceEntry[];
          requestPriceBook = new MarketPriceBookService(entries);
        }
        if (request.method === "GET" && requestUrl.pathname === "/pricing/options") {
          const productId = requestUrl.searchParams.get("productId") ?? "";
          sendJson(response, 200, { markets: requestPriceBook.listMarkets(productId) });
          return;
        }
        if (request.method === "POST" && requestUrl.pathname === "/pricing/quote") {
          const body = await readJson(request);
          if (typeof body.productId !== "string" || typeof body.marketId !== "string" ||
              (body.currency !== undefined && typeof body.currency !== "string")) {
            sendJson(response, 400, { error: "productId and marketId are required; currency must be a string when supplied" });
            return;
          }
          const quote = requestPriceBook.quote({
            productId: body.productId,
            marketId: body.marketId,
            ...(typeof body.currency === "string" ? { currency: body.currency } : {}),
          });
          sendJson(response, 200, { quote, amountMajor: quote.amountMinor / 100 });
          return;
        }
        response.writeHead(405, { allow: "GET, POST", "cache-control": "no-store" });
        response.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : "MARKET_PRICING_OPERATION_FAILED";
        const status = message === "APPROVED_MARKET_PRICE_NOT_FOUND" ? 404
          : message === "MARKET_PRICE_CONFIGURATION_AMBIGUOUS" ? 409
          : message === "MARKET_CURRENCY_MISMATCH" || message.startsWith("PRICE_") ||
            message.startsWith("MARKET_PRICE_") || message === "MARKET_PRICE_BOOK_JSON_ARRAY_REQUIRED" ? 400
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(response, status, { error: message });
      }
      return;
    }


    if (request.method === "GET" && requestUrl.pathname === "/localization/options") {
      sendJson(response, 200, { ...localizationService.options() });
      return;
    }

    if (requestUrl.pathname === "/localization/preferences") {
      if (process.env.EPER_LOCALIZATION_API_ENABLED !== "true") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      const localizationToken = process.env.EPER_LOCALIZATION_API_TOKEN ?? "";
      const localizationTenant = process.env.EPER_LOCALIZATION_TENANT_ID ?? "";
      const localizationPrincipal = process.env.EPER_LOCALIZATION_PRINCIPAL_ID ?? "";
      if (localizationToken.length < 32 || !localizationTenant || !localizationPrincipal) {
        sendJson(response, 503, { error: "localization_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, localizationToken)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      try {
        if (request.method === "GET") {
          sendJson(response, 200, { preference: localizationService.getPreference(localizationTenant, localizationPrincipal) });
          return;
        }
        if (request.method === "PUT") {
          const body = await readJson(request);
          const preference = localizationService.setPreference(localizationTenant, localizationPrincipal, {
            ...(typeof body.locale === "string" ? { locale: body.locale as SupportedLocale } : {}),
            ...(typeof body.currency === "string" ? { currency: body.currency as SupportedCurrency } : {}),
            ...(typeof body.timeZone === "string" ? { timeZone: body.timeZone } : {}),
          });
          sendJson(response, 200, { preference });
          return;
        }
        response.writeHead(405, { allow: "GET, PUT", "cache-control": "no-store" });
        response.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : "LOCALIZATION_OPERATION_FAILED";
        const status = message === "LOCALIZATION_STORE_CAPACITY_REACHED" ? 503
          : message === "LOCALIZATION_ACTOR_REQUIRED" ? 400
          : message === "LOCALE_UNSUPPORTED" || message === "CURRENCY_UNSUPPORTED" || message === "TIME_ZONE_INVALID" ? 400
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(response, status, { error: message });
      }
      return;
    }


    if (request.method === "GET" && requestUrl.pathname === "/health") {
      const buildId = process.env.RENDER_GIT_COMMIT || process.env.EPER_BUILD_ID || "";
      const buildIdIsCommit = /^[a-f0-9]{40}$/i.test(buildId);

      sendJson(response, buildIdIsCommit ? 200 : 503, {
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
      sendJson(response, ready ? 200 : 503, {
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
      if (!response.headersSent) sendJson(response, 503, { error: "payment_operation_unavailable" });
      else response.destroy();
      return;
    }


    // Customer-side module/add-on access check. This endpoint is diagnostic; the same
    // policy must also be invoked at protected capability entry points before UAT.
    const customerAccessMatch = /^\/customer\/applications\/([^/]+)\/access\/(modules|addons)\/([^/]+)$/.exec(requestUrl.pathname);
    if (request.method === "GET" && customerAccessMatch) {
      if (process.env.EPER_CUSTOMER_ACCESS_API_ENABLED !== "true") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      if (!options.moduleEntitlementService) {
        sendJson(response, 503, { error: "customer_access_policy_unavailable" });
        return;
      }
      const identity = resolveCustomerAccessIdentity(request);
      if (!identity) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      let applicationId: string;
      let itemKey: string;
      try {
        applicationId = decodeURIComponent(customerAccessMatch[1]);
        itemKey = decodeURIComponent(customerAccessMatch[3]);
      } catch {
        sendJson(response, 400, { error: "invalid_path_encoding" });
        return;
      }
      const permissionKey = requestUrl.searchParams.get("permission") ?? "module.use";
      if (!applicationId.trim() || applicationId.length > 128 || !itemKey.trim() || itemKey.length > 128 ||
          !/^[a-zA-Z0-9._:-]{1,128}$/.test(permissionKey)) {
        sendJson(response, 400, { error: "invalid_access_query" });
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
        sendJson(response, 200, { applicationId, itemKey, kind: customerAccessMatch[2], ...decision });
      } catch {
        sendJson(response, 503, { error: "customer_access_check_failed" });
      }
      return;
    }

    // Opt-in read-only API over the canonical requirement registry.
    const registryMatch = /^\/v1\/requirements(?:\/([^/]+))?$/.exec(requestUrl.pathname);
    if (request.method === "GET" && registryMatch) {
      if (process.env.EPER_REQUIREMENTS_API_ENABLED !== "true") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }
      const registryToken = process.env.EPER_REQUIREMENTS_API_TOKEN ?? "";
      if (registryToken.length < 32) {
        sendJson(response, 503, { error: "requirements_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, registryToken)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      if (registryMatch[1] !== undefined) {
        let requirementId: string;
        try {
          requirementId = decodeURIComponent(registryMatch[1]);
        } catch {
          sendJson(response, 400, { error: "invalid_requirement_id_encoding" });
          return;
        }
        const requirement = requirementBindings.find((binding) => binding.id === requirementId);
        if (!requirement) {
          sendJson(response, 404, { error: "requirement_not_found" });
          return;
        }
        sendJson(response, 200, { apiVersion: "1.0.0", source: "requirement-registry", requirement });
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
        sendJson(response, 400, { error: "invalid_query_parameters" });
        return;
      }
      const capability = query.get("capability");
      const pattern = query.get("pattern");
      const srs = query.get("srs");
      const supportedPatterns = new Set(["XX01", "XX02", "XX03", "XX04", "XX05", "XX06"]);
      if (pattern !== null && !supportedPatterns.has(pattern)) {
        sendJson(response, 400, { error: "invalid_pattern", supportedPatterns: [...supportedPatterns] });
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
      sendJson(response, 200, {
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
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const token = process.env.EPER_UAT_API_TOKEN ?? "";
      const tenantId = process.env.EPER_UAT_TENANT_ID ?? "";
      const principalId = process.env.EPER_UAT_PRINCIPAL_ID ?? "";
      const publicAck = process.env.EPER_UAT_PUBLIC_ENDPOINT_ACK ?? "";
      if (token.length < 32 || !tenantId || !principalId || publicAck !== "I_ACCEPT_PUBLIC_BEARER_UAT_RISK") {
        sendJson(response, 503, { error: "uat_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, token)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      let requirementId: string;
      try {
        requirementId = decodeURIComponent(uatCapabilityMatch[1]);
      } catch {
        sendJson(response, 400, { error: "invalid_requirement_id_encoding" });
        return;
      }
      const requirement = requirementBindings.find((binding) => binding.id === requirementId);
      if (!requirement) {
        sendJson(response, 404, { error: "requirement_not_found" });
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
          sendJson(response, 503, { error: "capability_entitlement_enforcement_unconfigured" });
          return;
        }
        try {
          const decision = await entitlementService.checkModule({
            tenantId, applicationId, roleKey, permissionKey: "capability.execute",
          }, moduleKey);
          if (!decision.allowed) {
            sendJson(response, 403, { error: "capability_entitlement_denied", reason: decision.reason });
            return;
          }
        } catch {
          sendJson(response, 503, { error: "capability_entitlement_check_failed" });
          return;
        }
      }

      try {
        const body = await readJson(request);
        if (!Object.prototype.hasOwnProperty.call(body, "payload")) {
          sendJson(response, 400, { error: "payload_required" });
          return;
        }
        const result = await executeIntegratedRequirement(requirement, {
          context: { tenantId, principalId, correlationId: randomUUID() },
          payload: body.payload,
        }, services);
        sendJson(response, 200, { result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "CAPABILITY_EXECUTION_FAILED";
        const status = message === "REQUEST_BODY_TOO_LARGE" ? 413
          : message === "TENANT_CONTEXT_MISMATCH" ? 403
          : error instanceof SyntaxError || message === "CAPABILITY_OPERATION_REQUIRED" || message.endsWith("_UNSUPPORTED") || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(response, status, { error: status === 422 ? "capability_execution_failed" : message });
      }
      return;
    }

    const capabilityMatch = /^\/internal\/requirements\/([^/]+)\/execute$/.exec(requestUrl.pathname);
    if (request.method === "POST" && capabilityMatch) {
      if (process.env.EPER_LOCAL_CAPABILITY_API !== "true") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const token = process.env.EPER_LOCAL_CAPABILITY_TOKEN ?? "";
      const tenantId = process.env.EPER_LOCAL_TENANT_ID ?? "";
      const principalId = process.env.EPER_LOCAL_PRINCIPAL_ID ?? "";
      if (token.length < 32 || !tenantId || !principalId) {
        sendJson(response, 503, { error: "local_capability_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, token)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      let requirementId: string;
      try {
        requirementId = decodeURIComponent(capabilityMatch[1]);
      } catch {
        sendJson(response, 400, { error: "invalid_requirement_id_encoding" });
        return;
      }
      const requirement = requirementBindings.find((binding) => binding.id === requirementId);
      if (!requirement) {
        sendJson(response, 404, { error: "requirement_not_found" });
        return;
      }

      try {
        const body = await readJson(request);
        if (!Object.prototype.hasOwnProperty.call(body, "payload")) {
          sendJson(response, 400, { error: "payload_required" });
          return;
        }
        const result = await executeIntegratedRequirement(requirement, {
          context: { tenantId, principalId, correlationId: randomUUID() },
          payload: body.payload,
        }, services);
        sendJson(response, 200, { result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "CAPABILITY_EXECUTION_FAILED";
        const status = message === "REQUEST_BODY_TOO_LARGE" ? 413
          : message === "TENANT_CONTEXT_MISMATCH" ? 403
          : error instanceof SyntaxError || message === "CAPABILITY_OPERATION_REQUIRED" || message.endsWith("_UNSUPPORTED") || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(response, status, { error: status === 422 ? "capability_execution_failed" : message });
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

    sendJson(response, 404, { error: "not_found" });
  });
}