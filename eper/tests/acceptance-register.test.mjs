import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requirementBindings } from "../dist/packages/requirements/registry.js";

const register = JSON.parse(
  readFileSync(new URL("../WHOLE_BATCH_ACCEPTANCE_REGISTER.json", import.meta.url), "utf8"),
);

const validStates = new Set([
  "SOURCE_MAPPED",
  "ROUTED",
  "CAPABILITY_VERIFIED",
  "ACCEPTANCE_PENDING",
  "ACCEPTED",
  "PRODUCTION_CLOSED",
]);

test("acceptance register contains exactly the governed 228 requirements", () => {
  assert.equal(register.scope.requirementCount, 228);
  assert.equal(register.requirements.length, 228);
  assert.equal(requirementBindings.length, 228);

  const registryIds = new Set(requirementBindings.map((r) => r.id));
  const registerIds = new Set(register.requirements.map((r) => r.id));

  assert.equal(registerIds.size, 228);
  assert.deepEqual([...registerIds].sort(), [...registryIds].sort());
});

test("every acceptance row preserves registry traceability and controlled state", () => {
  const byId = new Map(requirementBindings.map((r) => [r.id, r]));

  for (const row of register.requirements) {
    const source = byId.get(row.id);
    assert.ok(source, row.id);

    assert.equal(row.brd, source.brd, row.id);
    assert.equal(row.srs, source.srs, row.id);
    assert.equal(row.chapter, source.chapter, row.id);
    assert.equal(row.sequence, source.sequence, row.id);
    assert.equal(row.pattern, source.pattern, row.id);
    assert.equal(row.capability, source.capability, row.id);
    assert.equal(row.service, source.service, row.id);
    assert.equal(row.dataContract, source.dataContract, row.id);
    assert.equal(row.apiContract, source.apiContract, row.id);
    assert.equal(row.eventContract, source.eventContract, row.id);
    assert.ok(validStates.has(row.state), row.id);
  }
});

test("acceptance-pending rows cannot claim final acceptance or production closure", () => {
  for (const row of register.requirements) {
    if (row.state !== "ACCEPTANCE_PENDING") continue;

    assert.equal(row.evidence.acceptanceCriteria, false, row.id);
    assert.equal(row.evidence.requirementTest, false, row.id);
    assert.equal(row.evidence.testExecution, false, row.id);
    assert.equal(row.evidence.finalAcceptance, false, row.id);
    assert.equal(row.evidence.traceabilityFreeze, false, row.id);
  }
});

test("the current register records the governed whole-batch baseline", () => {
  assert.equal(register.requirements.filter((r) => r.state === "ACCEPTANCE_PENDING").length, 228);
  assert.equal(register.requirements.filter((r) => r.state === "ACCEPTED").length, 0);
  assert.equal(register.requirements.filter((r) => r.state === "PRODUCTION_CLOSED").length, 0);
});
