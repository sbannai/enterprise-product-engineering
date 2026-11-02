import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlatformAdminPrincipal } from "../../packages/identity/platform-admin-principal.js";
import type { PostgresPlatformApplicationRemediationStore } from "../../packages/workflows/postgres-platform-application-remediation-store.js";

function respond(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 16 * 1024) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON_OBJECT_REQUIRED");
  return parsed as Record<string, unknown>;
}

export async function handlePlatformApplicationRemediationRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  dependencies: {
    store?: PostgresPlatformApplicationRemediationStore;
    environment?: "production" | "uat" | "sandbox";
    serviceVersion?: string;
  },
): Promise<boolean> {
  const match = /^\/platform\/tenants\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/applications\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/remediation$/.exec(pathname);
  if (!match) return false;
  if (request.method !== "POST") {
    respond(response, 405, { error: "method_not_allowed" });
    return true;
  }
  if (process.env.EPER_PLATFORM_APPLICATION_REMEDIATION_API_ENABLED !== "true" ||
      !dependencies.store || !dependencies.environment) {
    respond(response, 404, { error: "not_found" });
    return true;
  }

  const principal = resolvePlatformAdminPrincipal(
    request.headers.authorization,
    process.env.EPER_PLATFORM_ADMIN_IDENTITIES_JSON ?? "",
  );
  if (!principal) {
    respond(response, 401, { error: "unauthorized" });
    return true;
  }
  if (!principal.permissions.includes("application:remediate")) {
    respond(response, 403, { error: "platform_application_remediation_permission_denied" });
    return true;
  }

  try {
    const body = await readBody(request);
    const allowed = ["expectedAssignmentVersion", "reasonTicketReference"];
    if (Object.keys(body).some(key => !allowed.includes(key))) {
      respond(response, 400, { error: "invalid_platform_application_remediation_body" });
      return true;
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (!Number.isSafeInteger(body.expectedAssignmentVersion) ||
        typeof body.reasonTicketReference !== "string" || !body.reasonTicketReference.trim() ||
        body.reasonTicketReference.length > 200 ||
        typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 200) {
      respond(response, 400, { error: "platform_application_remediation_fields_required" });
      return true;
    }
    const correlationHeader = request.headers["x-correlation-id"];
    const correlationId = typeof correlationHeader === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(correlationHeader)
      ? correlationHeader : randomUUID();
    const result = await dependencies.store.remediate({
      principal,
      tenantId: match[1],
      applicationId: match[2],
      expectedAssignmentVersion: body.expectedAssignmentVersion as number,
      reasonTicketReference: body.reasonTicketReference,
      idempotencyKey,
      correlationId,
      environment: dependencies.environment,
      serviceVersion: dependencies.serviceVersion,
    });
    respond(response, result.replayed ? 200 : 200, { result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLATFORM_APPLICATION_REMEDIATION_FAILED";
    const status = message.includes("PERMISSION_DENIED") ? 403 :
      message.includes("VERSION_CONFLICT") || message.includes("IDEMPOTENCY_KEY_REUSED") ? 409 :
      message.includes("NOT_FOUND") ? 404 :
      message === "REQUEST_BODY_TOO_LARGE" ? 413 :
      error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED" ? 400 :
      message.includes("INVALID_") || message.includes("REQUIRED") || message.includes("EXPECTED_VERSION_INVALID") ? 400 : 422;
    respond(response, status, { error: message });
  }
  return true;
}
