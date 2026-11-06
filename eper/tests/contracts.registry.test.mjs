import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings, requirementCount } from "../dist/packages/requirements/registry.js";
import {
  getCapabilityContracts,
  getContractCapabilityIds,
  validateRequirementContracts,
} from "../dist/contracts/index.js";

test("six contract descriptor sets cover all six shared capabilities", () => {
  assert.equal(getContractCapabilityIds().length, 6);
  for (const capability of getContractCapabilityIds()) {
    const contracts = getCapabilityContracts(capability);
    assert.equal(contracts.data.kind, "DATA");
    assert.equal(contracts.api.kind, "API");
    assert.equal(contracts.event.kind, "EVENT");
    for (const descriptor of [contracts.data, contracts.api, contracts.event]) {
      assert.equal(descriptor.capability, capability);
      assert.equal(descriptor.version, "v1");
      assert.ok(descriptor.id.length > 0);
    }
  }
});

test("all 228 registry bindings resolve to a matching descriptor triplet", () => {
  assert.equal(requirementCount, 228);
  assert.equal(requirementBindings.length, 228);
  for (const binding of requirementBindings) {
    const contracts = validateRequirementContracts(binding);
    assert.equal(contracts.data.id, binding.dataContract, binding.id);
    assert.equal(contracts.api.id, binding.apiContract, binding.id);
    assert.equal(contracts.event.id, binding.eventContract, binding.id);
  }
});

test("unknown capability fails closed", () => {
  assert.throws(
    () => getCapabilityContracts("unregistered-capability"),
    /CONTRACTS_NOT_DEFINED:unregistered-capability/,
  );
});

test("requirement DATA/API/EVENT mismatches are rejected", () => {
  const binding = requirementBindings.find((item) => item.id === "REQ-46301");
  assert.ok(binding);
  assert.throws(
    () => validateRequirementContracts({ ...binding, dataContract: "DATA:unapproved" }),
    /DATA_CONTRACT_MISMATCH:REQ-46301/,
  );
  assert.throws(
    () => validateRequirementContracts({ ...binding, apiContract: "API:unapproved" }),
    /API_CONTRACT_MISMATCH:REQ-46301/,
  );
  assert.throws(
    () => validateRequirementContracts({ ...binding, eventContract: "EVENT:unapproved" }),
    /EVENT_CONTRACT_MISMATCH:REQ-46301/,
  );
});
