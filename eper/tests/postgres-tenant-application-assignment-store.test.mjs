import test from "node:test";
import assert from "node:assert/strict";
import { PostgresTenantApplicationAssignmentStore } from "../dist/packages/identity/postgres-tenant-application-assignment-store.js";

test("tenant application assignment reads are explicitly tenant-scoped", async () => {
  const calls = [];
  const rows = [
    { tenant_id: "tenant-a", application_id: "app-a", assignment_status: "active", version: 2,
      assigned_at: "2026-10-29T00:00:00.000Z", assigned_by: "admin-a", revoked_at: null,
      revoked_by: null, updated_at: "2026-10-29T00:00:00.000Z", updated_by: "admin-a" },
    { tenant_id: "tenant-a", application_id: "app-b", assignment_status: "revoked", version: 3,
      assigned_at: "2026-10-28T00:00:00.000Z", assigned_by: "admin-a", revoked_at: "2026-10-29T00:00:00.000Z",
      revoked_by: "admin-a", updated_at: "2026-10-29T00:00:00.000Z", updated_by: "admin-a" },
  ];
  const pool = { async connect() { return {
    async query(sql, values=[]) {
      calls.push({ sql, values });
      if (sql.includes("SELECT application_id FROM eper_tenant_application_assignment")) {
        return { rows: rows.filter(row => row.tenant_id === values[0] && row.assignment_status === "active").map(row => ({ application_id: row.application_id })) };
      }
      if (sql.includes("SELECT * FROM eper_tenant_application_assignment")) {
        return { rows: rows.filter(row => row.tenant_id === values[0]) };
      }
      throw new Error("unexpected SQL: " + sql);
    },
    release() {},
  }; } };
  const store = new PostgresTenantApplicationAssignmentStore(pool);
  assert.deepEqual(await store.listActive("tenant-a"), ["app-a"]);
  const history = await store.listAssignments("tenant-a");
  assert.deepEqual(history.map(row => [row.applicationId, row.status, row.version]), [["app-a", "active", 2], ["app-b", "revoked", 3]]);
  assert.ok(calls.every(call => call.values[0] === "tenant-a"));
  assert.ok(calls.every(call => call.sql.includes("tenant_id = $1")));
});
