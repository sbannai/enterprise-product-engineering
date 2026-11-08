import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runMigrations } from "../scripts/migrate-payments.mjs";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("customer asset migrations enforce catalog, RLS role boundary, rerun and checksum drift on PostgreSQL 16",
  { skip: !connectionString }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "migration-tenant-" + suffix.slice(0, 18);
    const applicationId = "migration-app-" + suffix.slice(0, 18);
    const otherApplicationId = "migration-other-" + suffix.slice(0, 16);
    const assetId = randomUUID();
    const ledgerTable = "eper_asset_checksum_test_" + suffix.slice(0, 16);
    let tempDirectory;
    try {
      // Re-run the actual ordered audit migration runner against the current schema.
      await runMigrations(connectionString, {
        directory: new URL("../packages/audit/migrations/", import.meta.url).pathname,
        lockName: "eper:test:asset-audit-migration-rerun",
        ledgerTable: "eper_audit_schema_migrations",
        applicationName: "eper-asset-migration-rerun-test",
      });

      const catalog = await pool.query(`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
         WHERE c.relname IN (
           'eper_customer_assets',
           'eper_customer_asset_application_links',
           'eper_customer_asset_upload_sessions',
           'eper_customer_asset_scan_jobs',
           'eper_customer_asset_metadata_operations'
         )
      `);
      assert.equal(catalog.rowCount, 5, "all customer-asset tables, including metadata idempotency, must exist");
      for (const table of catalog.rows) {
        assert.equal(table.relrowsecurity, true, table.relname + " must ENABLE RLS");
        assert.equal(table.relforcerowsecurity, true, table.relname + " must FORCE RLS");
      }

      const indexes = await pool.query(`
        SELECT indexname, indexdef
          FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname IN (
             'eper_customer_asset_upload_recovery_idx',
             'eper_customer_asset_upload_provider_outcome_idx'
           )
         ORDER BY indexname
      `);
      assert.equal(indexes.rowCount, 2, "both recovery and provider-outcome indexes must exist");
      const recoveryIndex = indexes.rows.find(row => row.indexname === "eper_customer_asset_upload_recovery_idx");
      const outcomeIndex = indexes.rows.find(row => row.indexname === "eper_customer_asset_upload_provider_outcome_idx");
      assert.match(recoveryIndex.indexdef, /\(tenant_id, application_id, actor_id, idempotency_key, updated_at DESC\)/);
      assert.match(outcomeIndex.indexdef, /\(tenant_id, application_id, provider_outcome, updated_at DESC\)/);

      const constraints = await pool.query(`
        SELECT conname, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
         WHERE conrelid = 'eper_customer_asset_upload_sessions'::regclass
           AND conname IN (
             'eper_customer_asset_upload_request_fingerprint_format',
             'eper_customer_asset_upload_grant_expiry_requires_reference',
             'eper_customer_asset_upload_provider_outcome_values',
             'eper_customer_asset_upload_provider_success_reference',
             'eper_customer_asset_upload_provider_rejection_reference'
           )
         ORDER BY conname
      `);
      assert.equal(constraints.rowCount, 5, "all recovery and provider-outcome constraints must exist");
      const constraintDefinitions = constraints.rows.map(row => row.definition).join(" ");
      assert.match(constraintDefinitions, /request_fingerprint.*IS NULL.*request_fingerprint.*~/);
      assert.match(constraintDefinitions, /provider_grant_expires_at.*IS NULL.*provider_upload_reference.*IS NOT NULL/);
      assert.match(constraintDefinitions, /provider_outcome.*ANY/);
      assert.match(constraintDefinitions, /provider_outcome.*'succeeded'.*provider_upload_reference.*IS NOT NULL/);
      assert.match(constraintDefinitions, /provider_outcome.*'rejected'.*provider_upload_reference.*IS NULL/);

      const metadataConstraints = await pool.query(`
        SELECT conname, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
         WHERE conrelid = 'eper_customer_asset_metadata_operations'::regclass
         ORDER BY conname
      `);
      assert.ok(metadataConstraints.rows.some(row => row.conname === "eper_customer_asset_metadata_operations_pkey"),
        "metadata operation identity must be unique per tenant/application/actor/operation");
      assert.ok(metadataConstraints.rows.some(row => row.definition.includes("UNIQUE (tenant_id, asset_id)")),
        "one metadata operation must own one asset per tenant");
      const metadataPolicy = await pool.query(`
        SELECT policyname, qual, with_check FROM pg_policies
         WHERE schemaname = current_schema() AND tablename = 'eper_customer_asset_metadata_operations'
      `);
      assert.equal(metadataPolicy.rowCount, 1);
      assert.match(metadataPolicy.rows[0].qual, /tenant_id.*eper\.tenant_id.*application_id.*eper\.application_id/);
      assert.match(metadataPolicy.rows[0].with_check, /tenant_id.*eper\.tenant_id.*application_id.*eper\.application_id/);
      const role = await pool.query(`
        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit
          FROM pg_roles WHERE rolname = 'eper_customer_asset_access'
      `);
      assert.equal(role.rowCount, 1);
      assert.deepEqual(role.rows[0], {
        rolcanlogin: false, rolsuper: false, rolcreatedb: false,
        rolcreaterole: false, rolbypassrls: false, rolinherit: false,
      });
      const privileges = await pool.query(`
        SELECT
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'SELECT') AS can_select_assets,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'INSERT') AS can_insert_assets,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'UPDATE') AS can_update_assets,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'DELETE') AS can_delete_assets
      `);
      assert.deepEqual(privileges.rows[0], {
        can_select_assets: true, can_insert_assets: true,
        can_update_assets: true, can_delete_assets: false,
      });

      // Seed one restricted asset, then prove the NOLOGIN runtime role cannot
      // see it from another application or tenant when FORCE RLS is active.
      await pool.query(`
        INSERT INTO eper_customer_assets (
          tenant_id, asset_id, repository_scope, owner_application_id,
          display_name, original_file_name, media_category, mime_type,
          file_extension, size_bytes, storage_adapter_key, storage_object_reference,
          created_by, updated_by
        ) VALUES ($1, $2, 'application_restricted', $3,
          'RLS fixture', 'rls.pdf', 'document', 'application/pdf',
          'pdf', 100, 'ci-storage', $4, 'migration-test', 'migration-test')
      `, [tenantId, assetId, applicationId, "opaque-" + suffix]);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE eper_customer_asset_access");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", [tenantId]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const visible = await client.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2",
          [tenantId, assetId],
        );
        assert.equal(visible.rowCount, 1, "owning application must see its restricted asset");
        await client.query("SELECT set_config('eper.application_id', $1, true)", [otherApplicationId]);
        const crossApplication = await client.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2",
          [tenantId, assetId],
        );
        assert.equal(crossApplication.rowCount, 0, "other application must not see restricted asset");
        await client.query("SELECT set_config('eper.tenant_id', $1, true)", ["different-" + tenantId]);
        await client.query("SELECT set_config('eper.application_id', $1, true)", [applicationId]);
        const crossTenant = await client.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2",
          [tenantId, assetId],
        );
        assert.equal(crossTenant.rowCount, 0, "other tenant context must not see asset");
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      // Verify checksum drift is rejected by the real runner before SQL executes.
      tempDirectory = await mkdtemp(join(tmpdir(), "eper-asset-migration-"));
      const migrationSource = await readFile(
        new URL("../packages/audit/migrations/023_customer_asset_upload_recovery.sql", import.meta.url),
        "utf8",
      );
      await writeFile(
        join(tempDirectory, "023_customer_asset_upload_recovery.sql"),
        migrationSource + "\n-- deliberate checksum drift fixture\n",
      );
      await pool.query(`
        CREATE TABLE ${ledgerTable} (
          migration_name TEXT PRIMARY KEY, sha256 CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `INSERT INTO ${ledgerTable} (migration_name, sha256) VALUES ($1, $2)`,
        ["023_customer_asset_upload_recovery.sql", "0".repeat(64)],
      );
      await assert.rejects(
        runMigrations(connectionString, {
          directory: tempDirectory,
          lockName: "eper:test:asset-checksum-drift",
          ledgerTable,
          applicationName: "eper-asset-checksum-drift-test",
        }),
        /EPER_PAYMENT_MIGRATION_CHECKSUM_MISMATCH:023_customer_asset_upload_recovery\.sql/,
      );
    } finally {
      await pool.query("DELETE FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2", [tenantId, assetId]).catch(() => {});
      await pool.query(`DROP TABLE IF EXISTS ${ledgerTable}`).catch(() => {});
      if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
      await pool.end();
    }
  });
