import type { PrincipalContext } from "../identity/index.js";
import type { TenantContext } from "../tenant/index.js";

export interface AuthorizationRequest { action: string; resource: string; principal: PrincipalContext; tenant: TenantContext; }
export interface AuthorizationPolicy { authorize(request: AuthorizationRequest): Promise<boolean>; }

export async function enforceAuthorization(policy: AuthorizationPolicy, request: AuthorizationRequest): Promise<void> {
  if (!request.principal.authenticated) throw new Error("UNAUTHENTICATED");
  if (!(await policy.authorize(request))) throw new Error("UNAUTHORIZED");
}
