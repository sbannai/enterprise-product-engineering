import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresCustomerAssetRepository } from "../dist/packages/assets/postgres-customer-asset-repository.js";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

test("live PostgreSQL customer asset upload reservation replay, fingerprint conflicts, audit and tenant/application isolation",
  { skip: !connectionString || process.env.EPER_CUSTOMER_ASSET_LIVE_TESTS !== "1" }, async () => {
    const pool = new Pool({ connectionString, max: 8 });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "asset-tenant-" + suffix.slice(0, 20);
    const applicationId = "asset-app-" + suffix.slice(0, 20);
    const otherApplicationId = "asset-other-" + suffix.slice(0, 20);
    const actorId = "asset-actor-" + suffix.slice(0, 20);
    const otherActorId = "asset-other-actor-" + suffix.slice(0, 18);
    const assetId = randomUUID();
    const idempotencyKey = "asset-upload-" + suffix.slice(0, 32);
    const fingerprint = createHash("sha256").update("immutable-upload-request-" + suffix).digest("hex");
    const correlationId = "asset-recovery-" + suffix;
    const repository = new PostgresCustomerAssetRepository(pool);

    try {
      await repository.assertReady();
      await repository.create({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Upload recovery integration fixture", originalFileName: "fixture.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 4096, storageAdapterKey: "ci-storage",
        storageObjectReference: "opaque-ci-object-" + suffix,
      });

      const reservationInput = {
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, expectedSizeBytes: 4096, idempotencyKey, requestFingerprint: fingerprint,
      };
      const [first, concurrentReplay] = await Promise.all([
        repository.reserveUpload(reservationInput),
        repository.reserveUpload(reservationInput),
      ]);
      assert.equal(first.uploadSessionId, concurrentReplay.uploadSessionId,
        "concurrent requests with one idempotency key must resolve to one durable session");
      assert.equal(first.uploadStatus, "initiated");
      assert.equal(first.providerUploadReference, null);
      assert.ok(Date.parse(first.expiresAt) > Date.now());

      await assert.rejects(
        repository.reserveUpload({ ...reservationInput, actorId: otherActorId }),
        { message: "EPER_CUSTOMER_ASSET_UPLOAD_IDEMPOTENCY_CONFLICT" },
      );
      await assert.rejects(
        repository.reserveUpload({ ...reservationInput, requestFingerprint: "a".repeat(64) }),
        { message: "EPER_CUSTOMER_ASSET_UPLOAD_IDEMPOTENCY_CONFLICT" },
      );

      const grantExpiry = new Date(Date.now() + 60_000).toISOString();
      await repository.recordUploadGrant({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, uploadSessionId: first.uploadSessionId, requestFingerprint: fingerprint,
        providerUploadReference: "opaque-provider-object-" + suffix, grantExpiresAt: grantExpiry,
      });
      const recovered = await repository.reserveUpload(reservationInput);
      assert.equal(recovered.uploadSessionId, first.uploadSessionId);
      assert.equal(recovered.providerUploadReference, "opaque-provider-object-" + suffix);
      assert.equal(recovered.uploadStatus, "initiated");
      assert.ok(recovered.providerGrantExpiresAt);

      await assert.rejects(
        repository.reserveUpload({
          ...reservationInput, applicationId: otherApplicationId,
        }),
        /EPER_CUSTOMER_ASSET_NOT_FOUND|duplicate key|unique constraint/i,
        "another application must not recover the reservation or learn its session",
      );

      const persisted = await pool.query(
        `SELECT upload_session_id, actor_id, request_fingerprint,
                provider_upload_reference, provider_grant_expires_at, last_recovered_at
           FROM eper_customer_asset_upload_sessions
          WHERE tenant_id = $1 AND application_id = $2 AND idempotency_key = $3`,
        [tenantId, applicationId, idempotencyKey],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].upload_session_id, first.uploadSessionId);
      assert.equal(persisted.rows[0].actor_id, actorId);
      assert.equal(persisted.rows[0].request_fingerprint, fingerprint);
      assert.equal(persisted.rows[0].provider_upload_reference, "opaque-provider-object-" + suffix);
      assert.ok(persisted.rows[0].provider_grant_expires_at);
      assert.ok(persisted.rows[0].last_recovered_at);

      const audit = await pool.query(
        `SELECT action, outcome, payload
           FROM eper_audit_events
          WHERE tenant_id = $1 AND application_id = $2
            AND resource_id = $3
            AND action IN ('customer.asset.metadata.create',
                           'customer.asset.upload.reserve',
                           'customer.asset.upload.grant.recover')
          ORDER BY created_at`,
        [tenantId, applicationId, first.uploadSessionId],
      );
      assert.ok(audit.rows.some(row => row.action === "customer.asset.upload.reserve" && row.outcome === "success"));
      assert.ok(audit.rows.some(row => row.action === "customer.asset.upload.grant.recover" && row.outcome === "success"));
      const serializedAudit = JSON.stringify(audit.rows);
      assert.doesNotMatch(serializedAudit, /https:\/\/|signed_url|bearer_token|access_token/i);
    } finally {
      await pool.end();
    }
  });
