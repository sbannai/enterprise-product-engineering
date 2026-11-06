import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;
const platformAdminUrl = process.env.EPER_PLATFORM_ADMIN_TEST_DATABASE_URL;
const providerCatalogueUrl = process.env.EPER_PROVIDER_CATALOGUE_TEST_DATABASE_URL;

async function assertRoleContract(label, connectionString, expectedGroupRole, allowed, denied, allowedColumns, deniedColumns) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const identity = await client.query(`
        SELECT current_user AS role_name, r.rolcanlogin, r.rolsuper, r.rolbypassrls,
               pg_has_role(current_user, $1, 'member') AS is_member
        FROM pg_roles r WHERE r.rolname = current_user
      `, [expectedGroupRole]);
      assert.equal(identity.rowCount, 1, label + ": database role must resolve");
      assert.equal(identity.rows[0].rolcanlogin, true, label + ": runtime role must be a login");
      assert.equal(identity.rows[0].rolsuper, false, label + ": role must not be superuser");
      assert.equal(identity.rows[0].rolbypassrls, false, label + ": role must not bypass RLS");
      assert.equal(identity.rows[0].is_member, true, label + ": login must inherit the approved group role");

      for (const [table, privileges] of Object.entries(allowed)) {
        for (const privilege of privileges) {
          const result = await client.query(
            "SELECT has_table_privilege(current_user, $1, $2) AS allowed",
            ["public." + table, privilege],
          );
          assert.equal(result.rows[0].allowed, true, label + ": expected " + privilege + " on " + table);
        }
      }
      for (const [table, privileges] of Object.entries(denied)) {
        for (const privilege of privileges) {
          const result = await client.query(
            "SELECT has_table_privilege(current_user, $1, $2) AS allowed",
            ["public." + table, privilege],
          );
          assert.equal(result.rows[0].allowed, false, label + ": unexpected table-level " + privilege + " on " + table);
        }
      }
      for (const [table, columns] of Object.entries(allowedColumns)) {
        for (const column of columns) {
          const result = await client.query(
            "SELECT has_column_privilege(current_user, $1, $2, 'UPDATE') AS allowed",
            ["public." + table, column],
          );
          assert.equal(result.rows[0].allowed, true, label + ": expected column UPDATE on " + table + "." + column);
        }
      }
      for (const [table, columns] of Object.entries(deniedColumns)) {
        for (const column of columns) {
          const result = await client.query(
            "SELECT has_column_privilege(current_user, $1, $2, 'UPDATE') AS allowed",
            ["public." + table, column],
          );
          assert.equal(result.rows[0].allowed, false, label + ": unexpected column UPDATE on " + table + "." + column);
        }
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const auditAllowed = {
  eper_audit_events: ["INSERT"],
  eper_audit_chain_head: ["SELECT"],
};
const auditDenied = {
  eper_audit_events: ["UPDATE", "DELETE", "TRUNCATE"],
  eper_audit_chain_head: ["INSERT", "UPDATE", "DELETE", "TRUNCATE"],
  eper_payment_orders: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  eper_payment_receipts: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  eper_payment_webhook_events: ["SELECT", "INSERT", "UPDATE", "DELETE"],
};

test("platform-admin database role is limited to credentials and append-only audit writes",
  { skip: !platformAdminUrl }, async () => {
    await assertRoleContract(
      "platform-admin",
      platformAdminUrl,
      "eper_platform_admin_access",
      {
        ...auditAllowed,
        eper_platform_admin_credentials: ["SELECT", "INSERT"],
      },
      {
        ...auditDenied,
        eper_platform_admin_credentials: ["UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_definitions: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_connections: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_connection_applications: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_application_provider_policies: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_validation_events: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_operations: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_webhook_receipts: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_tenant_provider_defaults: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
      },
      {
        eper_audit_chain_head: ["last_event_hash", "updated_at"],
        eper_platform_admin_credentials: ["last_used_at", "revoked_at"],
      },
      {
        eper_audit_chain_head: ["singleton"],
        eper_platform_admin_credentials: ["token_hash", "permissions", "platform_actor_id", "expires_at", "created_by"],
      },
    );
  });

test("provider-catalogue database role is limited to provider data and append-only audit writes",
  { skip: !providerCatalogueUrl }, async () => {
    await assertRoleContract(
      "provider-catalogue",
      providerCatalogueUrl,
      "eper_provider_catalogue_access",
      {
        ...auditAllowed,
        eper_provider_definitions: ["SELECT", "INSERT"],
        eper_provider_connections: ["SELECT", "INSERT"],
        eper_provider_connection_applications: ["SELECT", "INSERT"],
        eper_application_provider_policies: ["SELECT"],
        eper_provider_validation_events: ["SELECT", "INSERT"],
        eper_provider_operations: ["SELECT", "INSERT"],
        eper_tenant_provider_defaults: ["SELECT", "INSERT"],
      },
      {
        ...auditDenied,
        eper_provider_definitions: ["UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_connections: ["UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_connection_applications: ["UPDATE", "DELETE", "TRUNCATE"],
        eper_application_provider_policies: ["INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_validation_events: ["UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_operations: ["UPDATE", "DELETE", "TRUNCATE"],
        eper_provider_webhook_receipts: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
        eper_tenant_provider_defaults: ["UPDATE", "DELETE", "TRUNCATE"],
        eper_platform_admin_credentials: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
      },
      {
        eper_audit_chain_head: ["last_event_hash", "updated_at"],
        eper_provider_definitions: [
          "display_name", "adapter_key", "adapter_version", "capabilities", "auth_modes",
          "configuration_schema", "provider_status", "version", "updated_at", "updated_by",
        ],
        eper_provider_connections: ["secret_reference", "connection_status", "version", "updated_at", "updated_by"],
        eper_provider_connection_applications: [
          "allowed_capabilities", "binding_status", "version", "updated_at", "updated_by",
        ],
        eper_provider_operations: [
          "operation_status", "attempt_count", "available_at", "last_error_code", "provider_reference",
          "lease_owner", "lease_expires_at", "fencing_token", "updated_at",
        ],
        eper_tenant_provider_defaults: ["defaults", "version", "updated_at", "updated_by"],
      },
      {
        eper_audit_chain_head: ["singleton"],
        eper_provider_definitions: ["provider_key", "created_at"],
        eper_provider_connections: ["tenant_id", "connection_id", "provider_key", "created_at", "created_by"],
        eper_provider_connection_applications: [
          "tenant_id", "application_id", "connection_id", "provider_key", "created_at",
        ],
        eper_provider_operations: [
          "operation_id", "tenant_id", "application_id", "connection_id", "capability_key",
          "capability_version", "idempotency_key", "correlation_id", "request_digest",
          "payload_reference", "created_at",
        ],
        eper_tenant_provider_defaults: ["tenant_id", "connection_id"],
      },
    );
  });
