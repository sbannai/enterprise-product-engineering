import { getRequirementBinding, RequirementBinding } from "./registry.js";
import { PrincipalContext } from "../identity/index.js";
import { TenantContext, requireTenantContext } from "../tenant/index.js";
import { enforceAuthorization, AuthorizationPolicy } from "../authorization/index.js";

export interface RequirementExecutionContext {
  principal: PrincipalContext;
  tenant: TenantContext;
  correlationId: string;
}

export interface RequirementExecutionResult {
  requirement: RequirementBinding;
  capability: string;
  service: string;
  status: "BOUND";
}

export async function bindRequirement(
  id: string,
  context: RequirementExecutionContext,
  policy: AuthorizationPolicy
): Promise<RequirementExecutionResult> {
  const requirement = getRequirementBinding(id);
  requireTenantContext(context.tenant);
  await enforceAuthorization(
    policy,
    { principal: context.principal, tenant: context.tenant, action: "EXECUTE_REQUIREMENT", resource: requirement.id }
  );
  return { requirement, capability: requirement.capability, service: requirement.service, status: "BOUND" };
}
