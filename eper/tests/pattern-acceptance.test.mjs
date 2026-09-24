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

test("pattern acceptance wave covers all six shared capabilities", async () => {
  for (const [pattern, requirement] of representative) {
    assert.ok(requirement, pattern);
    const service = services[pattern];
    assert.ok(service, pattern);

    const result = await service.execute(requirement, {
      context: {
        tenantId: "acceptance-wave",
        principalId: "acceptance-runner",
        correlationId: `acceptance-${pattern}`,
      },
      payload: {
        acceptanceWave: pattern,
        requirementId: requirement.id,
      },
    });

    assert.equal(result.requirementId, requirement.id);
    assert.equal(result.pattern, pattern);
    assert.equal(result.status, "EXECUTED");
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
