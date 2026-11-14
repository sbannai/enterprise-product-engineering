import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("built-in PostgreSQL activity revalidates the exact workflow role and permission", async () => {
 const source=await readFile(new URL("../apps/worker/application-data-activities/postgres.ts",import.meta.url),"utf8");
 assert.match(source,/context\.workflowRoleId/);
 assert.match(source,/context\.workflowPermission/);
 assert.match(source,/new PostgresApplicationDataAdapter\(input\.pool, true\)/);
 assert.match(source,/APPLICATION_DATA_WORKFLOW_AUTHORIZATION_CONTEXT_MISSING/);
 assert.match(source,/PostgresApplicationDataAdapter\(input\.pool, true\)/);
 assert.match(source,/APPLICATION_DATA_WORKFLOW_PERMISSION_REVOKED/);
});

test("PostgreSQL record mutation authorization locks the exact active role grant", async () => {
 const { assertApplicationDataWorkflowAuthorization } = await import("../dist/packages/application-data/postgres-workflow-authorization.js");
 let captured;
 const client = { async query(sql, values) { captured = { sql, values }; return { rows: [{ role_id: "operator" }], rowCount: 1 }; } };
 await assertApplicationDataWorkflowAuthorization(client, {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  correlationId: "corr-a", requirementId: "REQ-001", workflowRoleId: "operator",
  workflowPermission: "workflow:approve",
 });
 assert.match(captured.sql, /FOR SHARE OF r, aa, ta, rd/);
 assert.deepEqual(captured.values, ["tenant-a","app-a","actor-a","operator","workflow:approve"]);
});
test("PostgreSQL record mutation authorization fails closed when the grant was revoked", async () => {
 const { assertApplicationDataWorkflowAuthorization } = await import("../dist/packages/application-data/postgres-workflow-authorization.js");
 const client = { async query() { return { rows: [], rowCount: 0 }; } };
 await assert.rejects(() => assertApplicationDataWorkflowAuthorization(client, {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  correlationId: "corr-a", requirementId: "REQ-001", workflowRoleId: "operator",
  workflowPermission: "workflow:act",
 }), /APPLICATION_DATA_WORKFLOW_PERMISSION_REVOKED/);
});
