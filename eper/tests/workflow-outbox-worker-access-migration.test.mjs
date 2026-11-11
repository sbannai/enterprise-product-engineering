import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const migrationUrl = new URL("../packages/workflows/migrations/015_workflow_outbox_worker_access.sql", import.meta.url);

test("workflow outbox worker role is created atomically with least-privilege grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.ok(sql.includes("BEGIN;"), "migration must open a transaction");
  assert.ok(sql.indexOf("BEGIN;") > sql.indexOf("-- Assignment discovery"), "transaction follows migration header comments");
  assert.match(sql, /CREATE ROLE eper_workflow_outbox_worker_access[\s\S]*NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
  assert.match(sql, /GRANT SELECT \(tenant_id, application_id, assignment_status\)[\s\S]*ON eper_tenant_application_assignment/);
  assert.doesNotMatch(sql, /GRANT SELECT ON eper_tenant_application_assignment/);
  assert.match(sql, /GRANT SELECT ON eper_workflow_outbox_events,[\s\S]*eper_workflow_outbox_delivery/);
  assert.match(sql, /GRANT UPDATE \([\s\S]*delivery_status,[\s\S]*attempts,[\s\S]*available_at,[\s\S]*locked_at,[\s\S]*locked_by,[\s\S]*last_error,[\s\S]*delivered_at,[\s\S]*updated_at[\s\S]*\) ON eper_workflow_outbox_delivery/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|DELETE|TRUNCATE|ALL)\b/);
  assert.match(sql, /COMMIT;\s*$/);
});

test("workflow migrations preserve the ordered worker-access, claim-generation and permission-catalogue sequence", async () => {
  const names = (await readdir(new URL("../packages/workflows/migrations/", import.meta.url)))
    .filter((name) => /^[0-9]{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const workerAccess = names.indexOf("015_workflow_outbox_worker_access.sql");
  const claimGeneration = names.indexOf("016_workflow_outbox_claim_generation.sql");
  const permissionCatalogue = names.indexOf("017_workflow_role_permission_catalogue.sql");
  assert.notEqual(workerAccess, -1, "worker-access migration must exist");
  assert.notEqual(claimGeneration, -1, "claim-generation migration must exist");
  assert.notEqual(permissionCatalogue, -1, "permission-catalogue migration must exist");
  assert.equal(names[workerAccess - 1], "014_workflow_definition_drafts.sql");
  assert.equal(names[workerAccess + 1], "016_workflow_outbox_claim_generation.sql");
  assert.equal(names[claimGeneration + 1], "017_workflow_role_permission_catalogue.sql");
  assert.equal(names.at(-1), "017_workflow_role_permission_catalogue.sql");
});
