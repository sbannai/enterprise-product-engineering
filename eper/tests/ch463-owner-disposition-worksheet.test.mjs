import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worksheetPath = new URL("../uat/B01_CH463_OWNER_DISPOSITION_WORKSHEET.csv", import.meta.url);
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); if (row.some(v => v.length)) rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  assert.equal(quoted, false, "Worksheet CSV contains an unterminated quoted field");
  return rows;
}

test("Chapter 463 owner disposition worksheet has six preserved IDs and no inferred approvals", async () => {
  const rows = parseCsv(await readFile(worksheetPath, "utf8"));
  const [header, ...data] = rows;
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  assert.equal(data.length, 6, "Exactly six Chapter 463 requirements must be present");
  assert.equal(new Set(data.map(r => r[idx.requirement_id])).size, 6, "Requirement IDs must be unique");
  assert.equal(header.length, 22, "Review worksheet schema changes intentionally");
  for (const row of data) assert.equal(row.length, header.length, "Every CSV row must match the header width");
  const expected = [
    ["REQ-46301","SRS-FR-2323","TRC-46301","XX01 authoritative-records"],
    ["REQ-46302","SRS-FR-2324","TRC-46302","XX02 authorization"],
    ["REQ-46303","SRS-FR-2325","TRC-46303","XX03 business-validation"],
    ["REQ-46304","SRS-FR-2326","TRC-46304","XX04 audit-evidence"],
    ["REQ-46305","SRS-FR-2327","TRC-46305","XX05 exception-handling"],
    ["REQ-46306","SRS-FR-2328","TRC-46306","XX06 governed-reporting"],
  ];
  for (let i = 0; i < expected.length; i++) {
    for (let j = 0; j < expected[i].length; j++) {
      const expectedField = ["requirement_id", "srs_id", "trc_id", "candidate_capability"][j];
      assert.equal(data[i][idx[expectedField]], expected[i][j], `Unexpected mapping at worksheet row ${i + 2}, field ${expectedField}`);
    }
  }
  for (const name of [
    "owner_disposition","approved_acceptance_source_locator","approved_hld_locator","approved_lld_locator",
    "data_contract_id_version_or_approved_na","api_contract_id_version_or_approved_na",
    "event_contract_id_version_or_approved_na","acceptance_oracle_reference","approver_name_role",
    "decision_timestamp_timezone","approval_reference","change_record_id"
  ]) assert.ok(idx[name] !== undefined, `Missing evidence capture field: ${name}`);
  for (const row of data) {
    for (const name of [
      "owner_disposition","approved_acceptance_source_locator","approved_hld_locator","approved_lld_locator",
      "data_contract_id_version_or_approved_na","api_contract_id_version_or_approved_na",
      "event_contract_id_version_or_approved_na","acceptance_oracle_reference","approver_name_role",
      "decision_timestamp_timezone","approval_reference","change_record_id"
    ]) assert.equal(row[idx[name]], "", `Approval field ${name} must not be inferred for ${row[idx.requirement_id]}`);
    assert.equal(row[idx.source_status], "In Development");
  }
});
