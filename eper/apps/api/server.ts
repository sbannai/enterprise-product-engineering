import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { executeIntegratedRequirement } from "../../packages/capability-router.js";
import { createCapabilityServices } from "../../packages/capabilities/index.js";
import { requirementBindings } from "../../packages/requirements/registry.js";
import { PaymentReceiptService } from "../../packages/payments/payment-receipt.js";

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


    // Explicitly opt-in sandbox payment flow. This is a test adapter, not a live gateway.
    const paymentPath = requestUrl.pathname;
    if (paymentPath === "/sandbox/payments" || paymentPath.startsWith("/sandbox/payments/")) {
      if (process.env.EPER_PAYMENT_SANDBOX_ENABLED !== "true") {
        sendJson(response, 404, { error: "not_found" });
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
        const status = message === "PAYMENT_NOT_FOUND" ? 404
          : message === "RECEIPT_NOT_AVAILABLE" || message.includes("IDEMPOTENCY_KEY_REUSED") ||
            message === "PAYMENT_CALLBACK_CONFLICT" || message === "PAYMENT_TERMINAL_STATE_CONFLICT" ? 409
          : message === "REQUEST_BODY_TOO_LARGE" ? 413
          : message === "JSON_OBJECT_REQUIRED" || error instanceof SyntaxError ||
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
