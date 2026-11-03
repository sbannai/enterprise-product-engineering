import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresModuleEntitlementService } from "../dist/packages/workflows/postgres-module-entitlement-service.js";
import { PostgresTenantApplicationAssignmentStore } from "../dist/packages/identity/postgres-tenant-application-assignment-store.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("live PostgreSQL commercial access guard denies tariff overage, then restores only the retained application after versioned revocation",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 6 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 24);
    const tenantId = "guard-tenant-" + suffix;
    const appA = "guard-app-a-" + suffix;
    const appB = "guard-app-b-" + suffix;
    const actorId = "guard-admin-" + suffix;
    const tariffKey = "guard-tariff-" + suffix;
    const moduleKey = "guard-module-" + suffix;
    const common = { tenantId, changedBy: actorId, environment: "sandbox",
      correlationId: "commercial-guard-" + suffix, serviceVersion: "integration-test" };
    const assignments = new PostgresTenantApplicationAssignmentStore(pool);
    const service = new PostgresModuleEntitlementService(pool, {
      async isAssignedToTenant(tenant, application) {
        const result = await pool.query(
          "SELECT 1 FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id=$2 AND assignment_status='active'",
          [tenant, application]);
        return result.rowCount === 1;
      },
    });
    try {
      await pool.query(`INSERT INTO eper_customer_account
        (tenant_id, customer_status, status_reason, updated_by)
        VALUES ($1, 'active', 'live commercial guard integration fixture', $2)`, [tenantId, actorId]);
      await pool.query(`INSERT INTO eper_commercial_tariff_plan
        (tariff_key, tariff_version, billing_basis, max_applications, amount, currency,
         billing_interval, effective_from, tariff_status, created_by)
        VALUES ($1, 1, 'single_application', 1, 499, 'INR', 'monthly',
                NOW() - INTERVAL '1 hour', 'active', $2)`, [tariffKey, actorId]);
      await pool.query(`INSERT INTO eper_customer_tariff_assignment
        (tenant_id, tariff_key, tariff_version, billing_basis, max_applications,
         accepted_amount, accepted_currency, billing_interval, assignment_status,
         starts_at, updated_by, accepted_by, accepted_at, acceptance_reference)
        VALUES ($1, $2, 1, 'single_application', 1, 499, 'INR', 'monthly',
                'active', NOW() - INTERVAL '1 hour', $3, $3, NOW(), $4)`,
        [tenantId, tariffKey, actorId, "ACCEPT-" + suffix]);
      await pool.query(`INSERT INTO eper_tenant_application_assignment
        (tenant_id, application_id, assignment_status, assigned_by, updated_by)
        VALUES ($1, $2, 'active', $3, $3), ($1, $4, 'active', $3, $3)`,
        [tenantId, appA, actorId, appB]);
      await pool.query(`INSERT INTO eper_module_catalog
        (module_key, display_name, status, updated_by)
        VALUES ($1, 'Commercial Guard Integration Module', 'active', $2)`, [moduleKey, actorId]);
      await pool.query(`INSERT INTO eper_customer_module_entitlement
        (tenant_id, module_key, entitlement_status, starts_at, updated_by)
        VALUES ($1, $2, 'active', NOW() - INTERVAL '1 hour', $3)`, [tenantId, moduleKey, actorId]);
      await pool.query(`INSERT INTO eper_customer_module_permission
        (tenant_id, module_key, role_key, permission_key, allowed, updated_by)
        VALUES ($1, $2, 'customer-admin', 'module.use', TRUE, $3)`, [tenantId, moduleKey, actorId]);

      const context = applicationId => ({ tenantId, applicationId, roleKey: "customer-admin",
        permissionKey: "module.use", now: new Date() });
      assert.deepEqual(await service.checkModule(context(appA), moduleKey), { allowed: false, reason: "tariff_overage" });
      assert.deepEqual(await service.checkModule(context(appB), moduleKey), { allowed: false, reason: "tariff_overage" });

      const revoked = await assignments.revoke({ ...common, applicationId: appB, expectedVersion: 1 });
      assert.equal(revoked.status, "revoked");
      assert.equal(revoked.version, 2);
      assert.deepEqual(await service.checkModule(context(appA), moduleKey), { allowed: true, reason: "allowed" });
      assert.deepEqual(await service.checkModule(context(appB), moduleKey), { allowed: false, reason: "application_not_assigned" });

      const audit = await pool.query(`SELECT action, actor_id FROM eper_audit_events
        WHERE tenant_id=$1 AND application_id=$2 AND action='tenant.application_assignment.revoke'`, [tenantId, appB]);
      assert.equal(audit.rowCount, 1);
      assert.equal(audit.rows[0].actor_id, actorId);
    } finally {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", ["platform"]);
        await client.query("DELETE FROM eper_customer_module_permission WHERE tenant_id=$1", [tenantId]);
        await client.query("DELETE FROM eper_customer_module_entitlement WHERE tenant_id=$1", [tenantId]);
        await client.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1", [tenantId]);
        await client.query("DELETE FROM eper_customer_tariff_assignment WHERE tenant_id=$1", [tenantId]);
        await client.query("DELETE FROM eper_audit_events WHERE tenant_id=$1 AND application_id IN ($2,$3)", [tenantId, appA, appB]);
        await client.query("DELETE FROM eper_module_catalog WHERE module_key=$1", [moduleKey]);
        await client.query("DELETE FROM eper_commercial_tariff_plan WHERE tariff_key=$1", [tariffKey]);
        await client.query("DELETE FROM eper_customer_account WHERE tenant_id=$1", [tenantId]);
        await client.query("COMMIT");
      } catch { await client.query("ROLLBACK").catch(() => undefined); }
      finally { client.release(); await pool.end(); }
    }
  });
