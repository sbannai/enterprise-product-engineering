import type { Pool } from "pg";
import type { RequirementBinding, RequirementPattern } from "../requirements/registry.js";
import { validateRequirementContracts } from "../../contracts/index.js";
import type { CapabilityService, CapabilityResult } from "./index.js";
import { BusinessValidationEngine } from "./business-validation.js";
import type { AuthorizationPolicy, AuthorizationRequest } from "./authorization.js";
import type { ExceptionCreateInput, ExceptionPatch } from "./exception-handling.js";
import type { ReportQuery, ReportRow } from "./governed-reporting.js";
import { PostgresAuthoritativeRecordStore, PostgresAuthorizationPolicyStore, PostgresAuditEvidenceStore, PostgresExceptionStore, PostgresGovernedReportingStore } from "./postgres-stores.js";

type Context = { tenantId: string; principalId: string; correlationId: string };
type Input = { context?: Context; payload?: unknown };
type Payload = Record<string, unknown>;

function prepare(req: RequirementBinding, input: unknown, pattern: RequirementPattern, capability: string) {
  if (req.pattern !== pattern) throw new Error("CAPABILITY_PATTERN_MISMATCH");
  if (req.capability !== capability) throw new Error("CAPABILITY_BINDING_MISMATCH");
  const contracts = validateRequirementContracts(req);
  const value = (input ?? {}) as Input;
  const context = value.context;
  if (!context?.tenantId?.trim() || !context.principalId?.trim() || !context.correlationId?.trim()) throw new Error("CAPABILITY_CONTEXT_REQUIRED");
  const payload = value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("CAPABILITY_OPERATION_REQUIRED");
  return { context, contracts, payload: payload as Payload };
}
function tenant(context: Context, supplied: unknown): string {
  if (supplied !== undefined && supplied !== context.tenantId) throw new Error("TENANT_CONTEXT_MISMATCH");
  return context.tenantId;
}
function result(req: RequirementBinding, contracts: ReturnType<typeof validateRequirementContracts>, payload: unknown): CapabilityResult {
  return { requirementId: req.id, pattern: req.pattern, status: "EXECUTED", data: { payload, contracts } };
}

/** Async capability services backed by PostgreSQL. Use local/integration pools only in this phase. */
export function createPostgresCapabilityServices(pool: Pool): Readonly<Record<RequirementPattern, CapabilityService>> {
  const records = new PostgresAuthoritativeRecordStore(pool);
  const policies = new PostgresAuthorizationPolicyStore(pool);
  const audit = new PostgresAuditEvidenceStore(pool);
  const exceptions = new PostgresExceptionStore(pool);
  const reports = new PostgresGovernedReportingStore(pool);
  const validation = new BusinessValidationEngine<unknown>();

  const XX01: CapabilityService = { async execute(req, input) {
    const { context, contracts, payload: p } = prepare(req, input, "XX01", "authoritative-records");
    const tid = tenant(context, (p.record as { tenantId?: unknown } | undefined)?.tenantId ?? p.tenantId);
    if (p.operation === "create") return result(req, contracts, { operation: "create", record: await records.createGoverned({ ...(p.record as object), tenantId: tid } as Parameters<typeof records.create>[0], { principalId: context.principalId, correlationId: context.correlationId, requirementId: req.id }) });
    if (p.operation === "get") return result(req, contracts, { operation: "get", record: await records.get(tid, String(p.id)) });
    if (p.operation === "update") return result(req, contracts, { operation: "update", record: await records.updateGoverned(tid, String(p.id), Number(p.expectedVersion), (p.patch ?? {}) as Parameters<typeof records.update>[3], { principalId: context.principalId, correlationId: context.correlationId, requirementId: req.id }) });
    if (p.operation === "delete") { await records.deleteGoverned(tid, String(p.id), Number(p.expectedVersion), { principalId: context.principalId, correlationId: context.correlationId, requirementId: req.id }); return result(req, contracts, { operation: "delete", deleted: true }); }
    throw new Error("RECORD_OPERATION_UNSUPPORTED");
  } };

  const XX02: CapabilityService = { async execute(req, input) {
    const { context, contracts, payload: p } = prepare(req, input, "XX02", "authorization");
    if (p.operation === "addPolicy") { const policy = p.policy as AuthorizationPolicy & { id?: string }; await policies.addPolicyGoverned({ ...policy, tenantId: tenant(context, policy?.tenantId) }, { principalId: context.principalId, correlationId: context.correlationId, requirementId: req.id }); return result(req, contracts, { operation: "addPolicy", added: true }); }
    if (p.operation === "decide") { const request = p.request as AuthorizationRequest; tenant(context, request?.tenantId); if (request?.principalId !== context.principalId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH"); return result(req, contracts, { operation: "decide", decision: await policies.decide(request) }); }
    if (p.operation === "snapshot") return result(req, contracts, { operation: "snapshot", policies: await policies.snapshot(context.tenantId) });
    throw new Error("AUTHORIZATION_OPERATION_UNSUPPORTED");
  } };

  const XX03: CapabilityService = { async execute(req, input) {
    const { contracts, payload: p } = prepare(req, input, "XX03", "business-validation");
    if (p.operation !== "validate") throw new Error("VALIDATION_OPERATION_UNSUPPORTED");
    return result(req, contracts, { operation: "validate", validation: validation.validate(p.input) });
  } };

  const XX04: CapabilityService = { async execute(req, input) {
    const { context, contracts, payload: p } = prepare(req, input, "XX04", "audit-evidence");
    if (p.operation === "append") { const evidence = p.evidence as Record<string, unknown>; tenant(context, evidence?.tenantId); return result(req, contracts, { operation: "append", evidence: await audit.append({ ...evidence, tenantId: context.tenantId, principalId: context.principalId, correlationId: context.correlationId } as Parameters<typeof audit.append>[0]) }); }
    if (p.operation === "get") return result(req, contracts, { operation: "get", evidence: await audit.get(context.tenantId, String(p.id)) });
    if (p.operation === "listByRequirement") return result(req, contracts, { operation: "listByRequirement", evidence: await audit.listByRequirement(context.tenantId, String(p.requirementId)) });
    throw new Error("AUDIT_OPERATION_UNSUPPORTED");
  } };

  const XX05: CapabilityService = { async execute(req, input) {
    const { context, contracts, payload: p } = prepare(req, input, "XX05", "exception-handling");
    if (p.operation === "create") { const item = p.exception as ExceptionCreateInput; tenant(context, item?.tenantId); return result(req, contracts, { operation: "create", exception: await exceptions.create({ ...item, tenantId: context.tenantId }, context.correlationId, context.principalId) }); }
    if (p.operation === "transition") return result(req, contracts, { operation: "transition", exception: await exceptions.transition(tenant(context, p.tenantId), String(p.id), Number(p.expectedVersion), p.patch as ExceptionPatch, context.correlationId, context.principalId) });
    if (p.operation === "get") return result(req, contracts, { operation: "get", exception: await exceptions.get(tenant(context, p.tenantId), String(p.id)) });
    throw new Error("EXCEPTION_OPERATION_UNSUPPORTED");
  } };

  const XX06: CapabilityService = { async execute(req, input) {
    const { context, contracts, payload: p } = prepare(req, input, "XX06", "governed-reporting");
    if (p.operation === "publish") { const row = p.row as ReportRow; tenant(context, row?.tenantId); await reports.publish({ ...row, tenantId: context.tenantId }, String(p.publicationId), context.principalId, context.correlationId); return result(req, contracts, { operation: "publish", published: true }); }
    if (p.operation === "query") { const request = p.request as ReportQuery; tenant(context, request?.tenantId); return result(req, contracts, { operation: "query", rows: await reports.query({ ...request, tenantId: context.tenantId }) }); }
    throw new Error("REPORT_OPERATION_UNSUPPORTED");
  } };

  return { XX01, XX02, XX03, XX04, XX05, XX06 };
}
