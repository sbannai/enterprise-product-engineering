import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// This workflow is a required PR check. Keep its pull_request trigger
// unconditional so changes outside its push path filters still receive a
// concrete status instead of leaving branch protection waiting on "Expected".
const workflow = readFileSync(
  "../.github/workflows/eper-provider-operation-postgres-lifecycle.yml",
  "utf8",
);

test("provider PostgreSQL lifecycle required check runs for every pull request", () => {
  assert.match(
    workflow,
    /^on:\s*\n\s+pull_request:\s*\n\s+push:/m,
    "pull_request must remain unconditional and must not inherit push path filters",
  );
  assert.match(workflow, /^\s+workflow_dispatch:\s*$/m);
  assert.match(workflow, /^\s+provider-operation-postgres-lifecycle:\s*$/m);
});
