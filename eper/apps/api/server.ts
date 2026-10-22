import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { executeIntegratedRequirement } from "../../packages/capability-router.js";
import { createCapabilityServices } from "../../packages/capabilities/index.js";
import { ApplicationPermissionAdminService } from "../../packages/tenant/application-grants.js";
import { JsonFileApplicationGrantStore, JsonLinesPermissionAuditSink } from "../../packages/tenant/json-file-application-grants.js";
import type { ApplicationEnvironment, ApplicationGrant } from "../../packages/tenant/application-access.js";
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

    // Opt-in local/UAT permission editor API. Acting identity and scope come only from server config.
    const permissionMatch = /^\\/internal\\/permissions\\/([^/]+)$/.exec(requestUrl.pathname);
    if ((request.method === "PUT" || request.method === "GET") && permissionMatch) {
      if (process.env.EPER_LOCAL_PERMISSION_API !== "true") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const token = process.env.EPER_LOCAL_PERMISSION_TOKEN ?? "";
      const tenantId = process.env.EPER_LOCAL_PERMISSION_TENANT_ID ?? "";
      const applicationId = process.env.EPER_LOCAL_PERMISSION_APPLICATION_ID ?? "";
      const environment = process.env.EPER_LOCAL_PERMISSION_ENVIRONMENT ?? "";
      const actorPrincipalId = process.env.EPER_LOCAL_PERMISSION_ACTOR_ID ?? "";
      const grantsFile = process.env.EPER_LOCAL_PERMISSION_GRANTS_FILE ?? "";
      const auditFile = process.env.EPER_LOCAL_PERMISSION_AUDIT_FILE ?? "";
      if (token.length < 32 || !tenantId || !applicationId || !actorPrincipalId ||
          !["development", "test", "uat", "production"].includes(environment) || !grantsFile || !auditFile) {
        sendJson(response, 503, { error: "local_permission_api_unconfigured" });
        return;
      }
      if (!bearerMatches(request, token)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      let targetPrincipalId: string;
      try {
        targetPrincipalId = decodeURIComponent(permissionMatch[1]);
      } catch {
        sendJson(response, 400, { error: "invalid_principal_id_encoding" });
        return;
      }
      if (!targetPrincipalId.trim() || targetPrincipalId.length > 200) {
        sendJson(response, 400, { error: "invalid_principal_id" });
        return;
      }

      try {
        const scope = { tenantId, applicationId, environment: environment as ApplicationEnvironment };
        const store = new JsonFileApplicationGrantStore(grantsFile);
        if (request.method === "GET") {
          const visible = store.list().filter((grant) =>
            grant.tenantId === scope.tenantId &&
            grant.applicationId === scope.applicationId &&
            grant.environment === scope.environment &&
            grant.principalId === targetPrincipalId
          );
          sendJson(response, 200, { scope, principalId: targetPrincipalId, grants: visible });
          return;
        }

        const body = await readJson(request);
        if (!Array.isArray(body.grants)) {
          sendJson(response, 400, { error: "grants_array_required" });
          return;
        }
        const audit = new JsonLinesPermissionAuditSink(auditFile);
        const admin = new ApplicationPermissionAdminService(store, audit);
        const actor = { principalId: actorPrincipalId, tenantIds: [tenantId], platformAdmin: false };
        const result = admin.replaceGrants(actor, scope, targetPrincipalId, body.grants as ApplicationGrant[]);
        if (!result.ok) {
          sendJson(response, result.status, { error: result.reason });
          return;
        }
        sendJson(response, 200, { scope, principalId: targetPrincipalId, grants: result.grants, auditEvent: result.auditEvent });
      } catch (error) {
        const message = error instanceof Error ? error.message : "permission_api_failed";
        sendJson(response, message === "REQUEST_BODY_TOO_LARGE" ? 413 : 400, {
          error: message === "REQUEST_BODY_TOO_LARGE" ? message : "invalid_permission_request",
        });
      }
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
