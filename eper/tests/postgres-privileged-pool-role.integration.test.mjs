import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { appendAuditEventInTransaction } from "../dist/packages/audit/audit-event-store.js";

const databaseUrl = process.env.EPER_PRIVILEGED_ROLE_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
let safeDatabase = false;
if (databaseUrl) {
  try {
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    safeDatabase = /(^|[_-])(test|ci|sandbox)([_-]|$)/i.test(databaseName);
  } catch {
    safeDatabase = false;
  }
}

test("privileged PostgreSQL roles enforce isolated least-privilege grants and tenant RLS", {
  skip: !safeDatabase ? "Requires an isolated test/CI/sandbox PostgreSQL database with audit migrations applied" : false,
}, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 5000 });
  try {
    const roles = await pool.query(`
      SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles
      WHERE rolname = ANY($1::text[])
    `, [["eper_platform_admin_access", "eper_provider_catalogue_access", "eper_customer_asset_upload_expiry_worker_access"]]);
    assert.equal(roles.rows.length, 3);
    for (const role of roles.rows) {
      assert.equal(role.rolcanlogin, false, role.rolname + " must be a NOLOGIN group role");
      assert.equal(role.rolsuper, false, role.rolname + " must not be superuser");
      assert.equal(role.rolcreatedb, false);
      assert.equal(role.rolcreaterole, false);
      assert.equal(role.rolreplication, false);
      assert.equal(role.rolbypassrls, false);
    }

    const grants = await pool.query(`
      SELECT
        has_table_privilege('eper_platform_admin_access', 'public.eper_platform_admin_credentials', 'SELECT') AS platform_credential_select,
        has_table_privilege('eper_platform_admin_access', 'public.eper_platform_admin_credentials', 'INSERT') AS platform_credential_insert,
        has_column_privilege('eper_platform_admin_access', 'public.eper_platform_admin_credentials', 'last_used_at', 'UPDATE') AS platform_last_used_update,
        has_column_privilege('eper_platform_admin_access', 'public.eper_platform_admin_credentials', 'revoked_at', 'UPDATE') AS platform_revoked_update,
        has_column_privilege('eper_platform_admin_access', 'public.eper_platform_admin_credentials', 'permissions', 'UPDATE') AS platform_permissions_update,
        has_table_privilege('eper_platform_admin_access', 'public.eper_platform_admin_credentials', 'DELETE') AS platform_credential_delete,
        has_table_privilege('eper_platform_admin_access', 'public.eper_provider_definitions', 'SELECT') AS platform_provider_read,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_provider_definitions', 'SELECT') AS provider_definition_select,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_provider_definitions', 'INSERT') AS provider_definition_insert,
        has_column_privilege('eper_provider_catalogue_access', 'public.eper_provider_definitions', 'provider_status', 'UPDATE') AS provider_status_update,
        has_column_privilege('eper_provider_catalogue_access', 'public.eper_provider_definitions', 'provider_key', 'UPDATE') AS provider_key_update,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_provider_definitions', 'DELETE') AS provider_definition_delete,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_provider_connections', 'INSERT') AS provider_connection_insert,
        has_column_privilege('eper_provider_catalogue_access', 'public.eper_provider_connections', 'connection_status', 'UPDATE') AS provider_connection_status_update,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_provider_validation_events', 'INSERT') AS provider_validation_insert,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_provider_validation_events', 'SELECT') AS provider_validation_select,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_platform_admin_credentials', 'SELECT') AS provider_credential_read,
        has_table_privilege('eper_platform_admin_access', 'public.eper_audit_events', 'INSERT') AS platform_audit_insert,
        has_table_privilege('eper_platform_admin_access', 'public.eper_audit_events', 'UPDATE') AS platform_audit_update,
        has_table_privilege('eper_provider_catalogue_access', 'public.eper_audit_events', 'INSERT') AS provider_audit_insert,
        has_column_privilege('eper_provider_catalogue_access', 'public.eper_audit_chain_head', 'last_event_hash', 'UPDATE') AS provider_chain_head_update,
        has_column_privilege('eper_provider_catalogue_access', 'public.eper_audit_chain_head', 'singleton', 'UPDATE') AS provider_chain_singleton_update,
        has_function_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_expire_customer_asset_upload_sessions(character varying, integer)', 'EXECUTE') AS expiry_function_execute,
        has_function_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_customer_asset_upload_expiry_queue_age_ms(character varying)', 'EXECUTE') AS expiry_queue_age_execute,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_customer_asset_upload_sessions', 'SELECT') AS expiry_session_select,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_customer_asset_upload_sessions', 'UPDATE') AS expiry_session_update,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_customer_assets', 'SELECT') AS expiry_asset_select,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_customer_asset_scan_jobs', 'SELECT') AS expiry_scan_job_select,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_payment_orders', 'SELECT') AS expiry_payment_select,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_provider_payloads', 'SELECT') AS expiry_provider_payload_select,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_audit_events', 'INSERT') AS expiry_audit_insert,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_audit_events', 'SELECT') AS expiry_audit_select,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_audit_events', 'UPDATE') AS expiry_audit_update,
        has_table_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_audit_events', 'DELETE') AS expiry_audit_delete,
        has_column_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_audit_chain_head', 'last_event_hash', 'UPDATE') AS expiry_chain_hash_update,
        has_column_privilege('eper_customer_asset_upload_expiry_worker_access', 'public.eper_audit_chain_head', 'singleton', 'UPDATE') AS expiry_chain_singleton_update
    `);
    const g = grants.rows[0];
    for (const key of [
      "platform_credential_select", "platform_credential_insert", "platform_last_used_update",
      "platform_revoked_update", "provider_definition_select", "provider_definition_insert",
      "provider_status_update", "provider_connection_insert", "provider_connection_status_update",
      "provider_validation_insert", "provider_validation_select", "platform_audit_insert",
      "provider_audit_insert", "provider_chain_head_update",
    ]) assert.equal(g[key], true, key);
    for (const key of [
      "platform_permissions_update", "platform_credential_delete", "platform_provider_read",
      "provider_key_update", "provider_definition_delete", "provider_credential_read",
      "platform_audit_update", "provider_chain_singleton_update",
      "expiry_session_select", "expiry_session_update", "expiry_asset_select",
      "expiry_scan_job_select", "expiry_payment_select", "expiry_provider_payload_select",
      "expiry_audit_select", "expiry_audit_update", "expiry_audit_delete", "expiry_chain_singleton_update",
    ]) assert.equal(g[key], false, key);
    for (const key of [
      "expiry_function_execute", "expiry_queue_age_execute", "expiry_audit_insert", "expiry_chain_hash_update",
    ]) assert.equal(g[key], true, key);

    const rls = await pool.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = ANY($1::text[])
    `, [[
      "eper_provider_connections",
      "eper_provider_connection_applications",
      "eper_provider_validation_events",
    ]]);
    assert.equal(rls.rows.length, 3);
    for (const table of rls.rows) {
      assert.equal(table.relrowsecurity, true, table.relname + " RLS enabled");
      assert.equal(table.relforcerowsecurity, true, table.relname + " RLS forced");
    }

    const client = await pool.connect();
    try {
      const credentialId = "role-test-" + randomUUID();
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE eper_platform_admin_access");
      await client.query(`
        INSERT INTO eper_platform_admin_credentials
          (credential_id, platform_actor_id, token_hash, permissions, expires_at, created_by)
        VALUES ($1, 'platform-test-actor', $2, '["provider_catalogue:manage"]'::jsonb,
                NOW() + INTERVAL '1 day', 'role-test')
      `, [credentialId, Buffer.alloc(32, 7)]);
      const credential = await client.query(
        "SELECT credential_id FROM eper_platform_admin_credentials WHERE credential_id = $1",
        [credentialId],
      );
      assert.equal(credential.rows.length, 1);
      await client.query(
        "UPDATE eper_platform_admin_credentials SET last_used_at = NOW() WHERE credential_id = $1",
        [credentialId],
      );
      await client.query(
        "UPDATE eper_platform_admin_credentials SET revoked_at = NOW() WHERE credential_id = $1",
        [credentialId],
      );
      await appendAuditEventInTransaction(client, {
        tenantId: "platform", applicationId: "platform-admin", environment: "sandbox",
        actorType: "human", actorId: "role-test", action: "platform_admin.credential.test",
        outcome: "success", source: "platform", operationName: "platform_admin.credential.test",
        correlationId: randomUUID(), payload: { credentialId },
      });
      await client.query("SAVEPOINT platform_denied_permissions");
      await assert.rejects(
        client.query("UPDATE eper_platform_admin_credentials SET permissions = '[]'::jsonb WHERE credential_id = $1", [credentialId]),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT platform_denied_permissions");
      await client.query("SAVEPOINT platform_denied_delete");
      await assert.rejects(
        client.query("DELETE FROM eper_platform_admin_credentials WHERE credential_id = $1", [credentialId]),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT platform_denied_delete");
      await client.query("ROLLBACK");

      const tenantId = "role-test-tenant-" + randomUUID();
      const applicationId = "role-test-app";
      const providerKey = "role-test-provider-" + randomUUID();
      const connectionId = randomUUID();
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE eper_provider_catalogue_access");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
      await client.query(`
        INSERT INTO eper_provider_definitions
          (provider_key, display_name, adapter_key, adapter_version, capabilities, auth_modes,
           configuration_schema, provider_status, version, updated_by)
        VALUES ($1, 'Role Test Provider', 'synthetic-test', '1.0.0',
                '["notifications"]'::jsonb, '["api_key"]'::jsonb,
                '{"type":"object"}'::jsonb, 'ACTIVE', 1, 'role-test')
      `, [providerKey]);
      await client.query(`
        INSERT INTO eper_provider_connections
          (tenant_id, connection_id, provider_key, display_name, auth_mode, secret_reference,
           connection_status, environment, safe_metadata, created_by, updated_by)
        VALUES ($1,$2,$3,'Role Test Connection','api_key','secret-ref://synthetic/test',
                'PENDING_VALIDATION','sandbox','{}'::jsonb,'role-test','role-test')
      `, [tenantId, connectionId, providerKey]);
      await client.query(`
        INSERT INTO eper_provider_connection_applications
          (tenant_id, application_id, connection_id, provider_key, allowed_capabilities,
           binding_status, version, updated_by)
        VALUES ($1,$2,$3,$4,'["notifications"]'::jsonb,'PENDING_VALIDATION',1,'role-test')
      `, [tenantId, applicationId, connectionId, providerKey]);
      await client.query(`
        INSERT INTO eper_provider_validation_events
          (validation_event_id, tenant_id, connection_id, provider_key,
           expected_connection_version, resulting_connection_version,
           validation_outcome, actor_id, correlation_id, audit_environment)
        VALUES ($1,$2,$3,$4,1,2,'SUCCEEDED','role-test',$5,'sandbox')
      `, [randomUUID(), tenantId, connectionId, providerKey, randomUUID()]);
      await client.query(`
        UPDATE eper_provider_connections
        SET connection_status = 'ACTIVE', version = version + 1, updated_at = NOW(), updated_by = 'role-test'
        WHERE tenant_id = $1 AND connection_id = $2
      `, [tenantId, connectionId]);
      await appendAuditEventInTransaction(client, {
        tenantId, applicationId, environment: "sandbox", actorType: "human",
        actorId: "role-test", action: "provider.connection.role_test", outcome: "success",
        source: "integration", operationName: "provider.connection.role_test",
        correlationId: randomUUID(), payload: { providerKey, connectionId },
      });
      await client.query("SAVEPOINT provider_denied_immutable_key");
      await assert.rejects(
        client.query("UPDATE eper_provider_definitions SET provider_key = 'changed' WHERE provider_key = $1", [providerKey]),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT provider_denied_immutable_key");
      await client.query("SAVEPOINT provider_denied_cross_tenant");
      await assert.rejects(
        client.query(`
          INSERT INTO eper_provider_connections
            (tenant_id, connection_id, provider_key, display_name, auth_mode, secret_reference,
             connection_status, environment, safe_metadata, created_by, updated_by)
          VALUES ('other-tenant',$1,$2,'Cross Tenant','api_key','secret-ref://synthetic/denied',
                  'PENDING_VALIDATION','sandbox','{}'::jsonb,'role-test','role-test')
        `, [randomUUID(), providerKey]),
        /row-level security|permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT provider_denied_cross_tenant");
      await client.query("ROLLBACK");

      // The expiry worker can execute only the tenant-bound expiry/queue-age
      // functions and append audit events; it cannot read session or asset rows.
      const expiryTenantId = "expiry-role-test-tenant-" + randomUUID();
      const expiryApplicationId = "expiry-role-test-app";
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE eper_customer_asset_upload_expiry_worker_access");
      await client.query("SELECT set_config('eper.tenant_id', $1, true)", [expiryTenantId]);
      await client.query("SELECT set_config('eper.application_id', $1, true)", [expiryApplicationId]);
      const expiryRows = await client.query(
        "SELECT * FROM public.eper_expire_customer_asset_upload_sessions($1, 10)",
        [expiryTenantId],
      );
      assert.equal(expiryRows.rows.length, 0);
      const queueAge = await client.query(
        "SELECT public.eper_customer_asset_upload_expiry_queue_age_ms($1) AS age_ms",
        [expiryTenantId],
      );
      assert.equal(Number(queueAge.rows[0].age_ms), 0);
      await appendAuditEventInTransaction(client, {
        tenantId: expiryTenantId, applicationId: expiryApplicationId, environment: "sandbox",
        actorType: "system", actorId: "expiry-role-test", action: "customer.asset.upload.expiry.role_test",
        outcome: "success", source: "job", operationName: "customer.asset.upload.expiry.role_test",
        correlationId: randomUUID(), payload: {},
      });
      await client.query("SAVEPOINT expiry_denied_session_read");
      await assert.rejects(
        client.query("SELECT upload_session_id FROM eper_customer_asset_upload_sessions LIMIT 1"),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT expiry_denied_session_read");
      await client.query("SAVEPOINT expiry_denied_asset_read");
      await assert.rejects(
        client.query("SELECT asset_id FROM eper_customer_assets LIMIT 1"),
        /permission denied/i,
      );
      await client.query("ROLLBACK TO SAVEPOINT expiry_denied_asset_read");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});
