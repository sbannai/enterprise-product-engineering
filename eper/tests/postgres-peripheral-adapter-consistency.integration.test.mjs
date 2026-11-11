import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("peripheral active configuration is bound to its exact adapter identity under PostgreSQL constraints and RLS",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 2 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const tenant = "peripheral-tenant-" + suffix;
    const otherTenant = "peripheral-other-" + suffix;
    const app = "peripheral-app-" + suffix;
    const otherApp = "peripheral-other-app-" + suffix;
    const validId = randomUUID();
    const mismatchId = randomUUID();
    const draftId = randomUUID();
    const role = "eper_peripheral_test_" + suffix;
    const roleName = '"' + role + '"';
    let client;
    try {
      // Unique role per test run; never alter or remove a shared CI role.
      await pool.query("CREATE ROLE " + roleName + " NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS");
      await pool.query("GRANT USAGE ON SCHEMA public TO " + roleName);
      await pool.query("GRANT SELECT, INSERT, UPDATE ON eper_application_peripheral TO " + roleName);
      await pool.query("GRANT SELECT, INSERT ON eper_application_peripheral_configuration TO " + roleName);

      client = await pool.connect();
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO eper_tenant_application_assignment
          (tenant_id, application_id, assignment_status, assigned_by, updated_by)
        VALUES ($1,$3,'active','peripheral-ci','peripheral-ci'),
               ($1,$4,'active','peripheral-ci','peripheral-ci'),
               ($2,$5,'active','peripheral-ci','peripheral-ci')
        ON CONFLICT (tenant_id, application_id) DO NOTHING
      `, [tenant, otherTenant, app, otherApp, "other-" + otherApp]);

      await client.query("SET LOCAL ROLE " + roleName);
      await client.query("SELECT set_config('eper.tenant_id',$1,true)", [tenant]);
      await client.query("SELECT set_config('eper.application_id',$1,true)", [app]);

      // Matching registration/configuration must satisfy the deferred FK.
      await client.query("SAVEPOINT matching_adapter");
      await client.query(`
        INSERT INTO eper_application_peripheral
          (tenant_id,application_id,peripheral_id,peripheral_kind,display_name,adapter_key,adapter_version,
           lifecycle_status,active_configuration_version,created_by,updated_by)
        VALUES ($1,$2,$3,'qr_reader','Valid QR reader','synthetic.qr','1.0.0','ACTIVE',1,'ci','ci')
      `, [tenant, app, validId]);
      await client.query(`
        INSERT INTO eper_application_peripheral_configuration
          (tenant_id,application_id,peripheral_id,configuration_version,adapter_key,adapter_version,settings,created_by)
        VALUES ($1,$2,$3,1,'synthetic.qr','1.0.0','{}'::jsonb,'ci')
      `, [tenant, app, validId]);
      await client.query("SET CONSTRAINTS eper_application_peripheral_active_configuration_adapter_fk IMMEDIATE");
      await client.query("RELEASE SAVEPOINT matching_adapter");

      // Restore deferred mode so the negative case reaches its explicit assertion.
      await client.query("SET CONSTRAINTS eper_application_peripheral_active_configuration_adapter_fk DEFERRED");
      // Different adapter key/version must be rejected by the exact composite FK.
      await client.query("SAVEPOINT mismatched_adapter");
      await client.query(`
        INSERT INTO eper_application_peripheral
          (tenant_id,application_id,peripheral_id,peripheral_kind,display_name,adapter_key,adapter_version,
           lifecycle_status,active_configuration_version,created_by,updated_by)
        VALUES ($1,$2,$3,'qr_reader','Mismatched QR reader','synthetic.qr','1.0.0','ACTIVE',1,'ci','ci')
      `, [tenant, app, mismatchId]);
      await client.query(`
        INSERT INTO eper_application_peripheral_configuration
          (tenant_id,application_id,peripheral_id,configuration_version,adapter_key,adapter_version,settings,created_by)
        VALUES ($1,$2,$3,1,'synthetic.other','2.0.0','{}'::jsonb,'ci')
      `, [tenant, app, mismatchId]);
      await assert.rejects(
        client.query("SET CONSTRAINTS eper_application_peripheral_active_configuration_adapter_fk IMMEDIATE"),
        error => error && error.code === "23503",
      );
      await client.query("ROLLBACK TO SAVEPOINT mismatched_adapter");
      await client.query("RELEASE SAVEPOINT mismatched_adapter");

      // An unconfigured pre-activation registration is permitted.
      await client.query(`
        INSERT INTO eper_application_peripheral
          (tenant_id,application_id,peripheral_id,peripheral_kind,display_name,lifecycle_status,created_by,updated_by)
        VALUES ($1,$2,$3,'sensor','Unconfigured sensor','REGISTERED','ci','ci')
      `, [tenant, app, draftId]);

      const own = await client.query(
        "SELECT peripheral_id FROM eper_application_peripheral WHERE tenant_id=$1 AND application_id=$2",
        [tenant, app]);
      assert.deepEqual(new Set(own.rows.map(row => row.peripheral_id)), new Set([validId, draftId]));

      await client.query("SELECT set_config('eper.application_id',$1,true)", [otherApp]);
      const hidden = await client.query(
        "SELECT peripheral_id FROM eper_application_peripheral WHERE tenant_id=$1", [tenant]);
      assert.equal(hidden.rowCount, 0);

      await client.query("SELECT set_config('eper.tenant_id',$1,true)", [otherTenant]);
      await client.query("SELECT set_config('eper.application_id',$1,true)", ["other-" + otherApp]);
      const otherTenantHidden = await client.query(
        "SELECT peripheral_id FROM eper_application_peripheral WHERE tenant_id=$1", [tenant]);
      assert.equal(otherTenantHidden.rowCount, 0);

      // All rows, including immutable configuration history, are discarded atomically.
      await client.query("ROLLBACK");
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (client) client.release();
      await pool.query("DROP OWNED BY " + roleName).catch(() => {});
      await pool.query("DROP ROLE IF EXISTS " + roleName).catch(() => {});
      await pool.end();
    }
  });
