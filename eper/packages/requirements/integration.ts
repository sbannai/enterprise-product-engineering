import { getRequirementBinding, RequirementBinding } from "./registry.js";
import { PrincipalContext } from "../identity/index.js";
import { TenantContext } from "../tenant/index.js";
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

export function bindRequirement(id: string, context: RequirementExecutionContext, policy: AuthorizationPolicy): RequirementExecutionResult {
  const requirement = getRequirementBinding(id);
  enforceAuthorization(
    { principal: context.principal, tenant: context.tenant, action: "EXECUTE_REQUIREMENT", resource: requirement.id },
    policy
  );
  return { requirement, capability: requirement.capability, service: requirement.service, status: "BOUND" };
}
