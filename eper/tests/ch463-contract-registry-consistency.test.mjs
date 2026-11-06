import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import {
  getCapabilityContracts,
  getContractCapabilityIds,
  validateRequirementContracts,
} from "../dist/contracts/index.js";

const chapter463 = [
  ["REQ-46301", "authoritative-records", "DATA:authoritative-domain", "API:capability-resource", "EVENT:material-lifecycle"],
  ["REQ-46302", "authorization", "DATA:identity-policy", "API:secured-capability", "EVENT:authorization-audit"],
  ["REQ-46303", "business-validation", "DATA:domain-rules", "API:validated-command", "EVENT:validation-outcome"],
  ["REQ-46304", "audit-evidence", "DATA:audit-record", "API:audit-retrieval", "EVENT:audit-material-event"],
  ["REQ-46305", "exception-handling", "DATA:workflow-exception", "API:recovery-command", "EVENT:exception-lifecycle"],
  ["REQ-46306", "governed-reporting", "DATA:derived-reporting", "API:report-query", "EVENT:report-refresh"],
];

test("Chapter 463 requirement bindings match the six capability contract descriptors", () => {
  assert.deepEqual(
    getContractCapabilityIds().slice().sort(),
    ["authoritative-records", "authorization", "business-validation", "audit-evidence", "exception-handling", "governed-reporting"].sort(),
  );

  for (const [requirementId, capability, dataId, apiId, eventId] of chapter463) {
    const requirement = requirementBindings.find((item) => item.id === requirementId);
    assert.ok(requirement, `Missing baseline requirement ${requirementId}`);
    assert.equal(requirement.capability, capability);
    assert.equal(requirement.dataContract, dataId);
    assert.equal(requirement.apiContract, apiId);
    assert.equal(requirement.eventContract, eventId);

    const contracts = validateRequirementContracts(requirement);
    assert.deepEqual(
      [contracts.data.id, contracts.api.id, contracts.event.id],
      [dataId, apiId, eventId],
    );
    for (const [kind, descriptor] of Object.entries(contracts)) {
      assert.equal(descriptor.kind, kind.toUpperCase());
      assert.equal(descriptor.capability, capability);
      assert.equal(descriptor.version, "v1");
      assert.equal(typeof descriptor.id, "string");
    }
  }
});

test("Chapter 463 contract documentation does not mislabel descriptors as complete approved contracts", async () => {
  const source = await readFile(new URL("../contracts/index.ts", import.meta.url), "utf8");
  assert.match(source, /interface ContractDescriptor/);
  assert.match(source, /kind: "DATA" \| "API" \| "EVENT"/);
  assert.doesNotMatch(source, /openapi:|jsonSchema:|payloadSchema:/i);

  const inventory = await readFile(new URL("../CH463_CONTRACT_IMPLEMENTATION_INVENTORY.md", import.meta.url), "utf8");
  assert.match(inventory, /NOT AN APPROVED API\/DATA\/EVENT SPECIFICATION/);
  assert.match(inventory, /identifier consistency validation/i);
  assert.match(inventory, /does not close SRC-003\/G3/i);
});
