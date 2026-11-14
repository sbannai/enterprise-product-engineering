import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CI provisions capability persistence before workflow migrations that grant executor access", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  const capability = workflow.indexOf("Apply capability persistence migrations to ephemeral CI database");
  const workflowMigration = workflow.indexOf("Apply workflow execution, publication and role migrations to ephemeral CI database");
  assert.notEqual(capability, -1);
  assert.notEqual(workflowMigration, -1);
  assert.ok(capability < workflowMigration);
});
