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


test("G9 separates automated pilot evidence from approved acceptance execution", () => {
  assert.equal(register.schemaVersion, "1.2.0");
  assert.equal(register.requirements.length, 228);
  for (const row of register.requirements) {
    assert.equal(
      row.automatedPilotTestEvidence?.classification,
      "AUTOMATED_PILOT_TEST_PASS_NOT_BUSINESS_UAT",
      row.id + " pilot classification",
    );
    assert.equal(row.automatedPilotTestEvidence?.status, "PASS", row.id + " pilot status");
    assert.match(row.automatedPilotTestEvidence?.runUrl ?? "", /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/);
    assert.match(row.automatedPilotTestEvidence?.testedCommit ?? "", /^[0-9a-f]{40}$/);
    assert.match(row.automatedPilotTestEvidence?.artifactSha256 ?? "", /^sha256:[0-9a-f]{64}$/);
    assert.equal(row.automatedPilotTestEvidence?.requirementIdInTestTitle, true, row.id);
    assert.equal(row.automatedPilotTestEvidence?.requirementIdInTestSource, true, row.id);
    assert.equal(row.automatedPilotTestEvidence?.chapterSuiteStatus, "PASS", row.id);
    assert.ok(row.automatedPilotTestEvidence?.testFile, row.id + " test file");
    assert.equal(row.approvedAcceptanceTestExecution?.status, "NOT_EXECUTED", row.id);
    for (const field of [
      "approvedCaseId",
      "approvedCaseVersion",
      "executionSessionId",
      "environment",
      "actualResult",
      "testerIdentity",
      "businessDecisionAuthority",
      "evidenceReference",
    ]) {
      assert.equal(row.approvedAcceptanceTestExecution?.[field], null, row.id + " " + field);
    }
    assert.equal(row.evidence.requirementTest, false, row.id + " legacy acceptance-test flag");
    assert.equal(row.evidence.testExecution, false, row.id + " legacy acceptance-execution flag");
    assert.equal(row.evidence.uat, false, row.id + " UAT flag");
    assert.equal(row.evidence.finalAcceptance, false, row.id + " final acceptance flag");
    assert.equal(row.evidence.traceabilityFreeze, false, row.id + " freeze flag");
  }
});
