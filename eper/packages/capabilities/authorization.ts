export type AuthorizationEffect = "ALLOW" | "DENY";

export interface AuthorizationRequest {
  tenantId: string;
  principalId: string;
  action: string;
  resource: string;
}

export interface AuthorizationPolicy {
  tenantId: string;
  principalId?: string;
  actions: readonly string[];
  resources: readonly string[];
  effect: AuthorizationEffect;
}

export interface AuthorizationDecision {
  effect: AuthorizationEffect;
  reason: string;
  request: AuthorizationRequest;
}

export class InMemoryAuthorizationService {
  private readonly policies: AuthorizationPolicy[] = [];

  addPolicy(policy: AuthorizationPolicy): void {
    this.policies.push({ ...policy, actions: [...policy.actions], resources: [...policy.resources] });
  }

  decide(request: AuthorizationRequest): AuthorizationDecision {
    if (!request.tenantId || !request.principalId || !request.action || !request.resource) {
      throw new Error("AUTHORIZATION_CONTEXT_REQUIRED");
    }

    const matches = this.policies.filter((policy) =>
      policy.tenantId === request.tenantId &&
      (!policy.principalId || policy.principalId === request.principalId) &&
      policy.actions.includes(request.action) &&
      policy.resources.includes(request.resource),
    );

    const deny = matches.find((policy) => policy.effect === "DENY");
    if (deny) {
      return { effect: "DENY", reason: "EXPLICIT_DENY_POLICY", request };
    }

    const allow = matches.find((policy) => policy.effect === "ALLOW");
    if (allow) {
      return { effect: "ALLOW", reason: "ALLOW_POLICY_MATCH", request };
    }

    return { effect: "DENY", reason: "NO_ALLOW_POLICY", request };
  }
}
