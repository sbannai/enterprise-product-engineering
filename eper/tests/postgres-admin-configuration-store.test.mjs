import test from "node:test";
import assert from "node:assert/strict";
import { PostgresAdminConfigurationStore, AdminConfigurationConflictError } from "../dist/packages/workflows/postgres-admin-configuration-store.js";

function poolFactory({ currentVersion = null, failAudit = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT version FROM eper_admin_configuration")) {
        return { rows: currentVersion === null ? [] : [{ version: currentVersion }], rowCount: currentVersion === null ? 0 : 1 };
      }
      if (sql.includes("INSERT INTO eper_admin_configuration")) {
        return { rows: [{
          tenant_id: values[0], resource_type: values[1], config: JSON.parse(values[2]),
          version: values[3], updated_at: "2026-10-25T12:00:00.000Z", updated_by: values[4],
        }], rowCount: 1 };
      }
      if (sql.includes("SELECT last_event_hash")) return { rows: [{ last_event_hash: null }], rowCount: 1 };
      if (failAudit && sql.includes("INSERT INTO eper_audit_events")) throw new Error("audit unavailable");
      return { rows: [], rowCount: 1 };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}
const input = {
  tenantId: "tenant-a", actorId: "admin-1", resourceType: "workflows",
  config: [], expectedVersion: 0, correlationId: "corr-1", environment: "uat",
};

test("admin config write is versioned and audited in the same transaction", async () => {
  const { pool, calls } = poolFactory();
  const saved = await new PostgresAdminConfigurationStore(pool).replace(input);
  assert.equal(saved.tenantId, "tenant-a");
  assert.equal(saved.version, 1);
  assert.equal(saved.updatedBy, "admin-1");
  assert.ok(calls.some((c) => c.sql === "BEGIN"));
  assert.ok(calls.some((c) => c.sql.includes("pg_advisory_xact_lock")));
  assert.ok(calls.some((c) => c.sql.includes("INSERT INTO eper_admin_configuration")));
  assert.ok(calls.some((c) => c.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((c) => c.sql === "COMMIT"));
  assert.equal(calls.at(-1).sql, "RELEASE");
});

test("stale admin config version is rejected without writing", async () => {
  const { pool, calls } = poolFactory({ currentVersion: 2 });
  await assert.rejects(() => new PostgresAdminConfigurationStore(pool).replace({ ...input, expectedVersion: 1 }),
    (error) => error instanceof AdminConfigurationConflictError && error.currentVersion === 2);
  assert.ok(!calls.some((c) => c.sql.includes("INSERT INTO eper_admin_configuration")));
  assert.ok(!calls.some((c) => c.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((c) => c.sql === "ROLLBACK"));
});

test("audit failure rolls back the admin config mutation", async () => {
  const { pool, calls } = poolFactory({ failAudit: true });
  await assert.rejects(() => new PostgresAdminConfigurationStore(pool).replace(input), /audit unavailable/);
  assert.ok(calls.some((c) => c.sql.includes("INSERT INTO eper_admin_configuration")));
  assert.ok(calls.some((c) => c.sql.includes("INSERT INTO eper_audit_events")));
  assert.ok(calls.some((c) => c.sql === "ROLLBACK"));
  assert.ok(!calls.some((c) => c.sql === "COMMIT"));
});

test("tenant identity is a required server-side input", async () => {
  const { pool, calls } = poolFactory();
  await assert.rejects(() => new PostgresAdminConfigurationStore(pool).replace({ ...input, tenantId: " " }),
    /ADMIN_CONFIGURATION_TENANTID_INVALID/);
  assert.equal(calls.length, 0);
});
