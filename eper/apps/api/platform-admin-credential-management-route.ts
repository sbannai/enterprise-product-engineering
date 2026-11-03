import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolvePlatformAdminPrincipalFromStore } from "../../packages/identity/platform-admin-principal.js";
import { PlatformAdminCredentialService } from "../../packages/identity/platform-admin-credential-service.js";
import type { PlatformAdminCredentialPermission, PostgresPlatformAdminCredentialStore } from "../../packages/identity/postgres-platform-admin-credential-store.js";

const MAX_BODY_BYTES = 8 * 1024;
const permissionSet = new Set<PlatformAdminCredentialPermission>([
  "customer_admin:provision", "customer_admin:recover", "application:remediate",
  "provider_catalogue:manage", "platform_admin:credentials:manage",
]);

function respond(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "pragma": "no-cache", "x-content-type-options": "nosniff", "vary": "authorization",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("PLATFORM_CREDENTIAL_BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("PLATFORM_CREDENTIAL_INVALID_JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PLATFORM_CREDENTIAL_JSON_OBJECT_REQUIRED");
  }
  return parsed as Record<string, unknown>;
}

function correlationId(request: IncomingMessage): string {
  const value = request.headers["x-correlation-id"];
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value : randomUUID();
}

export async function handlePlatformAdminCredentialManagementRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  dependencies: {
    store?: PostgresPlatformAdminCredentialStore;
    environment?: "production" | "uat" | "sandbox";
    serviceVersion?: string;
  },
): Promise<boolean> {
  const issuePath = pathname === "/platform/credentials";
  const revokeMatch = /^\/platform\/credentials\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/revoke$/.exec(pathname);
  if (!issuePath && !revokeMatch) return false;
  if (request.method !== "POST") { respond(response, 405, { error: "method_not_allowed" }); return true; }
  if (process.env.EPER_PLATFORM_ADMIN_CREDENTIALS_ENABLED !== "true" ||
      !dependencies.store || !dependencies.environment) {
    respond(response, 404, { error: "not_found" }); return true;
  }

  try {
    const issuer = await resolvePlatformAdminPrincipalFromStore(request.headers.authorization, dependencies.store);
    if (!issuer) { respond(response, 401, { error: "unauthorized" }); return true; }
    if (!issuer.permissions.includes("platform_admin:credentials:manage")) {
      respond(response, 403, { error: "platform_admin_credential_management_forbidden" }); return true;
    }

    const body = await readBody(request);
    const service = new PlatformAdminCredentialService(dependencies.store);
    const context = {
      correlationId: correlationId(request), environment: dependencies.environment,
      serviceVersion: dependencies.serviceVersion,
    };
    if (issuePath) {
      const allowed = ["permissions", "expiresAt"];
      if (Object.keys(body).some((key) => !allowed.includes(key)) ||
          !Array.isArray(body.permissions) || body.permissions.length === 0 ||
          !body.permissions.every((value) => typeof value === "string" &&
            permissionSet.has(value as PlatformAdminCredentialPermission)) ||
          typeof body.expiresAt !== "string") {
        respond(response, 400, { error: "platform_admin_credential_issue_fields_invalid" }); return true;
      }
      const issued = await service.issue(issuer, {
        // Until a governed platform-operator directory exists, credentials may only be rotated for the authenticated actor.
        platformActorId: issuer.platformActorId,
        permissions: body.permissions as PlatformAdminCredentialPermission[],
        expiresAt: body.expiresAt,
      }, context);
      // Return the bearer token once; only its hash is persisted.
      respond(response, 201, { result: issued }); return true;
    }
    if (Object.keys(body).length !== 0) {
      respond(response, 400, { error: "platform_admin_credential_revoke_body_must_be_empty" }); return true;
    }
    const credentialId = revokeMatch![1];
    const revoked = await service.revoke(issuer, credentialId, context);
    respond(response, revoked ? 200 : 404, { result: { credentialId, revoked } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PLATFORM_ADMIN_CREDENTIAL_OPERATION_FAILED";
    const status = message.includes("FORBIDDEN") || message.includes("AUTHORITY") ? 403 :
      message.includes("EXPIRY_INVALID") || message.includes("INPUT_INVALID") ||
      message.includes("PERMISSIONS_INVALID") || message.includes("BODY_") ||
      message.includes("JSON") ? 400 : 422;
    respond(response, status, { error: message });
  }
  return true;
}
