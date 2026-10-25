import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresAdminConfigurationStore, AdminConfigurationConflictError } from "../dist/packages/workflows/postgres-admin-configuration-store.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL admin configuration persists by tenant, versions writes, and appends audit evidence",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const store = new PostgresAdminConfigurationStore(pool);
    const tenantId = "integration-" + randomUUID();
    const otherTenant = "integration-" + randomUUID();
    const resourceType = "roles-access";
    try {
      await store.assertReady();
      const saved = await store.replace({
        tenantId, actorId: "integration-admin", resourceType,
        config: [{ id: "finance", name: "Finance", members: ["payer"], permissions: ["workflow:view"] }],
        expectedVersion: 0, correlationId: randomUUID(), environment: "uat",
      });
      assert.equal(saved.version, 1);
      assert.equal(saved.tenantId, tenantId);

      const readBack = await store.get(tenantId, resourceType);
      assert.equal(readBack?.version, 1);
      assert.equal(readBack?.updatedBy, "integration-admin");
      assert.deepEqual(readBack?.config, [{ id: "finance", name: "Finance", members: ["payer"], permissions: ["workflow:view"] }]);
      assert.equal(await store.get(otherTenant, resourceType), null);

      await assert.rejects(() => store.replace({
        tenantId, actorId: "integration-admin", resourceType, config: [],
        expectedVersion: 0, correlationId: randomUUID(), environment: "uat",
      }), (error) => error instanceof AdminConfigurationConflictError && error.currentVersion === 1);

      const client = await pool.connect();
      try {
        const evidence = await client.query(
          "SELECT event_id FROM eper_audit_events WHERE tenant_id = $1 AND action = $2 AND resource_type = $3",
          [tenantId, "admin.configuration.replace", resourceType],
        );
        assert.equal(evidence.rows.length, 1);
      } finally {
        client.release();
      }
    } finally {
      const client = await pool.connect();
      try {
        await client.query("DELETE FROM eper_admin_configuration WHERE tenant_id IN ($1, $2)", [tenantId, otherTenant]);
      } finally {
        client.release();
      }
      await pool.end();
    }
  });
