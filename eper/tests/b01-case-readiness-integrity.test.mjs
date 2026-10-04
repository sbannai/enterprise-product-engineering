import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readCsv(relativePath) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8").replace(/^\uFEFF/, "").trimEnd();
  const lines = text.split(/\r?\n/);
  const parseLine = (line) => {
    const fields = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        fields.push(field);
        field = "";
      } else {
        field += char;
      }
    }
    fields.push(field);
    assert.equal(quoted, false, `unterminated CSV quote in ${relativePath}`);
    return fields;
  };
  const header = parseLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseLine(line);
    assert.equal(values.length, header.length, `CSV column count mismatch in ${relativePath}`);
    return Object.fromEntries(header.map((name, i) => [name, values[i]]));
  });
}

const cases = readCsv("../uat/B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv");
const gaps = readCsv("../uat/B01_REQUIREMENT_CASE_GAP_REGISTER.csv");
const execution = readCsv("../uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv");

function expectedSrs(chapter, sequence) {
  return `SRS-FR-${2323 + (chapter - 463) * 6 + (sequence - 1)}`;
}

test("B01 draft cases cover each of the 48 scoped requirements exactly once", () => {
  assert.equal(cases.length, 48);
  const ids = new Set();
  for (const row of cases) {
    assert.match(row.requirement_id, /^REQ-46[3-9]\d{2}$|^REQ-470\d{2}$/);
    assert.ok(!ids.has(row.requirement_id), `duplicate ${row.requirement_id}`);
    ids.add(row.requirement_id);
    const chapter = Number(row.chapter);
    const sequence = Number(row.requirement_id.slice(-2));
    assert.ok(chapter >= 463 && chapter <= 470, row.requirement_id);
    assert.ok(sequence >= 1 && sequence <= 6, row.requirement_id);
    assert.equal(row.srs_id, expectedSrs(chapter, sequence), row.requirement_id);
    assert.equal(row.case_status, "DRAFT_TEMPLATE_NOT_APPROVED", row.requirement_id);
    assert.equal(row.baseline_approval_status, "REQUIREMENTS_BASELINE_APPROVAL_PENDING", row.requirement_id);
    assert.equal(row.business_review_status, "REVIEW_REQUIRED", row.requirement_id);
    assert.equal(row.execution_status, "NOT_RUN", row.requirement_id);
  }
  assert.equal(ids.size, 48);
});

test("every B01 case gap remains explicit until requirement-level criteria are approved", () => {
  assert.equal(gaps.length, 48);
  const caseIds = new Set(cases.map((row) => row.requirement_id));
  const gapIds = new Set();
  for (const row of gaps) {
    assert.ok(caseIds.has(row.requirement_id), row.requirement_id);
    assert.ok(!gapIds.has(row.requirement_id), `duplicate gap ${row.requirement_id}`);
    gapIds.add(row.requirement_id);
    assert.equal(row.scenario_reference_status, "MISSING", row.requirement_id);
    assert.equal(row.expected_result_status, "MISSING", row.requirement_id);
    assert.equal(row.approved_acceptance_source_status, "NOT_VERIFIED", row.requirement_id);
    assert.equal(row.gap_status, "BLOCKED", row.requirement_id);
    assert.equal(row.status, "OPEN", row.requirement_id);
  }
  assert.deepEqual([...gapIds].sort(), [...caseIds].sort());
});

test("the 228-row execution capture does not promote draft B01 cases into execution", () => {
  assert.equal(execution.length, 228);
  const b01 = execution.filter((row) => Number(row.chapter) >= 463 && Number(row.chapter) <= 470);
  assert.equal(b01.length, 48);
  for (const row of b01) {
    assert.equal(row.outcome, "NOT_RUN", row.requirement_id);
    assert.equal(row.business_decision, "PENDING", row.requirement_id);
    assert.equal(row.execution_timestamp, "", row.requirement_id);
    assert.equal(row.actual_result, "", row.requirement_id);
    assert.equal(row.evidence_archive_reference, "", row.requirement_id);
  }
});

const decisions = readCsv("../uat/B01_OWNER_DECISION_LOG.csv");

test("owner decision log covers 48 requirement decisions and 13 environment gates without fabricated approval", () => {
  assert.equal(decisions.length, 61);
  const requirementDecisions = decisions.filter((row) => row.requirement_id);
  const environmentDecisions = decisions.filter((row) => !row.requirement_id);
  assert.equal(requirementDecisions.length, 48);
  assert.equal(environmentDecisions.length, 13);

  const expectedRequirementIds = new Set(cases.map((row) => row.requirement_id));
  const decisionRequirementIds = new Set();
  for (const row of requirementDecisions) {
    assert.ok(expectedRequirementIds.has(row.requirement_id), row.decision_id);
    assert.ok(!decisionRequirementIds.has(row.requirement_id), `duplicate decision for ${row.requirement_id}`);
    decisionRequirementIds.add(row.requirement_id);
    assert.equal(row.decision, "PENDING", row.decision_id);
    assert.equal(row.status, "OPEN", row.decision_id);
    assert.equal(row.evidence_reference, "", row.decision_id);
    assert.equal(row.approver_name, "", row.decision_id);
    assert.equal(row.decision_date_utc, "", row.decision_id);
  }
  assert.deepEqual([...decisionRequirementIds].sort(), [...expectedRequirementIds].sort());

  for (const row of environmentDecisions) {
    assert.match(row.decision_id, /^B01-DEC-(0[1-9]|1[0-3])$/);
    assert.equal(row.decision, "PENDING", row.decision_id);
    assert.equal(row.status, "OPEN", row.decision_id);
    assert.equal(row.evidence_reference, "", row.decision_id);
    assert.equal(row.approver_name, "", row.decision_id);
    assert.equal(row.decision_date_utc, "", row.decision_id);
  }
});
