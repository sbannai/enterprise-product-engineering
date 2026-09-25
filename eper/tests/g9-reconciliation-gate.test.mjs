import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requirementBindings } from "../dist/packages/requirements/registry.js";

const register = JSON.parse(
  readFileSync(new URL("../WHOLE_BATCH_ACCEPTANCE_REGISTER.json", import.meta.url), "utf8"),
);

test("G9 baseline contains 228 unique requirements with six per chapter", () => {
  assert.equal(requirementBindings.length, 228);
  assert.equal(register.requirements.length, 228);
  const ids = new Set(requirementBindings.map((r) => r.id));
  assert.equal(ids.size, 228);
  for (let chapter = 463; chapter <= 500; chapter++) {
    const rows = requirementBindings.filter((r) => r.chapter === chapter);
    assert.equal(rows.length, 6, "chapter " + chapter);
    assert.deepEqual(rows.map((r) => r.sequence), [1,2,3,4,5,6]);
  }
});

test("G9 baseline preserves registry identity, routing and contract joins", () => {
  const byId = new Map(requirementBindings.map((r) => [r.id, r]));
  for (const row of register.requirements) {
    const source = byId.get(row.id);
    assert.ok(source, row.id);
    for (const field of ["brd","srs","chapter","sequence","pattern","capability","service","dataContract","apiContract","eventContract"]) {
      assert.equal(row[field], source[field], row.id + " " + field);
    }
  }
});

test("G9 baseline does not promote pending requirements to final closure", () => {
  for (const row of register.requirements) {
    if (row.state !== "ACCEPTANCE_PENDING") continue;
    assert.equal(row.evidence.finalAcceptance, false, row.id);
    assert.equal(row.evidence.traceabilityFreeze, false, row.id);
    assert.equal(row.evidence.production, false, row.id);
  }
  assert.equal(register.requirements.filter((r) => r.state === "ACCEPTED").length, 0);
  assert.equal(register.requirements.filter((r) => r.state === "PRODUCTION_CLOSED").length, 0);
});

test("G9 baseline preserves the authoritative SRS sequence", () => {
  for (let chapter = 463; chapter <= 500; chapter++) {
    const rows = requirementBindings.filter((r) => r.chapter === chapter);
    const first = 2323 + (chapter - 463) * 6;
    assert.deepEqual(
      rows.map((r) => r.srs),
      Array.from({ length: 6 }, (_, i) => "SRS-FR-" + (first + i)),
    );
  }
});
