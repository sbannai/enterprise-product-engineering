/**
 * Fail-closed authorization primitives for the proposed multi-application API.
 *
 * This module does not authenticate a caller or persist memberships. Callers must
 * build the principal from a verified server-side identity and load memberships
 * from an authoritative store before invoking these checks.
 */
export type ApplicationAction =
  | "application:read"
  | "application:create"
  | "application:update"
  | "member:manage"
  | "workflow:design"
  | "workflow:review"
  | "workflow:approve"
  | "workflow:publish"
  | "kpi:read"
  | "kpi:export"
  | "audit:read";

export interface VerifiedApplicationPrincipal {
  readonly principalId: string;
  readonly tenantIds: readonly string[];
  readonly platformAdmin: boolean;
}

export interface ApplicationScope {
  readonly tenantId: string;
  readonly applicationId: string;
}

export interface ApplicationGrant {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly principalId: string;
  readonly actions: readonly ApplicationAction[];
  readonly active: boolean;
}

export type ApplicationAccessDecision =
  | { readonly allowed: true; readonly reason: "PLATFORM_ADMIN" | "APPLICATION_GRANT" }
  | { readonly allowed: false; readonly reason: "PRINCIPAL_REQUIRED" | "TENANT_SCOPE_DENIED" | "APPLICATION_GRANT_REQUIRED" | "ACTION_NOT_GRANTED" };

export function authorizeApplicationAction(
  principal: VerifiedApplicationPrincipal | null | undefined,
  scope: ApplicationScope,
  action: ApplicationAction,
  grants: readonly ApplicationGrant[],
): ApplicationAccessDecision {
  if (!principal?.principalId?.trim()) {
    return { allowed: false, reason: "PRINCIPAL_REQUIRED" };
  }

  // Platform administrators are privileged only when the trusted caller has
  // explicitly set this server-derived flag. Never derive it from request JSON.
  if (principal.platformAdmin) {
    return { allowed: true, reason: "PLATFORM_ADMIN" };
  }

  if (!scope.tenantId?.trim() || !scope.applicationId?.trim() || !principal.tenantIds.includes(scope.tenantId)) {
    return { allowed: false, reason: "TENANT_SCOPE_DENIED" };
  }

  const matching = grants.filter((grant) =>
    grant.active &&
    grant.tenantId === scope.tenantId &&
    grant.applicationId === scope.applicationId &&
    grant.principalId === principal.principalId
  );

  if (matching.length === 0) {
    return { allowed: false, reason: "APPLICATION_GRANT_REQUIRED" };
  }

  if (!matching.some((grant) => grant.actions.includes(action))) {
    return { allowed: false, reason: "ACTION_NOT_GRANTED" };
  }

  return { allowed: true, reason: "APPLICATION_GRANT" };
}
