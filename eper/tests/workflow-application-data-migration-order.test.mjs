import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workflow migrations apply the application-data schema before worker privilege grants", async () => {
  const script = await readFile(new URL("../scripts/migrate-workflows.mjs", import.meta.url), "utf8");
  const capabilities = script.indexOf('packages", "capabilities", "migrations');\n  const applicationData = script.indexOf('packages", "application-data", "migrations');
  const workflows = script.indexOf('packages", "workflows", "migrations');
  assert.notEqual(capabilities, -1, "capability audit and outbox schema migration directory must be included");\n  assert.notEqual(applicationData, -1, "application-data schema migration directory must be included");
  assert.notEqual(workflows, -1, "workflow migration directory must be included");
  assert.ok(capabilities < applicationData, "capability audit and outbox schema must be installed first");\n  assert.ok(applicationData < workflows, "application-data schema must be installed before workflow grants");
  assert.match(script, /eper_capability_schema_migrations/);\n  assert.match(script, /eper_application_data_schema_migrations/);
  assert.match(script, /eper_workflow_schema_migrations/);
});
