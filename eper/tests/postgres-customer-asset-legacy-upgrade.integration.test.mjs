import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runMigrations } from "../scripts/migrate-payments.mjs";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("customer asset 023-024 upgrade backfills only legacy rows with persisted provider references on PostgreSQL 16",
  { skip: !connectionString }, async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 18);
    const databaseName = "eper_asset_upgrade_" + suffix;
    const adminPool = new Pool({ connectionString, max: 2 });
    const databaseUrl = new URL(connectionString);
    databaseUrl.pathname = "/" + databaseName;
    const databaseConnectionString = databaseUrl.toString();
    let tempRoot;
    let databaseCreated = false;
    try {
      await adminPool.query(`CREATE DATABASE "${databaseName}"`);
      databaseCreated = true;

      // Build an isolated audit migration directory containing the exact
      // current-main 001-022 files, then introduce legacy rows before 023-024.
      tempRoot = await mkdtemp(join(tmpdir(), "eper-asset-legacy-upgrade-"));
      const auditSource = new URL("../packages/audit/migrations/", import.meta.url);
      const auditFiles = await readdir(auditSource);
      const beforeRecovery = join(tempRoot, "audit-before-recovery");
      const recoveryOnly = join(tempRoot, "audit-recovery-only");
      await mkdir(beforeRecovery);
      await mkdir(recoveryOnly);
      for (const name of auditFiles.filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
        const number = Number(name.slice(0, 3));
        if (number <= 22) await copyFile(new URL(name, auditSource), join(beforeRecovery, name));
        if (number === 23 || number === 24) await copyFile(new URL(name, auditSource), join(recoveryOnly, name));
      }

      await runMigrations(databaseConnectionString, {
        lockName: "eper:test:legacy-upgrade:payments",
        applicationName: "eper-asset-legacy-upgrade",
      });
      await runMigrations(databaseConnectionString, {
        directory: beforeRecovery,
        lockName: "eper:test:legacy-upgrade:audit",
        ledgerTable: "eper_audit_schema_migrations",
        applicationName: "eper-asset-legacy-upgrade",
      });

      const fixturePool = new Pool({ connectionString: databaseConnectionString, max: 2 });
      const tenantId = "legacy-tenant-" + suffix;
      const applicationId = "legacy-app-" + suffix;
      const actorId = "legacy-actor-" + suffix;
      const withReferenceAsset = randomUUID();
      const unknownAsset = randomUUID();
      const withReferenceSession = randomUUID();
      const unknownSession = randomUUID();
      try {
        for (const [assetId, name] of [
          [withReferenceAsset, "Legacy provider success"],
          [unknownAsset, "Legacy unknown provider result"],
        ]) {
          await fixturePool.query(`
            INSERT INTO eper_customer_assets (
              tenant_id, asset_id, repository_scope, owner_application_id,
              display_name, original_file_name, media_category, mime_type,
              file_extension, size_bytes, storage_adapter_key, storage_object_reference,
              created_by, updated_by
            ) VALUES ($1, $2, 'application_restricted', $3, $4, 'legacy.pdf',
              'document', 'application/pdf', 'pdf', 100, 'legacy-storage',
              $5, $6, $6)
          `, [tenantId, assetId, applicationId, name, "opaque-" + assetId, actorId]);
        }

        await fixturePool.query(`
          INSERT INTO eper_customer_asset_upload_sessions (
            tenant_id, application_id, upload_session_id, asset_id, actor_id,
            expected_size_bytes, provider_upload_reference, idempotency_key, expires_at
          ) VALUES
            ($1, $2, $3, $4, $5, 100, 'persisted-provider-reference', $6, NOW() + INTERVAL '1 hour'),
            ($1, $2, $7, $8, $5, 100, NULL, $9, NOW() + INTERVAL '1 hour')
        `, [
          tenantId, applicationId, withReferenceSession, withReferenceAsset, actorId,
          "legacy-key-ref-" + suffix, unknownSession, unknownAsset, "legacy-key-unknown-" + suffix,
        ]);

        await runMigrations(databaseConnectionString, {
          directory: recoveryOnly,
          lockName: "eper:test:legacy-upgrade:audit",
          ledgerTable: "eper_audit_schema_migrations",
          applicationName: "eper-asset-legacy-upgrade",
        });
        // Repeating the exact applied migration set must be a no-op with intact checksums.
        await runMigrations(databaseConnectionString, {
          directory: recoveryOnly,
          lockName: "eper:test:legacy-upgrade:audit",
          ledgerTable: "eper_audit_schema_migrations",
          applicationName: "eper-asset-legacy-upgrade",
        });

        const outcomes = await fixturePool.query(`
          SELECT upload_session_id, provider_outcome
            FROM eper_customer_asset_upload_sessions
           WHERE tenant_id = $1 AND application_id = $2
           ORDER BY upload_session_id
        `, [tenantId, applicationId]);
        const bySession = new Map(outcomes.rows.map(row => [row.upload_session_id, row.provider_outcome]));
        assert.equal(bySession.get(withReferenceSession), "succeeded",
          "only a persisted provider reference is evidence of legacy provider success");
        assert.equal(bySession.get(unknownSession), "unknown",
          "a missing provider reference must remain unknown, never inferred as rejection or success");
      } finally {
        await fixturePool.end();
      }
    } finally {
      if (databaseCreated) {
        await adminPool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", [databaseName]).catch(() => {});
        await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => {});
      }
      if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
      await adminPool.end();
    }
  });
