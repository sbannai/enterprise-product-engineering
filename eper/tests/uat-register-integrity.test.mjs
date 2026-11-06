import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const registerPath = "uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv";

function makeFixture(mutator) {
  const temp = mkdtempSync(join(tmpdir(), "eper-uat-register-"));
  const source = readFileSync(registerPath, "utf8").replace(/^\uFEFF/, "");
  const lines = source.trimEnd().split(/\r?\n/);
  const header = lines[0].split(",");
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const fields = lines[1].split(",");
  mutator(fields, index);
  lines[1] = fields.join(",");
  const fixture = join(temp, "invalid.csv");
  writeFileSync(fixture, lines.join("\n") + "\n");
  return { temp, fixture };
}

function runValidator(fixture) {
  return spawnSync(process.execPath, ["scripts/validate-uat-register.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, EPER_UAT_REGISTER_PATH: fixture }
  });
}

test("228-row business UAT register is structurally valid and does not infer acceptance", () => {
  const result = runValidator(registerPath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.result, "PASS");
  assert.equal(report.requirements, 228);
  assert.equal(report.chapters, 38);
  assert.equal(report.notRun, 228);
  assert.equal(report.businessDecisionsPending, 228);
  assert.equal(report.fabricatedAcceptanceGuard, "ENFORCED");
  assert.match(report.note, /not business UAT evidence or acceptance/);
});

test("validator rejects executed outcomes without execution evidence", () => {
  const { temp, fixture } = makeFixture((fields, index) => {
    fields[index.outcome] = "PASS";
    fields[index.business_decision] = "ACCEPTED";
  });
  try {
    const result = runValidator(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /execution_timestamp/);
    assert.match(result.stderr, /business approver and approval date/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("validator rejects contradictory business decisions", () => {
  const { temp, fixture } = makeFixture((fields, index) => {
    fields[index.outcome] = "FAIL";
    fields[index.business_decision] = "ACCEPTED";
    fields[index.business_approver] = "Business Owner";
    fields[index.approval_date] = "2026-10-02";
    fields[index.execution_timestamp] = "2026-10-02T06:00:00Z";
    fields[index.environment] = "UAT";
    fields[index.build_commit] = "test-build";
    fields[index.session_authorization_reference] = "AUTH-001";
    fields[index.actual_steps] = "Executed test steps";
    fields[index.expected_result] = "Expected result";
    fields[index.actual_result] = "Actual result";
    fields[index.evidence_archive_reference] = "evidence://test";
    if (index.defect_id !== undefined) fields[index.defect_id] = "DEF-001";
  });
  try {
    const result = runValidator(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ACCEPTED decision requires PASS outcome/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
