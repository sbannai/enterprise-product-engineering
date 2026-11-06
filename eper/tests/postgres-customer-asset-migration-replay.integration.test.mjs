import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const migration = await readFile(
  new URL("../packages/audit/migrations/021_customer_asset_repository.sql", import.meta.url),
  "utf8",
);

test("customer asset migration 021 can execute twice without losing data or RLS controls",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 2 });
    const tenantId = "asset-migration-replay-" + randomUUID();
    const assetId = randomUUID();

    try {
      // The workflow has already applied the full audit migration chain. Execute
      // migration 021 directly, then preserve a sentinel row across a second run.
      await pool.query(migration);
      await pool.query(
        `INSERT INTO eper_customer_assets (
          tenant_id, asset_id, repository_scope, display_name, original_file_name,
          media_category, mime_type, file_extension, size_bytes, storage_adapter_key,
          storage_object_reference, created_by, updated_by
        ) VALUES ($1,$2,'customer_shared','Replay sentinel','sentinel.txt',
                  'document','text/plain','txt',12,'test-adapter','opaque:replay-sentinel',
                  'migration-test','migration-test')`,
        [tenantId, assetId],
      );

      await pool.query(migration);

      const retained = await pool.query(
        "SELECT display_name, storage_object_reference FROM eper_customer_assets WHERE tenant_id=$1 AND asset_id=$2",
        [tenantId, assetId],
      );
      assert.deepEqual(retained.rows, [{
        display_name: "Replay sentinel",
        storage_object_reference: "opaque:replay-sentinel",
      }], "replaying migration 021 must preserve existing repository data");

      const policies = await pool.query(
        "SELECT policyname FROM pg_policies WHERE schemaname=current_schema() AND tablename IN ($1,$2,$3) ORDER BY policyname",
        ["eper_customer_assets", "eper_customer_asset_application_links", "eper_customer_asset_upload_sessions"],
      );
      assert.deepEqual(policies.rows.map(row => row.policyname), [
        "customer_asset_application_insert",
        "customer_asset_application_link_isolation",
        "customer_asset_application_read",
        "customer_asset_application_update",
        "customer_asset_upload_session_isolation",
      ]);

      const rls = await pool.query(
        `SELECT relname, relrowsecurity, relforcerowsecurity
           FROM pg_class
          WHERE relname = ANY($1::text[])
          ORDER BY relname`,
        [["eper_customer_assets", "eper_customer_asset_application_links", "eper_customer_asset_upload_sessions"]],
      );
      assert.equal(rls.rows.length, 3);
      for (const table of rls.rows) {
        assert.equal(table.relrowsecurity, true, table.relname + " must have RLS enabled");
        assert.equal(table.relforcerowsecurity, true, table.relname + " must force RLS");
      }

      const grants = await pool.query(
        `SELECT
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'SELECT') AS can_select,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'INSERT') AS can_insert,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'UPDATE') AS can_update,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'DELETE') AS can_delete`,
      );
      assert.deepEqual(grants.rows[0], {
        can_select: true, can_insert: true, can_update: true, can_delete: false,
      }, "replay must preserve the intended least-privilege table grants");
    } finally {
      await pool.query("DELETE FROM eper_customer_assets WHERE tenant_id=$1 AND asset_id=$2", [tenantId, assetId]).catch(() => undefined);
      await pool.end();
    }
  });
