import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { executeIntegratedRequirement } from "../../packages/capability-router.js";
import { createCapabilityServices } from "../../packages/capabilities/index.js";
import { LocalizationService, type SupportedLocale, type SupportedCurrency } from "../../packages/localization/localization.js";
import { MarketPriceBookService, type MarketPriceEntry } from "../../packages/pricing/market-price-book.js";
import { WorkflowConfigurationService, WorkflowConfigurationError } from "../../packages/workflows/workflow-configuration.js";
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

export function createAppServer(options: { invoiceAmountSource?: TrustedInvoiceAmountSource; paymentStore?: PostgresPaymentStore; receiptNumberSource?: TrustedReceiptNumberSource; transactionSnapshotSource?: TrustedTransactionSnapshotSource; allowLegacyPaymentLedgerForTests?: boolean; auditWriter?: AgentAuditWriter } = {}): Server {
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
      const adminToken = process.env.EPER_ADMIN_CONFIG_API_TOKEN ?? "";
      if (adminToken.length < 32) {
        sendJson(response, 503, { error: "admin_config_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, adminToken)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      try {
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
          : message === "MARKET_PRICE_CONFIGURATION_AMBIGUOUS" ? 409
          : message.startsWith("MARKET_PRICE_") || message.startsWith("PRICE_") ||
            message === "MARKET_PRICE_REQUIRED_FIELDS_MISSING" ? 400
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(response, status, { error: message });
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
      const pricingToken = process.env.EPER_PRICING_API_TOKEN ?? "";
      if (pricingToken.length < 32) {
        sendJson(response, 503, { error: "pricing_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, pricingToken)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      try {
        if (request.method === "GET" && requestUrl.pathname === "/pricing/options") {
          const productId = requestUrl.searchParams.get("productId") ?? "";
          sendJson(response, 200, { markets: marketPriceBook.listMarkets(productId) });
          return;
        }
        if (request.method === "POST" && requestUrl.pathname === "/pricing/quote") {
          const body = await readJson(request);
          if (typeof body.productId !== "string" || typeof body.marketId !== "string" ||
              (body.currency !== undefined && typeof body.currency !== "string")) {
            sendJson(response, 400, { error: "productId and marketId are required; currency must be a string when supplied" });
            return;
          }
          const quote = marketPriceBook.quote({
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