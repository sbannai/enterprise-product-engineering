import test from "node:test";
import assert from "node:assert/strict";
import { PostgresApplicationDataModelAuthoringService } from "../dist/packages/application-data/model-authoring.js";

const context = {
 tenantId: "tenant-a", applicationId: "app-a", actorId: "admin-a", roleId: "application-admin",
 correlationId: "corr-model-01", requirementId: "REQ-463", environment: "sandbox",
};

function fixture({ allowed = true, currentVersion = 1 } = {}) {
 const statements = [];
 const client = {
  async query(sql, values = []) {
   const statement = String(sql).replace(/\s+/g, " ").trim();
   statements.push({ sql: statement, values });
   if (statement.startsWith("SELECT r.role_id FROM eper_workflow_actor_role_assignment")) {
    return { rows: allowed ? [{ role_id: "application-admin" }] : [], rowCount: allowed ? 1 : 0 };
   }
   if (statement.startsWith("SELECT version FROM eper_application_data_models")) {
    return { rows: currentVersion ? [{ version: currentVersion }] : [], rowCount: currentVersion ? 1 : 0 };
   }
   if (statement.includes("SELECT last_event_hash FROM eper_audit_chain_head")) {
    return { rows: [{ last_event_hash: null }], rowCount: 1 };
   }
   if (statement.startsWith("UPDATE eper_application_data_models SET status=")) return { rows: [], rowCount: 1 };
   return { rows: [], rowCount: 1 };
  },
  release() { statements.push({ sql: "RELEASE", values: [] }); },
 };
 return { pool: { async connect() { return client; } }, statements };
}

test("model draft creation requires an active application-scoped workflow admin and audits in the same transaction", async () => {
 const { pool, statements } = fixture();
 const service = new PostgresApplicationDataModelAuthoringService(pool);
 const model = await service.createDraft(context, {
  entityType: "Order",
  expectedVersion: 1,
  fields: [{ id: "total", type: "number", required: true }],
 });
 assert.equal(model.version, 2);
 assert.equal(model.status, "DRAFT");
 const auth = statements.findIndex(item => item.sql.includes("eper_workflow_actor_role_assignment"));
 const insert = statements.findIndex(item => item.sql.startsWith("INSERT INTO eper_application_data_models"));
 const audit = statements.findIndex(item => item.sql.startsWith("INSERT INTO eper_audit_events"));
 const outbox = statements.findIndex(item => item.sql.startsWith("INSERT INTO transactional_outbox"));
 assert.ok(auth > statements.findIndex(item => item.sql === "BEGIN"));
 assert.ok(insert > auth);
 assert.ok(audit > insert);
 assert.ok(outbox > audit);
 assert.equal(statements.at(-2).sql, "COMMIT");
});

test("model draft creation fails closed when the actor has no active model-management grant", async () => {
 const { pool, statements } = fixture({ allowed: false });
 const service = new PostgresApplicationDataModelAuthoringService(pool);
 await assert.rejects(() => service.createDraft(context, {
  entityType: "Order", expectedVersion: 1, fields: [{ id: "total", type: "number" }],
 }), /APPLICATION_DATA_MODEL_MANAGE_FORBIDDEN/);
 assert.equal(statements.some(item => item.sql.startsWith("INSERT INTO eper_application_data_models")), false);
 assert.equal(statements.at(-2).sql, "ROLLBACK");
});

test("model authoring rejects stale schema versions and invalid relationship declarations", async () => {
 const { pool } = fixture({ currentVersion: 3 });
 const service = new PostgresApplicationDataModelAuthoringService(pool);
 await assert.rejects(() => service.createDraft(context, {
  entityType: "Order", expectedVersion: 2, fields: [{ id: "total", type: "number" }],
 }), /APPLICATION_DATA_SCHEMA_VERSION_CONFLICT/);
 await assert.rejects(() => service.createDraft(context, {
  entityType: "Order", expectedVersion: 3,
  fields: [{ id: "customerId", type: "number" }],
  relationships: [{ field: "customerId", targetEntity: "Customer", cardinality: "one" }],
 }), /APPLICATION_DATA_RELATIONSHIP_INVALID/);
});
