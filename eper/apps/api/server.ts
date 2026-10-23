import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { executeIntegratedRequirement } from "../../packages/capability-router.js";
import { createCapabilityServices } from "../../packages/capabilities/index.js";
import { handlePaymentRoute } from "./payments.js";
import type { TrustedInvoiceAmountSource } from "../../packages/payments/invoice-amount-authority.js";
import type { PostgresPaymentStore } from "../../packages/payments/postgres-payment-store.js";
import type { TrustedReceiptNumberSource } from "./payments.js";
import { requirementBindings } from "../../packages/requirements/registry.js";

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

export function createAppServer(options: { invoiceAmountSource?: TrustedInvoiceAmountSource; paymentStore?: PostgresPaymentStore; receiptNumberSource?: TrustedReceiptNumberSource } = {}): Server {
  const services = createConfiguredCapabilityServices();

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

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
      // Dedicated subsystem readiness is intentionally separate from /health:
      // capability API health must not imply payment readiness, and payment
      // blockers must not expose configuration values or secret material.
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
      // Verify the schema separately from simple network connectivity. Older test doubles
      // may not expose this method; the real PostgresPaymentStore does.
      if (options.paymentStore && typeof (options.paymentStore as PostgresPaymentStore & { checkSchema?: () => Promise<boolean> }).checkSchema === "function") {
        try {
          if (!(await (options.paymentStore as PostgresPaymentStore & { checkSchema: () => Promise<boolean> }).checkSchema())) {
            blockers.push("postgres_payment_schema_unavailable");
          }
        } catch {
          blockers.push("postgres_payment_schema_unavailable");
        }
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

    // Catch rejected async payment operations at the HTTP boundary. A rejected
    // async createServer listener is not automatically converted into an HTTP response.
    try {
      if (await handlePaymentRoute(request, response, requestUrl.pathname, options.invoiceAmountSource, options.paymentStore, options.receiptNumberSource)) return;
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

    sendJson(response, 404, { error: "not_found" });
  });
}
