import assert from "node:assert/strict";
import test from "node:test";
import { requirementBindings, requirementCount } from "../dist/packages/requirements/registry.js";
import { executeIntegratedRequirement } from "../dist/packages/capability-router.js";

test("all 228 requirements resolve through the integrated capability router", async () => {
  const calls = [];
  const services = Object.fromEntries(["XX01","XX02","XX03","XX04","XX05","XX06"].map(pattern => [
    pattern,
    { execute: async (requirement) => { calls.push(requirement.id); return requirement.id; } }
  ]));
  for (const requirement of requirementBindings) {
    const result = await executeIntegratedRequirement(requirement, {}, services);
    assert.equal(result, requirement.id);
  }
  assert.equal(calls.length, 228);
  assert.equal(requirementCount, 228);
});
