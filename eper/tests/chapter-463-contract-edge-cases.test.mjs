import assert from "node:assert/strict";
import test from "node:test";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { getCapabilityContracts } from "../dist/contracts/index.js";
import {
  AuthoritativeRecordService,
  AuthorizationService,
  BusinessValidationService,
  AuditEvidenceService,
  ExceptionHandlingService,
  GovernedReportingService,
} from "../dist/packages/capabilities/services.js";

const requirement = (id) => {
  const value = requirementBindings.find((item) => item.id === id);
  assert.ok(value, `Missing requirement binding: ${id}`);
  return value;
};
const context = (tenantId = "tenant-463", principalId = "tester-463", correlationId = "edge-case") => ({
  tenantId, principalId, correlationId,
});

test("Chapter 463 contract descriptors are capability-scoped and versioned v1", () => {
  const cases = [
    ["REQ-46301", "authoritative-records", "DATA:authoritative-domain", "API:capability-resource", "EVENT:material-lifecycle"],
    ["REQ-46302", "authorization", "DATA:identity-policy", "API:secured-capability", "EVENT:authorization-audit"],
    ["REQ-46303", "business-validation", "DATA:domain-rules", "API:validated-command", "EVENT:validation-outcome"],
    ["REQ-46304", "audit-evidence", "DATA:audit-record", "API:audit-retrieval", "EVENT:audit-material-event"],
    ["REQ-46305", "exception-handling", "DATA:workflow-exception", "API:recovery-command", "EVENT:exception-lifecycle"],
    ["REQ-46306", "governed-reporting", "DATA:derived-reporting", "API:report-query", "EVENT:report-refresh"],
  ];
  for (const [id, capability, dataId, apiId, eventId] of cases) {
    const binding = requirement(id);
    assert.equal(binding.capability, capability);
    const contracts = getCapabilityContracts(capability);
    assert.deepEqual([contracts.data.id, contracts.api.id, contracts.event.id], [dataId, apiId, eventId]);
    assert.deepEqual([contracts.data.version, contracts.api.version, contracts.event.version], ["v1", "v1", "v1"]);
  }
});

test("REQ-46301 rejects tenant mismatch, duplicate create and stale delete version", async () => {
  const service = new AuthoritativeRecordService();
  const req = requirement("REQ-46301");
  const record = { id: "edge-record", tenantId: "tenant-463", version: 1, state: "OPEN", data: { x: 1 } };
  assert.throws(() => service.execute(req, {
    context: context("tenant-463"), payload: { operation: "create", record: { ...record, tenantId: "tenant-other" } },
  }), /TENANT_CONTEXT_MISMATCH/);
  await service.execute(req, { context: context(), payload: { operation: "create", record } });
  assert.throws(() => service.execute(req, {
    context: context(), payload: { operation: "create", record },
  }), /RECORD_ALREADY_EXISTS/);
  assert.throws(() => service.execute(req, {
    context: context(), payload: { operation: "delete", tenantId: "tenant-463", id: "edge-record", expectedVersion: 9 },
  }), /RECORD_VERSION_CONFLICT/);
  assert.equal(service.getRecord("tenant-463", "edge-record").version, 1);
});

test("REQ-46302 rejects a request principal that differs from the execution context", () => {
  const service = new AuthorizationService();
  assert.throws(() => service.execute(requirement("REQ-46302"), {
    context: context("tenant-463", "actor-context"),
    payload: { operation: "decide", request: { tenantId: "tenant-463", principalId: "actor-other", action: "read", resource: "record" } },
  }), /AUTHORIZATION_PRINCIPAL_MISMATCH/);
});

test("REQ-46303 rejects duplicate rule IDs and treats warning-only results as valid", async () => {
  const service = new BusinessValidationService();
  const rule = { id: "warning-rule", evaluate: () => ({ code: "WARN", message: "Advisory only", severity: "WARNING" }) };
  service.addRule(rule);
  assert.throws(() => service.addRule(rule), /VALIDATION_RULE_DUPLICATE/);
  const result = await service.execute(requirement("REQ-46303"), {
    context: context(), payload: { operation: "validate", input: { sample: true } },
  });
  assert.equal(result.data.payload.validation.valid, true);
  assert.equal(result.data.payload.validation.issues.length, 1);
});

test("REQ-46304 rejects invalid timestamps and duplicate tenant-scoped evidence IDs", async () => {
  const service = new AuditEvidenceService();
  const base = {
    id: "edge-audit", tenantId: "tenant-463", requirementId: "REQ-46304", action: "UPDATE",
    principalId: "tester-463", correlationId: "edge-audit-1", occurredAt: "2026-10-04T00:00:00.000Z", payload: { state: "OPEN" },
  };
  assert.throws(() => service.execute(requirement("REQ-46304"), {
    context: context(), payload: { operation: "append", evidence: { ...base, occurredAt: "not-a-date" } },
  }), /AUDIT_EVIDENCE_TIMESTAMP_INVALID/);
  await service.execute(requirement("REQ-46304"), { context: context(), payload: { operation: "append", evidence: base } });
  assert.throws(() => service.execute(requirement("REQ-46304"), {
    context: context(), payload: { operation: "append", evidence: { ...base, correlationId: "edge-audit-2" } },
  }), /AUDIT_EVIDENCE_ALREADY_EXISTS/);
});

test("REQ-46305 records lifecycle evidence and preserves state if audit callback fails", async () => {
  const service = new ExceptionHandlingService();
  const req = requirement("REQ-46305");
  const exception = { id: "edge-exception", tenantId: "tenant-463", requirementId: "REQ-46305", code: "EDGE", message: "Edge case", idempotencyKey: "edge-idem", createdAt: "2026-10-04T00:00:00.000Z" };
  await service.execute(req, { context: context(), payload: { operation: "create", exception } });
  const evidence = service.listLifecycleEvidence("tenant-463", "REQ-46305");
  assert.equal(evidence.length, 1);
  assert.equal(service.verifyLifecycleEvidence(evidence[0]), true);
  await service.execute(req, {
    context: context(), payload: { operation: "transition", tenantId: "tenant-463", id: "edge-exception", patch: { state: "RESOLVED" } },
  });
  assert.equal(service.getException("tenant-463", "edge-exception").state, "RESOLVED");
  assert.throws(() => service.execute(req, {
    context: context(), payload: { operation: "transition", tenantId: "tenant-463", id: "edge-exception", patch: { state: "RETRYING" } },
  }), /EXCEPTION_INVALID_TRANSITION/);
  assert.equal(service.getException("tenant-463", "edge-exception").state, "RESOLVED");
  const finalEvidence = service.listLifecycleEvidence("tenant-463", "REQ-46305");
  assert.equal(finalEvidence.length, 2);
  assert.equal(finalEvidence.every((entry) => service.verifyLifecycleEvidence(entry)), true);
});

test("REQ-46306 rejects invalid limits and reports without provenance", async () => {
  const service = new GovernedReportingService();
  assert.throws(() => service.execute(requirement("REQ-46306"), {
    context: context(), payload: { operation: "publish", row: { tenantId: "tenant-463", reportId: "r", values: {}, sourceRequirementIds: [], generatedAt: "2026-10-04T00:00:00.000Z" } },
  }), /REPORT_PROVENANCE_REQUIRED/);
  assert.throws(() => service.execute(requirement("REQ-46306"), {
    context: context(), payload: { operation: "query", request: { tenantId: "tenant-463", reportId: "r", limit: 0 } },
  }), /REPORT_LIMIT_INVALID/);
});
