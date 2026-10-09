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

const contextFor = (requirement) => ({
  tenantId: "test-tenant",
  principalId: "test-user",
  correlationId: `corr:${requirement.id}`,
});

function operationFor(requirement) {
  const context = contextFor(requirement);
  const occurredAt = "2026-10-09T00:00:00.000Z";
  switch (requirement.pattern) {
    case "XX01":
      return { context, payload: { operation: "create", record: {
        id: `record:${requirement.id}`, version: 1, state: "OPEN", data: { requirementId: requirement.id },
      } } };
    case "XX02":
      return { context, payload: { operation: "decide", request: {
        tenantId: context.tenantId, principalId: context.principalId, action: "read", resource: requirement.id,
      } } };
    case "XX03":
      return { context, payload: { operation: "validate", input: { requirementId: requirement.id } } };
    case "XX04":
      return { context, payload: { operation: "append", evidence: {
        id: `audit:${requirement.id}`, tenantId: context.tenantId, requirementId: requirement.id,
        action: "CAPABILITY_EXECUTED", principalId: context.principalId, correlationId: context.correlationId,
        occurredAt, payload: { requirementId: requirement.id },
      } } };
    case "XX05":
      return { context, payload: { operation: "create", exception: {
        id: `exception:${requirement.id}`, tenantId: context.tenantId, requirementId: requirement.id,
        code: "TEST_EXECUTION", message: `Capability exercise for ${requirement.id}`,
        idempotencyKey: `idem:${requirement.id}`, createdAt: occurredAt,
      } } };
    case "XX06":
      return { context, payload: { operation: "publish", row: {
        tenantId: context.tenantId, reportId: `report:${requirement.id}`,
        values: { requirementId: requirement.id }, sourceRequirementIds: [requirement.id], generatedAt: occurredAt,
      } } };
    default:
      throw new Error(`UNSUPPORTED_TEST_PATTERN:${requirement.pattern}`);
  }
}

test("six concrete capability services are instantiated", () => {
  const services = createCapabilityServices();
  assert.ok(services.XX01 instanceof AuthoritativeRecordService);
  assert.ok(services.XX02 instanceof AuthorizationService);
  assert.ok(services.XX03 instanceof BusinessValidationService);
  assert.ok(services.XX04 instanceof AuditEvidenceService);
  assert.ok(services.XX05 instanceof ExceptionHandlingService);
  assert.ok(services.XX06 instanceof GovernedReportingService);
});

test("all 228 requirements perform a real operation through the six concrete services", async () => {
  const services = createCapabilityServices();
  const seen = new Set();
  for (const requirement of requirementBindings) {
    const result = await executeIntegratedRequirement(requirement, operationFor(requirement), services);
    assert.equal(result.requirementId, requirement.id);
    assert.equal(result.pattern, requirement.pattern);
    assert.equal(result.status, "EXECUTED");
    const operationResult = result.data.payload;
    switch (requirement.pattern) {
      case "XX01":
        assert.equal(operationResult.operation, "create");
        assert.equal(operationResult.record.id, `record:${requirement.id}`);
        break;
      case "XX02":
        assert.equal(operationResult.operation, "decide");
        assert.equal(operationResult.decision.effect, "DENY");
        break;
      case "XX03":
        assert.equal(operationResult.operation, "validate");
        assert.equal(operationResult.validation.valid, true);
        break;
      case "XX04":
        assert.equal(operationResult.operation, "append");
        assert.match(operationResult.evidence.integrityHash, /^[a-f0-9]{64}$/);
        break;
      case "XX05":
        assert.equal(operationResult.operation, "create");
        assert.equal(operationResult.exception.state, "OPEN");
        break;
      case "XX06":
        assert.equal(operationResult.operation, "publish");
        assert.equal(operationResult.published, true);
        break;
    }
    seen.add(result.pattern);
  }
  assert.deepEqual([...seen].sort(), ["XX01", "XX02", "XX03", "XX04", "XX05", "XX06"]);
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

test("services reject generic payload passthrough instead of reporting a false execution", () => {
  const services = createCapabilityServices();
  for (const requirement of requirementBindings.slice(0, 6)) {
    assert.throws(
      () => services[requirement.pattern].execute(requirement, {
        context: contextFor(requirement),
        payload: { test: true },
      }),
      /CAPABILITY_OPERATION_REQUIRED/,
    );
  }
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
