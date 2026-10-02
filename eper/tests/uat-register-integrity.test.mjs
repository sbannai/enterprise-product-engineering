import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("228-row business UAT register is structurally valid and does not infer acceptance", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-uat-register.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
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
  const temp = mkdtempSync(join(tmpdir(), "eper-uat-register-"));
  try {
    const source = readFileSync("uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv", "utf8");
    const lines = source.trimEnd().split(/\\r?\\n/);
    const fields = lines[1].split(",");
    fields[16] = "PASS";
    fields[20] = "ACCEPTED";
    lines[1] = fields.join(",");
    const fixture = join(temp, "invalid.csv");
    writeFileSync(fixture, lines.join("\\n") + "\\n");
    const result = spawnSync(process.execPath, ["scripts/validate-uat-register.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EPER_UAT_REGISTER_PATH: fixture }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /execution_timestamp/);
    assert.match(result.stderr, /business approver and approval date/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("validator rejects contradictory business decisions", () => {
  const temp = mkdtempSync(join(tmpdir(), "eper-uat-register-"));
  try {
    const source = readFileSync("uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv", "utf8");
    const lines = source.trimEnd().split(/\\r?\\n/);
    const fields = lines[1].split(",");
    fields[16] = "FAIL";
    fields[20] = "ACCEPTED";
    fields[21] = "Business Owner";
    fields[22] = "2026-10-02";
    fields[9] = "2026-10-02T06:00:00Z";
    fields[10] = "UAT";
    fields[11] = "test-build";
    fields[12] = "AUTH-001";
    fields[13] = "Executed test steps";
    fields[14] = "Expected result";
    fields[15] = "Actual result";
    fields[17] = "evidence://test";
    fields[18] = "DEF-001";
    lines[1] = fields.join(",");
    const fixture = join(temp, "invalid.csv");
    writeFileSync(fixture, lines.join("\\n") + "\\n");
    const result = spawnSync(process.execPath, ["scripts/validate-uat-register.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EPER_UAT_REGISTER_PATH: fixture }
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ACCEPTED decision requires PASS outcome/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
