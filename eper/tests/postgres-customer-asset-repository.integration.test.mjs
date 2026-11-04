import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentPool } from "../dist/packages/payments/postgres-payment-runtime.js";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

const databaseConfigured = Boolean(process.env.EPER_PAYMENT_DATABASE_URL || process.env.DATABASE_URL);

test("PostgreSQL customer asset repository scopes visibility, links explicitly, reserves idempotently and audits mutations",
  { skip: !databaseConfigured },
  async () => {
    const pool = createPostgresPaymentPool();
    const repository = new PostgresCustomerAssetRepository(pool);
    const tenantId = "asset-it-" + randomUUID();
    const otherTenant = "asset-it-" + randomUUID();
    const applicationId = "app-" + randomUUID();
    const otherApplication = "app-" + randomUUID();
    const actorId = "integration-admin";
    const correlationId = randomUUID();
    const assetIds = [];
    try {
      await repository.assertReady();

      const shared = await repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "customer_shared", displayName: "Shared brief", originalFileName: "brief.docx",
        mediaCategory: "document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileExtension: "docx", sizeBytes: 4096, checksumSha256: "a".repeat(64),
        storageAdapterKey: "test-adapter", storageObjectReference: "opaque:test-shared",
      });
      assetIds.push(shared.assetId);
      assert.equal(shared.uploadStatus, "pending");
      assert.deepEqual(await repository.listForApplication(tenantId, applicationId), []);

      const restricted = await repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Private image", originalFileName: "private.png",
        mediaCategory: "image", mimeType: "image/png", fileExtension: "png",
        sizeBytes: 1024, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:test-restricted",
      });
      assetIds.push(restricted.assetId);
      await assert.rejects(() => repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "application_restricted", ownerApplicationId: otherApplication,
        displayName: "Wrong owner", originalFileName: "wrong.png",
        mediaCategory: "image", mimeType: "image/png", fileExtension: "png",
        sizeBytes: 1024, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:wrong-owner",
      }), /OWNER_APPLICATION_MISMATCH/);

      const idempotencyKey = "asset-upload-" + randomUUID();
      const expiry = new Date(Date.now() + 10 * 60_000).toISOString();
      const reserveInput = {
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        assetId: shared.assetId, expectedSizeBytes: 4096, idempotencyKey,
        providerUploadReference: "opaque-upload:test-session", expiresAt: expiry,
      };
      const sessionId = await repository.reserveUpload(reserveInput);
      assert.equal(await repository.reserveUpload(reserveInput), sessionId);

      const linkKey = "asset-link-" + randomUUID();
      await repository.link({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        idempotencyKey: linkKey, assetId: shared.assetId, reason: "integration-test",
      });
      await repository.link({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        idempotencyKey: linkKey, assetId: shared.assetId, reason: "integration-test",
      });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)", [tenantId, applicationId]);
        const links = await client.query(
          "SELECT asset_id FROM eper_customer_asset_application_links WHERE tenant_id = $1 AND application_id = $2 AND asset_id = $3",
          [tenantId, applicationId, shared.assetId],
        );
        assert.equal(links.rows.length, 1);
        const sessions = await client.query(
          "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND asset_id = $2",
          [tenantId, shared.assetId],
        );
        assert.equal(sessions.rows.length, 1);
        const audit = await client.query(
          "SELECT action FROM eper_audit_events WHERE tenant_id = $1 AND correlation_id = $2 AND action IN ('customer.asset.metadata.create', 'customer.asset.upload.reserve', 'customer.asset.application.link')",
          [tenantId, correlationId],
        );
        assert.equal(audit.rows.length, 4, "two creates, one upload reservation and one link are audited once each");
        await client.query("COMMIT");
      } finally {
        try { await client.query("ROLLBACK"); } catch { /* no active transaction */ }
        client.release();
      }

      assert.deepEqual(await repository.listForApplication(otherTenant, applicationId), []);
      assert.deepEqual(await repository.listForApplication(tenantId, otherApplication), []);
    } finally {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1", [tenantId]);
        await client.query("DELETE FROM eper_customer_asset_application_links WHERE tenant_id = $1", [tenantId]);
        await client.query("DELETE FROM eper_customer_assets WHERE tenant_id = $1", [tenantId]);
        await client.query("COMMIT");
      } finally {
        try { await client.query("ROLLBACK"); } catch { /* no active transaction */ }
        client.release();
      }
      await pool.end();
    }
  });
