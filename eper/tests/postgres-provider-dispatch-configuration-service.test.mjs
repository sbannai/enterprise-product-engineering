import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresProviderDispatchConfigurationService } from "../dist/packages/integrations/postgres-provider-dispatch-configuration-service.js";

function createPool() {
  const statements = [];
  let connectionReads = 0;
  let policyReads = 0;
  const pool = {
    async connect() {
      return {
        async query(sql, values = []) {
          statements.push({ sql, values });
          if (sql.includes("FROM eper_provider_connections c")) {
            connectionReads += 1;
            return { rows: [{
              tenant_id: "tenant-a", connection_id: "connection-a", provider_key: "storage-provider",
              display_name: "Storage", auth_mode: "OPAQUE_REFERENCE", connection_status: "ACTIVE",
              environment: "sandbox", safe_metadata: {}, version: 4,
              created_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-01T00:00:00.000Z",
              binding_status: "ACTIVE", allowed_capabilities: ["storage.upload.grant"],
            }], rowCount: 1 };
          }
          if (sql.includes("FROM eper_application_provider_policies")) {
            policyReads += 1;
            return { rows: [], rowCount: 0 };
          }
          if (sql.includes("FROM eper_tenant_provider_defaults")) {
            return { rows: [{ policy: { retryLimit: 2 }, version: 6 }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        },
        release() {},
      };
    },
  };
  return { pool, statements, counts: () => ({ connectionReads, policyReads }) };
}

test("PostgreSQL dispatch resolver uses one scoped pool for binding and effective policy", async () => {
  const { pool, statements, counts } = createPool();
  const service = createPostgresProviderDispatchConfigurationService(pool);
  const result = await service.resolve({
    tenantId: "tenant-a", applicationId: "app-a", capabilityKey: "storage.upload.grant",
  });
  assert.equal(result.connectionId, "connection-a");
  assert.deepEqual(result.policy, { retryLimit: 2 });
  assert.equal(result.policySource, "TENANT_DEFAULT");
  assert.equal(result.tenantDefaultVersion, 6);
  assert.deepEqual(counts(), { connectionReads: 1, policyReads: 1 });
  assert.ok(statements.some(({ sql, values }) =>
    sql.includes("set_config('eper.tenant_id'") && values[0] === "tenant-a"));
  assert.ok(statements.some(({ sql, values }) =>
    sql.includes("set_config('eper.application_id'") && values[0] === "app-a"));
  assert.equal(statements.filter(({ sql }) => sql === "BEGIN").length, 2);
  assert.equal(statements.filter(({ sql }) => sql === "COMMIT").length, 2);
});

test("PostgreSQL dispatch resolver requires an explicit pool", () => {
  assert.throws(() => createPostgresProviderDispatchConfigurationService(null),
    /PROVIDER_DISPATCH_POSTGRES_POOL_REQUIRED/);
});
