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

test("workflow migrations preserve the ordered worker-access, claim-generation, permission-catalogue and application-data sequence", async () => {
  const names = (await readdir(new URL("../packages/workflows/migrations/", import.meta.url)))
    .filter((name) => /^[0-9]{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const workerAccess = names.indexOf("015_workflow_outbox_worker_access.sql");
  const claimGeneration = names.indexOf("016_workflow_outbox_claim_generation.sql");
  const permissionCatalogue = names.indexOf("017_workflow_role_permission_catalogue.sql");
  const applicationDataIntents = names.indexOf("018_application_data_activity_intents.sql");
  const applicationDataWaitState = names.indexOf("019_workflow_application_data_wait_state.sql");
  const singlePendingIntent = names.indexOf("020_application_data_single_pending_intent.sql");
  const reconciliationLease = names.indexOf("021_application_data_reconciliation_lease.sql");
  const reconciliationWorkerAccess = names.indexOf("022_application_data_reconciliation_worker_access.sql");
  const applicationDataExecutorAccess = names.indexOf("023_application_data_executor_worker_access.sql");
  const applicationDataIntentAuthorization = names.indexOf("024_application_data_intent_authorization.sql");
  const applicationDataExecutorRowLocks = names.indexOf("025_application_data_executor_authorization_row_locks.sql");
  const applicationDataReconciliationDeadLetter = names.indexOf("026_application_data_reconciliation_dead_letter.sql");
  assert.notEqual(workerAccess, -1, "worker-access migration must exist");
  assert.notEqual(claimGeneration, -1, "claim-generation migration must exist");
  assert.notEqual(permissionCatalogue, -1, "permission-catalogue migration must exist");
  assert.notEqual(applicationDataIntents, -1, "application-data activity-intent migration must exist");
  assert.notEqual(applicationDataWaitState, -1, "application-data workflow wait-state migration must exist");
  assert.notEqual(singlePendingIntent, -1, "single pending application-data intent migration must exist");
  assert.notEqual(reconciliationLease, -1, "application-data reconciliation lease migration must exist");
  assert.notEqual(reconciliationWorkerAccess, -1, "reconciliation worker access migration must exist");
  assert.notEqual(applicationDataExecutorAccess, -1, "application-data executor worker access migration must exist");
  assert.notEqual(applicationDataIntentAuthorization, -1, "application-data intent authorization migration must exist");
  assert.notEqual(applicationDataExecutorRowLocks, -1, "application-data executor row-lock privilege migration must exist");
  assert.notEqual(applicationDataReconciliationDeadLetter, -1, "bounded reconciliation dead-letter migration must exist");
  assert.equal(names[workerAccess - 1], "014_workflow_definition_drafts.sql");
  assert.equal(names[workerAccess + 1], "016_workflow_outbox_claim_generation.sql");
  assert.equal(names[claimGeneration + 1], "017_workflow_role_permission_catalogue.sql");
  assert.equal(names[permissionCatalogue + 1], "018_application_data_activity_intents.sql");
  assert.equal(names[applicationDataIntents + 1], "019_workflow_application_data_wait_state.sql");
  assert.equal(names[applicationDataWaitState + 1], "020_application_data_single_pending_intent.sql");
  assert.equal(names[singlePendingIntent + 1], "021_application_data_reconciliation_lease.sql");
  assert.equal(names[reconciliationLease + 1], "022_application_data_reconciliation_worker_access.sql");
  assert.equal(names[reconciliationWorkerAccess + 1], "023_application_data_executor_worker_access.sql");
  assert.equal(names[applicationDataExecutorAccess + 1], "024_application_data_intent_authorization.sql");
  assert.equal(names[applicationDataIntentAuthorization + 1], "025_application_data_executor_authorization_row_locks.sql");
  assert.equal(names[applicationDataExecutorRowLocks + 1], "026_application_data_reconciliation_dead_letter.sql");
  assert.equal(names.at(-1), "026_application_data_reconciliation_dead_letter.sql");
});
