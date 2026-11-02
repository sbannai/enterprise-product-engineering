import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresCustomerLifecycleStore, CustomerLifecycleVersionConflictError } from "../dist/packages/identity/postgres-customer-lifecycle-store.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL customer lifecycle updates are versioned and audited atomically",
  { skip: !databaseConfigured }, async () => {
    const pool = createPostgresPaymentPool();
    const store = new PostgresCustomerLifecycleStore(pool);
    const tenantId = "lifecycle-" + randomUUID();
    const actorId = "integration-product-admin";
    try {
      await store.assertReady();
      await pool.query(`
        INSERT INTO eper_customer_account
          (tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by)
        VALUES ($1, 'active', 'integration setup', NOW(), 1, NOW(), $2)
      `, [tenantId, actorId]);

      const changed = await store.changeStatus({
        tenantId, status: "suspended", reason: "integration policy breach",
        effectiveAt: new Date().toISOString(), expectedVersion: 1, changedBy: actorId,
        environment: "uat", correlationId: randomUUID(), serviceVersion: "integration-test",
      });
      assert.equal(changed.status, "suspended");
      assert.equal(changed.version, 2);
      assert.equal(changed.updatedBy, actorId);

      const readBack = await store.get(tenantId);
      assert.equal(readBack?.status, "suspended");
      assert.equal(readBack?.version, 2);
      assert.equal(readBack?.reason, "integration policy breach");

      await assert.rejects(() => store.changeStatus({
        tenantId, status: "active", reason: "stale reactivation",
        effectiveAt: new Date().toISOString(), expectedVersion: 1, changedBy: actorId,
        environment: "uat", correlationId: randomUUID(),
      }), error => error instanceof CustomerLifecycleVersionConflictError && error.currentVersion === 2);

      const evidence = await pool.query(`
        SELECT action, outcome, resource_type, resource_id, payload
        FROM eper_audit_events
        WHERE tenant_id = $1 AND action = 'customer.lifecycle.status_change'
      `, [tenantId]);
      assert.equal(evidence.rowCount, 1);
      assert.equal(evidence.rows[0].outcome, "success");
      assert.equal(evidence.rows[0].resource_type, "customer-account");
      assert.equal(evidence.rows[0].resource_id, tenantId);
      assert.equal(evidence.rows[0].payload.status, "suspended");
    } finally {
      await pool.query("DELETE FROM eper_customer_account WHERE tenant_id = $1", [tenantId]).catch(() => undefined);
      await pool.end();
    }
  });
