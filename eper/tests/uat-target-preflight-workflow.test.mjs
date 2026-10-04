import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Keep this regression suite attached to the current authorized workflow, not
// the deprecated legacy workflow with different implementation and inputs.
const workflow = readFileSync("../.github/workflows/eper-authorized-uat-target-preflight.yml", "utf8");
const script = readFileSync("../eper/uat/scripts/authorized_uat_preflight.py", "utf8");

test("authorized target preflight is manually dispatched inside the protected environment", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*eper-business-uat/);
  assert.match(workflow, /vars\.UAT_ALLOWED_HOST/);
  assert.match(workflow, /expected_build_id/);
  assert.match(workflow, /build_id_json_field/);
});

test("preflight fails closed unless target is HTTPS and exactly allowlisted", () => {
  assert.match(script, /parsed\.scheme==["']https["']/);
  assert.match(script, /parsed\.netloc\.lower\(\)==allow\.lower\(\)/);
  assert.match(script, /not parsed\.username and not parsed\.password/);
  assert.match(script, /not parsed\.query and not parsed\.fragment/);
  assert.match(script, /not valid_base/);
});

test("health path and network request are bounded and redirects are not followed", () => {
  assert.match(script, /health_path\.startswith\(["']\/["']\)/);
  assert.match(script, /not health_path\.startswith\(["']\/\/["']\)/);
  assert.match(script, /MAX_RESPONSE_BYTES = 1024 \* 1024/);
  assert.match(script, /TIMEOUT_SECONDS = 15/);
  assert.match(script, /class NoRedirect\(urllib\.request\.HTTPRedirectHandler\)/);
  assert.match(script, /return None/);
});

test("preflight requires an exact string build ID and does not capture response body", () => {
  assert.match(script, /actual!=expected/);
  assert.match(script, /isinstance\(actual,str\)/);
  assert.doesNotMatch(script, /print\(body/);
  assert.match(script, /Reachability and build identity only; not OAuth, roles, tenant scope, functional UAT, acceptance, release authorization, or certification\./);
});
