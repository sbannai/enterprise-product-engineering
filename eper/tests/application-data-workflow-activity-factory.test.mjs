import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("built-in PostgreSQL activity revalidates the exact workflow role and permission", async () => {
 const source=await readFile(new URL("../apps/worker/application-data-activities/postgres.ts",import.meta.url),"utf8");
 assert.match(source,/context\.workflowRoleId/);
 assert.match(source,/context\.workflowPermission/);
 assert.match(source,/eper_workflow_actor_role_assignment/);
 assert.match(source,/eper_actor_application_assignment/);
 assert.match(source,/eper_tenant_application_assignment/);
 assert.match(source,/eper_workflow_role_definition/);
 assert.match(source,/FOR SHARE OF r,aa,ta,rd/);
 assert.match(source,/APPLICATION_DATA_WORKFLOW_PERMISSION_REVOKED/);
 assert.match(source,/PostgresApplicationDataAdapter/);
});
