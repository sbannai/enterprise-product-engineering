import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveApiRequestId, sendApiError, sendApiSuccess } from "./api-response.js";
import { resolveCustomerBrowserIdentity } from "../../packages/identity/customer-browser-session-authorization.js";
import { CUSTOMER_SESSION_COOKIE, parseCookieHeader, verifyCustomerBrowserCsrf } from "../../packages/identity/customer-browser-security.js";
import type { PostgresCustomerIdentitySessionStore } from "../../packages/identity/postgres-customer-identity-session-store.js";
import type { PostgresTenantApplicationAssignmentStore } from "../../packages/identity/postgres-tenant-application-assignment-store.js";
import type { PostgresActorApplicationAssignmentStore } from "../../packages/identity/postgres-actor-application-assignment-store.js";
import type { PostgresWorkflowRoleDefinitionStore } from "../../packages/workflows/postgres-workflow-role-definition-store.js";
import type { PostgresWorkflowActorRoleAssignmentStore } from "../../packages/workflows/postgres-workflow-actor-role-assignment-store.js";
import type { PostgresWorkflowRoleDelegationStore } from "../../packages/workflows/postgres-workflow-role-delegation-store.js";

export interface CustomerRoleDelegationDependencies {
  delegationStore?: PostgresWorkflowRoleDelegationStore;
  roleDefinitionStore?: PostgresWorkflowRoleDefinitionStore;
  actorRoleAssignmentStore?: PostgresWorkflowActorRoleAssignmentStore;
  customerIdentitySessionStore?: PostgresCustomerIdentitySessionStore;
  tenantApplicationAssignmentStore?: PostgresTenantApplicationAssignmentStore;
  actorApplicationAssignmentStore?: PostgresActorApplicationAssignmentStore;
  customerOidcPublicOrigin?: string;
  customerCsrfSecret?: string;
  environment?: "production" | "uat" | "sandbox";
  serviceVersion?: string;
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 64 * 1024) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(part);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON_OBJECT_REQUIRED");
  return parsed as Record<string, unknown>;
}

/** Customer Admin delegation is session-authenticated, CSRF-protected and application-scoped. */
export async function handleCustomerRoleDelegationRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  dependencies: CustomerRoleDelegationDependencies,
): Promise<boolean> {
  const match = /^\/customer\/applications\/([A-Za-z0-9][A-Za-z0-9._-]{1,99})\/workflow-role-delegations$/.exec(pathname);
  if (!match) return false;
  if (process.env.EPER_WORKFLOW_ROLE_DELEGATION_API_ENABLED !== "true" ||
      process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE !== "postgres" ||
      process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE !== "postgres" ||
      process.env.EPER_AUDIT_PERSISTENCE !== "postgres") {
    sendApiError(request, response, 404, "NOT_FOUND", "The requested resource was not found.");
    return true;
  }
  if (request.method !== "GET" && request.method !== "POST" && request.method !== "DELETE") {
    response.writeHead(405, { allow: "GET, POST, DELETE", "cache-control": "no-store" });
    response.end();
    return true;
  }
  const { delegationStore, roleDefinitionStore, actorRoleAssignmentStore,
    customerIdentitySessionStore, tenantApplicationAssignmentStore, actorApplicationAssignmentStore } = dependencies;
  if (!delegationStore || !roleDefinitionStore || !actorRoleAssignmentStore ||
      !customerIdentitySessionStore || !tenantApplicationAssignmentStore || !actorApplicationAssignmentStore) {
    sendApiError(request, response, 503, "ROLE_DELEGATION_UNAVAILABLE", "Role delegation is not configured.");
    return true;
  }
  const applicationId = match[1];
  const identity = await resolveCustomerBrowserIdentity({
    cookieHeader: request.headers.cookie, applicationId,
    sessionStore: customerIdentitySessionStore,
    tenantAssignments: tenantApplicationAssignmentStore,
    actorAssignments: actorApplicationAssignmentStore,
  });
  if (!identity) {
    sendApiError(request, response, 401, "UNAUTHENTICATED", "An active customer browser session and application assignment are required.");
    return true;
  }

  // All read and write operations require current durable Customer Admin authority.
  const activeRoleIds = await actorRoleAssignmentStore.listActiveRoleIds(identity.tenantId, applicationId, identity.actorId);
  const roleDefinitions = await roleDefinitionStore.list(identity.tenantId, applicationId);
  const grantorRole = roleDefinitions.find(role =>
    role.status === "active" && activeRoleIds.includes(role.roleId) && role.permissions.includes("access:manage"));
  if (!grantorRole) {
    sendApiError(request, response, 403, "CUSTOMER_ADMIN_DELEGATION_FORBIDDEN", "An authorized Customer Admin role is required.");
    return true;
  }
    
  if (request.method === "GET") {
    try {
      const [assignments, roles] = await Promise.all([
        actorRoleAssignmentStore.listAssignments(identity.tenantId, applicationId),
        roleDefinitionStore.list(identity.tenantId, applicationId),
      ]);
      sendApiSuccess(request, response, 200, {
        assignments,
        roles: roles.filter(role =>
          role.status === "active" && role.delegable === true &&
          !role.permissions.some(permission => ["workflow:admin", "role:assign", "access:manage"].includes(permission)) &&
          role.permissions.every(permission => grantorRole.permissions.includes(permission))
        ).map(role => ({
          roleId: role.roleId, name: role.name, description: role.description,
          permissions: role.permissions,
        })),
      });
    } catch {
      sendApiError(request, response, 503, "ROLE_DIRECTORY_UNAVAILABLE", "The role directory could not be loaded.");
    }
    return true;
  }

  const cookies = parseCookieHeader(request.headers.cookie);
  const sessionToken = cookies.get(CUSTOMER_SESSION_COOKIE) ?? "";
  if (!verifyCustomerBrowserCsrf({
    method: request.method,
    origin: typeof request.headers.origin === "string" ? request.headers.origin : undefined,
    expectedOrigin: dependencies.customerOidcPublicOrigin ?? process.env.EPER_CUSTOMER_BROWSER_ORIGIN ?? "",
    cookieHeader: request.headers.cookie,
    csrfHeader: typeof request.headers["x-csrf-token"] === "string" ? request.headers["x-csrf-token"] : undefined,
    sessionToken,
    secret: dependencies.customerCsrfSecret ?? process.env.EPER_CUSTOMER_CSRF_SECRET ?? "",
  })) {
    sendApiError(request, response, 403, "CSRF_VALIDATION_FAILED", "A valid same-origin CSRF token is required.");
    return true;
  }
  try {
    const body = await readBody(request);
    if (Object.keys(body).some(key => !["actorId", "roleId", "expectedVersion"].includes(key)) ||
        typeof body.actorId !== "string" || typeof body.roleId !== "string" ||
        !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) {
      sendApiError(request, response, 400, "INVALID_ROLE_DELEGATION_BODY", "Actor, role and expectedVersion are required.");
      return true;
    }

    const delegationInput = {
      tenantId: identity.tenantId, applicationId,
      grantorActorId: identity.actorId, grantorRoleId: grantorRole.roleId,
      targetActorId: body.actorId, targetRoleId: body.roleId,
      expectedVersion: Number(body.expectedVersion),
      environment: dependencies.environment ?? "sandbox" as const,
      correlationId: resolveApiRequestId(request),
      serviceVersion: dependencies.serviceVersion,
    };
    if (request.method === "DELETE") {
      const assignment = await delegationStore.revoke(delegationInput);
      sendApiSuccess(request, response, 200, { assignment });
    } else {
      const assignment = await delegationStore.grant(delegationInput);
      sendApiSuccess(request, response, 201, { assignment });
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "WORKFLOW_ROLE_DELEGATION_FAILED";
    if (message === "REQUEST_BODY_TOO_LARGE") {
      sendApiError(request, response, 413, "REQUEST_BODY_TOO_LARGE", "The request body is too large.");
    } else if (error instanceof SyntaxError || message === "JSON_OBJECT_REQUIRED") {
      sendApiError(request, response, 400, "INVALID_JSON_BODY", "A valid JSON object is required.");
    } else {
      const conflict = /VERSION_CONFLICT/.test(message);
      const forbidden = /FORBIDDEN|NOT_AUTHORIZED|NOT_ACTIVE|PROTECTED/.test(message);
      const invalid = /INVALID|REQUIRED/.test(message);
      const status = conflict ? 409 : forbidden ? 403 : /NOT_FOUND/.test(message) ? 404 : invalid ? 400 : 503;
      const code = message.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").slice(0, 64) || "ROLE_DELEGATION_FAILED";
      sendApiError(request, response, status, code, "The role delegation could not be completed.");
    }
    return true;
  }
}
