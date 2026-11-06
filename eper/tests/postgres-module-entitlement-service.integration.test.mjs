import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresModuleEntitlementService } from "../dist/packages/workflows/postgres-module-entitlement-service.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("live PostgreSQL module and add-on access enforce accepted customer tariff state and application allowance",
  { skip: !databaseConfigured }, async () => {
    const pool = createPostgresPaymentPool();
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "tariff-access-" + suffix.slice(0, 24);
    const applicationId = "tariff-app-" + suffix.slice(0, 18);
    const secondApplicationId = "tariff-app2-" + suffix.slice(0, 17);
    const tariffKey = "tariff-access-" + suffix.slice(0, 20);
    const moduleKey = "tariff-module-" + suffix.slice(0, 18);
    const addonKey = "tariff-addon-" + suffix.slice(0, 18);
    const priceId = randomUUID();
    const actorId = "tariff-access-integration";
    const service = new PostgresModuleEntitlementService(pool, {
      async isAssignedToTenant(tenant, application) {
        const result = await pool.query(
          "SELECT 1 FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id=$2 AND assignment_status='active'",
          [tenant, application],
        );
        return result.rowCount === 1;
      },
    });
    const context = { tenantId, applicationId, roleKey: "customer-admin", permissionKey: "module.use" };
    try {
      await service.assertReady();
      await pool.query(`
        INSERT INTO eper_customer_account
          (tenant_id, customer_status, status_reason, effective_at, version, updated_at, updated_by)
        VALUES ($1, 'active', 'tariff access integration', NOW(), 1, NOW(), $2)
      `, [tenantId, actorId]);
      await pool.query(`
        INSERT INTO eper_commercial_tariff_plan
          (tariff_key, tariff_version, billing_basis, max_applications, amount, currency,
           billing_interval, effective_from, tariff_status, created_by,
           change_reason, approval_required, approval_state, published_at, published_by)
        VALUES ($1, 1, 'single_application', 1, 10.00, 'INR', 'monthly',
                NOW() - INTERVAL '1 day', 'active', $2, 'tariff access integration',
                FALSE, 'not_required', NOW(), $2)
      `, [tariffKey, actorId]);
      await pool.query(`
        INSERT INTO eper_customer_tariff_assignment
          (tenant_id, tariff_key, tariff_version, billing_basis, max_applications,
           accepted_amount, accepted_currency, billing_interval, assignment_status,
           starts_at, ends_at, version, updated_at, updated_by)
        VALUES ($1, $2, 1, 'single_application', 1, 10.00, 'INR', 'monthly',
                'active', NOW() - INTERVAL '1 day', NULL, 1, NOW(), $3)
      `, [tenantId, tariffKey, actorId]);
      await pool.query(`
        INSERT INTO eper_tenant_application_assignment
          (tenant_id, application_id, assignment_status, assigned_by, updated_by)
        VALUES ($1, $2, 'active', $3, $3)
      `, [tenantId, applicationId, actorId]);
      await pool.query(`
        INSERT INTO eper_module_catalog (module_key, display_name, status, updated_by)
        VALUES ($1, 'Tariff access module', 'active', $3),
               ($2, 'Tariff access add-on', 'active', $3)
      `, [moduleKey, addonKey, actorId]);
      await pool.query(`
        INSERT INTO eper_customer_module_entitlement
          (tenant_id, module_key, entitlement_status, starts_at, updated_at, updated_by)
        VALUES ($1, $2, 'active', NOW() - INTERVAL '1 day', NOW(), $3)
      `, [tenantId, moduleKey, actorId]);
      await pool.query(`
        INSERT INTO eper_customer_module_permission
          (tenant_id, module_key, role_key, permission_key, allowed, updated_by)
        VALUES ($1, $2, 'customer-admin', 'module.use', TRUE, $3),
               ($1, $4, 'customer-admin', 'module.use', TRUE, $3)
      `, [tenantId, moduleKey, actorId, addonKey]);
      await pool.query(`
        INSERT INTO eper_module_price
          (price_id, module_key, price_version, pricing_model, amount, currency,
           billing_interval, effective_from, status, created_by)
        VALUES ($1, $2, 1, 'per_application', 1.00, 'INR', 'monthly',
                NOW() - INTERVAL '1 day', 'active', $3)
      `, [priceId, addonKey, actorId]);
      await pool.query(`
        INSERT INTO eper_application_addon_entitlement
          (tenant_id, application_id, addon_key, entitlement_status, price_id,
           accepted_price_version, agreed_amount, agreed_currency, billing_interval,
           selected_at, effective_from, requested_by, approved_by, updated_by)
        VALUES ($1, $2, $3, 'active', $4, 1, 1.00, 'INR', 'monthly',
                NOW(), NOW() - INTERVAL '1 day', $5, $5, $5)
      `, [tenantId, applicationId, addonKey, priceId, actorId]);

      assert.deepEqual(await service.checkModule(context, moduleKey), { allowed: true, reason: "allowed" });
      assert.deepEqual(await service.checkApplicationAddon(context, addonKey), { allowed: true, reason: "allowed" });

      // The exact purchased allowance is valid. One extra active application
      // causes protected module and add-on access to stop immediately.
      await pool.query(`
        INSERT INTO eper_tenant_application_assignment
          (tenant_id, application_id, assignment_status, assigned_by, updated_by)
        VALUES ($1, $2, 'active', $3, $3)
      `, [tenantId, secondApplicationId, actorId]);
      assert.deepEqual(await service.checkModule(context, moduleKey), {
        allowed: false, reason: "tariff_overage",
      });
      assert.deepEqual(await service.checkApplicationAddon(context, addonKey), {
        allowed: false, reason: "tariff_overage",
      });

      await pool.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id=$2",
        [tenantId, secondApplicationId]);
      await pool.query("UPDATE eper_customer_tariff_assignment SET assignment_status='suspended' WHERE tenant_id=$1", [tenantId]);
      assert.deepEqual(await service.checkModule(context, moduleKey), { allowed: false, reason: "tariff_inactive" });

      await pool.query("UPDATE eper_customer_tariff_assignment SET assignment_status='active', starts_at=NOW() + INTERVAL '1 day' WHERE tenant_id=$1", [tenantId]);
      assert.deepEqual(await service.checkModule(context, moduleKey), { allowed: false, reason: "tariff_not_started" });

      await pool.query("UPDATE eper_customer_tariff_assignment SET starts_at=NOW() - INTERVAL '1 day', ends_at=NOW() - INTERVAL '1 second' WHERE tenant_id=$1", [tenantId]);
      assert.deepEqual(await service.checkModule(context, moduleKey), { allowed: false, reason: "tariff_expired" });
    } finally {
      await pool.query("DELETE FROM eper_application_addon_entitlement WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_module_permission WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_module_entitlement WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_module_price WHERE price_id=$1", [priceId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_module_catalog WHERE module_key = ANY($1::text[])", [[moduleKey, addonKey]]).catch(() => undefined);
      await pool.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_tariff_assignment_history WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_tariff_assignment WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_customer_account WHERE tenant_id=$1", [tenantId]).catch(() => undefined);
      await pool.query("DELETE FROM eper_commercial_tariff_plan WHERE tariff_key=$1", [tariffKey]).catch(() => undefined);
      await pool.end();
    }
  });
