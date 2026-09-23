import type { RequirementBinding, RequirementPattern } from "../requirements/registry.js";
import type { CapabilityService, CapabilityResult } from "./index.js";

export interface CapabilityInput {
  context?: {
    tenantId: string;
    principalId: string;
    correlationId: string;
  };
  payload?: unknown;
}

function execute(
  requirement: RequirementBinding,
  input: unknown,
  expectedPattern: RequirementPattern,
  capability: string,
): CapabilityResult {
  if (requirement.pattern !== expectedPattern) {
    throw new Error(`CAPABILITY_PATTERN_MISMATCH:${expectedPattern}:${requirement.pattern}`);
  }
  if (requirement.capability !== capability) {
    throw new Error(`CAPABILITY_BINDING_MISMATCH:${capability}:${requirement.capability}`);
  }

  const value = (input ?? {}) as CapabilityInput;
  if (value.context) {
    if (!value.context.tenantId || !value.context.principalId || !value.context.correlationId) {
      throw new Error("CAPABILITY_CONTEXT_REQUIRED");
    }
  }

  return {
    requirementId: requirement.id,
    pattern: requirement.pattern,
    status: "EXECUTED",
    data: value.payload ?? input ?? null,
  };
}

export class AuthoritativeRecordService implements CapabilityService {
  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    return Promise.resolve(execute(requirement, input, "XX01", "authoritative-records"));
  }
}

export class AuthorizationService implements CapabilityService {
  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    return Promise.resolve(execute(requirement, input, "XX02", "authorization"));
  }
}

export class BusinessValidationService implements CapabilityService {
  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    return Promise.resolve(execute(requirement, input, "XX03", "business-validation"));
  }
}

export class AuditEvidenceService implements CapabilityService {
  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    return Promise.resolve(execute(requirement, input, "XX04", "audit-evidence"));
  }
}

export class ExceptionHandlingService implements CapabilityService {
  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    return Promise.resolve(execute(requirement, input, "XX05", "exception-handling"));
  }
}

export class GovernedReportingService implements CapabilityService {
  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    return Promise.resolve(execute(requirement, input, "XX06", "governed-reporting"));
  }
}

export function createCapabilityServices(): Readonly<Record<RequirementPattern, CapabilityService>> {
  return {
    XX01: new AuthoritativeRecordService(),
    XX02: new AuthorizationService(),
    XX03: new BusinessValidationService(),
    XX04: new AuditEvidenceService(),
    XX05: new ExceptionHandlingService(),
    XX06: new GovernedReportingService(),
  };
}
