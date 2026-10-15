import test from "node:test";
import assert from "node:assert/strict";
import { getRequirementBinding } from "../dist/packages/requirements/registry.js";
import { AuthoritativeRecordService, AuthorizationService, BusinessValidationService, AuditEvidenceService, ExceptionHandlingService, GovernedReportingService } from "../dist/packages/capabilities/services.js";

const context = { tenantId: "tenant-test", principalId: "principal-test", correlationId: "corr-test" };

test("all six capability services reject missing operation", () => {
  const cases = [
    [new AuthoritativeRecordService(), "REQ-46301"],
    [new AuthorizationService(), "REQ-46302"],
    [new BusinessValidationService(), "REQ-46303"],
    [new AuditEvidenceService(), "REQ-46304"],
    [new ExceptionHandlingService(), "REQ-46305"],
    [new GovernedReportingService(), "REQ-46306"],
  ];
  for (const [service, id] of cases) {
    assert.throws(() => service.execute(getRequirementBinding(id), { context, payload: {} }), /CAPABILITY_OPERATION_REQUIRED/);
  }
});

test("capability pattern mismatch is rejected", () => {
  assert.throws(
    () => new AuthoritativeRecordService().execute(getRequirementBinding("REQ-46302"), { context, payload: { operation: "create" } }),
    /CAPABILITY_PATTERN_MISMATCH/
  );
});

test("authoritative record mutation requires tenant context", () => {
  assert.throws(
    () => new AuthoritativeRecordService().execute(getRequirementBinding("REQ-46301"), { payload: { operation: "create", record: { id: "r1", version: 1, state: "DRAFT", data: {} } } }),
    /CAPABILITY_CONTEXT_REQUIRED/
  );
});

test("authorization request principal must match context principal", () => {
  assert.throws(
    () => new AuthorizationService().execute(getRequirementBinding("REQ-46302"), {
      context,
      payload: { operation: "decide", request: { tenantId: context.tenantId, principalId: "different-principal", action: "read", resource: "record" } }
    }),
    /AUTHORIZATION_PRINCIPAL_MISMATCH/
  );
});

test("validation engine rejects duplicate rule identifiers", () => {
  const service = new BusinessValidationService();
  const rule = { id: "rule-1", evaluate: () => null };
  service.addRule(rule);
  assert.throws(() => service.addRule(rule), /VALIDATION_RULE_DUPLICATE/);
});

test("service execution does not emit business acceptance", async () => {
  const result = await new BusinessValidationService().execute(getRequirementBinding("REQ-46303"), {
    context, payload: { operation: "validate", input: { sample: true } }
  });
  assert.equal(result.requirementId, "REQ-46303");
  assert.equal(result.status, undefined);
  assert.equal(Object.hasOwn(result, "businessAcceptance"), false);
  assert.equal(Object.hasOwn(result, "accepted"), false);
});
