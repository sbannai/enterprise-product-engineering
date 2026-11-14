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

test("MongoDB workflow grant resolver scopes active grants and binds lookup to the data transaction", async () => {
 const { createMongoWorkflowAuthorizer, ensureMongoWorkflowAuthorizationIndexes, createMongoApplicationDataAdapter } =
  await import("../dist/packages/application-data/mongo-workflow-authorization.js");
 let lookup;
 const session = { async withTransaction(work) { return work(); }, async endSession() {} };
 const database = { collection(name) {
  assert.equal(name, "eper_workflow_authorization_grants");
  return {
   async updateOne(filter, update, options) { lookup = { filter, update, options }; return { matchedCount: 1 }; },
   async createIndex(keys, options) { lookup.index = { keys, options }; return "grant-scope"; },
  };
 }};
 const authorize = createMongoWorkflowAuthorizer(database);
 await authorize(session, {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  correlationId: "corr-a", requirementId: "REQ-001", workflowRoleId: "operator",
  workflowPermission: "workflow:act",
 });
 assert.deepEqual(lookup.filter, {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  roleId: "operator", status: "active",
  permissions: { $in: ["workflow:act", "workflow:admin"] },
 });
 assert.equal(lookup.options.session, session);
 assert.deepEqual(lookup.update, { $inc: { authorizationFence: 1 } });
 await ensureMongoWorkflowAuthorizationIndexes(database);
 assert.equal(lookup.index.options.name, "eper_workflow_authorization_active_grant_scope");
 const indexedCollections = [];
 const factoryDatabase = { collection(name) {
  indexedCollections.push(name);
  return { async createIndex() { return name + "-index"; }, async updateOne() { return { matchedCount: 0 }; } };
 }};
 const adapter = await createMongoApplicationDataAdapter(factoryDatabase);
 assert.ok(adapter);
 assert.deepEqual(indexedCollections, ["eper_application_data_models", "eper_workflow_authorization_grants"]);
});

test("MongoDB workflow grant resolver rejects missing and revoked grants", async () => {
 const { createMongoWorkflowAuthorizer } = await import("../dist/packages/application-data/mongo-workflow-authorization.js");
 const session = { async withTransaction(work) { return work(); }, async endSession() {} };
 const authorize = createMongoWorkflowAuthorizer({ collection() { return { async updateOne() { return { matchedCount: 0 }; } }; } });
 await assert.rejects(() => authorize(session, {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  correlationId: "corr-a", requirementId: "REQ-001",
 }), /APPLICATION_DATA_WORKFLOW_AUTHORIZATION_CONTEXT_MISSING/);
 await assert.rejects(() => authorize(session, {
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  correlationId: "corr-a", requirementId: "REQ-001", workflowRoleId: "operator",
  workflowPermission: "workflow:approve",
 }), /APPLICATION_DATA_WORKFLOW_PERMISSION_REVOKED/);
});

test("MongoDB adapter revalidates the concrete grant before a scoped record read in one session", async () => {
 const { MongoApplicationDataAdapter } = await import("../dist/packages/application-data/mongo-adapter.js");
 const session = { async withTransaction(work) { return work(); }, async endSession() {} };
 let grantSession, recordSession;
 const record = {
  _id: '["tenant-a","app-a","Order","order-1"]',
  tenantId: "tenant-a", applicationId: "app-a", entityType: "Order", id: "order-1",
  schemaVersion: 1, version: 1, state: "ACTIVE", data: { total: 9 },
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
 };
 const database = {
  client: { startSession() { return session; } },
  collection(name) {
   if (name === "eper_workflow_authorization_grants") return {
    async updateOne(_filter, _update, options) { grantSession = options.session; return { matchedCount: 1 }; },
   };
   if (name === "eper_application_data_records") return {
    async findOne(_filter, options) { recordSession = options.session; return record; },
   };
   throw new Error("unexpected collection " + name);
  },
 };
 const adapter = new MongoApplicationDataAdapter(database, async (usedSession) => {
  grantSession = usedSession;
 });
 const found = await adapter.get({
  tenantId: "tenant-a", applicationId: "app-a", actorId: "actor-a",
  correlationId: "corr-a", requirementId: "REQ-001", workflowRoleId: "operator",
  workflowPermission: "workflow:act",
 }, "Order", "order-1");
 assert.equal(found.id, "order-1");
 assert.equal(grantSession, session);
 assert.equal(recordSession, session);
});
