import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function parseCsv(s) {
  const rows=[]; let row=[], cell="", quoted=false;
  for (let i=0;i<s.length;i++) {
    const c=s[i];
    if (c === '"') {
      if (quoted && s[i+1] === '"') { cell+='"'; i++; }
      else quoted=!quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell=""; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && s[i+1] === '\n') i++;
      row.push(cell);
      if (row.some(v => v !== "")) rows.push(row);
      row=[]; cell="";
    } else cell+=c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function load(path) {
  const rows=parseCsv(fs.readFileSync(path,"utf8").trim());
  return { headers:rows[0], rows:rows.slice(1) };
}

const cases=load("uat/B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv");
const approvals=load("uat/B01_48_CASE_APPROVAL_CHECKLIST.csv");

test("B01 packet contains exactly 48 unique requirements in both registers", () => {
  const ci=cases.headers.indexOf("requirement_id");
  const ai=approvals.headers.indexOf("requirement_id");
  const cr=cases.rows.map(r=>r[ci]);
  const ar=approvals.rows.map(r=>r[ai]);
  assert.equal(cr.length,48);
  assert.equal(new Set(cr).size,48);
  assert.deepEqual(cr,ar);
});

test("B01 cases have required draft execution content", () => {
  for (const field of ["case_id","requirement_id","steps_draft","expected_result_draft","evidence_to_capture"])
    assert.ok(cases.headers.includes(field), field);
  for (const r of cases.rows) {
    for (const field of ["case_id","requirement_id","steps_draft","expected_result_draft","evidence_to_capture"])
      assert.ok(r[cases.headers.indexOf(field)].trim(), field);
    assert.equal(r[cases.headers.indexOf("case_status")],"DRAFT_TEMPLATE_NOT_APPROVED");
  }
});

test("B01 approval checklist is fail-closed", () => {
  const decision=approvals.headers.indexOf("review_decision");
  const auth=approvals.headers.indexOf("execution_authorized");
  for (const r of approvals.rows) {
    assert.equal(r[decision],"PENDING");
    assert.equal(r[auth],"NO");
  }
});
