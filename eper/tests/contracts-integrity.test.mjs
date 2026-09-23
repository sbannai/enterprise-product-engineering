import assert from "node:assert/strict";
import test from "node:test";
import { requirementBindings, requirementCount } from "../dist/packages/requirements/registry.js";
import { getCapabilityContracts, validateRequirementContracts } from "../dist/contracts/index.js";

test("all 228 requirements resolve to governed DATA/API/EVENT contracts", () => {
  assert.equal(requirementCount, 228);
  assert.equal(requirementBindings.length, 228);

  const capabilities = new Set<string>();
  for (const requirement of requirementBindings) {
    const contracts = validateRequirementContracts(requirement);
    assert.equal(contracts.data.id, requirement.dataContract);
    assert.equal(contracts.api.id, requirement.apiContract);
    assert.equal(contracts.event.id, requirement.eventContract);
    capabilities.add(requirement.capability);
  }

  assert.deepEqual([...capabilities].sort(), [
    "audit-evidence",
    "authoritative-records",
    "authorization",
    "business-validation",
    "exception-handling",
    "governed-reporting",
  ]);
});

test("unknown capability contracts are rejected", () => {
  assert.throws(
    () => getCapabilityContracts("unsupported-capability"),
    /CONTRACTS_NOT_DEFINED:unsupported-capability/,
  );
});

test("registry contract mismatch is rejected", () => {
  const requirement = requirementBindings[0];
  assert.throws(
    () => validateRequirementContracts({ ...requirement, apiContract: "API:invalid" }),
    /API_CONTRACT_MISMATCH:REQ-46301/,
  );
});
