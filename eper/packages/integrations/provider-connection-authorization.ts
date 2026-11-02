export type ProviderConnectionAction =
  | "provider.connection.create"
  | "provider.connection.read"
  | "provider.connection.bind"
  | "provider.connection.validate"
  | "provider.connection.rotate"
  | "provider.connection.revoke";

export interface TrustedProviderActor {
  /** Resolved from a server-validated OIDC session, never request JSON. */
  tenantId: string;
  actorId: string;
}

export interface ProviderApplicationAssignmentReader {
  isTenantApplicationActive(tenantId: string, applicationId: string): Promise<boolean>;
  isActorAssigned(tenantId: string, actorId: string, applicationId: string): Promise<boolean>;
}

export interface ProviderRoleAuthorizer {
  /** Must resolve the actor's current durable role/delegation policy; no token role claims. */
  authorize(input: {
    tenantId: string;
    actorId: string;
    action: ProviderConnectionAction;
    applicationId: string | null;
  }): Promise<boolean>;
}

export interface ProviderConnectionAuthorizationInput {
  actor: TrustedProviderActor | null;
  action: ProviderConnectionAction;
  /** Required for application-scoped operations; omitted only for tenant-level create. */
  applicationId?: string;
  assignments: ProviderApplicationAssignmentReader;
  roles: ProviderRoleAuthorizer;
}

export interface AuthorizedProviderScope {
  tenantId: string;
  actorId: string;
  applicationId: string | null;
  action: ProviderConnectionAction;
}

/**
 * Provider API authorization boundary.
 *
 * Identity must already have been resolved from the server-side OIDC session.
 * This function independently rechecks current tenant/application membership
 * and delegates role/delegation decisions to the durable authorization policy.
 * A caller must use the returned scope (not request-body tenant/actor fields)
 * for every repository call.
 */
export async function authorizeProviderConnectionRequest(
  input: ProviderConnectionAuthorizationInput,
): Promise<AuthorizedProviderScope> {
  const actor = input.actor;
  if (!actor || !validId(actor.tenantId) || !validId(actor.actorId)) {
    throw new Error("PROVIDER_UNAUTHENTICATED");
  }

  const applicationId = input.applicationId ?? null;
  if (applicationId !== null && !validId(applicationId)) {
    throw new Error("PROVIDER_APPLICATION_SCOPE_INVALID");
  }
  if (input.action !== "provider.connection.create" && applicationId === null) {
    throw new Error("PROVIDER_APPLICATION_SCOPE_REQUIRED");
  }

  if (applicationId !== null) {
    const [tenantActive, actorAssigned] = await Promise.all([
      input.assignments.isTenantApplicationActive(actor.tenantId, applicationId),
      input.assignments.isActorAssigned(actor.tenantId, actor.actorId, applicationId),
    ]);
    if (!tenantActive || !actorAssigned) {
      throw new Error("PROVIDER_APPLICATION_ACCESS_DENIED");
    }
  }

  let allowed = false;
  try {
    allowed = await input.roles.authorize({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: input.action,
      applicationId,
    });
  } catch {
    // Policy-store outages are authorization failures, never permissive fallbacks.
    throw new Error("PROVIDER_AUTHORIZATION_UNAVAILABLE");
  }
  if (!allowed) throw new Error("PROVIDER_ACTION_FORBIDDEN");

  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    applicationId,
    action: input.action,
  };
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(value);
}


/** Adapter from the provider permission vocabulary to durable application role grants. */
export interface ProviderRolePermissionReader {
  listActiveRoleIds(tenantId: string, applicationId: string, actorId: string): Promise<string[]>;
  hasPermission(
    tenantId: string,
    applicationId: string,
    actorId: string,
    roleId: string,
    permission: string,
  ): Promise<boolean>;
}

const PROVIDER_ACTION_PERMISSION: Record<ProviderConnectionAction, string> = {
  "provider.connection.create": "provider.connection.create",
  "provider.connection.read": "provider.connection.read",
  "provider.connection.bind": "provider.connection.bind",
  "provider.connection.validate": "provider.connection.validate",
  "provider.connection.rotate": "provider.connection.rotate",
  "provider.connection.revoke": "provider.connection.revoke",
};

/**
 * Application-scoped role authorizer. Tenant-wide create is intentionally denied:
 * the current role-assignment model has no tenant-level administrator grants.
 */
export class PostgresProviderRoleAuthorizer implements ProviderRoleAuthorizer {
  constructor(private readonly assignments: ProviderRolePermissionReader) {}

  async authorize(input: {
    tenantId: string;
    actorId: string;
    action: ProviderConnectionAction;
    applicationId: string | null;
  }): Promise<boolean> {
    if (!input.applicationId) return false;
    const roleIds = await this.assignments.listActiveRoleIds(
      input.tenantId, input.applicationId, input.actorId,
    );
    if (roleIds.length === 0) return false;
    const grants = await Promise.all(roleIds.map(roleId => this.assignments.hasPermission(
      input.tenantId,
      input.applicationId as string,
      input.actorId,
      roleId,
      PROVIDER_ACTION_PERMISSION[input.action],
    )));
    return grants.some(Boolean);
  }
}
