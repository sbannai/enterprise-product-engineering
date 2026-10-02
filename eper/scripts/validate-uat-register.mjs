import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv");
const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "").trimEnd();

function parseCsv(source) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) throw new Error("Malformed CSV: unterminated quoted field");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

const [header, ...rows] = parseCsv(text);
const index = Object.fromEntries(header.map((name, i) => [name, i]));
const requiredColumns = [
  "requirement_id", "chapter", "srs_id", "uat_batch", "execution_timestamp",
  "environment", "build_commit", "session_authorization_reference",
  "actual_steps", "expected_result", "actual_result", "outcome",
  "evidence_archive_reference", "business_decision", "business_approver", "approval_date"
];
for (const name of requiredColumns) {
  if (!(name in index)) throw new Error(`Missing required column: ${name}`);
}
if (rows.length !== 228) throw new Error(`Expected 228 requirement rows; found ${rows.length}`);

const errors = [];
const seen = new Set();
const chapterCounts = new Map();
let notRun = 0, pending = 0;
for (const [n, row] of rows.entries()) {
  const line = n + 2;
  if (row.length !== header.length) { errors.push(`line ${line}: expected ${header.length} columns, found ${row.length}`); continue; }
  const get = (name) => (row[index[name]] ?? "").trim();
  const id = get("requirement_id");
  const chapter = Number(get("chapter"));
  const match = /^REQ-(\d{3})(\d{2})$/.exec(id);
  if (!match || Number(match[1]) !== chapter || chapter < 463 || chapter > 500 || Number(match[2]) < 1 || Number(match[2]) > 6) {
    errors.push(`line ${line}: invalid requirement/chapter identity ${id} / ${get("chapter")}`);
  }
  if (seen.has(id)) errors.push(`line ${line}: duplicate requirement ID ${id}`);
  seen.add(id);
  chapterCounts.set(chapter, (chapterCounts.get(chapter) ?? 0) + 1);

  const outcome = get("outcome");
  const decision = get("business_decision");
  if (outcome === "NOT_RUN") {
    notRun += 1;
    for (const fieldName of ["execution_timestamp","environment","build_commit","session_authorization_reference","actual_steps","actual_result","evidence_archive_reference"]) {
      if (get(fieldName)) errors.push(`line ${line}: ${fieldName} must remain blank while outcome is NOT_RUN`);
    }
    if (get("expected_result") === "") errors.push(`line ${line}: expected_result must be populated for planned execution`);
    if (decision !== "PENDING") errors.push(`line ${line}: NOT_RUN row must retain PENDING business_decision`);
  } else if (["PASS","FAIL","BLOCKED","NOT_APPLICABLE"].includes(outcome)) {
    for (const fieldName of ["execution_timestamp","environment","build_commit","session_authorization_reference","actual_steps","expected_result","actual_result","evidence_archive_reference"]) {
      if (!get(fieldName)) errors.push(`line ${line}: executed outcome ${outcome} requires ${fieldName}`);
    }
    if (outcome === "PASS" && decision === "ACCEPTED" && (!get("business_approver") || !get("approval_date"))) {
      errors.push(`line ${line}: ACCEPTED decision requires business approver and approval date`);
    }
  } else errors.push(`line ${line}: unsupported outcome ${outcome}`);
  if (decision === "PENDING") pending += 1;
  else if (!["ACCEPTED","REJECTED","WAIVED"].includes(decision)) errors.push(`line ${line}: unsupported business decision ${decision}`);
}
for (let chapter = 463; chapter <= 500; chapter += 1) {
  if (chapterCounts.get(chapter) !== 6) errors.push(`chapter ${chapter}: expected 6 requirements, found ${chapterCounts.get(chapter) ?? 0}`);
}
if (errors.length) {
  console.error("UAT register integrity: FAIL");
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    result: "PASS",
    register: "EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv",
    requirements: rows.length,
    chapters: chapterCounts.size,
    requirementsPerChapter: 6,
    notRun,
    businessDecisionsPending: pending,
    fabricatedAcceptanceGuard: "ENFORCED",
    note: "Structural integrity only; this is not business UAT evidence or acceptance."
  }, null, 2));
}
