import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

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
