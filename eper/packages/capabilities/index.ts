export interface CapabilityService { execute(requirement: unknown, input: unknown): Promise<unknown>; }
export interface CapabilityContext { tenantId: string; principalId: string; correlationId: string; }
export interface CapabilityResult { requirementId: string; pattern: string; status: "EXECUTED"; data: unknown; }

export function capabilityResult(requirement: {id:string;pattern:string}, data: unknown): CapabilityResult {
  return { requirementId: requirement.id, pattern: requirement.pattern, status: "EXECUTED", data };
}

export {
  AuthoritativeRecordService,
  AuthorizationService,
  BusinessValidationService,
  AuditEvidenceService,
  ExceptionHandlingService,
  GovernedReportingService,
  createCapabilityServices,
} from "./services.js";
