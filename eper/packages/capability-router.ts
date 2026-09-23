import type { RequirementBinding, RequirementPattern } from "./requirements/registry.js";

export interface CapabilityService {
  execute(requirement: RequirementBinding, input: unknown): Promise<unknown>;
}

export type CapabilityServices = Readonly<Record<RequirementPattern, CapabilityService>>;

export async function executeIntegratedRequirement(
  requirement: RequirementBinding,
  input: unknown,
  services: CapabilityServices
): Promise<unknown> {
  return services[requirement.pattern].execute(requirement, input);
}
