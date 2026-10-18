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

export interface AuthorizationPolicyStore {
  addPolicy(policy: AuthorizationPolicy): void;
  decide(request: AuthorizationRequest): AuthorizationDecision;
  snapshot(): readonly AuthorizationPolicy[];
}

export class InMemoryAuthorizationService implements AuthorizationPolicyStore {
  private readonly policies: AuthorizationPolicy[] = [];

  constructor(seed: readonly AuthorizationPolicy[] = []) {
    for (const policy of seed) this.addPolicy(policy);
  }

  snapshot(): readonly AuthorizationPolicy[] {
    return this.policies.map(policy => ({ ...policy, actions: [...policy.actions], resources: [...policy.resources] }));
  }

  addPolicy(policy: AuthorizationPolicy): void {
    if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
        typeof policy.tenantId !== "string" || !policy.tenantId.trim() ||
        (policy.principalId !== undefined && (typeof policy.principalId !== "string" || !policy.principalId.trim())) ||
        !Array.isArray(policy.actions) || policy.actions.length === 0 ||
        !policy.actions.every((action) => typeof action === "string" && action.trim().length > 0) ||
        !Array.isArray(policy.resources) || policy.resources.length === 0 ||
        !policy.resources.every((resource) => typeof resource === "string" && resource.trim().length > 0) ||
        (policy.effect !== "ALLOW" && policy.effect !== "DENY")) {
      throw new Error("AUTHORIZATION_POLICY_INVALID");
    }
    const identity = JSON.stringify([policy.tenantId, policy.principalId ?? null, policy.effect, [...policy.actions].sort(), [...policy.resources].sort()]);
    const duplicate = this.policies.some(existing =>
      JSON.stringify([existing.tenantId, existing.principalId ?? null, existing.effect, [...existing.actions].sort(), [...existing.resources].sort()]) === identity);
    if (duplicate) throw new Error("AUTHORIZATION_POLICY_ALREADY_EXISTS");
    this.policies.push({ ...policy, actions: [...policy.actions], resources: [...policy.resources] });
  }

  decide(request: AuthorizationRequest): AuthorizationDecision {
    if (!request || typeof request !== "object" || Array.isArray(request) ||
        typeof request.tenantId !== "string" || !request.tenantId.trim() ||
        typeof request.principalId !== "string" || !request.principalId.trim() ||
        typeof request.action !== "string" || !request.action.trim() ||
        typeof request.resource !== "string" || !request.resource.trim()) {
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
