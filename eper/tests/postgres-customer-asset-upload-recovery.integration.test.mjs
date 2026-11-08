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
      await pool.query(
        "INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id, enabled) VALUES (session_user, $1, true) ON CONFLICT (login_role, tenant_id) DO UPDATE SET enabled = true, updated_at = now()",
        [tenantId],
      );
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
        assetId, expectedSizeBytes: 4096, expectedChecksumSha256: "a".repeat(64), idempotencyKey, requestFingerprint: fingerprint,
      };
      const [first, concurrentReplay] = await Promise.all([
        repository.reserveUpload(reservationInput),
        repository.reserveUpload(reservationInput),
      ]);
      assert.equal(first.uploadSessionId, concurrentReplay.uploadSessionId,
        "concurrent requests with one idempotency key must resolve to one durable session");
      assert.deepEqual(new Set([first.disposition, concurrentReplay.disposition]), new Set(["created", "replayed"]),
        "exactly one concurrent reservation wins creation and the other is classified as replay");
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
      assert.equal(recovered.disposition, "replayed");
      assert.equal(recovered.uploadSessionId, first.uploadSessionId);
      assert.equal(recovered.providerUploadReference, "opaque-provider-object-" + suffix);
      assert.equal(recovered.uploadStatus, "initiated");
      assert.ok(recovered.providerGrantExpiresAt);

      const rejectedAssetId = randomUUID();
      const rejectedKey = "asset-reject-" + suffix.slice(0, 32);
      await repository.create({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId: rejectedAssetId, scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Definitive provider rejection fixture", originalFileName: "rejected.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 512, storageAdapterKey: "ci-storage",
        storageObjectReference: "opaque-rejected-asset-" + suffix,
      });
      const rejectedReservation = await repository.reserveUpload({
        ...reservationInput, assetId: rejectedAssetId, expectedSizeBytes: 512,
        idempotencyKey: rejectedKey,
        requestFingerprint: createHash("sha256").update("rejected-" + suffix).digest("hex"),
      });
      await repository.recordUploadProviderRejection({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId: rejectedAssetId, uploadSessionId: rejectedReservation.uploadSessionId,
        rejectionCode: "policy_denied",
      });
      const rejectedState = await pool.query(
        `SELECT upload_status, provider_outcome, provider_upload_reference
           FROM eper_customer_asset_upload_sessions
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3`,
        [tenantId, applicationId, rejectedReservation.uploadSessionId],
      );
      assert.deepEqual(rejectedState.rows[0], {
        upload_status: "failed", provider_outcome: "rejected", provider_upload_reference: null,
      });
      const rejectionAudit = await pool.query(
        `SELECT application_id, action, reason_code, outcome, payload FROM eper_audit_events
          WHERE tenant_id = $1 AND application_id = $2 AND resource_id = $3
            AND action = 'customer.asset.upload.provider.reject'`,
        [tenantId, applicationId, rejectedReservation.uploadSessionId],
      );
      assert.equal(rejectionAudit.rowCount, 1);
      assert.equal(rejectionAudit.rows[0].outcome, "failure");
      assert.equal(rejectionAudit.rows[0].payload.rejectionCode, "policy_denied");

      await assert.rejects(
        repository.reserveUpload({
          ...reservationInput, applicationId: otherApplicationId,
        }),
        { message: "EPER_CUSTOMER_ASSET_UPLOAD_ALREADY_ACTIVE" },
        "application-scoped idempotency permits an independent key scope, while tenant-wide active uniqueness prevents a second live upload for the same asset",
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
        `SELECT application_id, action, reason_code, outcome, payload
           FROM eper_audit_events
          WHERE tenant_id = $1 AND application_id IN ($2, $5)
            AND resource_id IN ($3, $4)
            AND action IN ('customer.asset.metadata.create',
                           'customer.asset.upload.reserve',
                           'customer.asset.upload.grant.recover')
          ORDER BY occurred_at`,
        [tenantId, applicationId, first.uploadSessionId, assetId, otherApplicationId],
      );
      assert.ok(audit.rows.some(row => row.action === "customer.asset.upload.reserve" && row.outcome === "success"));
      assert.ok(audit.rows.some(row => row.action === "customer.asset.upload.grant.recover" && row.outcome === "success"));
      assert.ok(audit.rows.filter(row => row.action === "customer.asset.upload.reserve" && row.outcome === "denied").length >= 3,
        "actor, fingerprint and cross-application idempotency conflicts must leave durable denial evidence");
      assert.ok(audit.rows.some(row =>
        row.application_id === otherApplicationId &&
        row.action === "customer.asset.upload.reserve" &&
        row.outcome === "denied" &&
        row.reason_code === "active_upload_conflict" &&
        row.payload.assetId === assetId),
        "cross-application active-upload denial must be audited in the requesting application without disclosing the owner");
      const serializedAudit = JSON.stringify(audit.rows);
      assert.doesNotMatch(serializedAudit, /https:\/\/|signed_url|bearer_token|access_token/i);

      // Exercise the real PostgreSQL upload-completion -> transactional scan
      // outbox -> leased worker -> trusted scanner result lifecycle.
      const scanAssetId = randomUUID();
      const scanIdempotencyKey = "asset-scan-" + suffix.slice(0, 32);
      const scanFingerprint = createHash("sha256").update("scan-lifecycle-" + suffix).digest("hex");
      await repository.create({
        tenantId, applicationId, actorId, environment: "sandbox",
        correlationId: correlationId + "-scan", assetId: scanAssetId,
        scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Scan lifecycle integration fixture", originalFileName: "scan-fixture.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 2048, storageAdapterKey: "ci-storage",
        storageObjectReference: "opaque-scan-object-" + suffix,
      });
      const scanReservation = await repository.reserveUpload({
        tenantId, applicationId, actorId, environment: "sandbox",
        correlationId: correlationId + "-scan", assetId: scanAssetId,
        expectedSizeBytes: 2048, expectedChecksumSha256: createHash("sha256").update("verified-binary-content-" + suffix).digest("hex"), idempotencyKey: scanIdempotencyKey,
        requestFingerprint: scanFingerprint,
      });
      await repository.recordUploadGrant({
        tenantId, applicationId, actorId, environment: "sandbox",
        correlationId: correlationId + "-scan", assetId: scanAssetId,
        uploadSessionId: scanReservation.uploadSessionId,
        requestFingerprint: scanFingerprint,
        providerUploadReference: "opaque-scan-provider-ref-" + suffix,
        grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const checksum = createHash("sha256").update("verified-binary-content-" + suffix).digest("hex");
      const completed = await repository.completeUpload({
        tenantId, applicationId, actorId, environment: "sandbox",
        correlationId: correlationId + "-scan",
        uploadSessionId: scanReservation.uploadSessionId,
        receivedSizeBytes: 2048, observedMimeType: "application/pdf",
        checksumSha256: checksum, scanStatus: "pending",
      });
      assert.equal(completed.uploadStatus, "scanning");
      assert.equal(completed.scanStatus, "pending");
      assert.equal(completed.checksumSha256, checksum);

      const [scanJob] = await repository.claimScanJobs({
        tenantId, applicationId, workerId: "asset-scan-worker-" + suffix.slice(0, 16),
        scannerServiceId: "asset-scanner-" + suffix.slice(0, 16),
        environment: "sandbox", limit: 5, leaseMs: 60_000,
      });
      assert.ok(scanJob, "completion must enqueue a scan job atomically");
      assert.equal(scanJob.uploadSessionId, scanReservation.uploadSessionId);
      const workerId = "asset-scan-worker-" + suffix.slice(0, 16);
      const scanInput = await repository.getUploadSessionForScanning(
        tenantId, applicationId, scanReservation.uploadSessionId, workerId,
      );
      assert.ok(scanInput);
      assert.equal(scanInput.checksumSha256, checksum);
      assert.equal(scanInput.providerUploadReference, "opaque-scan-provider-ref-" + suffix);
      await assert.rejects(
        repository.recordScanResult({
          tenantId, applicationId, scannerServiceId: "asset-scanner-" + suffix.slice(0, 16),
          workerId: "different-worker-" + suffix.slice(0, 16), environment: "sandbox",
          correlationId: correlationId + "-scan", uploadSessionId: scanReservation.uploadSessionId,
          scanStatus: "clean",
        }),
        { message: "EPER_CUSTOMER_ASSET_SCAN_LEASE_LOST" },
        "a worker without the active lease cannot publish a clean result",
      );
      const scanned = await repository.recordScanResult({
        tenantId, applicationId, scannerServiceId: "asset-scanner-" + suffix.slice(0, 16),
        workerId, environment: "sandbox", correlationId: correlationId + "-scan",
        uploadSessionId: scanReservation.uploadSessionId, scanStatus: "clean",
      });
      assert.equal(scanned.uploadStatus, "available");
      assert.equal(scanned.scanStatus, "clean");
      assert.equal(scanned.lifecycleStatus, "active");
      const visible = await repository.listForApplication(tenantId, applicationId);
      assert.ok(visible.some(asset => asset.assetId === scanAssetId),
        "only the clean, completed asset becomes visible in application listing");
      const scanAudit = await pool.query(
        `SELECT action, outcome, resource_type, resource_id, payload
           FROM eper_audit_events
          WHERE tenant_id = $1 AND application_id = $2
            AND (
              (action = 'customer.asset.upload.complete'
                AND resource_type = 'customer-asset-upload' AND resource_id = $3)
              OR
              (action = 'customer.asset.scan.complete'
                AND resource_type = 'customer-asset' AND resource_id = $4)
            )
          ORDER BY occurred_at`,
        [tenantId, applicationId, scanReservation.uploadSessionId, scanAssetId],
      );
      const uploadCompleteAudit = scanAudit.rows.find((row) =>
        row.action === "customer.asset.upload.complete" &&
        row.outcome === "success" &&
        row.resource_id === scanReservation.uploadSessionId);
      assert.ok(uploadCompleteAudit, "upload completion audit must be keyed by its durable upload session");
      assert.equal(uploadCompleteAudit.payload?.assetId, scanAssetId,
        "upload completion audit must retain the linked asset ID in its payload");
      const scanCompleteAudit = scanAudit.rows.find((row) =>
        row.action === "customer.asset.scan.complete" &&
        row.outcome === "success" &&
        row.resource_id === scanAssetId);
      assert.ok(scanCompleteAudit, "trusted scan completion audit must be keyed by the asset ID");
    } finally {
      await pool.end();
    }
  });


test("live PostgreSQL customer asset metadata creation is idempotent across concurrent retries",
  { skip: !connectionString || process.env.EPER_CUSTOMER_ASSET_LIVE_TESTS !== "1" }, async () => {
    const pool = new Pool({ connectionString, max: 4 });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "asset-meta-tenant-" + suffix.slice(0, 18);
    const applicationId = "asset-meta-app-" + suffix.slice(0, 18);
    const actorId = "asset-meta-actor-" + suffix.slice(0, 16);
    const clientOperationId = suffix.slice(0, 32);
    const correlationId = "asset-meta-idempotency-" + suffix;
    const repository = new PostgresCustomerAssetRepository(pool);

    try {
      await repository.assertReady();
      const input = {
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        clientOperationId, scope: "application_restricted", ownerApplicationId: applicationId,
        displayName: "Idempotent metadata fixture", originalFileName: "metadata.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 1024, storageAdapterKey: "ci-storage",
        storageObjectReference: "opaque-metadata-object-" + suffix,
      };

      const [first, concurrentReplay] = await Promise.all([
        repository.create(input),
        repository.create(input),
      ]);
      assert.equal(first.assetId, concurrentReplay.assetId,
        "concurrent retries with one client operation ID must return the same asset");
      assert.equal(first.createdAt, concurrentReplay.createdAt,
        "a replay must return the original durable metadata row");

      const assets = await pool.query(
        "SELECT count(*)::int AS count FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2",
        [tenantId, first.assetId],
      );
      assert.equal(assets.rows[0].count, 1);

      const operations = await pool.query(
        `SELECT client_operation_id, request_fingerprint, asset_id
           FROM eper_customer_asset_metadata_operations
          WHERE tenant_id = $1 AND application_id = $2 AND actor_id = $3
            AND client_operation_id = $4`,
        [tenantId, applicationId, actorId, clientOperationId],
      );
      assert.equal(operations.rowCount, 1);
      assert.equal(operations.rows[0].asset_id, first.assetId);
      assert.match(operations.rows[0].request_fingerprint, /^[a-f0-9]{64}$/);

      const audit = await pool.query(
        `SELECT action, resource_id FROM eper_audit_events
          WHERE tenant_id = $1 AND application_id = $2
            AND action = 'customer.asset.metadata.create' AND resource_id = $3`,
        [tenantId, applicationId, first.assetId],
      );
      assert.equal(audit.rowCount, 1, "a replay must not duplicate the metadata-create audit event");

      await assert.rejects(
        repository.create({ ...input, displayName: "Changed metadata payload" }),
        { message: "EPER_CUSTOMER_ASSET_METADATA_IDEMPOTENCY_CONFLICT" },
        "reusing one operation ID for a different metadata fingerprint must fail closed",
      );
      const afterConflict = await pool.query(
        "SELECT count(*)::int AS count FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2",
        [tenantId, first.assetId],
      );
      assert.equal(afterConflict.rows[0].count, 1, "a conflicting replay must not create another asset");
    } finally {
      await pool.end();
    }
  });


test("live PostgreSQL download lookup enforces owner and explicit shared-link visibility under the restricted asset role",
  { skip: !connectionString || process.env.EPER_CUSTOMER_ASSET_LIVE_TESTS !== "1" }, async () => {
    const pool = new Pool({ connectionString, max: 8 });
    const suffix = randomUUID().replaceAll("-", "");
    const tenantId = "asset-download-tenant-" + suffix.slice(0, 18);
    const otherTenantId = "asset-download-other-" + suffix.slice(0, 16);
    const ownerApplicationId = "asset-download-owner-" + suffix.slice(0, 16);
    const sharedApplicationId = "asset-download-shared-" + suffix.slice(0, 16);
    const otherApplicationId = "asset-download-other-" + suffix.slice(0, 16);
    const actorId = "asset-download-actor-" + suffix.slice(0, 16);
    const scannerServiceId = "asset-download-scanner-" + suffix.slice(0, 12);
    const workerId = "asset-download-worker-" + suffix.slice(0, 12);
    const roleName = "eper_asset_dl_" + suffix.slice(0, 16);
    const rolePassword = randomUUID().replaceAll("-", "");
    const repository = new PostgresCustomerAssetRepository(pool);
    let restrictedPool;

    await pool.query(
      "INSERT INTO public.eper_customer_asset_upload_expiry_worker_tenant_scope(login_role, tenant_id, enabled) VALUES (session_user, $1, true) ON CONFLICT (login_role, tenant_id) DO UPDATE SET enabled = true, updated_at = now()",
      [tenantId],
    );

    async function createAsset(applicationId, scope, scanStatus) {
      const assetId = randomUUID();
      const correlationId = "asset-download-" + suffix + "-" + assetId.slice(0, 8);
      const providerReference = "opaque-provider-reference-" + assetId;
      const metadataReference = "opaque-metadata-reference-" + assetId;
      const requestFingerprint = createHash("sha256").update("download-request-" + assetId).digest("hex");
      const idempotencyKey = "asset-download-" + assetId.replaceAll("-", "");
      await repository.create({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, scope, ...(scope === "application_restricted" ? { ownerApplicationId: applicationId } : {}),
        displayName: "Download lookup fixture", originalFileName: "fixture.pdf",
        mediaCategory: "document", mimeType: "application/pdf", fileExtension: "pdf",
        sizeBytes: 4096, storageAdapterKey: "ci-storage",
        storageObjectReference: metadataReference,
      });
      const reservation = await repository.reserveUpload({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, expectedSizeBytes: 4096, expectedChecksumSha256: createHash("sha256").update("synthetic-download-bytes-" + assetId).digest("hex"), idempotencyKey, requestFingerprint,
      });
      await repository.recordUploadGrant({
        tenantId, applicationId, actorId, environment: "sandbox", correlationId,
        assetId, uploadSessionId: reservation.uploadSessionId, requestFingerprint,
        providerUploadReference: providerReference,
        grantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      if (scanStatus !== null) {
        const checksumSha256 = createHash("sha256").update("synthetic-download-bytes-" + assetId).digest("hex");
        await repository.completeUpload({
          tenantId, applicationId, actorId, environment: "sandbox", correlationId,
          uploadSessionId: reservation.uploadSessionId, receivedSizeBytes: 4096,
          observedMimeType: "application/pdf", checksumSha256, scanStatus: "pending",
        });
        const claims = await repository.claimScanJobs({
          tenantId, applicationId, workerId, scannerServiceId,
          environment: "sandbox", limit: 1, leaseMs: 60_000,
        });
        assert.ok(claims.some(claim => claim.uploadSessionId === reservation.uploadSessionId),
          "completed upload must produce a claimable scan job");
        await repository.recordScanResult({
          tenantId, applicationId, scannerServiceId, workerId, environment: "sandbox",
          correlationId, uploadSessionId: reservation.uploadSessionId, scanStatus,
        });
      }
      return { assetId, providerReference, metadataReference, uploadSessionId: reservation.uploadSessionId };
    }

    try {
      await repository.assertReady();
      await pool.query(
        `CREATE ROLE ${roleName} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
          INHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${rolePassword}'`,
      );
      await pool.query(`GRANT eper_customer_asset_access TO ${roleName}`);
      const restrictedUrl = new URL(connectionString);
      restrictedUrl.username = roleName;
      restrictedUrl.password = rolePassword;
      restrictedPool = new Pool({ connectionString: restrictedUrl.toString(), max: 2 });
      const restrictedRepository = new PostgresCustomerAssetRepository(restrictedPool);

      const ownerAsset = await createAsset(ownerApplicationId, "application_restricted", "clean");
      const ownerDownload = await restrictedRepository.getDownloadAsset(tenantId, ownerApplicationId, ownerAsset.assetId);
      assert.deepEqual(ownerDownload, {
        accessReference: ownerAsset.providerReference,
        fileName: "fixture.pdf",
        mimeType: "application/pdf",
      }, "owner application receives only the provider upload reference after a clean completed scan");
      assert.notEqual(ownerDownload?.accessReference, ownerAsset.metadataReference,
        "download lookup must never return the metadata placeholder");
      assert.equal(await restrictedRepository.getDownloadAsset(tenantId, otherApplicationId, ownerAsset.assetId), null,
        "another application cannot read an application-restricted asset");
      assert.equal(await restrictedRepository.getDownloadAsset(otherTenantId, ownerApplicationId, ownerAsset.assetId), null,
        "another tenant cannot read the asset");

      const sharedAsset = await createAsset(ownerApplicationId, "customer_shared", "clean");
      assert.equal(await restrictedRepository.getDownloadAsset(tenantId, sharedApplicationId, sharedAsset.assetId), null,
        "a shared asset is not visible to another application before an explicit link");
      await repository.link({
        tenantId, applicationId: sharedApplicationId, actorId, environment: "sandbox",
        correlationId: "asset-download-link-" + suffix,
        idempotencyKey: "asset-download-link-" + suffix.slice(0, 32),
        assetId: sharedAsset.assetId, reason: "customer-shared",
      });
      const sharedDownload = await restrictedRepository.getDownloadAsset(tenantId, sharedApplicationId, sharedAsset.assetId);
      assert.deepEqual(sharedDownload, {
        accessReference: sharedAsset.providerReference,
        fileName: "fixture.pdf",
        mimeType: "application/pdf",
      }, "explicitly linked customer-shared asset is downloadable from the linked application");
      assert.notEqual(sharedDownload?.accessReference, sharedAsset.metadataReference);

      const sharedIncompleteAsset = await createAsset(ownerApplicationId, "customer_shared", null);
      await repository.link({
        tenantId, applicationId: sharedApplicationId, actorId, environment: "sandbox",
        correlationId: "asset-download-incomplete-link-" + suffix,
        idempotencyKey: "asset-download-incomplete-" + suffix.slice(0, 32),
        assetId: sharedIncompleteAsset.assetId, reason: "customer-shared",
      });
      assert.equal(await restrictedRepository.getDownloadAsset(tenantId, sharedApplicationId, sharedIncompleteAsset.assetId), null,
        "an explicitly linked but incomplete shared upload cannot be downloaded");
      const hiddenIncompleteSession = await restrictedPool.query(
        `SELECT provider_upload_reference
           FROM eper_customer_asset_upload_sessions
          WHERE tenant_id = $1 AND upload_session_id = $2`,
        [tenantId, sharedIncompleteAsset.uploadSessionId],
      );
      assert.equal(hiddenIncompleteSession.rowCount, 0,
        "shared-link RLS must not expose incomplete upload-session references");

      const incompleteAsset = await createAsset(ownerApplicationId, "application_restricted", null);
      assert.equal(await restrictedRepository.getDownloadAsset(tenantId, ownerApplicationId, incompleteAsset.assetId), null,
        "an incomplete upload session never produces a download reference");

      const infectedAsset = await createAsset(ownerApplicationId, "application_restricted", "infected");
      assert.equal(await restrictedRepository.getDownloadAsset(tenantId, ownerApplicationId, infectedAsset.assetId), null,
        "a rejected/quarantined scan result never produces a download reference");

      const inactiveAsset = await createAsset(ownerApplicationId, "application_restricted", "clean");
      await pool.query(
        `UPDATE eper_customer_assets
            SET lifecycle_status = 'deleted', deleted_by = $3, deleted_at = now()
          WHERE tenant_id = $1 AND asset_id = $2`,
        [tenantId, inactiveAsset.assetId, actorId],
      );
      assert.equal(await restrictedRepository.getDownloadAsset(tenantId, ownerApplicationId, inactiveAsset.assetId), null,
        "a deleted/inactive asset never produces a download reference");
      assert.equal(await restrictedRepository.getDownloadAsset(tenantId, ownerApplicationId, randomUUID()), null,
        "a missing asset never produces a download reference");
    } finally {
      if (restrictedPool) await restrictedPool.end();
      await pool.query(`DROP ROLE IF EXISTS ${roleName}`).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_application_links WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_scan_jobs WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_upload_sessions WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_asset_metadata_operations WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.query("DELETE FROM eper_customer_assets WHERE tenant_id = $1", [tenantId]).catch(() => {});
      await pool.end();
    }
  });
