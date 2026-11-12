import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { runMigrations } from "../scripts/migrate-payments.mjs";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

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
          has_table_privilege('eper_customer_asset_access', 'eper_customer_assets', 'DELETE') AS can_delete_assets,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_asset_metadata_operations', 'SELECT') AS can_select_metadata_operations,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_asset_metadata_operations', 'INSERT') AS can_insert_metadata_operations,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_asset_metadata_operations', 'UPDATE') AS can_update_metadata_operations,
          has_table_privilege('eper_customer_asset_access', 'eper_customer_asset_metadata_operations', 'DELETE') AS can_delete_metadata_operations
      `);
      assert.deepEqual(privileges.rows[0], {
        can_select_assets: true, can_insert_assets: true,
        can_update_assets: true, can_delete_assets: false,
        can_select_metadata_operations: true, can_insert_metadata_operations: true,
        can_update_metadata_operations: false, can_delete_metadata_operations: false,
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


test("scanner child LOGIN identity resolves only its live leased generation and has no direct data privileges",
  { skip: !connectionString || !process.env.EPER_SCAN_CHILD_CERT_DIR }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "scan-child-tenant-" + suffix.slice(0, 12);
    const applicationId = "scan-child-app-" + suffix.slice(0, 12);
    const actorId = "scan-child-actor-" + suffix.slice(0, 12);
    const assetId = randomUUID();
    const correlationId = "scan-child-correlation-" + suffix.slice(0, 12);
    const idempotencyKey = "scan-child-key-" + suffix.slice(0, 20);
    const workerId = "ci-child-service:worker-" + suffix.slice(0, 12);
    const scannerServiceId = "ci-child-service";
    const spiffeId = "spiffe://eper.example/asset-scanner/ci-child";
    const loginRole = "eper_scan_child_ci";
    const certDirectory = process.env.EPER_SCAN_CHILD_CERT_DIR;
    const bytes = Buffer.alloc(512, 65);
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const repository = new PostgresCustomerAssetRepository(pool);
    let childPool;
    let roleCreated = false;
    let uploadSessionId;
    try {
      await pool.query(
        "INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id, enabled) VALUES (session_user, $1, true) ON CONFLICT (login_role, tenant_id) DO UPDATE SET enabled = true, updated_at = now()",
        [tenantId],
      );
      await repository.create({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "scanner child integration fixture", originalFileName: "scan.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: bytes.length, checksumSha256, storageAdapterKey: "ci-storage",
        storageObjectReference: "opaque-child-object-" + suffix,
      });
      const reservation = await repository.reserveUpload({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, expectedSizeBytes: bytes.length, expectedChecksumSha256: checksumSha256,
        idempotencyKey, requestFingerprint: createHash("sha256").update(suffix).digest("hex"),
      });
      uploadSessionId = reservation.uploadSessionId;
      await repository.recordUploadGrant({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, uploadSessionId, requestFingerprint: createHash("sha256").update(suffix).digest("hex"),
        providerUploadReference: "opaque-child-provider-ref-" + suffix,
        grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await repository.completeUpload({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        uploadSessionId, receivedSizeBytes: bytes.length, observedMimeType: "application/pdf",
        checksumSha256, scanStatus: "pending",
      });
      const [claim] = await repository.claimScanJobs({
        tenantId, applicationId, workerId, scannerServiceId,
        environment: "sandbox", limit: 1, leaseMs: 30_000,
      });
      assert.ok(claim, "fixture scan job must be claimable");

      await pool.query(
        `CREATE ROLE "${loginRole}" WITH LOGIN INHERIT
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      roleCreated = true;
      await pool.query(`GRANT eper_customer_asset_scan_child_access TO "${loginRole}"`);
      await pool.query(
        `INSERT INTO public.eper_customer_asset_scan_child_identities
          (login_role, tenant_id, application_id, worker_id, scanner_service_id,
           spiffe_id, provider_connection_id, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [loginRole, tenantId, applicationId, workerId, scannerServiceId, spiffeId, "ci-storage-connection"],
      );
      const childUrl = new URL(connectionString);
      childUrl.username = loginRole;
      childUrl.password = "";
      assert.ok(certDirectory, "CI client-certificate directory must be configured");
      const childSsl = {
        ca: await readFile(join(certDirectory, "ca.crt")),
        cert: await readFile(join(certDirectory, "child.crt")),
        key: await readFile(join(certDirectory, "child.key")),
        rejectUnauthorized: true,
      };
      childPool = new Pool({ connectionString: childUrl.toString(), max: 1, ssl: childSsl });

      const tls = await childPool.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
      assert.equal(tls.rows[0]?.ssl, true, "scanner child must use TLS");

      const privileges = await childPool.query(`
        SELECT current_user,
          has_table_privilege(current_user, 'public.eper_customer_assets', 'SELECT') AS can_read_assets,
          has_table_privilege(current_user, 'public.eper_customer_asset_upload_sessions', 'SELECT') AS can_read_sessions,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'SELECT') AS can_read_jobs,
          has_table_privilege(current_user, 'public.eper_customer_assets', 'UPDATE') AS can_update_assets,
          has_table_privilege(current_user, 'public.eper_customer_asset_scan_jobs', 'UPDATE') AS can_update_jobs,
          has_table_privilege(current_user, 'public.eper_audit_events', 'INSERT') AS can_write_audit
      `);
      assert.deepEqual(privileges.rows[0], {
        current_user: loginRole, can_read_assets: false, can_read_sessions: false,
        can_read_jobs: false, can_update_assets: false, can_update_jobs: false,
        can_write_audit: false,
      });

      const resolved = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_input($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration, spiffeId],
      );
      assert.equal(resolved.rowCount, 1);
      assert.equal(resolved.rows[0].asset_id, assetId);
      assert.equal(resolved.rows[0].provider_upload_reference, "opaque-child-provider-ref-" + suffix);
      assert.equal(resolved.rows[0].storage_object_reference, "opaque-child-object-" + suffix);
      assert.equal(Number(resolved.rows[0].size_bytes), bytes.length);
      assert.equal(resolved.rows[0].checksum_sha256, checksumSha256);

      const providerBinding = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_provider_binding($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration, spiffeId],
      );
      assert.deepEqual(providerBinding.rows, [{ provider_connection_id: "ci-storage-connection" }],
        "provider connection must come from the authenticated child identity mapping");

      const staleProviderBinding = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_provider_binding($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration + 1, spiffeId],
      );
      assert.equal(staleProviderBinding.rowCount, 0,
        "provider connection must not resolve for a stale claim generation");
      // PostgreSQL cert authentication rejects an expired cert, untrusted issuer, mismatched CN, and no cert.
      for (const candidate of [
        { cert: "wrong-cn.crt", key: "wrong-cn.key", label: "wrong certificate CN" },
        { cert: "untrusted-child.crt", key: "untrusted-child.key", label: "untrusted client CA" },
        { cert: "expired-child.crt", key: "expired-child.key", label: "expired client certificate" },
      ]) {
        const rejectedPool = new Pool({
          connectionString: childUrl.toString(), max: 1,
          ssl: { ca: await readFile(join(certDirectory, "ca.crt")), cert: await readFile(join(certDirectory, candidate.cert)), key: await readFile(join(certDirectory, candidate.key)), rejectUnauthorized: true },
        });
        let unexpectedClient;
        try {
          await assert.rejects(
            async () => { unexpectedClient = await rejectedPool.connect(); },
            undefined,
            candidate.label + " must be rejected",
          );
        } finally {
          unexpectedClient?.release();
          await rejectedPool.end();
        }
      }
      const noCertificatePool = new Pool({ connectionString: childUrl.toString(), max: 1, ssl: { ca: await readFile(join(certDirectory, "ca.crt")), rejectUnauthorized: true } });
      let unexpectedNoCertificateClient;
      try {
        await assert.rejects(
          async () => { unexpectedNoCertificateClient = await noCertificatePool.connect(); },
          undefined,
          "missing client certificate must be rejected",
        );
      } finally {
        unexpectedNoCertificateClient?.release();
        await noCertificatePool.end();
      }

      await assert.rejects(
        childPool.query("SELECT asset_id FROM public.eper_customer_assets WHERE tenant_id = $1", [tenantId]),
        error => error?.code === "42501",
      );
      await assert.rejects(
        childPool.query("UPDATE public.eper_customer_asset_scan_jobs SET state = 'completed' WHERE tenant_id = $1", [tenantId]),
        error => error?.code === "42501",
      );

      const stale = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_input($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration + 1, "spiffe://eper.example/asset-scanner/ci-child"],
      );
      assert.equal(stale.rowCount, 0, "stale claim generation must not resolve source input");

      await assert.rejects(
        childPool.query(
          `SELECT * FROM public.eper_resolve_customer_asset_scan_child_input($1, $2, $3, $4, $5, $6, $7)`,
          ["other-" + tenantId, applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration, "spiffe://eper.example/asset-scanner/ci-child"],
        ),
        /EPER_CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_DENIED/,
      );

      await assert.rejects(
        childPool.query(
          `SELECT * FROM public.eper_resolve_customer_asset_scan_child_input($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, "other-" + applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration, "spiffe://eper.example/asset-scanner/ci-child"],
        ),
        /EPER_CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_DENIED/,
      );

      await pool.query(
        `UPDATE public.eper_customer_asset_scan_jobs
            SET lease_expires_at = clock_timestamp() - interval '1 second'
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3`,
        [tenantId, applicationId, uploadSessionId],
      );
      const expired = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_input($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration, "spiffe://eper.example/asset-scanner/ci-child"],
      );
      assert.equal(expired.rowCount, 0, "expired lease must not resolve source input");
      const expiredProviderBinding = await childPool.query(
        `SELECT * FROM public.eper_resolve_customer_asset_scan_child_provider_binding($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, applicationId, assetId, workerId, scannerServiceId, claim.claimGeneration, spiffeId],
      );
      assert.equal(expiredProviderBinding.rowCount, 0,
        "expired lease must not resolve provider connection");
    } finally {
      if (childPool) await childPool.end();
      await pool.query("DELETE FROM public.eper_customer_asset_scan_child_identities WHERE login_role = $1", [loginRole]).catch(() => {});
      if (roleCreated) {
        await pool.query(`REVOKE eper_customer_asset_scan_child_access FROM "${loginRole}"`).catch(() => {});
        await pool.query(`DROP ROLE IF EXISTS "${loginRole}"`).catch(() => {});
      }
      if (uploadSessionId) {
        await pool.query("DELETE FROM public.eper_customer_asset_scan_jobs WHERE tenant_id = $1 AND upload_session_id = $2", [tenantId, uploadSessionId]).catch(() => {});
        await pool.query("DELETE FROM public.eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = $2", [tenantId, uploadSessionId]).catch(() => {});
      }
      await pool.query("DELETE FROM public.eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2", [tenantId, assetId]).catch(() => {});
      await pool.query("DELETE FROM public.eper_customer_asset_upload_expiry_worker_tenant_scope WHERE login_role = session_user AND tenant_id = $1", [tenantId]).catch(() => {});
      await pool.end();
    }
  });
