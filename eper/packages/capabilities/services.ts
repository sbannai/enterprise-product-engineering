import type { RequirementBinding, RequirementPattern } from "../requirements/registry.js";
import { validateRequirementContracts } from "../../contracts/index.js";
import type { CapabilityService, CapabilityResult } from "./index.js";
import { InMemoryAuthoritativeRecordStore, type AuthoritativeRecord } from "./authoritative-records.js";
import { InMemoryAuthorizationService, type AuthorizationPolicy, type AuthorizationRequest } from "./authorization.js";
import { BusinessValidationEngine, type ValidationRule } from "./business-validation.js";
import { InMemoryAuditEvidenceStore, type AuditEvidence } from "./audit-evidence.js";
import { InMemoryExceptionStore, type ExceptionPatch, type WorkflowException } from "./exception-handling.js";
import { InMemoryGovernedReportingService, type ReportQuery, type ReportRow } from "./governed-reporting.js";

export interface CapabilityInput {
  context?: {
    tenantId: string;
    principalId: string;
    correlationId: string;
  };
  payload?: unknown;
}

function prepare(
  requirement: RequirementBinding,
  input: unknown,
  expectedPattern: RequirementPattern,
  capability: string,
): { value: CapabilityInput; contracts: ReturnType<typeof validateRequirementContracts> } {
  if (requirement.pattern !== expectedPattern) {
    throw new Error(`CAPABILITY_PATTERN_MISMATCH:${expectedPattern}:${requirement.pattern}`);
  }
  if (requirement.capability !== capability) {
    throw new Error(`CAPABILITY_BINDING_MISMATCH:${capability}:${requirement.capability}`);
  }

  const contracts = validateRequirementContracts(requirement);
  const value = (input ?? {}) as CapabilityInput;
  if (value.context) {
    if (!value.context.tenantId || !value.context.principalId || !value.context.correlationId) {
      throw new Error("CAPABILITY_CONTEXT_REQUIRED");
    }
  }
  return { value, contracts };
}

function result(
  requirement: RequirementBinding,
  contracts: ReturnType<typeof validateRequirementContracts>,
  value: unknown,
): CapabilityResult {
  return {
    requirementId: requirement.id,
    pattern: requirement.pattern,
    status: "EXECUTED",
    data: { payload: value, contracts },
  };
}

export class AuthoritativeRecordService implements CapabilityService {
  private readonly store = new InMemoryAuthoritativeRecordStore();

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX01", "authoritative-records");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      const context = value.context;
      const tenantId = payload.record?.tenantId ?? context?.tenantId;
      if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
      switch (payload.operation) {
        case "create":
          return Promise.resolve(result(requirement, contracts, { operation: "create", record: this.store.create({ ...payload.record, tenantId }) }));
        case "get":
          return Promise.resolve(result(requirement, contracts, { operation: "get", record: this.store.get(tenantId, payload.id) }));
        case "update":
          return Promise.resolve(result(requirement, contracts, { operation: "update", record: this.store.update(tenantId, payload.id, payload.expectedVersion, payload.patch ?? {}) }));
        case "delete":
          this.store.delete(tenantId, payload.id, payload.expectedVersion);
          return Promise.resolve(result(requirement, contracts, { operation: "delete", deleted: true }));
        default:
          throw new Error("RECORD_OPERATION_UNSUPPORTED");
      }
    }
    return Promise.resolve(result(requirement, contracts, value.payload ?? input ?? null));
  }

  getRecord(tenantId: string, id: string): AuthoritativeRecord | undefined {
    return this.store.get(tenantId, id);
  }
}

export class AuthorizationService implements CapabilityService {
  private readonly policyService = new InMemoryAuthorizationService();

  addPolicy(policy: AuthorizationPolicy): void {
    this.policyService.addPolicy(policy);
  }

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX02", "authorization");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation === "decide") {
      const request = payload.request as AuthorizationRequest;
      for (const policy of (payload.policies ?? [])) this.policyService.addPolicy(policy);
      return Promise.resolve(result(requirement, contracts, {
        operation: "decide",
        decision: this.policyService.decide(request),
      }));
    }
    return Promise.resolve(result(requirement, contracts, value.payload ?? input ?? null));
  }
}

export class BusinessValidationService implements CapabilityService {
  private readonly engine = new BusinessValidationEngine<unknown>();

  addRule(rule: ValidationRule<unknown>): void {
    this.engine.addRule(rule);
  }

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX03", "business-validation");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation === "validate") {
      return Promise.resolve(result(requirement, contracts, {
        operation: "validate",
        validation: this.engine.validate(payload.input),
      }));
    }
    return Promise.resolve(result(requirement, contracts, value.payload ?? input ?? null));
  }
}

export class AuditEvidenceService implements CapabilityService {
  private readonly store = new InMemoryAuditEvidenceStore();

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX04", "audit-evidence");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      if (payload.operation === "append") {
        return Promise.resolve(result(requirement, contracts, { operation: "append", evidence: this.store.append(payload.evidence) }));
      }
      if (payload.operation === "get") {
        return Promise.resolve(result(requirement, contracts, { operation: "get", evidence: this.store.get(payload.tenantId, payload.id) }));
      }
      if (payload.operation === "listByRequirement") {
        return Promise.resolve(result(requirement, contracts, {
          operation: "listByRequirement",
          evidence: this.store.listByRequirement(payload.tenantId, payload.requirementId),
        }));
      }
      throw new Error("AUDIT_OPERATION_UNSUPPORTED");
    }
    return Promise.resolve(result(requirement, contracts, value.payload ?? input ?? null));
  }
}

export class ExceptionHandlingService implements CapabilityService {
  private readonly store = new InMemoryExceptionStore();

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX05", "exception-handling");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      if (payload.operation === "create") {
        return Promise.resolve(result(requirement, contracts, { operation: "create", exception: this.store.create(payload.exception) }));
      }
      if (payload.operation === "transition") {
        return Promise.resolve(result(requirement, contracts, {
          operation: "transition",
          exception: this.store.transition(payload.tenantId, payload.id, payload.patch as ExceptionPatch),
        }));
      }
      if (payload.operation === "get") {
        return Promise.resolve(result(requirement, contracts, { operation: "get", exception: this.store.get(payload.tenantId, payload.id) }));
      }
      throw new Error("EXCEPTION_OPERATION_UNSUPPORTED");
    }
    return Promise.resolve(result(requirement, contracts, value.payload ?? input ?? null));
  }

  getException(tenantId: string, id: string): WorkflowException | undefined {
    return this.store.get(tenantId, id);
  }
}

export class GovernedReportingService implements CapabilityService {
  private readonly reporting = new InMemoryGovernedReportingService();

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX06", "governed-reporting");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      if (payload.operation === "publish") {
        this.reporting.publish(payload.row as ReportRow);
        return Promise.resolve(result(requirement, contracts, { operation: "publish", published: true }));
      }
      if (payload.operation === "query") {
        return Promise.resolve(result(requirement, contracts, {
          operation: "query",
          rows: this.reporting.query(payload.request as ReportQuery),
        }));
      }
      throw new Error("REPORT_OPERATION_UNSUPPORTED");
    }
    return Promise.resolve(result(requirement, contracts, value.payload ?? input ?? null));
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
