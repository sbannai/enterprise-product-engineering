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
      assert.deepEqual(await repository.getPendingUploadAsset(tenantId, applicationId, shared.assetId), shared,
        "the creating application can retrieve its pending shared asset for upload completion");
      assert.equal(await repository.getPendingUploadAsset(tenantId, otherApplication, shared.assetId), null,
        "another application cannot retrieve an unlinked pending shared asset");
      assert.equal(await repository.getPendingUploadAsset(otherTenant, applicationId, shared.assetId), null,
        "another tenant cannot retrieve the pending asset");

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
      const verificationSession = await repository.getUploadSessionForVerification(
        tenantId, applicationId, reservedSessionId,
      );
      assert.equal(verificationSession?.assetId, reservedAsset.assetId);
      assert.equal(verificationSession?.providerUploadReference, "opaque-upload:finalized-reservation");
      assert.equal(await repository.getUploadSessionForVerification(
        tenantId, otherApplication, reservedSessionId,
      ), null, "provider verification cannot resolve a session from another application");

      const expiryClient = await pool.connect();
      try {
        await expiryClient.query("BEGIN");
        await expiryClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        await expiryClient.query(
          "UPDATE eper_customer_asset_upload_sessions SET expires_at = now() - interval '1 second' WHERE tenant_id = $1 AND upload_session_id = $2",
          [tenantId, reservedSessionId],
        );
        await expiryClient.query("COMMIT");
      } finally {
        try { await expiryClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        expiryClient.release();
      }
      assert.equal(await repository.getUploadSessionForVerification(
        tenantId, applicationId, reservedSessionId,
      ), null, "expired sessions must not be handed to the provider verifier");
      await assert.rejects(() => repository.completeUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: reservedSessionId, receivedSizeBytes: 2048,
        observedMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        checksumSha256: "e".repeat(64), scanStatus: "pending",
      }), /UPLOAD_SESSION_EXPIRED/,
      "an expired provider grant cannot be completed or promoted to scanning");

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
      assert.equal(await repository.getDownloadAsset(tenantId, applicationId, failedAsset.assetId), null,
        "provider failure must never make a pending asset downloadable");
      await assert.rejects(() => repository.completeUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: failedReservationId, receivedSizeBytes: 1536,
        observedMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        checksumSha256: "d".repeat(64), scanStatus: "pending",
      }), /UPLOAD_SESSION_NOT_COMPLETABLE/,
      "a failed provider reservation cannot be completed or promoted to scanning");

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
      // Simulate a worker that finishes after its lease has expired. A replacement
      // worker must acquire the job; the stale worker must not publish its result.
      const leaseExpiryClient = await pool.connect();
      try {
        await leaseExpiryClient.query("BEGIN");
        await leaseExpiryClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        await leaseExpiryClient.query(
          "UPDATE eper_customer_asset_scan_jobs SET lease_expires_at = now() - interval '1 second' WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3",
          [tenantId, applicationId, sessionId],
        );
        await leaseExpiryClient.query("COMMIT");
      } finally {
        try { await leaseExpiryClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        leaseExpiryClient.release();
      }
      assert.equal(await repository.getUploadSessionForScanning(
        tenantId, applicationId, sessionId, workerId,
      ), null, "expired lease cannot expose provider object to stale worker");
      assert.equal(await repository.renewScanJobLease({
        tenantId, applicationId, uploadSessionId: sessionId, workerId, leaseMs: 60_000,
      }), false, "expired lease cannot be renewed by stale worker");
      const replacementWorkerId = "asset-scanner:replacement-worker";
      const replacementClaims = await repository.claimScanJobs({
        tenantId, applicationId, workerId: replacementWorkerId, scannerServiceId: "asset-scanner",
        environment: "uat", limit: 10, leaseMs: 60_000,
      });
      assert.ok(replacementClaims.some((job) => job.uploadSessionId === sessionId),
        "replacement worker reclaims expired scan job");
      await assert.rejects(() => repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner", workerId, environment: "uat",
        correlationId, uploadSessionId: sessionId, scanStatus: "clean",
      }), /SCAN_LEASE_LOST/, "stale worker cannot publish a clean result");
      const clean = await repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner", workerId: replacementWorkerId, environment: "uat",
        correlationId, uploadSessionId: sessionId, scanStatus: "clean",
      });
      assert.equal(clean.uploadStatus, "available");
      assert.equal(clean.scanStatus, "clean");
      assert.equal(clean.checksumSha256, "b".repeat(64));
      const authorizedDownload = await repository.getDownloadAsset(tenantId, applicationId, shared.assetId);
      assert.deepEqual(authorizedDownload, {
        accessReference: "opaque:test-shared", fileName: "brief.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }, "download lookup returns the private provider reference only for an available clean asset");
      assert.equal(await repository.getDownloadAsset(tenantId, otherApplication, shared.assetId), null,
        "another application cannot download a shared asset without an explicit link");
      assert.equal(await repository.getDownloadAsset(otherTenant, applicationId, shared.assetId), null,
        "another tenant cannot download the asset");

      assert.deepEqual(await repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner", workerId: replacementWorkerId, environment: "uat",
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
      assert.equal(await repository.getDownloadAsset(tenantId, applicationId, restricted.assetId), null,
        "quarantined/infected assets cannot be downloaded");
      assert.deepEqual(await repository.listForApplication(tenantId, applicationId), [clean],
        "infected assets must never appear in the available asset listing");

      // Independent recovery must finalize exhausted leases without another scanner claim.
      const exhaustedAsset = await repository.create({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Exhausted scan test", originalFileName: "exhausted.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 512, storageAdapterKey: "test-adapter",
        storageObjectReference: "opaque:test-exhausted",
      });
      assetIds.push(exhaustedAsset.assetId);
      const exhaustedSession = await repository.reserveUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        assetId: exhaustedAsset.assetId, expectedSizeBytes: 512,
        idempotencyKey: "asset-exhausted-" + randomUUID(),
        providerUploadReference: "opaque-upload:exhausted",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      await repository.completeUpload({
        tenantId, applicationId, actorId, environment: "uat", correlationId,
        uploadSessionId: exhaustedSession, receivedSizeBytes: 512,
        observedMimeType: "application/pdf", checksumSha256: "f".repeat(64), scanStatus: "pending",
      });
      const exhaustedWorker = "asset-scanner:crashed-worker";
      const exhaustedClaim = await repository.claimScanJobs({
        tenantId, applicationId, workerId: exhaustedWorker, scannerServiceId: "asset-scanner",
        environment: "uat", limit: 10, leaseMs: 5_000,
      });
      assert.ok(exhaustedClaim.some((job) => job.uploadSessionId === exhaustedSession));
      const expireClient = await pool.connect();
      try {
        await expireClient.query("BEGIN");
        await expireClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        await expireClient.query(
          "UPDATE eper_customer_asset_scan_jobs SET attempt_count = max_attempts, lease_expires_at = now() - interval '1 second' WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3",
          [tenantId, applicationId, exhaustedSession],
        );
        await expireClient.query("COMMIT");
      } finally {
        try { await expireClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        expireClient.release();
      }
      const recovered = await Promise.all([
        repository.recoverExhaustedScanJobs({
          tenantId, applicationId, scannerServiceId: "asset-scan-recovery", environment: "uat", limit: 10,
        }),
        repository.recoverExhaustedScanJobs({
          tenantId, applicationId, scannerServiceId: "asset-scan-recovery", environment: "uat", limit: 10,
        }),
      ]);
      assert.equal(recovered.reduce((sum, count) => sum + count, 0), 1,
        "concurrent independent sweeps finalize an exhausted lease exactly once");
      assert.equal(await repository.recoverExhaustedScanJobs({
        tenantId, applicationId, scannerServiceId: "asset-scan-recovery", environment: "uat", limit: 10,
      }), 0, "repeated recovery sweep is idempotent");
      const recoveredClient = await pool.connect();
      try {
        await recoveredClient.query("BEGIN");
        await recoveredClient.query(
          "SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)",
          [tenantId, applicationId],
        );
        const recoveredRows = await recoveredClient.query(
          "SELECT j.state, a.upload_status, a.scan_status, a.lifecycle_status FROM eper_customer_asset_scan_jobs j JOIN eper_customer_assets a ON a.tenant_id = j.tenant_id AND a.asset_id = j.asset_id WHERE j.tenant_id = $1 AND j.application_id = $2 AND j.upload_session_id = $3",
          [tenantId, applicationId, exhaustedSession],
        );
        assert.deepEqual(recoveredRows.rows[0], {
          state: "dead_letter", upload_status: "failed", scan_status: "error", lifecycle_status: "quarantined",
        });
        const recoveryAudit = await recoveredClient.query(
          "SELECT action, actor_id FROM eper_audit_events WHERE tenant_id = $1 AND correlation_id = $2 AND action = 'customer.asset.scan.exhausted'",
          [tenantId, correlationId],
        );
        assert.ok(recoveryAudit.rows.some((row) => row.actor_id === "asset-scan-recovery"),
          "independent recovery writes its audit event in the same transaction");
        await recoveredClient.query("COMMIT");
      } finally {
        try { await recoveredClient.query("ROLLBACK"); } catch { /* no active transaction */ }
        recoveredClient.release();
      }

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
          "SELECT action FROM eper_audit_events WHERE tenant_id = $1 AND correlation_id = $2 AND action IN ('customer.asset.metadata.create', 'customer.asset.upload.reserve', 'customer.asset.upload.grant.finalize', 'customer.asset.upload.reserve.fail', 'customer.asset.application.link', 'customer.asset.upload.complete', 'customer.asset.scan.complete')",
          [tenantId, correlationId],
        );
        assert.equal(audit.rows.length, 18, "the original asset lifecycle mutations are audited once each; the independent exhausted-scan recovery audit is asserted separately");
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
          new Set([shared.assetId, restricted.assetId, reservedAsset.assetId, failedAsset.assetId, exhaustedAsset.assetId]),
          "RLS role sees only assets linked to or owned by its current application");
        const sameApplicationSessions = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
          [tenantId],
        );
        assert.equal(sameApplicationSessions.rows.length, 5,
          "all initiated, reserved and failed upload sessions remain bound to their creating application");
        await restrictedRoleClient.query(
          "SELECT set_config('eper.application_id', $1, true)", [otherApplication],
        );
        const crossApplicationAssets = await restrictedRoleClient.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1", [tenantId],
        );
        assert.equal(crossApplicationAssets.rows.length, 0,
          "database RLS denies cross-application asset reads even for direct SQL");
        const crossApplicationSessions = await restrictedRoleClient.query(
          "SELECT upload_session_id FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1",
          [tenantId],
        );
        assert.equal(crossApplicationSessions.rows.length, 0,
          "database RLS denies cross-application upload-session reads");
        await restrictedRoleClient.query(
          "SELECT set_config('eper.tenant_id', $1, true)", [otherTenant],
        );
        const crossTenantAssets = await restrictedRoleClient.query(
          "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1", [tenantId],
        );
        assert.equal(crossTenantAssets.rows.length, 0,
          "database RLS denies cross-tenant reads");
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
