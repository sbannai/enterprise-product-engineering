import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync("../.github/workflows/eper-uat-target-preflight.yml", "utf8");

test("live UAT target preflight is manually dispatched inside the protected environment", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*eper-business-uat/);
  assert.match(workflow, /UAT_ALLOWED_HOST/);
});

test("preflight fails closed on non-HTTPS or host allowlist mismatch", () => {
  assert.match(workflow, /url\.protocol !== "https:"/);
  assert.match(workflow, /url\.host\.toLowerCase\(\) !== allowedHost\.trim\(\)\.toLowerCase\(\)/);
  assert.match(workflow, /url\.username \|\| url\.password \|\| url\.search \|\| url\.hash/);
  assert.match(workflow, /path\.includes\("\.\."\)/);
});

test("preflight requires exact build identity and bounded HTTPS request", () => {
  assert.match(workflow, /--max-time 15/);
  assert.match(workflow, /--connect-timeout 5/);
  assert.match(workflow, /--proto '=https'/);
  assert.match(workflow, /observedBuild === process\.env\.EXPECTED_BUILD/);
  assert.doesNotMatch(workflow, /curl[^\n]*--location/);
});

test("preflight evidence explicitly excludes business UAT and acceptance", () => {
  assert.match(workflow, /NOT BUSINESS UAT \/ NOT ACCEPTANCE/);
  assert.match(workflow, /businessUatExecuted: false/);
  assert.match(workflow, /businessAcceptance: "NOT_EXECUTED"/);
  assert.match(workflow, /formalSignoff: "NOT_EXECUTED"/);
  assert.match(workflow, /responseBodyCaptured: false/);
});
