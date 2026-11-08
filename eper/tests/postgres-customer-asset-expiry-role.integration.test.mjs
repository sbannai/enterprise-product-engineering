import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { appendAuditEventInTransaction } from "../dist/packages/audit/audit-event-store.js";

const connectionString = process.env.DATABASE_URL;
test("expiry worker group can expire and append audit but cannot read customer or payment/provider tables",
  { skip: !connectionString || process.env.EPER_CUSTOMER_ASSET_LIVE_TESTS !== "1" }, async () => {
    const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
    const client = await pool.connect();
    const tenantId = "expiry-role-tenant-" + randomUUID();
    const applicationId = "expiry-role-app-" + randomUUID();
    try {
      await pool.query(
        "INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id, enabled) VALUES (session_user, $1, true)",
        [tenantId],
      );
      const role = await client.query(`
        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
        FROM pg_roles WHERE rolname = 'eper_customer_asset_upload_expiry_worker_access'
      `);
      assert.equal(role.rowCount, 1, "worker access group role must exist");
      assert.deepEqual(role.rows[0], {
        rolcanlogin: false, rolsuper: false, rolcreatedb: false,
        rolcreaterole: false, rolreplication: false, rolbypassrls: false,
      });
      const grants = await client.query(`
        SELECT
          has_function_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_expire_customer_asset_upload_sessions(character varying,integer,uuid)', 'EXECUTE') AS can_expire,
          has_table_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_customer_asset_upload_sessions', 'SELECT') AS can_read_sessions,
          has_table_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_customer_asset_upload_sessions', 'UPDATE') AS can_update_sessions,
          has_table_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_customer_assets', 'SELECT') AS can_read_assets,
          has_table_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_payment_orders', 'SELECT') AS can_read_payments,
          has_table_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_provider_connections', 'SELECT') AS can_read_providers,
          has_table_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_audit_events', 'INSERT') AS can_append_audit,
          has_table_privilege('eper_customer_asset_upload_expiry_worker_access',
            'public.eper_audit_events', 'SELECT') AS can_read_audit
      `);
      assert.deepEqual(grants.rows[0], {
        can_expire: true, can_read_sessions: false, can_update_sessions: false,
        can_read_assets: false, can_read_payments: false, can_read_providers: false,
        can_append_audit: true, can_read_audit: false,
      });

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE eper_customer_asset_upload_expiry_worker_access");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
      const expired = await client.query(
        "SELECT * FROM public.eper_expire_customer_asset_upload_sessions($1, $2)", [tenantId, 5],
      );
      assert.equal(expired.rowCount, 0);
      await appendAuditEventInTransaction(client, {
        tenantId, applicationId, environment: "sandbox", actorType: "system",
        actorId: "expiry-role-integration", action: "customer.asset.upload.expiry.role_test",
        outcome: "success", source: "job", operationName: "customer-asset-upload-expiry-role-test",
        correlationId: randomUUID(), payload: {},
      });
      await client.query("SAVEPOINT deny_session_read");
      await assert.rejects(
        client.query("SELECT upload_session_id FROM public.eper_customer_asset_upload_sessions LIMIT 1"),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT deny_session_read");
      await client.query("ROLLBACK");
    } finally {
      await pool.query(
        "DELETE FROM public.eper_customer_asset_upload_expiry_worker_tenant_scope WHERE login_role = session_user AND tenant_id = $1",
        [tenantId],
      ).catch(() => {});
      client.release();
      await pool.end();
    }
  });
