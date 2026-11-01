import { CUSTOMER_SESSION_COOKIE, parseCookieHeader } from "./customer-browser-security.js";

export interface CustomerBrowserSessionRecord {
  tenantId: string; actorId: string; issuer: string; subject: string;
  createdAt: string; lastSeenAt: string; idleExpiresAt: string; absoluteExpiresAt: string;
}
export interface CustomerBrowserSessionStorePort {
  resolveSession(sessionToken: string): Promise<CustomerBrowserSessionRecord | null>;
}
export interface CustomerTenantApplicationAssignmentPort {
  listActive(tenantId: string): Promise<string[]>;
}
export interface CustomerActorApplicationAssignmentPort {
  isAssigned(tenantId: string, actorId: string, applicationId: string): Promise<boolean>;
}
export interface TrustedCustomerBrowserIdentity {
  tenantId: string; actorId: string; applicationId: string; issuer: string; subject: string;
  session: CustomerBrowserSessionRecord;
}
export interface ResolveCustomerBrowserIdentityInput {
  cookieHeader: string | undefined; applicationId: string;
  sessionStore: CustomerBrowserSessionStorePort;
  tenantAssignments: CustomerTenantApplicationAssignmentPort;
  actorAssignments: CustomerActorApplicationAssignmentPort;
}

/**
 * Resolve a browser session and prove tenant ownership plus actor membership
 * for the requested application on every invocation. No role is inferred from
 * OIDC claims and no authorization result is cached.
 */
export async function resolveCustomerBrowserIdentity(
  input: ResolveCustomerBrowserIdentityInput,
): Promise<TrustedCustomerBrowserIdentity | null> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/.test(input.applicationId)) return null;
  const cookies = parseCookieHeader(input.cookieHeader);
  const sessionToken = cookies.get(CUSTOMER_SESSION_COOKIE);
  if (!sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return null;
  try {
    const session = await input.sessionStore.resolveSession(sessionToken);
    if (!session || !session.tenantId || !session.actorId || !session.issuer || !session.subject) return null;
    // Recheck both durable assignments per request: revocation takes effect immediately.
    const [tenantApplications, actorAssigned] = await Promise.all([
      input.tenantAssignments.listActive(session.tenantId),
      input.actorAssignments.isAssigned(session.tenantId, session.actorId, input.applicationId),
    ]);
    if (!tenantApplications.includes(input.applicationId) || !actorAssigned) return null;
    return {
      tenantId: session.tenantId, actorId: session.actorId, applicationId: input.applicationId,
      issuer: session.issuer, subject: session.subject, session,
    };
  } catch {
    // Database or authorization errors deny access; never fall back to a bearer map.
    return null;
  }
}
