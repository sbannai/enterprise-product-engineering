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

test("exception create and transitions emit tenant-scoped lifecycle audit evidence", async () => {
  const service = new ExceptionHandlingService();
  const requirement = requirementBindings.find(r => r.pattern === "XX05");
  const context = { tenantId: "tenant-a", principalId: "operator-1", correlationId: "corr-lifecycle-1" };
  await service.execute(requirement, {
    context,
    payload: {
      operation: "create",
      exception: {
        id: "exception-a",
        tenantId: "tenant-a",
        requirementId: requirement.id,
        code: "PROCESS_FAILURE",
        message: "Processing failed",
        idempotencyKey: "idem-lifecycle-1",
        createdAt: "2026-10-03T05:00:00.000Z",
      },
    },
  });
  await service.execute(requirement, {
    context,
    payload: { operation: "transition", tenantId: "tenant-a", id: "exception-a", patch: { state: "RETRYING" } },
  });
  await service.execute(requirement, {
    context,
    payload: { operation: "transition", tenantId: "tenant-a", id: "exception-a", patch: { state: "RESOLVED" } },
  });

  await service.execute(requirement, {
    context,
    payload: {
      operation: "create",
      exception: {
        id: "exception-a",
        tenantId: "tenant-a",
        requirementId: requirement.id,
        code: "PROCESS_FAILURE",
        message: "Processing failed",
        idempotencyKey: "idem-lifecycle-1",
        createdAt: "2026-10-03T05:00:00.000Z",
      },
    },
  });

  const events = service.listLifecycleEvidence("tenant-a", requirement.id);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(e => e.action), ["EXCEPTION_CREATED", "EXCEPTION_TRANSITIONED", "EXCEPTION_TRANSITIONED"]);
  assert.deepEqual(events.map(e => e.payload.state), ["OPEN", "RETRYING", "RESOLVED"]);
  assert.equal(events.every(e => e.principalId === "operator-1" && e.correlationId === "corr-lifecycle-1"), true);
  assert.equal(service.listLifecycleEvidence("tenant-b", requirement.id).length, 0);
  assert.equal(events.every(e => service.verifyLifecycleEvidence(e)), true);
  assert.equal(service.verifyLifecycleEvidence({ ...events[0], action: "TAMPERED" }), false);
});
