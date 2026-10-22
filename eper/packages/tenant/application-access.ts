/**
 * Fail-closed authorization primitives for multi-application APIs.
 *
 * These functions do not authenticate callers or persist memberships. Callers
 * must derive the principal from verified server-side identity and load grants
 * from an authoritative store before invoking the decision function.
 */
export type ApplicationAction =
  | "application:read"
  | "application:create"
  | "application:update"
  | "member:manage"
  | "permission:manage"
  | "workflow:design"
  | "workflow:review"
  | "workflow:approve"
  | "workflow:publish"
  | "run:execute"
  | "run:read"
  | "kpi:read"
  | "kpi:export"
  | "audit:read"
  | "receipt:download"
  | "payment:reconcile";

export type ApplicationEnvironment = "development" | "test" | "uat" | "production";
export type GrantEffect = "ALLOW" | "DENY";

export interface VerifiedApplicationPrincipal {
  readonly principalId: string;
  readonly tenantIds: readonly string[];
  readonly platformAdmin: boolean;
}

export interface ApplicationScope {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly environment: ApplicationEnvironment;
}

export interface ApplicationGrant {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly environment: ApplicationEnvironment;
  readonly principalId: string;
  readonly actions: readonly ApplicationAction[];
  /** DENY always overrides any matching ALLOW grant. */
  readonly effect: GrantEffect;
  readonly active: boolean;
}

export type ApplicationAccessDecision =
  | { readonly allowed: true; readonly reason: "PLATFORM_ADMIN" | "APPLICATION_GRANT" }
  | { readonly allowed: false; readonly reason: "PRINCIPAL_REQUIRED" | "TENANT_SCOPE_DENIED" | "APPLICATION_GRANT_REQUIRED" | "ACTION_NOT_GRANTED" | "EXPLICIT_DENY" | "ENVIRONMENT_SCOPE_DENIED" };

const environments = new Set<ApplicationEnvironment>(["development", "test", "uat", "production"]);

/**
 * Decide access for one exact tenant, application, environment and action.
 * This is a pure policy function; it must be called by server-side handlers.
 */
export function authorizeApplicationAction(
  principal: VerifiedApplicationPrincipal | null | undefined,
  scope: ApplicationScope,
  action: ApplicationAction,
  grants: readonly ApplicationGrant[],
): ApplicationAccessDecision {
  if (!principal?.principalId?.trim()) {
    return { allowed: false, reason: "PRINCIPAL_REQUIRED" };
  }

  if (!scope.tenantId?.trim() || !scope.applicationId?.trim() ||
      !environments.has(scope.environment)) {
    return { allowed: false, reason: "ENVIRONMENT_SCOPE_DENIED" };
  }

  // This flag must come from trusted identity/administration data, never request JSON.
  if (principal.platformAdmin) {
    return { allowed: true, reason: "PLATFORM_ADMIN" };
  }

  if (!principal.tenantIds.includes(scope.tenantId)) {
    return { allowed: false, reason: "TENANT_SCOPE_DENIED" };
  }

  const matching = grants.filter((grant) =>
    grant.active &&
    grant.tenantId === scope.tenantId &&
    grant.applicationId === scope.applicationId &&
    grant.environment === scope.environment &&
    grant.principalId === principal.principalId &&
    grant.actions.includes(action)
  );

  if (matching.some((grant) => grant.effect === "DENY")) {
    return { allowed: false, reason: "EXPLICIT_DENY" };
  }

  if (matching.some((grant) => grant.effect === "ALLOW")) {
    return { allowed: true, reason: "APPLICATION_GRANT" };
  }

  const scopeGrants = grants.filter((grant) =>
    grant.active &&
    grant.tenantId === scope.tenantId &&
    grant.applicationId === scope.applicationId &&
    grant.principalId === principal.principalId
  );

  if (scopeGrants.length === 0) {
    return { allowed: false, reason: "APPLICATION_GRANT_REQUIRED" };
  }

  return { allowed: false, reason: "ACTION_NOT_GRANTED" };
}
