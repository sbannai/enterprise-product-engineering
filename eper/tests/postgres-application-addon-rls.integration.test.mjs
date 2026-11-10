import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("application add-on entitlements enforce tenant and application RLS for a restricted PostgreSQL role",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 3 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 18);
    const tenantA = "addon-rls-a-" + suffix;
    const tenantB = "addon-rls-b-" + suffix;
    const appA = "addon-app-a-" + suffix;
    const appB = "addon-app-b-" + suffix;
    const appC = "addon-app-c-" + suffix;
    const role = "eper_application_addon_access";
    const addon = "peripheral_management";
    try {
      const roleState = await pool.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=$1", [role]);
      assert.equal(roleState.rowCount, 1, "restricted entitlement role must be provisioned by CI");
      assert.deepEqual(roleState.rows[0], { rolsuper: false, rolbypassrls: false });
      const tableState = await pool.query(
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='eper_application_addon_entitlement'::regclass",
      );
      assert.deepEqual(tableState.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
      const grants = await pool.query(`
        SELECT has_table_privilege($1,'eper_application_addon_entitlement','SELECT') AS can_select,
               has_table_privilege($1,'eper_application_addon_entitlement','INSERT') AS can_insert,
               has_table_privilege($1,'eper_application_addon_entitlement','UPDATE') AS can_update,
               has_table_privilege($1,'eper_application_addon_entitlement','DELETE') AS can_delete
      `, [role]);
      assert.deepEqual(grants.rows[0], { can_select: true, can_insert: true, can_update: true, can_delete: false });

      await pool.query(`
        INSERT INTO eper_tenant_application_assignment
          (tenant_id, application_id, assignment_status, assigned_by, updated_by)
        VALUES ($1,$3,'active','rls-test','rls-test'),
               ($1,$4,'active','rls-test','rls-test'),
               ($2,$5,'active','rls-test','rls-test')
        ON CONFLICT (tenant_id, application_id) DO NOTHING
      `, [tenantA, tenantB, appA, appB, appC]);
      await pool.query(`
        INSERT INTO eper_application_addon_entitlement
          (tenant_id, application_id, addon_key, entitlement_status, requested_by, updated_by)
        VALUES ($1,$3,$6,'requested','rls-test','rls-test'),
               ($1,$4,$6,'requested','rls-test','rls-test'),
               ($2,$5,$6,'requested','rls-test','rls-test')
        ON CONFLICT (tenant_id, application_id, addon_key) DO NOTHING
      `, [tenantA, tenantB, appA, appB, appC, addon]);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE " + role);
        await client.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantA]);
        await client.query("SELECT set_config('eper.application_id',$1,true)", [appA]);
        const own = await client.query(
          "SELECT application_id FROM eper_application_addon_entitlement WHERE addon_key=$1", [addon]);
        assert.deepEqual(own.rows.map(row => row.application_id), [appA]);

        await client.query("SELECT set_config('eper.application_id',$1,true)", [appB]);
        const otherApp = await client.query(
          "SELECT application_id FROM eper_application_addon_entitlement WHERE tenant_id=$1 AND addon_key=$2",
          [tenantA, addon]);
        assert.equal(otherApp.rowCount, 1);
        assert.equal(otherApp.rows[0].application_id, appB);

        await client.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantB]);
        await client.query("SELECT set_config('eper.application_id',$1,true)", [appC]);
        const otherTenant = await client.query(
          "SELECT application_id FROM eper_application_addon_entitlement WHERE tenant_id=$1 AND addon_key=$2",
          [tenantA, addon]);
        assert.equal(otherTenant.rowCount, 0);

        await client.query("SELECT set_config('eper.tenant_id',$1,true)", [tenantA]);
        await client.query("SELECT set_config('eper.application_id',$1,true)", [appA]);
        await assert.rejects(client.query(`
          INSERT INTO eper_application_addon_entitlement
            (tenant_id,application_id,addon_key,entitlement_status,updated_by)
          VALUES ($1,$2,$3,'requested','rls-test')
        `, [tenantA, appB, addon]), /row-level security/i);
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await pool.query("DELETE FROM eper_application_addon_entitlement WHERE (tenant_id,application_id) IN (($1,$3),($1,$4),($2,$5))", [tenantA, tenantB, appA, appB, appC]).catch(() => {});
      await pool.query("DELETE FROM eper_tenant_application_assignment WHERE (tenant_id,application_id) IN (($1,$3),($1,$4),($2,$5))", [tenantA, tenantB, appA, appB, appC]).catch(() => {});
      await pool.end();
    }
  });
