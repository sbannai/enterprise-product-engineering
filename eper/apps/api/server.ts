import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { executeIntegratedRequirement } from "../../packages/capability-router.js";
import { createCapabilityServices } from "../../packages/capabilities/index.js";
import { requirementBindings } from "../../packages/requirements/registry.js";
import { LocalizationService, type SupportedLocale, type SupportedCurrency } from "../../packages/localization/localization.js";
import { PaymentReceiptService } from "../../packages/payments/payment-receipt.js";
import { MarketPriceBookService, type MarketPriceEntry } from "../../packages/pricing/market-price-book.js";
import { adminPricingUiHtml, isAdminPricingUiRequest } from "./admin-pricing-ui.js";

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
  const match = /^Bearer (.+)$/.exec(header);
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

export function createAppServer(): Server {
  const services = createConfiguredCapabilityServices();
  const paymentService = new PaymentReceiptService();
  const localizationService = new LocalizationService();
  const rawPriceBook = process.env.EPER_MARKET_PRICE_BOOK_JSON;
  let marketPriceEntries: MarketPriceEntry[] = [];
  if (rawPriceBook !== undefined) {
    const parsed: unknown = JSON.parse(rawPriceBook);
    if (!Array.isArray(parsed)) throw new Error("MARKET_PRICE_BOOK_JSON_ARRAY_REQUIRED");
    marketPriceEntries = parsed as MarketPriceEntry[];
  }
  let marketPriceBook = new MarketPriceBookService(marketPriceEntries);
  let paymentVendorConfig = {
    provider: process.env.EPER_PAYMENT_PROVIDER ?? "sandbox",
    mode: "sandbox",
    sandboxEnabled: process.env.EPER_PAYMENT_SANDBOX_ENABLED === "true",
  };

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

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
    if (adminConfigPath === "/admin/config/price-book" || adminConfigPath === "/admin/config/payment-vendor") {
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
            : true;
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
        const status = message === "MARKET_PRICE_CONFIGURATION_AMBIGUOUS" ? 409
          : message.startsWith("MARKET_PRICE_") || message.startsWith("PRICE_") ||
            message === "MARKET_PRICE_REQUIRED_FIELDS_MISSING" ? 400
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
        const status = message === "LOCALIZATION_ACTOR_REQUIRED" ? 400
          : message === "LOCALE_UNSUPPORTED" || message === "CURRENCY_UNSUPPORTED" || message === "TIME_ZONE_INVALID" ? 400
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400
          : 422;
        sendJson(response, status, { error: message });
      }
      return;
    }

    // Explicitly opt-in sandbox payment flow. This is a test adapter, not a live gateway.
    const paymentPath = requestUrl.pathname;
    if (paymentPath === "/sandbox/payments" || paymentPath.startsWith("/sandbox/payments/")) {
      if (process.env.EPER_PAYMENT_SANDBOX_ENABLED !== "true" ||
          !paymentVendorConfig.sandboxEnabled || paymentVendorConfig.provider !== "sandbox") {
        sendJson(response, 404, { error: "sandbox_payment_flow_disabled" });
        return;
      }
      const paymentToken = process.env.EPER_PAYMENT_SANDBOX_TOKEN ?? "";
      const paymentTenant = process.env.EPER_PAYMENT_SANDBOX_TENANT_ID ?? "";
      const paymentPrincipal = process.env.EPER_PAYMENT_SANDBOX_PRINCIPAL_ID ?? "";
      if (paymentToken.length < 32 || !paymentTenant || !paymentPrincipal) {
        sendJson(response, 503, { error: "payment_sandbox_unconfigured" });
        return;
      }
      if (!bearerMatches(request, paymentToken)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      try {
        if (request.method === "POST" && paymentPath === "/sandbox/payments/from-quote") {
          const body = await readJson(request);
          const productId = body.productId;
          const marketId = body.marketId;
          const description = body.description;
          const idempotencyKey = request.headers["idempotency-key"] ?? body.idempotencyKey;
          if (typeof productId !== "string" || typeof marketId !== "string" ||
              typeof description !== "string" || typeof idempotencyKey !== "string" ||
              (body.currency !== undefined && typeof body.currency !== "string")) {
            sendJson(response, 400, { error: "productId, marketId, description and idempotency key are required" });
            return;
          }
          const quote = marketPriceBook.quote({
            productId,
            marketId,
            ...(typeof body.currency === "string" ? { currency: body.currency } : {}),
          });
          const result = paymentService.initiate({
            tenantId: paymentTenant,
            principalId: paymentPrincipal,
            amountMinor: quote.amountMinor,
            currency: quote.currency,
            marketId: quote.marketId,
            productId: quote.productId,
            priceBookId: quote.priceBookId,
            priceBookVersion: quote.priceBookVersion,
            description,
            idempotencyKey,
          });
          sendJson(response, result.replayed ? 200 : 201, { ...result, quote });
          return;
        }

        if (request.method === "POST" && paymentPath === "/sandbox/payments") {
          const body = await readJson(request);
          const amountPaise = body.amountPaise;
          const description = body.description;
          const idempotencyKey = request.headers["idempotency-key"] ?? body.idempotencyKey;
          if (typeof amountPaise !== "number" || typeof description !== "string" || typeof idempotencyKey !== "string") {
            sendJson(response, 400, { error: "amountPaise, description and idempotency key are required" });
            return;
          }
          const result = paymentService.initiate({
            tenantId: paymentTenant, principalId: paymentPrincipal, amountPaise,
            currency: typeof body.currency === "string" ? body.currency : "INR",
            description, idempotencyKey,
          });
          sendJson(response, result.replayed ? 200 : 201, result);
          return;
        }

        const receiptMatch = /^\/sandbox\/payments\/([^/]+)\/receipt$/.exec(paymentPath);
        if (request.method === "GET" && receiptMatch) {
          const receipt = paymentService.getReceipt(paymentTenant, decodeURIComponent(receiptMatch[1]));
          response.writeHead(200, {
            "content-type": receipt.contentType,
            "content-disposition": `attachment; filename="${receipt.filename}"`,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          response.end(receipt.bytes);
          return;
        }

        const resultMatch = /^\/sandbox\/payments\/([^/]+)\/result$/.exec(paymentPath);
        if (request.method === "POST" && resultMatch) {
          const body = await readJson(request);
          if ((body.outcome !== "SUCCEEDED" && body.outcome !== "FAILED") || typeof body.providerReference !== "string") {
            sendJson(response, 400, { error: "outcome and providerReference are required" });
            return;
          }
          const payment = paymentService.applyGatewayResult({
            tenantId: paymentTenant, paymentId: decodeURIComponent(resultMatch[1]),
            outcome: body.outcome, providerReference: body.providerReference,
          });
          sendJson(response, 200, { payment });
          return;
        }

        const paymentMatch = /^\/sandbox\/payments\/([^/]+)$/.exec(paymentPath);
        if (request.method === "GET" && paymentMatch) {
          const payment = paymentService.get(paymentTenant, decodeURIComponent(paymentMatch[1]));
          if (!payment) {
            sendJson(response, 404, { error: "payment_not_found" });
            return;
          }
          sendJson(response, 200, { payment });
          return;
        }
        sendJson(response, 404, { error: "not_found" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "PAYMENT_OPERATION_FAILED";
        const status = message === "PAYMENT_NOT_FOUND" || message === "APPROVED_MARKET_PRICE_NOT_FOUND" ? 404
          : message === "RECEIPT_NOT_AVAILABLE" || message.includes("IDEMPOTENCY_KEY_REUSED") ||
            message === "PAYMENT_CALLBACK_CONFLICT" || message === "PAYMENT_TERMINAL_STATE_CONFLICT" ||
            message === "MARKET_PRICE_CONFIGURATION_AMBIGUOUS" ? 409
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : message === "JSON_OBJECT_REQUIRED" || error instanceof SyntaxError ||
            message === "MARKET_CURRENCY_MISMATCH" || message.startsWith("PRICE_") || message.startsWith("MARKET_PRICE_") ||
            message.startsWith("PAYMENT_AMOUNT") || message.startsWith("PAYMENT_CURRENCY") ||
            message.startsWith("PAYMENT_DESCRIPTION") || message.startsWith("PAYMENT_IDEMPOTENCY") ||
            message.startsWith("PAYMENT_ACTOR") || message.startsWith("PAYMENT_PROVIDER") ? 400
          : 422;
        sendJson(response, status, { error: message });
      }
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });
}
