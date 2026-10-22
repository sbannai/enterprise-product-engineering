#!/usr/bin/env node
/**
 * Validate the B01 E1-E13 request, assessment, and reconciliation registers.
 * Run from the repository root: node eper/uat/scripts/validate-b01-registers.mjs
 * This validates register integrity only; it does not approve or close any gate.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const files = {
  request: "eper/uat/B01_E1_E13_EVIDENCE_REQUEST_MATRIX.csv",
  assessment: "eper/uat/B01_E1_E13_EVIDENCE_ASSESSMENT.csv",
  reconciliation: "eper/uat/B01_GATE_RECONCILIATION_2026-10-22.csv",
};

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
  assert.equal(new Set(header).size, header.length, `${label}: duplicate column name`);
  for (const [index, record] of rows.entries()) {
    assert.equal(record.length, header.length, `${label}: row ${index + 1} has ${record.length} columns; expected ${header.length}`);
  }
  return { header, records: rows.slice(1) };
}

function column(table, name, label) {
  const index = table.header.indexOf(name);
  assert.notEqual(index, -1, `${label}: missing required column "${name}"`);
  return record => record[index];
}

const tables = Object.fromEntries(Object.entries(files).map(([name, file]) => [
  name, parseCsv(readFileSync(resolve(process.cwd(), file), "utf8"), file),
]));
const gateIds = Array.from({ length: 13 }, (_, i) => `E${i + 1}`);

for (const [name, table] of Object.entries(tables)) {
  assert.equal(table.records.length, 13, `${name}: expected exactly 13 E1-E13 records`);
  const ids = table.records.map(record => record[0]);
  assert.deepEqual(ids, gateIds, `${name}: gate IDs must be ordered E1-E13`);
  assert.equal(new Set(ids).size, 13, `${name}: duplicate gate ID`);
}

const requestStatus = column(tables.request, "status", "request");
const assessmentStatus = column(tables.assessment, "evidence_status", "assessment");
const assessmentClosure = column(tables.assessment, "closure_status", "assessment");
const reconciliationRequestStatus = column(tables.reconciliation, "request_status", "reconciliation");
const reconciliationAssessmentStatus = column(tables.reconciliation, "assessment_status", "reconciliation");
const reconciliationClosure = column(tables.reconciliation, "closure_status", "reconciliation");

// Use semantic columns to compare the records across all three registers.
const requestHeader = tables.request.header;
const requestStatusIndex = requestHeader.findIndex(name => /status/i.test(name));
assert.notEqual(requestStatusIndex, -1, "request: expected a status column");
assert.ok(tables.request.records.every(record => record[requestStatusIndex] === "PENDING"),
  "request: statuses must remain PENDING until an authorized owner changes them");

const assessmentHeader = tables.assessment.header;
const evidenceStatusIndex = assessmentHeader.indexOf("evidence_status");
const closureStatusIndex = assessmentHeader.indexOf("closure_status");
assert.notEqual(evidenceStatusIndex, -1, "assessment: missing evidence_status");
assert.notEqual(closureStatusIndex, -1, "assessment: missing closure_status");

const counts = tables.assessment.records.reduce((result, record) => {
  const status = record[evidenceStatusIndex];
  result[status] = (result[status] ?? 0) + 1;
  return result;
}, {});
assert.equal(counts.MISSING ?? 0, 9, "assessment: expected 9 MISSING evidence statuses");
assert.equal(counts.INSUFFICIENT ?? 0, 4, "assessment: expected 4 INSUFFICIENT evidence statuses");
assert.equal(counts.CLOSED ?? 0, 0, "assessment: no gate may be marked CLOSED by this integrity check");
assert.ok(tables.assessment.records.every(record => record[closureStatusIndex] === "OPEN"),
  "assessment: closure_status must remain OPEN");

for (let i = 0; i < gateIds.length; i += 1) {
  const assessmentRecord = tables.assessment.records[i];
  const reconciliationRecord = tables.reconciliation.records[i];
  assert.equal(reconciliationRequestStatus(reconciliationRecord), requestStatus(tables.request.records[i]),
    `${gateIds[i]}: request status mismatch`);
  assert.equal(reconciliationAssessmentStatus(reconciliationRecord), assessmentStatus(assessmentRecord),
    `${gateIds[i]}: evidence status mismatch`);
  assert.equal(reconciliationClosure(reconciliationRecord), assessmentClosure(assessmentRecord),
    `${gateIds[i]}: closure status mismatch`);
}

console.log("B01 register integrity: PASS");
console.log("Gate IDs aligned: E1-E13 (13 unique records in each register)");
console.log(`Evidence statuses: ${counts.MISSING ?? 0} MISSING, ${counts.INSUFFICIENT ?? 0} INSUFFICIENT, ${counts.CLOSED ?? 0} CLOSED`);
console.log("Closure statuses: OPEN for all 13 gates");
console.log("Request statuses: PENDING for all 13 gates");
console.log("Scope: structural/cross-register validation only; no gate approval, closure, or UAT execution implied.");
