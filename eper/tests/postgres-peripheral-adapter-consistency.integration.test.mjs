import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("peripheral active configuration is bound to its exact adapter identity under PostgreSQL constraints and RLS",
  { skip: !connectionString }, async () => {
    const admin = new Pool({ connectionString, max: 2 });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const tenant = "peripheral-tenant-" + suffix;
    const otherTenant = "peripheral-other-" + suffix;
    const app = "peripheral-app-" + suffix;
    const otherApp = "peripheral-other-app-" + suffix;
    const validId = randomUUID();
    const mismatchId = randomUUID();
    const draftId = randomUUID();
    const role = "eper_peripheral_test_" + suffix;
    const q = (identifier) => {
      if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error("unsafe_test_identifier");
      return '"' + identifier + '"';
    };
    const roleName = q(role);
    let appClient;
    try {
      await admin.query(`
        INSERT INTO eper_tenant_application_assignment
          (tenant_id, application_id, assignment_status, assigned_by, updated_by)
        VALUES ($1,$3,'active','peripheral-ci','peripheral-ci'),
               ($1,$4,'active','peripheral-ci','peripheral-ci'),
               ($2,$5,'active','peripheral-ci','peripheral-ci')
        ON CONFLICT (tenant_id, application_id) DO NOTHING
      `, [tenant, otherTenant, app, otherApp, "other-" + otherApp]);

      await admin.query("CREATE ROLE " + roleName + " NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS");
      await admin.query("GRANT USAGE ON SCHEMA public TO " + roleName);
      await admin.query("GRANT SELECT, INSERT, UPDATE ON eper_application_peripheral TO " + roleName);
      await admin.query("GRANT SELECT, INSERT ON eper_application_peripheral_configuration TO " + roleName);

      appClient = await admin.connect();
      await appClient.query("BEGIN");
      await appClient.query("SET LOCAL ROLE " + roleName);
      await appClient.query("SELECT set_config('eper.tenant_id',$1,true)", [tenant]);
      await appClient.query("SELECT set_config('eper.application_id',$1,true)", [app]);

      // The exact adapter identity is accepted, even when the parent is inserted first.
      await appClient.query(`
        INSERT INTO eper_application_peripheral
          (tenant_id,application_id,peripheral_id,peripheral_kind,display_name,adapter_key,adapter_version,
           lifecycle_status,active_configuration_version,created_by,updated_by)
        VALUES ($1,$2,$3,'qr_reader','Valid QR reader','synthetic.qr','1.0.0','ACTIVE',1,'ci','ci')
      `, [tenant, app, validId]);
      await appClient.query(`
        INSERT INTO eper_application_peripheral_configuration
          (tenant_id,application_id,peripheral_id,configuration_version,adapter_key,adapter_version,settings,created_by)
        VALUES ($1,$2,$3,1,'synthetic.qr','1.0.0','{}'::jsonb,'ci')
      `, [tenant, app, validId]);
      await appClient.query("COMMIT");

      // A configuration with a different adapter key/version must fail at deferred FK check.
      await appClient.query("BEGIN");
      await appClient.query("SET LOCAL ROLE " + roleName);
      await appClient.query("SELECT set_config('eper.tenant_id',$1,true)", [tenant]);
      await appClient.query("SELECT set_config('eper.application_id',$1,true)", [app]);
      await appClient.query(`
        INSERT INTO eper_application_peripheral
          (tenant_id,application_id,peripheral_id,peripheral_kind,display_name,adapter_key,adapter_version,
           lifecycle_status,active_configuration_version,created_by,updated_by)
        VALUES ($1,$2,$3,'qr_reader','Mismatched QR reader','synthetic.qr','1.0.0','ACTIVE',1,'ci','ci')
      `, [tenant, app, mismatchId]);
      await appClient.query(`
        INSERT INTO eper_application_peripheral_configuration
          (tenant_id,application_id,peripheral_id,configuration_version,adapter_key,adapter_version,settings,created_by)
        VALUES ($1,$2,$3,1,'synthetic.other','2.0.0','{}'::jsonb,'ci')
      `, [tenant, app, mismatchId]);
      await assert.rejects(appClient.query("COMMIT"), error => error && error.code === "23503");
      await appClient.query("ROLLBACK");

      // Pre-activation registrations may legitimately have no adapter/configuration.
      await appClient.query("BEGIN");
      await appClient.query("SET LOCAL ROLE " + roleName);
      await appClient.query("SELECT set_config('eper.tenant_id',$1,true)", [tenant]);
      await appClient.query("SELECT set_config('eper.application_id',$1,true)", [app]);
      await appClient.query(`
        INSERT INTO eper_application_peripheral
          (tenant_id,application_id,peripheral_id,peripheral_kind,display_name,lifecycle_status,created_by,updated_by)
        VALUES ($1,$2,$3,'sensor','Unconfigured sensor','REGISTERED','ci','ci')
      `, [tenant, app, draftId]);
      await appClient.query("COMMIT");

      // Both tables enforce application scope; the restricted role cannot see another app.
      await appClient.query("BEGIN");
      await appClient.query("SET LOCAL ROLE " + roleName);
      await appClient.query("SELECT set_config('eper.tenant_id',$1,true)", [tenant]);
      await appClient.query("SELECT set_config('eper.application_id',$1,true)", [otherApp]);
      const hidden = await appClient.query(
        "SELECT peripheral_id FROM eper_application_peripheral WHERE tenant_id=$1", [tenant]);
      assert.equal(hidden.rowCount, 0);
      await appClient.query("ROLLBACK");

      // A failure inside a transaction leaves no partial peripheral/configuration rows.
      await appClient.query("BEGIN");
      await appClient.query("SET LOCAL ROLE " + roleName);
      await appClient.query("SELECT set_config('eper.tenant_id',$1,true)", [tenant]);
      await appClient.query("SELECT set_config('eper.application_id',$1,true)", [app]);
      const visible = await appClient.query(
        "SELECT peripheral_id FROM eper_application_peripheral WHERE tenant_id=$1 AND application_id=$2",
        [tenant, app]);
      assert.deepEqual(new Set(visible.rows.map(row => row.peripheral_id)), new Set([validId, draftId]));
      await appClient.query("ROLLBACK");
    } finally {
      if (appClient) appClient.release();
      await admin.query("DELETE FROM eper_application_peripheral_configuration WHERE tenant_id=$1 AND application_id=$2", [tenant, app]).catch(() => {});
      await admin.query("DELETE FROM eper_application_peripheral WHERE tenant_id=$1 AND application_id=$2", [tenant, app]).catch(() => {});
      await admin.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id IN ($2,$3)", [tenant, app, otherApp]).catch(() => {});
      await admin.query("DELETE FROM eper_tenant_application_assignment WHERE tenant_id=$1 AND application_id=$2", [otherTenant, "other-" + otherApp]).catch(() => {});
      await admin.query("DROP OWNED BY " + roleName).catch(() => {});
      await admin.query("DROP ROLE IF EXISTS " + roleName).catch(() => {});
      await admin.end();
    }
  });
