import {
  CUSTOMER_SESSION_COOKIE,
  parseCookieHeader,
  verifyCustomerBrowserCsrf,
} from "../identity/customer-browser-security.js";
import {
  resolveCustomerBrowserIdentity,
  type CustomerActorApplicationAssignmentPort,
  type CustomerBrowserSessionStorePort,
  type CustomerTenantApplicationAssignmentPort,
} from "../identity/customer-browser-session-authorization.js";
import {
  hasCustomerAssetUploadPermission,
  type CustomerAssetUploadPermissionStore,
} from "./customer-asset-upload-authorization.js";

export interface CustomerAssetUploadBrowserRequest {
  method: string | undefined;
  origin: string | undefined;
  cookieHeader: string | undefined;
  csrfHeader: string | undefined;
  applicationId: string;
}
export interface CustomerAssetUploadAuthorizationDependencies {
  expectedOrigin: string;
  csrfSecret: string;
  sessionStore: CustomerBrowserSessionStorePort;
  tenantAssignments: CustomerTenantApplicationAssignmentPort;
  actorAssignments: CustomerActorApplicationAssignmentPort;
  roleAssignments: CustomerAssetUploadPermissionStore;
}
export type CustomerAssetUploadAuthorizationResult =
  | { allowed: true; identity: { tenantId: string; actorId: string; applicationId: string } }
  | { allowed: false; reason: "csrf_invalid" | "identity_unavailable" | "permission_denied" };

/**
 * One fail-closed browser boundary for upload mutations. CSRF is checked before
 * any session or role-store lookup; identity and permission are then re-read
 * from durable stores for the exact requested application on every request.
 */
export async function authorizeCustomerAssetUploadBrowserRequest(
  request: CustomerAssetUploadBrowserRequest,
  dependencies: CustomerAssetUploadAuthorizationDependencies,
): Promise<CustomerAssetUploadAuthorizationResult> {
  const cookies = parseCookieHeader(request.cookieHeader);
  const sessionToken = cookies.get(CUSTOMER_SESSION_COOKIE);
  if (!sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken) ||
      !verifyCustomerBrowserCsrf({
        method: request.method,
        origin: request.origin,
        expectedOrigin: dependencies.expectedOrigin,
        cookieHeader: request.cookieHeader,
        csrfHeader: request.csrfHeader,
        sessionToken,
        secret: dependencies.csrfSecret,
      })) {
    return { allowed: false, reason: "csrf_invalid" };
  }

  const identity = await resolveCustomerBrowserIdentity({
    cookieHeader: request.cookieHeader,
    applicationId: request.applicationId,
    sessionStore: dependencies.sessionStore,
    tenantAssignments: dependencies.tenantAssignments,
    actorAssignments: dependencies.actorAssignments,
  });
  if (!identity) return { allowed: false, reason: "identity_unavailable" };

  const permitted = await hasCustomerAssetUploadPermission(
    identity, request.applicationId, dependencies.roleAssignments,
  );
  if (!permitted) return { allowed: false, reason: "permission_denied" };

  return {
    allowed: true,
    identity: {
      tenantId: identity.tenantId,
      actorId: identity.actorId,
      applicationId: identity.applicationId,
    },
  };
}
