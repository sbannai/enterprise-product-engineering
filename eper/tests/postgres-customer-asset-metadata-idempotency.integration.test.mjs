import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runMigrations } from "../scripts/migrate-payments.mjs";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("customer asset metadata creation replays identical operations and rejects changed payloads on PostgreSQL 16",
  { skip: !connectionString }, async () => {
    await runMigrations(connectionString, {
      directory: new URL("../packages/audit/migrations/", import.meta.url).pathname,
      lockName: "eper:test:customer-asset-metadata-idempotency",
      ledgerTable: "eper_audit_schema_migrations",
      applicationName: "eper-customer-asset-metadata-idempotency-test",
    });
    const pool = new Pool({ connectionString, max: 6 });
    const repository = new PostgresCustomerAssetRepository(pool);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
    const tenantId = "metadata-tenant-" + suffix;
    const applicationId = "metadata-app-" + suffix;
    const actorId = "metadata-actor-" + suffix;
    const operationId = randomUUID().replaceAll("-", "");
    const base = {
      tenantId, applicationId, actorId, environment: "sandbox",
      correlationId: "metadata-correlation-" + suffix, clientOperationId: operationId,
      scope: "application_restricted", ownerApplicationId: applicationId,
      displayName: "Evidence document", originalFileName: "evidence.pdf",
      mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
      sizeBytes: 2048, checksumSha256: "a".repeat(64), storageAdapterKey: "ci-storage",
      storageObjectReference: "opaque-metadata-object-" + suffix,
    };
    try {
      await repository.assertReady();
      const [first, concurrentReplay] = await Promise.all([
        repository.create(base), repository.create(base),
      ]);
      assert.equal(first.assetId, concurrentReplay.assetId, "concurrent duplicate operation must return one durable asset");
      const replay = await repository.create(base);
      assert.equal(replay.assetId, first.assetId, "identical retry must return the original asset");
      assert.equal(first.checksumSha256, base.checksumSha256, "the persisted checksum must match the immutable metadata request");
      await assert.rejects(
        repository.create({ ...base, displayName: "Changed evidence document" }),
        /EPER_CUSTOMER_ASSET_METADATA_IDEMPOTENCY_CONFLICT/,
      );
      await assert.rejects(
        repository.create({ ...base, checksumSha256: "b".repeat(64) }),
        /EPER_CUSTOMER_ASSET_METADATA_IDEMPOTENCY_CONFLICT/,
        "a checksum-only change must not replay the original metadata operation",
      );
      const counts = await pool.query(
        "SELECT (SELECT count(*)::int FROM eper_customer_assets WHERE tenant_id = $1) AS assets, " +
        "(SELECT count(*)::int FROM eper_customer_asset_metadata_operations WHERE tenant_id = $1) AS operations",
        [tenantId],
      );
      assert.deepEqual(counts.rows[0], { assets: 1, operations: 1 },
        "replay and conflict must not create extra assets or operation records");
      const actorScoped = await repository.create({
        ...base, actorId: actorId + "-other", correlationId: base.correlationId + "-other",
      });
      assert.notEqual(actorScoped.assetId, first.assetId, "operation identity must be scoped to actor as well as tenant/application");
    } finally {
      await pool.query("DELETE FROM eper_customer_asset_metadata_operations WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_application_links WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_scan_jobs WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_assets WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.end();
    }
  });
