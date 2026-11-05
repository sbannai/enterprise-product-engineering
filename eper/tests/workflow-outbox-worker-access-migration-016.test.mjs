import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workflow outbox worker context discovery is restricted to tenant, application and active status columns", async () => {
  const sql = await readFile(new URL("../packages/workflows/migrations/016_workflow_outbox_assignment_column_grants.sql", import.meta.url), "utf8");
  assert.match(sql, /REVOKE\s+SELECT\s+ON\s+eper_tenant_application_assignment\s+FROM\s+eper_workflow_outbox_worker_access/i);
  assert.match(sql, /GRANT\s+SELECT\s*\(\s*tenant_id\s*,\s*application_id\s*,\s*assignment_status\s*\)\s+ON\s+eper_tenant_application_assignment\s+TO\s+eper_workflow_outbox_worker_access/i);
  assert.doesNotMatch(sql, /GRANT\s+SELECT\s+ON\s+eper_tenant_application_assignment/i);
});
