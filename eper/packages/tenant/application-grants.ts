import {
  authorizeApplicationAction,
  type ApplicationAction,
  type ApplicationEnvironment,
  type ApplicationGrant,
  type ApplicationScope,
  type VerifiedApplicationPrincipal,
} from "./application-access.js";

export interface ApplicationGrantStore {
  list(): readonly ApplicationGrant[];
  replaceForPrincipal(scope: ApplicationScope, principalId: string, grants: readonly ApplicationGrant[]): void;
}

export interface PermissionAuditEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorPrincipalId: string;
  readonly targetPrincipalId: string;
  readonly tenantId: string;
  readonly applicationId: string;
  readonly environment: ApplicationEnvironment;
  readonly action: "permission.grants.replaced";
  readonly grantCount: number;
}

export interface PermissionAuditSink {
  append(event: PermissionAuditEvent): void;
}

export type GrantReplacementResult =
  | { readonly ok: true; readonly grants: readonly ApplicationGrant[]; readonly auditEvent: PermissionAuditEvent }
  | { readonly ok: false; readonly status: 403 | 400; readonly reason: string };

/** In-memory adapter for tests and local prototypes; not durable production storage. */
export class InMemoryApplicationGrantStore implements ApplicationGrantStore {
  private grants: ApplicationGrant[] = [];

  constructor(seed: readonly ApplicationGrant[] = []) {
    this.grants = seed.map((grant) => ({ ...grant, actions: [...grant.actions] }));
  }

  list(): readonly ApplicationGrant[] {
    return this.grants.map((grant) => ({ ...grant, actions: [...grant.actions] }));
  }

  replaceForPrincipal(scope: ApplicationScope, principalId: string, grants: readonly ApplicationGrant[]): void {
    this.grants = this.grants.filter((grant) => !(
      grant.tenantId === scope.tenantId &&
      grant.applicationId === scope.applicationId &&
      grant.environment === scope.environment &&
      grant.principalId === principalId
    ));
    this.grants.push(...grants.map((grant) => ({ ...grant, actions: [...grant.actions] })));
  }
}

/** Test/local audit sink. Production must supply a durable, append-only sink. */
export class InMemoryPermissionAuditSink implements PermissionAuditSink {
  private events: PermissionAuditEvent[] = [];

  append(event: PermissionAuditEvent): void {
    this.events.push({ ...event });
  }

  snapshot(): readonly PermissionAuditEvent[] {
    return this.events.map((event) => ({ ...event }));
  }
}

const allowedActions = new Set<ApplicationAction>([
  "application:read", "application:create", "application:update", "member:manage",
  "permission:manage", "workflow:design", "workflow:review", "workflow:approve",
  "workflow:publish", "run:execute", "run:read", "kpi:read", "kpi:export",
  "audit:read", "receipt:download", "payment:reconcile",
]);

function validGrant(grant: ApplicationGrant, scope: ApplicationScope, targetPrincipalId: string): boolean {
  return grant.tenantId === scope.tenantId &&
    grant.applicationId === scope.applicationId &&
    grant.environment === scope.environment &&
    grant.principalId === targetPrincipalId &&
    (grant.effect === "ALLOW" || grant.effect === "DENY") &&
    typeof grant.active === "boolean" &&
    Array.isArray(grant.actions) &&
    grant.actions.length > 0 &&
    grant.actions.every((action) => allowedActions.has(action)) &&
    new Set(grant.actions).size === grant.actions.length;
}

/**
 * Replaces grants only after server-side permission:manage authorization.
 * Authentication, durable persistence, and durable audit are injected concerns.
 */
export class ApplicationPermissionAdminService {
  constructor(
    private readonly store: ApplicationGrantStore,
    private readonly audit: PermissionAuditSink,
    private readonly makeId: () => string = () => `perm_${Date.now().toString(36)}`,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  replaceGrants(
    actor: VerifiedApplicationPrincipal | null | undefined,
    scope: ApplicationScope,
    targetPrincipalId: string,
    grants: readonly ApplicationGrant[],
  ): GrantReplacementResult {
    const decision = authorizeApplicationAction(actor, scope, "permission:manage", this.store.list());
    if (!decision.allowed) {
      return { ok: false, status: 403, reason: decision.reason };
    }

    if (!targetPrincipalId.trim() || !Array.isArray(grants) ||
        !grants.every((grant) => validGrant(grant, scope, targetPrincipalId))) {
      return { ok: false, status: 400, reason: "INVALID_GRANT_SET" };
    }

    // Commit the grant set and then emit an audit record. Production adapters should
    // make these operations atomic (e.g. one DB transaction/outbox).
    this.store.replaceForPrincipal(scope, targetPrincipalId, grants);
    const event: PermissionAuditEvent = {
      eventId: this.makeId(),
      occurredAt: this.now(),
      actorPrincipalId: actor!.principalId,
      targetPrincipalId,
      tenantId: scope.tenantId,
      applicationId: scope.applicationId,
      environment: scope.environment,
      action: "permission.grants.replaced",
      grantCount: grants.length,
    };
    this.audit.append(event);
    return { ok: true, grants: this.store.list().filter((grant) =>
      grant.tenantId === scope.tenantId &&
      grant.applicationId === scope.applicationId &&
      grant.environment === scope.environment &&
      grant.principalId === targetPrincipalId
    ), auditEvent: event };
  }
}
