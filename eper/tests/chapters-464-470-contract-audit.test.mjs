import assert from "node:assert/strict";
import test from "node:test";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { validateRequirementContracts } from "../dist/contracts/index.js";
import {
  AuthoritativeRecordService,
  AuthorizationService,
  BusinessValidationService,
  AuditEvidenceService,
  ExceptionHandlingService,
  GovernedReportingService,
} from "../dist/packages/capabilities/services.js";

const services = {
  XX01: new AuthoritativeRecordService(),
  XX02: new AuthorizationService(),
  XX03: new BusinessValidationService(),
  XX04: new AuditEvidenceService(),
  XX05: new ExceptionHandlingService(),
  XX06: new GovernedReportingService(),
};
const ctx = { tenantId: "contract-audit", principalId: "contract-audit-actor", correlationId: "chapter-sweep" };

test("Chapters 464–470: all 42 requirement bindings retain chapter, SRS sequence, capability and valid contract IDs", () => {
  const rows = requirementBindings.filter((r) => r.chapter >= 464 && r.chapter <= 470);
  assert.equal(rows.length, 42);
  assert.equal(new Set(rows.map((r) => r.id)).size, 42);
  assert.equal(new Set(rows.map((r) => r.srs)).size, 42);
  for (const r of rows) {
    assert.equal(r.id, `REQ-${r.chapter}${String(r.sequence).padStart(2, "0")}`);
    assert.equal(r.srs, `SRS-FR-${2323 + (r.chapter - 463) * 6 + (r.sequence - 1)}`);
    assert.ok(services[r.pattern], `No service for ${r.id} pattern ${r.pattern}`);
    assert.doesNotThrow(() => validateRequirementContracts(r), `Invalid contracts for ${r.id}`);
  }
});

test("Chapters 464–470: record capability rejects tenant mismatch for every chapter binding", async () => {
  for (const chapter of [464, 465, 466, 467, 468, 469, 470]) {
    const binding = requirementBindings.find((r) => r.chapter === chapter && r.sequence === 1);
    assert.ok(binding);
    const service = new AuthoritativeRecordService();
    assert.throws(() => service.execute(binding, {
      context: ctx,
      payload: { operation: "create", record: { id: `record-${chapter}`, tenantId: "other-tenant", version: 1, state: "OPEN", data: {} } },
    }), /TENANT_CONTEXT_MISMATCH/, `record tenant boundary failed for ${binding.id}`);
  }
});

test("Chapters 464–470: authorization principal mismatch is rejected for every chapter binding", () => {
  const service = new AuthorizationService();
  for (const chapter of [464, 465, 466, 467, 468, 469, 470]) {
    const binding = requirementBindings.find((r) => r.chapter === chapter && r.sequence === 2);
    assert.ok(binding);
    assert.throws(() => service.execute(binding, {
      context: ctx,
      payload: { operation: "decide", request: { tenantId: ctx.tenantId, principalId: "different-actor", action: "read", resource: "record" } },
    }), /AUTHORIZATION_PRINCIPAL_MISMATCH/, `principal boundary failed for ${binding.id}`);
  }
});

test("Chapters 464–470: invalid capability operations fail closed", () => {
  for (const chapter of [464, 465, 466, 467, 468, 469, 470]) {
    const bySequence = (sequence) => requirementBindings.find((r) => r.chapter === chapter && r.sequence === sequence);
    assert.throws(() => services.XX01.execute(bySequence(1), { context: ctx, payload: { operation: "not-an-operation" } }), /RECORD_OPERATION_UNSUPPORTED/);
    assert.throws(() => services.XX04.execute(bySequence(4), { context: ctx, payload: { operation: "not-an-operation" } }), /AUDIT_OPERATION_UNSUPPORTED/);
    assert.throws(() => services.XX05.execute(bySequence(5), { context: ctx, payload: { operation: "not-an-operation" } }), /EXCEPTION_OPERATION_UNSUPPORTED/);
    assert.throws(() => services.XX06.execute(bySequence(6), { context: ctx, payload: { operation: "not-an-operation" } }), /REPORT_OPERATION_UNSUPPORTED/);
  }
});

test("Chapters 464–470: capability service rejects a requirement-pattern mismatch", () => {
  for (const chapter of [464, 465, 466, 467, 468, 469, 470]) {
    const recordRequirement = requirementBindings.find((r) => r.chapter === chapter && r.sequence === 1);
    assert.throws(() => services.XX02.execute(recordRequirement, { context: ctx, payload: { operation: "decide", request: { tenantId: ctx.tenantId, principalId: ctx.principalId, action: "read", resource: "record" } } }), /CAPABILITY_PATTERN_MISMATCH/);
  }
});
