import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../packages/workflows/migrations/015_workflow_outbox_worker_access.sql", import.meta.url);

test("workflow outbox worker role is created atomically with least-privilege grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /CREATE ROLE eper_workflow_outbox_worker_access[\s\S]*NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
  assert.match(sql, /GRANT SELECT \(tenant_id, application_id, assignment_status\)[\s\S]*ON eper_tenant_application_assignment/);
  assert.doesNotMatch(sql, /GRANT SELECT ON eper_tenant_application_assignment/);
  assert.match(sql, /GRANT SELECT ON eper_workflow_outbox_events,[\s\S]*eper_workflow_outbox_delivery/);
  assert.match(sql, /GRANT UPDATE \([\s\S]*delivery_status,[\s\S]*attempts,[\s\S]*available_at,[\s\S]*locked_at,[\s\S]*locked_by,[\s\S]*last_error,[\s\S]*delivered_at,[\s\S]*updated_at[\s\S]*\) ON eper_workflow_outbox_delivery/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|DELETE|TRUNCATE|ALL)\b/);
  assert.match(sql, /COMMIT;\s*$/);
});

test("worker role migration is ordered immediately after workflow migration 014", async () => {
  const { readdir } = await import("node:fs/promises");
  const names = (await readdir(new URL("../packages/workflows/migrations/", import.meta.url)))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  assert.equal(names.at(-2), "014_workflow_definition_drafts.sql");
  assert.equal(names.at(-1), "015_workflow_outbox_worker_access.sql");
});
