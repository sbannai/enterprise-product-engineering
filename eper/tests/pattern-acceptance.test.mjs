import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { createCapabilityServices } from "../dist/packages/capabilities/services.js";

const services = createCapabilityServices();
const representative = new Map(
  ["XX01", "XX02", "XX03", "XX04", "XX05", "XX06"].map((pattern) => [
    pattern,
    requirementBindings.find((r) => r.pattern === pattern),
  ]),
);

function operationFor(pattern, requirement) {
  const context = {
    tenantId: "acceptance-wave",
    principalId: "acceptance-runner",
    correlationId: `acceptance-${pattern}`,
  };
  const occurredAt = "2026-10-09T00:00:00.000Z";
  switch (pattern) {
    case "XX01":
      return { context, payload: { operation: "create", record: {
        id: `acceptance-record-${requirement.id}`, version: 1, state: "OPEN",
        data: { requirementId: requirement.id },
      } } };
    case "XX02":
      return { context, payload: { operation: "decide", request: {
        tenantId: context.tenantId, principalId: context.principalId,
        action: "acceptance.check", resource: requirement.id,
      } } };
    case "XX03":
      return { context, payload: { operation: "validate", input: { requirementId: requirement.id } } };
    case "XX04":
      return { context, payload: { operation: "append", evidence: {
        id: `acceptance-audit-${requirement.id}`, tenantId: context.tenantId,
        requirementId: requirement.id, action: "ACCEPTANCE_CHECK",
        principalId: context.principalId, correlationId: context.correlationId,
        occurredAt, payload: { requirementId: requirement.id },
      } } };
    case "XX05":
      return { context, payload: { operation: "create", exception: {
        id: `acceptance-exception-${requirement.id}`, tenantId: context.tenantId,
        requirementId: requirement.id, code: "ACCEPTANCE_CHECK",
        message: "Pattern acceptance technical exercise",
        idempotencyKey: `acceptance-idem-${requirement.id}`, createdAt: occurredAt,
      } } };
    case "XX06":
      return { context, payload: { operation: "publish", row: {
        tenantId: context.tenantId, reportId: `acceptance-report-${requirement.id}`,
        values: { requirementId: requirement.id }, sourceRequirementIds: [requirement.id], generatedAt: occurredAt,
      } } };
    default:
      throw new Error(`UNSUPPORTED_PATTERN:${pattern}`);
  }
}

test("pattern acceptance wave covers all six shared capabilities with real operations", async () => {
  for (const [pattern, requirement] of representative) {
    assert.ok(requirement, pattern);
    const service = services[pattern];
    assert.ok(service, pattern);

    const result = await service.execute(requirement, operationFor(pattern, requirement));

    assert.equal(result.requirementId, requirement.id);
    assert.equal(result.pattern, pattern);
    assert.equal(result.status, "EXECUTED");
    assert.equal(typeof result.data.payload.operation, "string");
    assert.notEqual(result.data.payload.operation, undefined);
  }
});

test("pattern acceptance wave confirms balanced 38-requirement coverage", () => {
  for (const pattern of representative.keys()) {
    assert.equal(
      requirementBindings.filter((r) => r.pattern === pattern).length,
      38,
      pattern,
    );
  }
});

test("pattern acceptance wave preserves chapter distribution", () => {
  for (let chapter = 463; chapter <= 500; chapter += 1) {
    const rows = requirementBindings.filter((r) => r.chapter === chapter);
    assert.equal(rows.length, 6, String(chapter));
  }
});
