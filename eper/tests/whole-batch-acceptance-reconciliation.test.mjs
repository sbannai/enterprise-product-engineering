import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings, requirementCount } from "../dist/packages/requirements/registry.js";
import { createCapabilityServices } from "../dist/packages/capabilities/services.js";

test("whole batch: 228 requirements have complete governed acceptance-routing metadata", () => {
  assert.equal(requirementCount, 228);
  assert.equal(requirementBindings.length, 228);

  const services = createCapabilityServices();
  const patterns = new Set(["XX01", "XX02", "XX03", "XX04", "XX05", "XX06"]);

  for (const requirement of requirementBindings) {
    assert.ok(patterns.has(requirement.pattern), requirement.id);
    assert.ok(requirement.brd.startsWith("BRD-001-REQ-"), requirement.id);
    assert.ok(requirement.srs.startsWith("SRS-FR-"), requirement.id);
    assert.ok(requirement.capability);
    assert.ok(requirement.service);
    assert.ok(requirement.dataContract);
    assert.ok(requirement.apiContract);
    assert.ok(requirement.eventContract);
    assert.ok(services[requirement.pattern], requirement.id);
    assert.equal(typeof services[requirement.pattern].execute, "function", requirement.id);
  }
});

test("whole batch: six capability families each cover exactly 38 requirements", () => {
  const counts = Object.fromEntries(
    ["XX01", "XX02", "XX03", "XX04", "XX05", "XX06"].map((pattern) => [
      pattern,
      requirementBindings.filter((r) => r.pattern === pattern).length,
    ]),
  );

  for (const count of Object.values(counts)) assert.equal(count, 38);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 228);
});

test("whole batch: every chapter 463-500 contains exactly XX01-XX06 once", () => {
  for (let chapter = 463; chapter <= 500; chapter += 1) {
    const rows = requirementBindings.filter((r) => r.chapter === chapter);
    assert.equal(rows.length, 6, String(chapter));

    const patterns = rows.map((r) => r.pattern).sort();
    assert.deepEqual(patterns, ["XX01", "XX02", "XX03", "XX04", "XX05", "XX06"]);
  }
});
