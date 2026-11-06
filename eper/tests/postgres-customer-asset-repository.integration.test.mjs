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
    // Simulate the dedicated worker login-group role for each repository
    // transaction. The login itself remains operator-provisioned.
    const workerPool = {
      async connect() {
        const client = await pool.connect();
        let roleApplied = false;
        return {
          async query(sql, values) {
            const result = await client.query(sql, values);
            if (!roleApplied && typeof sql === "string" && sql.trim().toUpperCase() === "BEGIN") {
              await client.query("SET LOCAL ROLE eper_customer_asset_upload_expiry_worker_access");
              roleApplied = true;
            }
            return result;
          },
          release() { client.release(); },
        };
      },
    };
    const workerRepository = new PostgresCustomerAssetRepository(workerPool);
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

      // A separate asset is required because the schema permits only one upload
      // session per tenant/asset; keep the provider-free reservation independent
      // from the provider-bound session exercised below.
      const reservedAsset = await repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Reservation test file", originalFileName: "reservation.xlsx",
        mediaCategory: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileExtension: "xlsx", sizeBytes: 2048, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:test-reservation",
      });
      assetIds.push(reservedAsset.assetId);

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
      await assert.rejects(() => repository.reserveUpload({
        ...reserveInput, idempotencyKey: "asset-expired-" + randomUUID(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }), /UPLOAD_EXPIRY_INVALID/);
      const sessionId = await repository.reserveUpload(reserveInput);
      assert.equal(await repository.reserveUpload(reserveInput), sessionId);

      const linkKey = "asset-link-" + randomUUID();
      const concurrentReservations = await Promise.all(
        Array.from({ length: 5 }, () => repository.reserveUpload(reserveInput)),
      );
      assert.deepEqual(new Set(concurrentReservations), new Set([sessionId]),
        "concurrent retries for the same tenant/idempotency key must converge on one session");

      // Exercise the provider-free reservation path used before a storage
      // provider is allowed to mint a capability.
      const reservedKey = "asset-reserved-" + randomUUID();
      const reservationInput = {
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        assetId: reservedAsset.assetId, expectedSizeBytes: 2048, idempotencyKey: reservedKey,
      };
      const reservationIds = await Promise.all(
        Array.from({ length: 5 }, () => repository.reserveUpload(reservationInput)),
      );
      assert.equal(new Set(reservationIds).size, 1,
        "concurrent provider-free reservations must converge on one durable session");
      const reservedSessionId = reservationIds[0];
      const reservationClient = await pool.connect();
      try {
        await reservationClient.query("BEGIN");
        await reservationClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        const reservedRow = await reservationClient.query(
          "SELECT upload_status, provider_upload_reference FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = $2",
          [tenantId, reservedSessionId],
        );
        assert.equal(reservedRow.rows[0]?.upload_status, "reserved");
        assert.equal(reservedRow.rows[0]?.provider_upload_reference, null,
          "a reservation must not persist or expose a provider reference before grant finalization");
        await reservationClient.query("COMMIT");
      } finally {
        try { await reservationClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        reservationClient.release();
      }
      await repository.finalizeUploadGrant({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: reservedSessionId,
        providerUploadReference: "opaque-upload:finalized-reservation",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      const finalizedClient = await pool.connect();
      try {
        await finalizedClient.query("BEGIN");
        await finalizedClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        const finalizedRow = await finalizedClient.query(
          "SELECT upload_status, provider_upload_reference FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = $2",
          [tenantId, reservedSessionId],
        );
        assert.equal(finalizedRow.rows[0]?.upload_status, "initiated");
        assert.equal(finalizedRow.rows[0]?.provider_upload_reference, "opaque-upload:finalized-reservation");
        await finalizedClient.query("COMMIT");
      } finally {
        try { await finalizedClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        finalizedClient.release();
      }

      const failedAsset = await repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Failed reservation test file", originalFileName: "failed-reservation.docx",
        mediaCategory: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileExtension: "docx", sizeBytes: 1536, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:test-failed-reservation",
      });
      assetIds.push(failedAsset.assetId);
      const failedReservationId = await repository.reserveUpload({
        ...reservationInput, assetId: failedAsset.assetId, expectedSizeBytes: 1536,
        idempotencyKey: "asset-failed-" + randomUUID(),
      });
      await repository.failUploadReservation({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: failedReservationId, reason: "provider_unavailable",
      });
      const failedClient = await pool.connect();
      try {
        await failedClient.query("BEGIN");
        await failedClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        const failedRow = await failedClient.query(
          "SELECT upload_status FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = $2",
          [tenantId, failedReservationId],
        );
        assert.equal(failedRow.rows[0]?.upload_status, "failed",
          "provider failure must durably fail the reservation");
        await failedClient.query("COMMIT");
      } finally {
        try { await failedClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        failedClient.release();
      }

      // A provider failure is terminal for that attempt, not for the asset.
      // A fresh operation key must be able to reserve the same asset again.
      const retrySessionId = await repository.reserveUpload({
        ...reservationInput, assetId: failedAsset.assetId, expectedSizeBytes: 1536,
        idempotencyKey: "asset-failed-retry-" + randomUUID(),
      });
      assert.notEqual(retrySessionId, failedReservationId,
        "a terminal failed attempt must not permanently block a new upload attempt");

      const expiryAsset = await repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Expiry retry file", originalFileName: "expiry-retry.txt",
        mediaCategory: "document", mimeType: "text/plain", fileExtension: "txt",
        sizeBytes: 256, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:expiry-retry",
      });
      assetIds.push(expiryAsset.assetId);
      const expiringSessionId = await repository.reserveUpload({
        ...reservationInput, assetId: expiryAsset.assetId, expectedSizeBytes: 256,
        idempotencyKey: "asset-expiring-" + randomUUID(),
        expiresAt: new Date(Date.now() + 100).toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const afterExpirySessionId = await repository.reserveUpload({
        ...reservationInput, assetId: expiryAsset.assetId, expectedSizeBytes: 256,
        idempotencyKey: "asset-after-expiry-" + randomUUID(),
      });
      assert.notEqual(afterExpirySessionId, expiringSessionId,
        "an expired attempt must be replaced by a new reservation");
      const expiryClient = await pool.connect();
      try {
        await expiryClient.query("BEGIN");
        await expiryClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        const expiredRow = await expiryClient.query(
          "SELECT upload_status FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = $2",
          [tenantId, expiringSessionId],
        );
        assert.equal(expiredRow.rows[0]?.upload_status, "expired",
          "retry reconciliation durably marks the stale session expired");
        await expiryClient.query(
          "UPDATE eper_customer_asset_upload_sessions SET expires_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1 AND upload_session_id = $2",
          [tenantId, afterExpirySessionId],
        );
        await expiryClient.query("COMMIT");
      } finally {
        try { await expiryClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        expiryClient.release();
      }
      const workerExpiryResults = await Promise.all(Array.from({ length: 2 }, () =>
        workerRepository.expireStaleUploadSessions({
          tenantId, applicationId, environment: "uat", correlationId, limit: 10,
        }),
      ));
      assert.equal(workerExpiryResults.reduce((total, count) => total + count, 0), 1,
        "concurrent expiry workers claim and audit one stale session exactly once");
      const afterWorkerRetryId = await repository.reserveUpload({
        ...reservationInput, assetId: expiryAsset.assetId, expectedSizeBytes: 256,
        idempotencyKey: "asset-after-worker-expiry-" + randomUUID(),
      });
      assert.notEqual(afterWorkerRetryId, afterExpirySessionId,
        "a session expired by the worker no longer blocks a fresh attempt");

      // Idempotency keys are application-scoped within a tenant. A second
      // application may legitimately use the same key without seeing or
      // colliding with the first application's session.
      const otherAppAsset = await repository.create({
        tenantId, applicationId: otherApplication, actorId, environment: "uat", correlationId,
        scope: "customer_shared", displayName: "Other app upload", originalFileName: "other-app.txt",
        mediaCategory: "document", mimeType: "text/plain", fileExtension: "txt",
        sizeBytes: 512, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:other-app-upload",
      });
      assetIds.push(otherAppAsset.assetId);
      const otherAppSessionId = await repository.reserveUpload({
        tenantId, applicationId: otherApplication, actorId, environment: "uat", correlationId,
        assetId: otherAppAsset.assetId, expectedSizeBytes: 512, idempotencyKey,
      });

      assert.ok(otherAppSessionId, "the same idempotency key is independent in another application");

      // A shared asset can be uploaded by Application A and explicitly linked
      // to Application B. An expired A session must not remain a tenant-wide
      // active-index blocker merely because B cannot read A's session under RLS.
      const crossAppAsset = await repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "customer_shared", displayName: "Cross-app expiry", originalFileName: "shared-expiry.txt",
        mediaCategory: "document", mimeType: "text/plain", fileExtension: "txt",
        sizeBytes: 768, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:cross-app-expiry",
      });
      assetIds.push(crossAppAsset.assetId);
      await repository.link({
        tenantId, applicationId: otherApplication, actorId, environment: "uat", correlationId,
        idempotencyKey: "asset-cross-app-link-" + randomUUID(),
        assetId: crossAppAsset.assetId, reason: "cross-app-expiry-test",
      });
      const crossAppStaleSession = await repository.reserveUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        assetId: crossAppAsset.assetId, expectedSizeBytes: 768,
        idempotencyKey: "asset-cross-app-stale-" + randomUUID(),
      });
      const crossAppExpireClient = await pool.connect();
      try {
        await crossAppExpireClient.query("BEGIN");
        await crossAppExpireClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        await crossAppExpireClient.query(
          "UPDATE eper_customer_asset_upload_sessions SET expires_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3",
          [tenantId, applicationId, crossAppStaleSession],
        );
        await crossAppExpireClient.query("COMMIT");
      } finally {
        try { await crossAppExpireClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        crossAppExpireClient.release();
      }
      const crossAppExpiryCounts = await Promise.all([
        repository.expireStaleUploadSessions({
          tenantId, applicationId: otherApplication, environment: "uat", correlationId, limit: 10,
        }),
        repository.expireStaleUploadSessions({
          tenantId, applicationId: otherApplication, environment: "uat", correlationId, limit: 10,
        }),
      ]);
      assert.equal(crossAppExpiryCounts.reduce((sum, count) => sum + count, 0), 1,
        "tenant-bound expiry recovers an expired session created by another application exactly once");
      const crossAppRetry = await repository.reserveUpload({
        tenantId, applicationId: otherApplication, actorId, environment: "uat", correlationId,
        assetId: crossAppAsset.assetId, expectedSizeBytes: 768,
        idempotencyKey: "asset-cross-app-retry-" + randomUUID(),
      });
      assert.ok(crossAppRetry,
        "the linked application can reserve the shared asset after the prior application's session expires");


      await Promise.all(Array.from({ length: 5 }, () => repository.link({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        idempotencyKey: linkKey, assetId: shared.assetId, reason: "integration-test",
      })));

      const restrictedSessionId = await repository.reserveUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        assetId: restricted.assetId, expectedSizeBytes: 1024,
        idempotencyKey: "asset-upload-" + randomUUID(),
        providerUploadReference: "opaque-upload:restricted-session",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      await assert.rejects(() => repository.completeUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: sessionId, receivedSizeBytes: 1,
        observedMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        checksumSha256: "b".repeat(64), scanStatus: "pending",
      }), /UPLOAD_SIZE_MISMATCH/);
      await assert.rejects(() => repository.completeUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: sessionId, receivedSizeBytes: 4096,
        observedMimeType: "application/pdf",
        checksumSha256: "b".repeat(64), scanStatus: "clean",
      }), /UPLOAD_MIME_MISMATCH/);
      const completed = await repository.completeUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: sessionId, receivedSizeBytes: 4096,
        observedMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        checksumSha256: "b".repeat(64), scanStatus: "pending",
      });
      assert.equal(completed.uploadStatus, "scanning");
      const workerId = "asset-scanner:integration-worker";
      const claimed = await repository.claimScanJobs({
        tenantId, applicationId, workerId, scannerServiceId: "asset-scanner",
        environment: "uat", limit: 10, leaseMs: 60_000,
      });
      assert.equal(claimed.length, 1, "completed upload enqueues one durable scan job");
      assert.ok(claimed.some((job) => job.uploadSessionId === sessionId));
      assert.equal(await repository.renewScanJobLease({
        tenantId, applicationId, uploadSessionId: sessionId, workerId, leaseMs: 60_000,
      }), true, "the current worker can renew its active lease");
      assert.equal(await repository.renewScanJobLease({
        tenantId, applicationId, uploadSessionId: sessionId, workerId: "asset-scanner:other-worker", leaseMs: 60_000,
      }), false, "a different worker cannot renew the lease");
      const clean = await repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner", workerId, environment: "uat",
        correlationId, uploadSessionId: sessionId, scanStatus: "clean",
      });
      assert.equal(clean.uploadStatus, "available");
      assert.equal(clean.scanStatus, "clean");
      assert.equal(clean.checksumSha256, "b".repeat(64));
      assert.deepEqual(await repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner", workerId, environment: "uat",
        correlationId, uploadSessionId: sessionId, scanStatus: "clean",
      }), clean, "duplicate scanner callback is idempotent");
      await assert.rejects(() => repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner", workerId, environment: "uat",
        correlationId, uploadSessionId: sessionId, scanStatus: "infected",
      }), /SCAN_RESULT_CONFLICT/);
      await repository.completeUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: restrictedSessionId, receivedSizeBytes: 1024,
        observedMimeType: "image/png", checksumSha256: "c".repeat(64), scanStatus: "pending",
      });
      const restrictedClaims = await repository.claimScanJobs({
        tenantId, applicationId, workerId, scannerServiceId: "asset-scanner",
        environment: "uat", limit: 10, leaseMs: 60_000,
      });
      assert.ok(restrictedClaims.some((job) => job.uploadSessionId === restrictedSessionId),
        "restricted upload has a claimed scan job");
      const quarantined = await repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner", workerId, environment: "uat",
        correlationId, uploadSessionId: restrictedSessionId, scanStatus: "infected",
      });
      assert.equal(quarantined.uploadStatus, "rejected");
      assert.equal(quarantined.lifecycleStatus, "quarantined");
      assert.deepEqual(await repository.listForApplication(tenantId, applicationId), [clean],
        "infected assets must never appear in the available asset listing");

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
          "SELECT action FROM eper_audit_events WHERE tenant_id = $1 AND correlation_id = $2 AND application_id = $3 AND action IN ('customer.asset.metadata.create', 'customer.asset.upload.reserve', 'customer.asset.upload.grant.finalize', 'customer.asset.upload.reserve.fail', 'customer.asset.upload.expire', 'customer.asset.application.link', 'customer.asset.upload.complete', 'customer.asset.scan.complete')",
          [tenantId, correlationId, applicationId],
        );
        assert.equal(audit.rows.length, 26, "six creates, nine reservations, one grant finalization, one failed reservation, three expiries, two application links, two upload completions and two scan results are audited once each");
        await client.query("COMMIT");
      } finally {
        try { await client.query("ROLLBACK"); } catch { /* no active transaction */ }
        client.release();
      }

      const ownerVisible = await repository.listForApplication(tenantId, applicationId);
      assert.deepEqual(ownerVisible.map((asset) => asset.assetId), [shared.assetId],
        "the owning application sees its available, explicitly linked shared asset but not the quarantined restricted asset");
      assert.deepEqual(await repository.listForApplication(tenantId, otherApplication), [],
        "another application in the same tenant sees neither an unlinked shared asset nor a restricted asset");
      assert.deepEqual(await repository.listForApplication(otherTenant, applicationId), [],
        "another tenant sees no assets");
      // Exercise the database policies as the non-login least-privilege role,
      // not merely through the repository's application-level filters.
      const restrictedRoleClient = await pool.connect();
      try {
        await restrictedRoleClient.query("BEGIN");
        await restrictedRoleClient.query("SET LOCAL ROLE eper_customer_asset_access");
        await restrictedRoleClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        const sameApplicationAssets = await restrictedRoleClient.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1 ORDER BY asset_id",
          [tenantId],
        );
        assert.deepEqual(new Set(sameApplicationAssets.rows.map((row) => row.asset_id)),
          new Set([shared.assetId, restricted.assetId, reservedAsset.assetId, failedAsset.assetId, expiryAsset.assetId, crossAppAsset.assetId]),
          "RLS role sees only assets linked to or owned by its current application");
        const sameApplicationSessions = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
          [tenantId],
        );
        assert.equal(sameApplicationSessions.rows.length, 9,
          "all initiated, reserved and failed upload sessions remain bound to their creating application");
        await restrictedRoleClient.query(
          "SELECT set_config('eper.application_id', $1, true)", [otherApplication],
        );
        const crossApplicationAssets = await restrictedRoleClient.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1", [tenantId],
        );
        assert.deepEqual(new Set(crossApplicationAssets.rows.map((row) => row.asset_id)), new Set([otherAppAsset.assetId, crossAppAsset.assetId]),
          "database RLS exposes only the explicitly linked shared asset to the other application");
        const crossApplicationSessions = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
          [tenantId],
        );
        assert.deepEqual(new Set(crossApplicationSessions.rows.map((row) => row.upload_session_id)), new Set([otherAppSessionId, crossAppRetry]),
          "database RLS exposes only the other application's own upload session");
        await restrictedRoleClient.query(
          "SELECT set_config('eper.tenant_id', $1, true)", [otherTenant],
        );
        const crossTenantAssets = await restrictedRoleClient.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1", [tenantId],
        );
        assert.equal(crossTenantAssets.rows.length, 0,
          "database RLS denies cross-tenant reads");
        const crossTenantSessions = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
          [tenantId],
        );
        assert.equal(crossTenantSessions.rows.length, 0,
          "database RLS denies cross-tenant upload-session reads");
        const crossTenantExpiry = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM public.eper_expire_customer_asset_upload_sessions($1, 10)",
          [otherTenant],
        );
        assert.equal(crossTenantExpiry.rows.length, 0,
          "the tenant-bound expiry routine cannot return another tenant's sessions");
        await restrictedRoleClient.query("SAVEPOINT deny_expiry_tenant_switch");
        await assert.rejects(
          restrictedRoleClient.query(
            "SELECT upload_session_id FROM public.eper_expire_customer_asset_upload_sessions($1, 10)",
            [tenantId],
          ),
          /TENANT_CONTEXT_MISMATCH/i,
          "the function cannot switch away from the caller's bound tenant",
        );
        await restrictedRoleClient.query("ROLLBACK TO SAVEPOINT deny_expiry_tenant_switch");
        await restrictedRoleClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, otherApplication],
        );
        const hiddenCrossApplicationSession = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1 AND upload_session_id = $2",
          [tenantId, crossAppStaleSession],
        );
        assert.equal(hiddenCrossApplicationSession.rows.length, 0,
          "Application B cannot directly read Application A's expired session");
        const deniedCrossApplicationUpdate = await restrictedRoleClient.query(
          "UPDATE eper_customer_asset_upload_sessions SET updated_at = clock_timestamp() WHERE tenant_id = $1 AND upload_session_id = $2 RETURNING upload_session_id",
          [tenantId, crossAppStaleSession],
        );
        assert.equal(deniedCrossApplicationUpdate.rows.length, 0,
          "Application B cannot directly update Application A's session");
        const permittedTenantExpiry = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM public.eper_expire_customer_asset_upload_sessions($1, 10)",
          [tenantId],
        );
        assert.equal(permittedTenantExpiry.rows.length, 0,
          "the customer-asset runtime role may invoke the narrow expiry routine for its bound tenant");
        await restrictedRoleClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [otherTenant, applicationId],
        );
        const deniedCrossTenantSessionUpdate = await restrictedRoleClient.query(
          "UPDATE eper_customer_asset_upload_sessions SET upload_status = 'expired' WHERE tenant_id = $1 AND upload_session_id = $2 RETURNING upload_session_id",
          [tenantId, crossAppStaleSession],
        );
        assert.equal(deniedCrossTenantSessionUpdate.rows.length, 0,
          "database RLS denies cross-tenant upload-session updates");
        await restrictedRoleClient.query("SAVEPOINT deny_cross_tenant_asset_insert");
        await assert.rejects(restrictedRoleClient.query(
          `INSERT INTO eper_customer_assets (
            tenant_id, asset_id, repository_scope, display_name, original_file_name,
            media_category, mime_type, file_extension, size_bytes, storage_adapter_key,
            storage_object_reference, created_by, updated_by
          ) VALUES ($1,$2,'customer_shared','Denied','denied.txt','document','text/plain',
                    'txt',1,'test-adapter','opaque:denied','role-test','role-test')`,
          [tenantId, randomUUID()],
        ), /row-level security/i);
        await restrictedRoleClient.query("ROLLBACK TO SAVEPOINT deny_cross_tenant_asset_insert");
        await restrictedRoleClient.query("COMMIT");
      } finally {
        try { await restrictedRoleClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        restrictedRoleClient.release();
      }

      // The dedicated worker role has no direct table access beyond its narrow
      // function and append-only audit operations.
      const expiryWorkerRoleClient = await pool.connect();
      try {
        await expiryWorkerRoleClient.query("BEGIN");
        await expiryWorkerRoleClient.query("SET LOCAL ROLE eper_customer_asset_upload_expiry_worker_access");
        await expiryWorkerRoleClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        const workerChainHead = await expiryWorkerRoleClient.query(
          "SELECT singleton FROM eper_audit_chain_head WHERE singleton = TRUE",
        );
        assert.equal(workerChainHead.rows.length, 1,
          "worker may read the single audit chain head required for append");
        const workerExpiryNoop = await expiryWorkerRoleClient.query(
          "SELECT upload_session_id FROM public.eper_expire_customer_asset_upload_sessions($1, 10)",
          [tenantId],
        );
        assert.equal(workerExpiryNoop.rows.length, 0,
          "worker may invoke only the tenant-bound expiry routine");
        for (const [savepoint, sql, values] of [
          ["deny_worker_session_read", "SELECT upload_session_id FROM eper_customer_asset_upload_sessions LIMIT 1", []],
          ["deny_worker_session_update", "UPDATE eper_customer_asset_upload_sessions SET upload_status = 'expired' WHERE tenant_id = $1 RETURNING upload_session_id", [tenantId]],
          ["deny_worker_asset_read", "SELECT asset_id FROM eper_customer_assets LIMIT 1", []],
          ["deny_worker_payment_read", "SELECT id FROM eper_payment_orders LIMIT 1", []],
          ["deny_worker_provider_read", "SELECT connection_id FROM eper_provider_connections LIMIT 1", []],
        ]) {
          await expiryWorkerRoleClient.query("SAVEPOINT " + savepoint);
          await assert.rejects(expiryWorkerRoleClient.query(sql, values), /permission denied/i,
            "worker role must not have direct access to " + savepoint);
          await expiryWorkerRoleClient.query("ROLLBACK TO SAVEPOINT " + savepoint);
        }
        await expiryWorkerRoleClient.query("COMMIT");
      } finally {
        try { await expiryWorkerRoleClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        expiryWorkerRoleClient.release();
      }

    } finally {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM eper_customer_asset_scan_jobs WHERE tenant_id = $1", [tenantId]);
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
