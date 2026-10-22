#!/usr/bin/env node
/**
 * Fail-closed authorization guard for B01 case execution.
 * Run from repository root: node eper/uat/scripts/validate-b01-case-authorization.mjs
 * Passing in HOLD mode confirms only that no unapproved case is authorized.
 * It does not grant approval, close gates, or execute UAT.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const checklistPath = "eper/uat/B01_48_CASE_APPROVAL_CHECKLIST.csv";
const assessmentPath = "eper/uat/B01_E1_E13_EVIDENCE_ASSESSMENT.csv";

function parseCsv(source, label) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(value => value.length > 0)) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  assert.equal(quoted, false, `${label}: unterminated quoted field`);
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some(value => value.length > 0)) rows.push(row);
  }
  assert.ok(rows.length >= 2, `${label}: expected header and data rows`);
  const header = rows[0];
  assert.equal(new Set(header).size, header.length, `${label}: duplicate columns`);
  for (const [i, record] of rows.slice(1).entries()) {
    assert.equal(record.length, header.length, `${label}: row ${i + 2} column count mismatch`);
  }
  return { header, records: rows.slice(1).map(values => Object.fromEntries(header.map((key, i) => [key, values[i]]))) };
}

const checklist = parseCsv(readFileSync(resolve(checklistPath), "utf8"), checklistPath);
const gates = parseCsv(readFileSync(resolve(assessmentPath), "utf8"), assessmentPath);
assert.equal(checklist.records.length, 48, "B01 checklist must contain exactly 48 cases");
assert.equal(gates.records.length, 13, "B01 assessment must contain exactly E1-E13");
assert.deepEqual(gates.records.map(row => row.gate_id), Array.from({ length: 13 }, (_, i) => `E${i + 1}`),
  "B01 gates must be ordered E1-E13");

const caseIds = checklist.records.map(row => row.case_id);
const reqIds = checklist.records.map(row => row.requirement_id);
assert.equal(new Set(caseIds).size, 48, "B01 case IDs must be unique");
assert.equal(new Set(reqIds).size, 48, "B01 requirement IDs must be unique");
for (let chapter = 463; chapter <= 470; chapter += 1) {
  const cases = checklist.records.filter(row => Number(row.chapter) === chapter);
  assert.equal(cases.length, 6, `Chapter ${chapter} must contain exactly six cases`);
  assert.deepEqual(cases.map(row => row.requirement_id).sort(),
    Array.from({ length: 6 }, (_, i) => `REQ-${chapter}${String(i + 1).padStart(2, "0")}`).sort(),
    `Chapter ${chapter} requirement IDs must cover REQ-${chapter}01 through REQ-${chapter}06`);
}

const requiredApprovalFields = [
  "requirement_specific_acceptance_source",
  "actor_role_tenant_confirmed",
  "preconditions_and_test_data_approved",
  "positive_steps_reviewed",
  "negative_path_reviewed",
  "measurable_expected_result_approved",
  "evidence_capture_plan_approved",
];
for (const name of [...requiredApprovalFields, "reviewer_identity", "review_decision", "decision_date", "approval_reference", "execution_authorized"]) {
  assert.ok(checklist.header.includes(name), `B01 checklist missing required field: ${name}`);
}
for (const name of ["gate_id", "closure_status"]) {
  assert.ok(gates.header.includes(name), `B01 assessment missing required field: ${name}`);
}

const allGatesClosed = gates.records.every(row => row.closure_status === "CLOSED");
const approvedValues = new Set(["APPROVED", "YES", "CONFIRMED", "REVIEWED", "PASS"]);
let authorized = 0;
let incompleteReviews = 0;
const violations = [];

for (const row of checklist.records) {
  const isAuthorized = row.execution_authorized === "YES";
  if (isAuthorized) authorized += 1;
  const fieldsApproved = requiredApprovalFields.every(name => approvedValues.has((row[name] ?? "").trim().toUpperCase()));
  const metadataComplete = ["reviewer_identity", "decision_date", "approval_reference"].every(name => (row[name] ?? "").trim().length > 0);
  const decisionApproved = (row.review_decision ?? "").trim().toUpperCase() === "APPROVED";
  const caseApproved = fieldsApproved && metadataComplete && decisionApproved;
  if (!caseApproved) incompleteReviews += 1;
  if (isAuthorized && (!caseApproved || !allGatesClosed)) {
    violations.push(`${row.case_id}: execution_authorized=YES without complete case approval and all E1-E13 gates CLOSED`);
  }
  if (!isAuthorized && row.execution_authorized !== "NO") {
    violations.push(`${row.case_id}: execution_authorized must be exactly YES or NO (found "${row.execution_authorized}")`);
  }
}

assert.deepEqual(violations, [], violations.join("\n"));
if (!allGatesClosed) {
  assert.equal(authorized, 0, "No B01 case may be authorized while any E1-E13 gate remains open");
}

console.log("B01 case authorization guard: PASS");
console.log(`Cases: ${checklist.records.length}; unique case IDs: 48; unique requirement IDs: 48`);
console.log(`Case reviews incomplete: ${incompleteReviews}; execution-authorized cases: ${authorized}`);
console.log(`E1-E13 gates closed: ${gates.records.filter(row => row.closure_status === "CLOSED").length}/13`);
console.log(allGatesClosed
  ? "Guard evaluated case approval completeness; no UAT was executed."
  : "SAFE HOLD confirmed: gates are not all CLOSED and no case is authorized. No approval or UAT execution is implied.");
