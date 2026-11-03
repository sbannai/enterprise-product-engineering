import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;
const platformAdminUrl = process.env.EPER_PLATFORM_ADMIN_TEST_DATABASE_URL;
const providerCatalogueUrl = process.env.EPER_PROVIDER_CATALOGUE_TEST_DATABASE_URL;

async function assertRoleContract(label, connectionString, allowed, denied) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const identity = await client.query(`
        SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls
        FROM pg_roles r WHERE r.rolname = current_user
      `);
      assert.equal(identity.rowCount, 1, label + ": database role must resolve");
      assert.equal(identity.rows[0].rolsuper, false, label + ": role must not be superuser");
      assert.equal(identity.rows[0].rolbypassrls, false, label + ": role must not bypass RLS");

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
          assert.equal(result.rows[0].allowed, false, label + ": unexpected " + privilege + " on " + table);
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
  eper_audit_chain_head: ["SELECT", "UPDATE"],
};
const auditDenied = {
  eper_audit_events: ["UPDATE", "DELETE", "TRUNCATE"],
  eper_audit_chain_head: ["INSERT", "DELETE", "TRUNCATE"],
  eper_payment_orders: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  eper_payment_receipts: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  eper_payment_webhook_events: ["SELECT", "INSERT", "UPDATE", "DELETE"],
};

test("platform-admin database role is limited to credentials and append-only audit writes",
  { skip: !platformAdminUrl }, async () => {
    await assertRoleContract(
      "platform-admin",
      platformAdminUrl,
      {
        ...auditAllowed,
        eper_platform_admin_credentials: ["SELECT", "INSERT", "UPDATE"],
      },
      {
        ...auditDenied,
        eper_platform_admin_credentials: ["DELETE", "TRUNCATE"],
        eper_provider_definitions: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      },
    );
  });

test("provider-catalogue database role is limited to catalogue and append-only audit writes",
  { skip: !providerCatalogueUrl }, async () => {
    await assertRoleContract(
      "provider-catalogue",
      providerCatalogueUrl,
      {
        ...auditAllowed,
        eper_provider_definitions: ["SELECT", "INSERT", "UPDATE"],
      },
      {
        ...auditDenied,
        eper_provider_definitions: ["DELETE", "TRUNCATE"],
        eper_platform_admin_credentials: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      },
    );
  });
