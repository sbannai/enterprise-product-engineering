import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("built-in PostgreSQL activity requires authorization provenance and enables transaction-bound checks", async () => {
 const source = await readFile(new URL("../apps/worker/application-data-activities/postgres.ts", import.meta.url), "utf8");
 assert.match(source, /context\.workflowRoleId/);
 assert.match(source, /context\.workflowPermission/);
 assert.match(source, /new PostgresApplicationDataAdapter\(input\.pool, true\)/);
 assert.match(source, /APPLICATION_DATA_WORKFLOW_AUTHORIZATION_CONTEXT_MISSING/);
 assert.match(source, /same transaction as every scoped data access/);
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

test("PostgreSQL adapter checks workflow authorization on the same connection before reading a record", async () => {
 const { PostgresApplicationDataAdapter } = await import("../dist/packages/application-data/postgres-adapter.js");
 const statements = [];
 const client = {
  async query(sql, values) {
   statements.push({ sql: String(sql), values });
   if (String(sql).includes("FROM eper_workflow_actor_role_assignment")) {
    return { rows: [{ role_id: "operator" }], rowCount: 1 };
   }
   return { rows: [], rowCount: 0 };
  },
  release() {},
 };
 const pool = { async connect() { return client; } };
 const adapter = new PostgresApplicationDataAdapter(pool, true);
 await adapter.get({
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  correlationId: "corr-a", requirementId: "REQ-001", workflowRoleId: "operator",
  workflowPermission: "workflow:act",
 }, "Order", "order-1");
 const authorizationIndex = statements.findIndex(item => item.sql.includes("FROM eper_workflow_actor_role_assignment"));
 const recordReadIndex = statements.findIndex(item => item.sql.includes("FROM eper_application_data_records"));
 assert.ok(authorizationIndex > statements.findIndex(item => item.sql === "BEGIN"));
 assert.ok(recordReadIndex > authorizationIndex);
 assert.equal(statements.at(-1).sql, "COMMIT");
});

test("MongoDB workflow data access fails closed and revalidates grants in the same transaction", async () => {
 const source = await readFile(new URL("../packages/application-data/mongo-adapter.ts", import.meta.url), "utf8");
 assert.match(source, /export type MongoWorkflowAuthorizer = \(session: MongoSessionLike, context: ApplicationDataContext\) => Promise<void>/);
 assert.match(source, /MONGODB_WORKFLOW_AUTHORIZATION_NOT_CONFIGURED/);
 assert.match(source, /private async authorizedRead/);
 assert.match(source, /await this\.authorizeWorkflow\(session, context\)/);
 assert.match(source, /await this\.authorizeWorkflow\(session, c\)/);
 assert.match(source, /return this\.authorizedRead\(context/);
 assert.match(source, /return this\.authorizedRead\(c/);
 assert.match(source, /this\.transaction\(async session => \{ await this\.authorizeWorkflow\(session,c\); return read\(session\); \}\)/);
});
