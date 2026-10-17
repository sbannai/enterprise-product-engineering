import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const csvPath = new URL("../CH463_IMPLEMENTATION_TO_DESIGN_CROSSWALK.csv", import.meta.url);
const expected = [
  ["REQ-46301", "SRS-FR-2323", "XX01", "authoritative-records"],
  ["REQ-46302", "SRS-FR-2324", "XX02", "authorization"],
  ["REQ-46303", "SRS-FR-2325", "XX03", "business-validation"],
  ["REQ-46304", "SRS-FR-2326", "XX04", "audit-evidence"],
  ["REQ-46305", "SRS-FR-2327", "XX05", "exception-handling"],
  ["REQ-46306", "SRS-FR-2328", "XX06", "governed-reporting"],
];

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
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); if (row.some((v) => v.length)) rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  assert.equal(quoted, false, "Crosswalk CSV has an unterminated quoted field");
  return rows;
}

test("Chapter 463 crosswalk preserves all six requirement/SRS/capability bindings", async () => {
  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const [header, ...data] = rows;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  assert.equal(data.length, 6, "Crosswalk must contain exactly six Chapter 463 rows");
  assert.equal(new Set(data.map((row) => row[0])).size, 6, "Requirement IDs must be unique");
  assert.equal(header.length, 32, "Crosswalk column count changed; review schema intentionally");
  for (const requiredColumn of ["requirement_id", "srs_id", "pattern", "capability", "candidate_authority_status", "business_approval_reference", "hld_exact_locator", "traceability_disposition", "promotion_blocker", "candidate_disposition"]) {
    assert.ok(index[requiredColumn] !== undefined, `Missing required crosswalk column: ${requiredColumn}`);
  }
  for (let i = 0; i < expected.length; i++) {
    for (let j = 0; j < expected[i].length; j++) {
      assert.equal(data[i][j], expected[i][j], `Unexpected binding at row ${i + 1}, column ${j + 1}`);
    }
  }
  for (const row of data) {
    assert.match(row[index.candidate_authority_status], /DRAFT|CANDIDATE/i, "Candidate authority must remain visibly unapproved");
    assert.doesNotMatch(row[index.candidate_authority_status], /^APPROVED$/i, "Candidate authority must not be promoted without evidence");
    assert.equal(row[index.traceability_disposition], "IMPLEMENTATION_TRACE_ONLY_NOT_DESIGN_TRACEABILITY");
    assert.equal(row[index.business_approval_reference], "NOT_PROVIDED");
    assert.equal(row[index.hld_exact_locator], "NOT_FOUND_IN_REVIEWED_CONTROLLED_SOURCE");
    assert.match(row[index.promotion_blocker], /approved versioned HLD\/LLD exact locators/i);
    assert.match(row[index.candidate_disposition], /candidate(?:s)? only/i);
  }
});
