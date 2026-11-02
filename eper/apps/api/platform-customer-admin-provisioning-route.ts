import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlatformAdminPrincipal } from "../../packages/identity/platform-admin-principal.js";
import type { PostgresPlatformCustomerAdminProvisioningStore } from "../../packages/workflows/postgres-platform-customer-admin-provisioning-store.js";

const MAX_BODY_BYTES = 16 * 1024;

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("PLATFORM_ADMIN_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (size === 0) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("PLATFORM_ADMIN_INVALID_JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PLATFORM_ADMIN_JSON_OBJECT_REQUIRED");
  }
  return parsed as Record<string, unknown>;
}

function respond(request: IncomingMessage, response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "authorization",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function statusFor(message: string): number {
  if (message.includes("PERMISSION_DENIED")) return 403;
  if (message.includes("NOT_ACTIVE") || message.includes("NOT_ALLOWED") ||
      message.includes("INITIAL_PROVISIONING_NOT_ALLOWED") ||
      message.includes("RECOVERY_REQUIRES_PRIOR_ADMIN_HISTORY")) return 409;
  if (message.includes("IDEMPOTENCY_KEY_REUSED")) return 409;
  if (message.includes("INVALID_") || message.includes("REASON_REQUIRED") ||
      message.includes("JSON_") || message.includes("BODY_TOO_LARGE")) return 400;
  if (message.includes("ALREADY_ACTIVE")) return 409;
  return 503;
}

/**
 * Dedicated bearer-authenticated platform routes. They do not use customer
 * sessions, tenant-scoped admin-config credentials, or request-body authority.
 */
export async function handlePlatformCustomerAdminProvisioningRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  dependencies: {
    store?: PostgresPlatformCustomerAdminProvisioningStore;
    environment?: "production" | "uat" | "sandbox";
    serviceVersion?: string;
  },
): Promise<boolean> {
  const route = /^\/platform\/tenants\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/(customer-admins|customer-admin-recovery)$/.exec(pathname);
  if (!route) return false;
  if (request.method !== "POST") {
    respond(request, response, 405, { error: "method_not_allowed" });
    return true;
  }
  if (!dependencies.store || !dependencies.environment) {
    respond(request, response, 503, { error: "platform_customer_admin_unavailable" });
    return true;
  }

  const principal = resolvePlatformAdminPrincipal(
    request.headers.authorization,
    process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON ?? "",
  );
  if (!principal) {
    respond(request, response, 401, { error: "unauthorized" });
    return true;
  }

  try {
    const body = await readBody(request);
    const operation = route[3] === "customer-admins" ? "provision" : "recover";
    const allowedKeys = operation === "provision"
      ? ["targetActorId", "idempotencyKey"]
      : ["targetActorId", "idempotencyKey", "reasonTicketReference"];
    if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
      respond(request, response, 400, { error: "invalid_platform_customer_admin_body" });
      return true;
    }
    if (typeof body.targetActorId !== "string" ||
        typeof body.idempotencyKey !== "string" ||
        (operation === "recover" && typeof body.reasonTicketReference !== "string")) {
      respond(request, response, 400, { error: "platform_customer_admin_fields_required" });
      return true;
    }
    const correlationHeader = request.headers["x-correlation-id"];
    const correlationId = typeof correlationHeader === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(correlationHeader)
      ? correlationHeader : randomUUID();
    const result = await dependencies.store.mutate({
      principal,
      operation,
      tenantId: route[1],
      applicationId: route[2],
      targetActorId: body.targetActorId,
      idempotencyKey: body.idempotencyKey,
      correlationId,
      environment: dependencies.environment,
      ...(operation === "recover" ? { reasonTicketReference: body.reasonTicketReference as string } : {}),
      serviceVersion: dependencies.serviceVersion,
    });
    respond(request, response, result.replayed ? 200 : 201, { result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLATFORM_CUSTOMER_ADMIN_OPERATION_FAILED";
    const status = statusFor(message);
    respond(request, response, status, {
      error: status === 503 ? "platform_customer_admin_operation_unavailable" : message,
    });
  }
  return true;
}
