import type { RequirementBinding, RequirementPattern } from "../requirements/registry.js";
import { validateRequirementContracts } from "../../contracts/index.js";
import type { CapabilityService, CapabilityResult } from "./index.js";
import { InMemoryAuthoritativeRecordStore, type AuthoritativeRecord } from "./authoritative-records.js";
import { InMemoryAuthorizationService, type AuthorizationPolicy, type AuthorizationPolicyStore, type AuthorizationRequest } from "./authorization.js";
import { BusinessValidationEngine, type ValidationRule } from "./business-validation.js";
import { InMemoryAuditEvidenceStore, type AuditEvidence, type AuditEvidenceStore } from "./audit-evidence.js";
import { InMemoryExceptionStore, type ExceptionPatch, type ExceptionStore, type WorkflowException } from "./exception-handling.js";
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

function requireTenantContext(value: CapabilityInput, requestedTenantId?: string): string {
  const tenantId = value.context?.tenantId;
  if (!tenantId) throw new Error("CAPABILITY_CONTEXT_REQUIRED");
  if (requestedTenantId && requestedTenantId !== tenantId) {
    throw new Error("TENANT_CONTEXT_MISMATCH");
  }
  return tenantId;
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
  constructor(private readonly store: import("./authoritative-records.js").AuthoritativeRecordStore = new InMemoryAuthoritativeRecordStore()) {}

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX01", "authoritative-records");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      const tenantId = requireTenantContext(value, payload.record?.tenantId ?? payload.tenantId);
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
    throw new Error("CAPABILITY_OPERATION_REQUIRED");
  }

  getRecord(tenantId: string, id: string): AuthoritativeRecord | undefined {
    return this.store.get(tenantId, id);
  }
}

export class AuthorizationService implements CapabilityService {
  constructor(private readonly policyService: AuthorizationPolicyStore = new InMemoryAuthorizationService()) {}

  addPolicy(policy: AuthorizationPolicy): void {
    this.policyService.addPolicy(policy);
  }

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX02", "authorization");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation === "decide") {
      const request = payload.request as AuthorizationRequest;
      requireTenantContext(value, request?.tenantId);
      if (request?.principalId !== value.context?.principalId) {
        throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
      }
      return Promise.resolve(result(requirement, contracts, {
        operation: "decide",
        decision: this.policyService.decide(request),
      }));
    }
    throw new Error("CAPABILITY_OPERATION_REQUIRED");
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
    throw new Error("CAPABILITY_OPERATION_REQUIRED");
  }
}

export class AuditEvidenceService implements CapabilityService {
  constructor(private readonly store: AuditEvidenceStore = new InMemoryAuditEvidenceStore()) {}

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX04", "audit-evidence");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      if (payload.operation === "append") {
        requireTenantContext(value, payload.evidence?.tenantId);
        return Promise.resolve(result(requirement, contracts, { operation: "append", evidence: this.store.append(payload.evidence) }));
      }
      if (payload.operation === "get") {
        requireTenantContext(value, payload.tenantId);
        return Promise.resolve(result(requirement, contracts, { operation: "get", evidence: this.store.get(payload.tenantId, payload.id) }));
      }
      if (payload.operation === "listByRequirement") {
        requireTenantContext(value, payload.tenantId);
        return Promise.resolve(result(requirement, contracts, {
          operation: "listByRequirement",
          evidence: this.store.listByRequirement(payload.tenantId, payload.requirementId),
        }));
      }
      throw new Error("AUDIT_OPERATION_UNSUPPORTED");
    }
    throw new Error("CAPABILITY_OPERATION_REQUIRED");
  }
}

export class ExceptionHandlingService implements CapabilityService {
  constructor(private readonly store: ExceptionStore = new InMemoryExceptionStore()) {}
  private readonly lifecycleEvidence = new InMemoryAuditEvidenceStore();
  private lifecycleSequence = 0;

  private recordLifecycleEvent(
    requirement: RequirementBinding,
    context: NonNullable<CapabilityInput["context"]>,
    exception: WorkflowException,
    eventType: "EXCEPTION_CREATED" | "EXCEPTION_TRANSITIONED",
    previousState?: WorkflowException["state"],
  ): AuditEvidence {
    const id = `exception-lifecycle:${exception.id}:${++this.lifecycleSequence}`;
    return this.lifecycleEvidence.append({
      id,
      tenantId: exception.tenantId,
      requirementId: exception.requirementId || requirement.id,
      action: eventType,
      principalId: context.principalId,
      correlationId: context.correlationId,
      occurredAt: exception.updatedAt,
      payload: {
        exceptionId: exception.id,
        eventType,
        previousState: previousState ?? null,
        state: exception.state,
        retryCount: exception.retryCount,
        code: exception.code,
        owner: exception.owner ?? null,
      },
    });
  }

  listLifecycleEvidence(tenantId: string, requirementId: string): readonly AuditEvidence[] {
    return this.lifecycleEvidence.listByRequirement(tenantId, requirementId);
  }

  verifyLifecycleEvidence(entry: AuditEvidence): boolean {
    return this.lifecycleEvidence.verify(entry);
  }

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX05", "exception-handling");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      if (payload.operation === "create") {
        const tenantId = requireTenantContext(value, payload.exception?.tenantId);
        const created = this.store.create(
          { ...payload.exception, tenantId },
          (newException) => {
            this.recordLifecycleEvent(requirement, value.context!, newException, "EXCEPTION_CREATED");
          },
        );
        return Promise.resolve(result(requirement, contracts, { operation: "create", exception: created }));
      }
      if (payload.operation === "transition") {
        const tenantId = requireTenantContext(value, payload.tenantId);
        const previous = this.store.get(tenantId, payload.id);
        if (!previous) throw new Error("EXCEPTION_NOT_FOUND");
        const updated = this.store.transition(
          tenantId,
          payload.id,
          payload.patch as ExceptionPatch,
          (next, current) => {
            if (next.state !== current.state || next.retryCount !== current.retryCount || next.owner !== current.owner || next.message !== current.message) {
              this.recordLifecycleEvent(requirement, value.context!, next, "EXCEPTION_TRANSITIONED", current.state);
            }
          },
        );
        return Promise.resolve(result(requirement, contracts, {
          operation: "transition",
          exception: updated,
        }));
      }
      if (payload.operation === "get") {
        requireTenantContext(value, payload.tenantId);
        return Promise.resolve(result(requirement, contracts, { operation: "get", exception: this.store.get(payload.tenantId, payload.id) }));
      }
      throw new Error("EXCEPTION_OPERATION_UNSUPPORTED");
    }
    throw new Error("CAPABILITY_OPERATION_REQUIRED");
  }

  getException(tenantId: string, id: string): WorkflowException | undefined {
    return this.store.get(tenantId, id);
  }
}

export class GovernedReportingService implements CapabilityService {
  constructor(private readonly reporting: Pick<InMemoryGovernedReportingService, "publish" | "query"> = new InMemoryGovernedReportingService()) {}

  execute(requirement: RequirementBinding, input: unknown): Promise<CapabilityResult> {
    const { value, contracts } = prepare(requirement, input, "XX06", "governed-reporting");
    const payload = (value.payload ?? input) as any;
    if (payload && typeof payload === "object" && payload.operation) {
      if (payload.operation === "publish") {
        requireTenantContext(value, payload.row?.tenantId);
        this.reporting.publish(payload.row as ReportRow);
        return Promise.resolve(result(requirement, contracts, { operation: "publish", published: true }));
      }
      if (payload.operation === "query") {
        requireTenantContext(value, payload.request?.tenantId);
        return Promise.resolve(result(requirement, contracts, {
          operation: "query",
          rows: this.reporting.query(payload.request as ReportQuery),
        }));
      }
      throw new Error("REPORT_OPERATION_UNSUPPORTED");
    }
    throw new Error("CAPABILITY_OPERATION_REQUIRED");
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
