import assert from "node:assert/strict";
import test from "node:test";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { executeIntegratedRequirement } from "../dist/packages/capability-router.js";
import {
  createCapabilityServices,
  AuthoritativeRecordService,
  AuthorizationService,
  BusinessValidationService,
  AuditEvidenceService,
  ExceptionHandlingService,
  GovernedReportingService,
} from "../dist/packages/capabilities/index.js";

test("six concrete capability services are instantiated", () => {
  const services = createCapabilityServices();
  assert.ok(services.XX01 instanceof AuthoritativeRecordService);
  assert.ok(services.XX02 instanceof AuthorizationService);
  assert.ok(services.XX03 instanceof BusinessValidationService);
  assert.ok(services.XX04 instanceof AuditEvidenceService);
  assert.ok(services.XX05 instanceof ExceptionHandlingService);
  assert.ok(services.XX06 instanceof GovernedReportingService);
});

test("all 228 requirements execute through the six concrete services", async () => {
  const services = createCapabilityServices();
  const seen = new Set();
  for (const requirement of requirementBindings) {
    const result = await executeIntegratedRequirement(
      requirement,
      { context: { tenantId: "test-tenant", principalId: "test-user", correlationId: requirement.id }, payload: { test: true } },
      services,
    );
    assert.equal(result.requirementId, requirement.id);
    assert.equal(result.pattern, requirement.pattern);
    assert.equal(result.status, "EXECUTED");
    seen.add(result.pattern);
  }
  assert.deepEqual([...seen].sort(), ["XX01","XX02","XX03","XX04","XX05","XX06"]);
});

test("services reject a requirement routed to the wrong capability", () => {
  const service = new AuthorizationService();
  assert.throws(
    () => service.execute(requirementBindings.find(r => r.pattern === "XX01"), {}),
    /CAPABILITY_PATTERN_MISMATCH/,
  );
});

test("services reject incomplete execution context when supplied", () => {
  const service = new AuthorizationService();
  const requirement = requirementBindings.find(r => r.pattern === "XX02");
  assert.throws(
    () => service.execute(requirement, { context: { tenantId: "", principalId: "user", correlationId: "c" } }),
    /CAPABILITY_CONTEXT_REQUIRED/,
  );
});
