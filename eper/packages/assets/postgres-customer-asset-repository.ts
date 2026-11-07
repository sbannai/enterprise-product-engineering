import { randomUUID } from "node:crypto";
import {
  appendAuditEventInTransaction,
  type AuditEnvironment,
  type AuditSqlClient,
  type AuditSqlPool,
} from "../audit/audit-event-store.js";

export type CustomerAssetScope = "customer_shared" | "application_restricted";
export type CustomerAssetStatus = "pending" | "uploaded" | "scanning" | "available" | "rejected" | "failed";
export interface CustomerAsset {
  tenantId: string;
  assetId: string;
  scope: CustomerAssetScope;
  ownerApplicationId: string | null;
  displayName: string;
  originalFileName: string;
  mediaCategory: "image" | "video" | "document" | "other";
  mimeType: string;
  fileExtension: string;
  sizeBytes: number;
  checksumSha256: string | null;
  storageAdapterKey: string;
  uploadStatus: CustomerAssetStatus;
  scanStatus: "pending" | "clean" | "infected" | "error" | "not_required";
  lifecycleStatus: "active" | "quarantined" | "deleted";
  version: number;
  createdBy: string;
  createdAt: string;
}
export interface CreateCustomerAssetInput {
  tenantId: string;
  applicationId: string;
  actorId: string;
  environment: AuditEnvironment;
  correlationId: string;
  assetId?: string;
  scope: CustomerAssetScope;
  ownerApplicationId?: string;
  displayName: string;
  originalFileName: string;
  mediaCategory: CustomerAsset["mediaCategory"];
  mimeType: string;
  fileExtension: string;
  sizeBytes: number;
  checksumSha256?: string;
  storageAdapterKey: string;
  storageObjectReference: string;
}
export interface LinkCustomerAssetInput {
  tenantId: string;
  applicationId: string;
  actorId: string;
  environment: AuditEnvironment;
  correlationId: string;
  idempotencyKey: string;
  assetId: string;
  reason: string;
}
type AssetRow = {
  tenant_id: string; asset_id: string; repository_scope: CustomerAssetScope;
  owner_application_id: string | null; display_name: string; original_file_name: string;
  media_category: CustomerAsset["mediaCategory"]; mime_type: string; file_extension: string;
  size_bytes: number | string; checksum_sha256: string | null; storage_adapter_key: string;
  upload_status: CustomerAssetStatus; scan_status: CustomerAsset["scanStatus"];
  lifecycle_status: CustomerAsset["lifecycleStatus"]; version: number | string;
  created_by: string; created_at: string | Date;
};
function mapAsset(row: AssetRow): CustomerAsset {
  return {
    tenantId: row.tenant_id, assetId: row.asset_id, scope: row.repository_scope,
    ownerApplicationId: row.owner_application_id, displayName: row.display_name,
    originalFileName: row.original_file_name, mediaCategory: row.media_category,
    mimeType: row.mime_type, fileExtension: row.file_extension, sizeBytes: Number(row.size_bytes),
    checksumSha256: row.checksum_sha256, storageAdapterKey: row.storage_adapter_key,
    uploadStatus: row.upload_status, scanStatus: row.scan_status,
    lifecycleStatus: row.lifecycle_status, version: Number(row.version),
    createdBy: row.created_by, createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Tenant-scoped metadata repository. Binary transfer and provider grants are
 * deliberately outside this store. Callers must authorize the actor and enforce
 * upload policy before invoking mutations; every mutation is coupled to audit.
 */
export class PostgresCustomerAssetRepository {
  constructor(private readonly pool: AuditSqlPool) {}

  async assertReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ assets: string | null; links: string | null; sessions: string | null; scanJobs: string | null }>(
        "SELECT to_regclass('public.eper_customer_assets')::text AS assets, to_regclass('public.eper_customer_asset_application_links')::text AS links, to_regclass('public.eper_customer_asset_upload_sessions')::text AS sessions, to_regclass('public.eper_customer_asset_scan_jobs')::text AS \"scanJobs\"",
      );
      const row = result.rows[0];
      if (!row?.assets || !row.links || !row.sessions || !row.scanJobs) throw new Error("EPER_CUSTOMER_ASSET_SCHEMA_NOT_APPLIED");
      const recovery = await client.query<{ column_name: string | null }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='eper_customer_asset_upload_sessions' AND column_name IN ('request_fingerprint', 'provider_outcome')",
      );
      const recoveryColumns = new Set(recovery.rows.map((row) => row.column_name));
      if (!recoveryColumns.has("request_fingerprint")) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_RECOVERY_SCHEMA_NOT_APPLIED");
      if (!recoveryColumns.has("provider_outcome")) throw new Error("EPER_CUSTOMER_ASSET_PROVIDER_OUTCOME_SCHEMA_NOT_APPLIED");
    } catch (error) {
      if (error instanceof Error && error.message === "EPER_CUSTOMER_ASSET_SCHEMA_NOT_APPLIED") throw error;
      throw new Error("EPER_CUSTOMER_ASSET_SCHEMA_READINESS_FAILED", { cause: error });
    } finally { client.release(); }
  }

  async listForApplication(tenantId: string, applicationId: string): Promise<CustomerAsset[]> {
    this.validateId(tenantId, "tenantId");
    this.validateId(applicationId, "applicationId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await this.setContext(client, tenantId, applicationId);
      const result = await client.query<AssetRow>(
        `SELECT a.tenant_id, a.asset_id, a.repository_scope, a.owner_application_id,
          a.display_name, a.original_file_name, a.media_category, a.mime_type, a.file_extension,
          a.size_bytes, a.checksum_sha256, a.storage_adapter_key, a.upload_status,
          a.scan_status, a.lifecycle_status, a.version, a.created_by, a.created_at
         FROM eper_customer_assets a
         WHERE a.tenant_id = $1 AND a.lifecycle_status = 'active'
           AND a.upload_status = 'available' AND a.scan_status IN ('clean', 'not_required')
           AND (
             (a.repository_scope = 'application_restricted' AND a.owner_application_id = $2)
             OR (a.repository_scope = 'customer_shared' AND EXISTS (
               SELECT 1 FROM eper_customer_asset_application_links l
                WHERE l.tenant_id = a.tenant_id AND l.application_id = $2 AND l.asset_id = a.asset_id
             ))
           )
         ORDER BY a.created_at DESC, a.asset_id`,
        [tenantId, applicationId],
      );
      await client.query("COMMIT");
      return result.rows.map(mapAsset);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async getPendingUploadAsset(tenantId: string, applicationId: string, assetId: string): Promise<CustomerAsset | null> {
    this.validateId(tenantId, "tenantId");
    this.validateId(applicationId, "applicationId");
    this.validateId(assetId, "assetId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await this.setContext(client, tenantId, applicationId);
      const result = await client.query<AssetRow>(
        `SELECT tenant_id, asset_id, repository_scope, owner_application_id, display_name,
          original_file_name, media_category, mime_type, file_extension, size_bytes,
          checksum_sha256, storage_adapter_key, upload_status, scan_status, lifecycle_status,
          version, created_by, created_at
         FROM eper_customer_assets
         WHERE tenant_id = $1 AND asset_id = $2
           AND upload_status = 'pending' AND lifecycle_status = 'active'`,
        [tenantId, assetId],
      );
      await client.query("COMMIT");
      return result.rows[0] ? mapAsset(result.rows[0]) : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async create(input: CreateCustomerAssetInput): Promise<CustomerAsset> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.actorId, "actorId");
    if (input.scope === "application_restricted" && input.ownerApplicationId !== input.applicationId) {
      throw new Error("EPER_CUSTOMER_ASSET_OWNER_APPLICATION_MISMATCH");
    }
    if (input.scope === "customer_shared" && input.ownerApplicationId) {
      throw new Error("EPER_CUSTOMER_ASSET_SHARED_OWNER_MUST_BE_NULL");
    }
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) throw new Error("EPER_CUSTOMER_ASSET_SIZE_INVALID");
    if (input.checksumSha256 && !/^[a-f0-9]{64}$/.test(input.checksumSha256)) throw new Error("EPER_CUSTOMER_ASSET_CHECKSUM_INVALID");
    if (!input.correlationId?.trim()) throw new Error("EPER_CUSTOMER_ASSET_CORRELATION_ID_REQUIRED");
    const assetId = input.assetId ?? randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      await client.query(
        `INSERT INTO eper_customer_assets (
          tenant_id, asset_id, repository_scope, owner_application_id, display_name,
          original_file_name, media_category, mime_type, file_extension, size_bytes,
          checksum_sha256, storage_adapter_key, storage_object_reference, upload_status,
          scan_status, lifecycle_status, created_by, updated_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending','pending','active',$14,$14)`,
        [input.tenantId, assetId, input.scope, input.ownerApplicationId ?? null,
          input.displayName, input.originalFileName, input.mediaCategory, input.mimeType,
          input.fileExtension.toLowerCase().replace(/^\\./, ""), input.sizeBytes,
          input.checksumSha256 ?? null, input.storageAdapterKey, input.storageObjectReference, input.actorId],
      );
      // A shared asset is immediately linked to the application in which it was
      // created. Other applications receive visibility only through an explicit
      // later sharing authorization and link operation.
      if (input.scope === "customer_shared") {
        await client.query(
          `INSERT INTO eper_customer_asset_application_links
            (tenant_id, application_id, asset_id, linked_by, link_reason, idempotency_key)
           VALUES ($1,$2,$3,$4,'created_in_application',$5)`,
          [input.tenantId, input.applicationId, assetId, input.actorId, "asset-create-" + randomUUID()],
        );
        await appendAuditEventInTransaction(client as AuditSqlClient, {
          tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
          actorType: "human", actorId: input.actorId, action: "customer.asset.application.link",
          outcome: "success", resourceType: "customer-asset", resourceId: assetId,
          correlationId: input.correlationId, source: "api", operationName: "POST /customer/assets",
          payload: { assetId, applicationId: input.applicationId, reason: "created_in_application" },
        });
      }
      const selected = await client.query<AssetRow>(
        `SELECT tenant_id, asset_id, repository_scope, owner_application_id, display_name,
          original_file_name, media_category, mime_type, file_extension, size_bytes,
          checksum_sha256, storage_adapter_key, upload_status, scan_status, lifecycle_status,
          version, created_by, created_at
         FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2`,
        [input.tenantId, assetId],
      );
      const row = selected.rows[0];
      if (!row) throw new Error("EPER_CUSTOMER_ASSET_CREATE_RETURNED_NO_ROW");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "customer.asset.metadata.create",
        outcome: "success", resourceType: "customer-asset", resourceId: assetId,
        correlationId: input.correlationId, source: "api", operationName: "POST /customer/assets",
        payload: { assetId, scope: input.scope, mediaCategory: input.mediaCategory, sizeBytes: input.sizeBytes },
      });
      await client.query("COMMIT");
      return mapAsset(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async reserveUpload(input: {
    tenantId: string; applicationId: string; actorId: string; environment: AuditEnvironment;
    correlationId: string; assetId: string; expectedSizeBytes: number; idempotencyKey: string;
    requestFingerprint: string; uploadSessionId?: string;
  }): Promise<{
    disposition: "created" | "replayed";
    uploadSessionId: string; providerUploadReference: string | null;
    uploadStatus: "initiated" | "in_progress" | "completed" | "aborted" | "expired" | "failed";
    expiresAt: string; providerGrantExpiresAt: string | null;
  }> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.actorId, "actorId");
    this.validateId(input.assetId, "assetId");
    if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes <= 0) {
      throw new Error("EPER_CUSTOMER_ASSET_EXPECTED_SIZE_INVALID");
    }
    if (!/^[a-zA-Z0-9._:-]{16,128}$/.test(input.idempotencyKey)) {
      throw new Error("EPER_CUSTOMER_ASSET_IDEMPOTENCY_KEY_INVALID");
    }
    if (!/^[a-f0-9]{64}$/.test(input.requestFingerprint)) {
      throw new Error("EPER_CUSTOMER_ASSET_REQUEST_FINGERPRINT_INVALID");
    }
    const client = await this.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await this.setContext(client, input.tenantId, input.applicationId);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "eper-asset-upload:" + input.tenantId + ":" + input.idempotencyKey,
      ]);
      const prior = await client.query<{
        upload_session_id: string; application_id: string; actor_id: string; asset_id: string;
        expected_size_bytes: number | string; provider_upload_reference: string | null;
        upload_status: "initiated" | "in_progress" | "completed" | "aborted" | "expired" | "failed";
        expires_at: string | Date; provider_grant_expires_at: string | Date | null;
        request_fingerprint: string | null;
      }>(
        `SELECT upload_session_id, application_id, actor_id, asset_id, expected_size_bytes,
          provider_upload_reference, upload_status, expires_at, provider_grant_expires_at,
          request_fingerprint
         FROM eper_customer_asset_upload_sessions
         WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        const row = prior.rows[0];
        if (row.application_id !== input.applicationId || row.actor_id !== input.actorId ||
            row.asset_id !== input.assetId || Number(row.expected_size_bytes) !== input.expectedSizeBytes ||
            row.request_fingerprint !== input.requestFingerprint) {
          // Persist a denial after rolling back the reservation transaction. Do not
          // disclose the prior session id or fingerprint in the denial event.
          await client.query("ROLLBACK");
          transactionOpen = false;
          await client.query("BEGIN");
          transactionOpen = true;
          await this.setContext(client, input.tenantId, input.applicationId);
          await appendAuditEventInTransaction(client as AuditSqlClient, {
            tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
            actorType: "human", actorId: input.actorId, action: "customer.asset.upload.reserve",
            outcome: "denied", reasonCode: "idempotency_conflict",
            resourceType: "customer-asset-upload", resourceId: input.assetId,
            correlationId: input.correlationId, source: "api",
            operationName: "POST /customer/assets/:assetId/uploads",
            payload: { assetId: input.assetId, conflict: true },
          });
          await client.query("COMMIT");
          transactionOpen = false;
          throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_IDEMPOTENCY_CONFLICT");
        }
        await client.query("COMMIT");
        transactionOpen = false;
        return {
          disposition: "replayed",
          uploadSessionId: row.upload_session_id,
          providerUploadReference: row.provider_upload_reference,
          uploadStatus: row.upload_status,
          expiresAt: new Date(row.expires_at).toISOString(),
          providerGrantExpiresAt: row.provider_grant_expires_at
            ? new Date(row.provider_grant_expires_at).toISOString() : null,
        };
      }
      const asset = await client.query<{ asset_id: string }>(
        "SELECT asset_id FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2 AND lifecycle_status = 'active' FOR UPDATE",
        [input.tenantId, input.assetId],
      );
      if (!asset.rows[0]) throw new Error("EPER_CUSTOMER_ASSET_NOT_FOUND");
      const sessionId = input.uploadSessionId ?? randomUUID();
      this.validateId(sessionId, "uploadSessionId");
      const expiry = await client.query<{ expires_at: string | Date }>(
        "SELECT now() + interval '15 minutes' AS expires_at",
      );
      const expiresAt = new Date(expiry.rows[0].expires_at).toISOString();
      await client.query(
        `INSERT INTO eper_customer_asset_upload_sessions
          (tenant_id, application_id, upload_session_id, asset_id, actor_id, expected_size_bytes,
           provider_upload_reference, upload_status, idempotency_key, expires_at, request_fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,'initiated',$7,$8,$9)`,
        [input.tenantId, input.applicationId, sessionId, input.assetId, input.actorId,
          input.expectedSizeBytes, input.idempotencyKey, expiresAt, input.requestFingerprint],
      );
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "customer.asset.upload.reserve",
        outcome: "success", resourceType: "customer-asset-upload", resourceId: sessionId,
        correlationId: input.correlationId, idempotencyKey: input.idempotencyKey,
        source: "api", operationName: "POST /customer/assets/:assetId/uploads",
        payload: { assetId: input.assetId, expectedSizeBytes: input.expectedSizeBytes,
          requestFingerprint: input.requestFingerprint },
      });
      await client.query("COMMIT");
      transactionOpen = false;
      return {
        disposition: "created",
        uploadSessionId: sessionId, providerUploadReference: null,
        uploadStatus: "initiated", expiresAt, providerGrantExpiresAt: null,
      };
    } catch (error) {
      if (transactionOpen) {
        try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      }
      throw error;
    } finally { client.release(); }
  }

  async recordUploadGrant(input: {
    tenantId: string; applicationId: string; actorId: string; environment: AuditEnvironment;
    correlationId: string; assetId: string; uploadSessionId: string;
    requestFingerprint: string; providerUploadReference: string; grantExpiresAt: string;
  }): Promise<void> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.actorId, "actorId");
    this.validateId(input.assetId, "assetId");
    this.validateId(input.uploadSessionId, "uploadSessionId");
    if (!/^[a-f0-9]{64}$/.test(input.requestFingerprint) ||
        !input.providerUploadReference?.trim() || input.providerUploadReference.length > 2048) {
      throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_GRANT_INVALID");
    }
    const expiry = Date.parse(input.grantExpiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry - Date.now() > 15 * 60_000) {
      throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_GRANT_EXPIRY_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      const current = await client.query<{
        provider_upload_reference: string | null; actor_id: string; asset_id: string;
        request_fingerprint: string | null; upload_status: string;
      }>(
        `SELECT provider_upload_reference, actor_id, asset_id, request_fingerprint, upload_status
         FROM eper_customer_asset_upload_sessions
         WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3 FOR UPDATE`,
        [input.tenantId, input.applicationId, input.uploadSessionId],
      );
      const row = current.rows[0];
      if (!row || row.actor_id !== input.actorId || row.asset_id !== input.assetId ||
          row.request_fingerprint !== input.requestFingerprint ||
          !["initiated", "in_progress"].includes(row.upload_status)) {
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_NOT_RECOVERABLE");
      }
      if (row.provider_upload_reference && row.provider_upload_reference !== input.providerUploadReference) {
        throw new Error("EPER_CUSTOMER_ASSET_PROVIDER_REFERENCE_CONFLICT");
      }
      await client.query(
        `UPDATE eper_customer_asset_upload_sessions
            SET provider_upload_reference = COALESCE(provider_upload_reference, $4),
                provider_outcome = 'succeeded',
                provider_grant_expires_at = $5, last_recovered_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3`,
        [input.tenantId, input.applicationId, input.uploadSessionId,
          input.providerUploadReference, new Date(expiry).toISOString()],
      );
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "customer.asset.upload.grant.recover",
        outcome: "success", resourceType: "customer-asset-upload", resourceId: input.uploadSessionId,
        correlationId: input.correlationId,
        source: "api", operationName: "POST /customer/assets/:assetId/uploads",
        payload: { assetId: input.assetId, providerGrantExpiresAt: new Date(expiry).toISOString() },
      });
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  /** Persist only a definitive provider rejection; unknown outcomes must remain recoverable. */
  async recordUploadProviderRejection(input: {
    tenantId: string; applicationId: string; actorId: string; environment: AuditEnvironment;
    correlationId: string; assetId: string; uploadSessionId: string; rejectionCode: string;
  }): Promise<void> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.actorId, "actorId");
    this.validateId(input.assetId, "assetId");
    this.validateId(input.uploadSessionId, "uploadSessionId");
    if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(input.rejectionCode)) {
      throw new Error("EPER_CUSTOMER_ASSET_PROVIDER_REJECTION_CODE_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      const updated = await client.query(
        `UPDATE eper_customer_asset_upload_sessions
            SET upload_status = 'failed', provider_outcome = 'rejected', updated_at = now()
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3
            AND actor_id = $4 AND asset_id = $5
            AND upload_status IN ('initiated', 'in_progress')
            AND provider_upload_reference IS NULL AND provider_outcome = 'unknown'`,
        [input.tenantId, input.applicationId, input.uploadSessionId, input.actorId, input.assetId],
      );
      if (updated.rowCount !== 1) {
        throw new Error("EPER_CUSTOMER_ASSET_PROVIDER_REJECTION_NOT_APPLICABLE");
      }
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "customer.asset.upload.provider.reject",
        outcome: "failure", resourceType: "customer-asset-upload", resourceId: input.uploadSessionId,
        correlationId: input.correlationId, source: "api",
        operationName: "POST /customer/assets/:assetId/uploads",
        payload: { assetId: input.assetId, rejectionCode: input.rejectionCode },
      });
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async getUploadSessionForVerification(tenantId: string, applicationId: string, uploadSessionId: string): Promise<{
    assetId: string; actorId: string; providerUploadReference: string;
    expectedSizeBytes: number; expectedMimeType: string; expiresAt: string;
  } | null> {
    this.validateId(tenantId, "tenantId");
    this.validateId(applicationId, "applicationId");
    this.validateId(uploadSessionId, "uploadSessionId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await this.setContext(client, tenantId, applicationId);
      const result = await client.query<{
        asset_id: string; actor_id: string; provider_upload_reference: string;
        expected_size_bytes: number | string; expected_mime_type: string; expires_at: string | Date;
      }>(
        `SELECT s.asset_id, s.actor_id, s.provider_upload_reference,
          s.expected_size_bytes, a.mime_type AS expected_mime_type, s.expires_at
         FROM eper_customer_asset_upload_sessions s
         JOIN eper_customer_assets a
           ON a.tenant_id = s.tenant_id AND a.asset_id = s.asset_id
         WHERE s.tenant_id = $1 AND s.application_id = $2
           AND s.upload_session_id = $3
           AND s.upload_status IN ('initiated', 'in_progress')
           AND s.expires_at > now()
           AND a.upload_status = 'pending' AND a.lifecycle_status = 'active'`,
        [tenantId, applicationId, uploadSessionId],
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return row ? {
        assetId: row.asset_id, actorId: row.actor_id,
        providerUploadReference: row.provider_upload_reference,
        expectedSizeBytes: Number(row.expected_size_bytes),
        expectedMimeType: row.expected_mime_type,
        expiresAt: new Date(row.expires_at).toISOString(),
      } : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async getUploadSessionForScanning(tenantId: string, applicationId: string, uploadSessionId: string, workerId: string): Promise<{
    assetId: string; providerUploadReference: string; checksumSha256: string;
    sizeBytes: number; mimeType: string; attempt: number;
  } | null> {
    this.validateId(tenantId, "tenantId");
    this.validateId(applicationId, "applicationId");
    this.validateId(uploadSessionId, "uploadSessionId");
    this.validateId(workerId, "workerId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await this.setContext(client, tenantId, applicationId);
      const result = await client.query<{
        asset_id: string; provider_upload_reference: string; checksum_sha256: string | null;
        size_bytes: number | string; mime_type: string; attempt_count: number;
      }>(
        `SELECT s.asset_id, s.provider_upload_reference, a.checksum_sha256,
          a.size_bytes, a.mime_type, j.attempt_count
         FROM eper_customer_asset_upload_sessions s
         JOIN eper_customer_assets a
           ON a.tenant_id = s.tenant_id AND a.asset_id = s.asset_id
         JOIN eper_customer_asset_scan_jobs j
           ON j.tenant_id = s.tenant_id AND j.upload_session_id = s.upload_session_id
         WHERE s.tenant_id = $1 AND s.application_id = $2
           AND s.upload_session_id = $3 AND s.upload_status = 'completed'
           AND a.upload_status = 'scanning' AND a.scan_status = 'pending'
           AND a.lifecycle_status = 'active' AND a.checksum_sha256 IS NOT NULL
           AND j.state = 'leased' AND j.lease_owner = $4 AND j.lease_expires_at > now()`,
        [tenantId, applicationId, uploadSessionId, workerId],
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return row ? {
        assetId: row.asset_id, providerUploadReference: row.provider_upload_reference,
        checksumSha256: row.checksum_sha256 as string, sizeBytes: Number(row.size_bytes),
        mimeType: row.mime_type, attempt: Number(row.attempt_count),
      } : null;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async completeUpload(input: {
    tenantId: string; applicationId: string; actorId: string; environment: AuditEnvironment;
    correlationId: string; uploadSessionId: string; receivedSizeBytes: number;
    observedMimeType: string; checksumSha256: string;
    scanStatus: "pending";
  }): Promise<CustomerAsset> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.actorId, "actorId");
    this.validateId(input.uploadSessionId, "uploadSessionId");
    if (!input.correlationId?.trim()) throw new Error("EPER_CUSTOMER_ASSET_CORRELATION_ID_REQUIRED");
    if (!Number.isSafeInteger(input.receivedSizeBytes) || input.receivedSizeBytes <= 0) {
      throw new Error("EPER_CUSTOMER_ASSET_RECEIVED_SIZE_INVALID");
    }
    if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) {
      throw new Error("EPER_CUSTOMER_ASSET_CHECKSUM_INVALID");
    }
    if (!input.observedMimeType?.trim() || input.observedMimeType.length > 128) {
      throw new Error("EPER_CUSTOMER_ASSET_MIME_TYPE_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      // All lifecycle writers lock upload session -> asset -> scan job.
      // Avoid joined FOR UPDATE: PostgreSQL's plan may choose a different row-lock order.
      const lockedSession = await client.query<{
        upload_session_id: string; asset_id: string; actor_id: string;
        expected_size_bytes: number | string; expires_at: string | Date;
        upload_status: string; session_not_expired: boolean;
      }>(
        `SELECT upload_session_id, asset_id, actor_id, expected_size_bytes,
          expires_at, upload_status, (expires_at > clock_timestamp()) AS session_not_expired
         FROM eper_customer_asset_upload_sessions
         WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3
         FOR UPDATE`,
        [input.tenantId, input.applicationId, input.uploadSessionId],
      );
      const session = lockedSession.rows[0];
      if (!session) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_NOT_FOUND");
      const lockedAsset = await client.query<{
        mime_type: string; upload_status: string; lifecycle_status: string;
      }>(
        `SELECT mime_type, upload_status, lifecycle_status
           FROM eper_customer_assets
          WHERE tenant_id = $1 AND asset_id = $2
          FOR UPDATE`,
        [input.tenantId, session.asset_id],
      );
      const asset = lockedAsset.rows[0];
      if (!asset || asset.lifecycle_status !== "active") {
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_NOT_FOUND");
      }
      if (session.actor_id !== input.actorId) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_ACTOR_MISMATCH");
      if (session.upload_status !== "initiated" && session.upload_status !== "in_progress") {
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_NOT_COMPLETABLE");
      }
      if (asset.upload_status !== "pending") {
        throw new Error("EPER_CUSTOMER_ASSET_NOT_PENDING_UPLOAD");
      }
      if (!session.session_not_expired) {
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_EXPIRED");
      }
      if (Number(session.expected_size_bytes) !== input.receivedSizeBytes) {
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SIZE_MISMATCH");
      }
      if (asset.mime_type.toLowerCase() !== input.observedMimeType.toLowerCase()) {
        throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_MIME_MISMATCH");
      }
      // Upload completion is not a scanner attestation. Always hold the asset
      // in scanning until recordScanResult receives a trusted provider/worker result.
      const nextStatus: CustomerAssetStatus = "scanning";
      const lifecycleStatus = "active";
      await client.query(
        `UPDATE eper_customer_asset_upload_sessions
            SET received_size_bytes = $3, upload_status = 'completed', updated_at = now()
          WHERE tenant_id = $1 AND upload_session_id = $2`,
        [input.tenantId, input.uploadSessionId, input.receivedSizeBytes],
      );
      const updated = await client.query<AssetRow>(
        `UPDATE eper_customer_assets
            SET checksum_sha256 = $3, upload_status = $4, scan_status = $5,
                lifecycle_status = $6, updated_by = $7, updated_at = now(), version = version + 1
          WHERE tenant_id = $1 AND asset_id = $2
          RETURNING tenant_id, asset_id, repository_scope, owner_application_id, display_name,
            original_file_name, media_category, mime_type, file_extension, size_bytes,
            checksum_sha256, storage_adapter_key, upload_status, scan_status, lifecycle_status,
            version, created_by, created_at`,
        [input.tenantId, session.asset_id, input.checksumSha256, nextStatus,
          input.scanStatus, lifecycleStatus, input.actorId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_COMPLETION_FAILED");
      // Transactional outbox: the scan job is committed atomically with the
      // transition to scanning, so a process crash cannot lose the dispatch.
      await client.query(
        `INSERT INTO eper_customer_asset_scan_jobs
          (tenant_id, application_id, upload_session_id, asset_id, correlation_id)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, upload_session_id) DO NOTHING`,
        [input.tenantId, input.applicationId, input.uploadSessionId, session.asset_id, input.correlationId],
      );
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "customer.asset.upload.complete",
        outcome: "success", resourceType: "customer-asset-upload", resourceId: input.uploadSessionId,
        correlationId: input.correlationId, source: "api",
        operationName: "POST /customer/assets/:assetId/uploads/:sessionId/complete",
        payload: {
          assetId: session.asset_id, receivedSizeBytes: input.receivedSizeBytes,
          scanStatus: input.scanStatus, resultingAssetStatus: nextStatus,
        },
      });
      await client.query("COMMIT");
      return mapAsset(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  /**
   * Records the result returned by a trusted scanner integration. The public
   * upload-completion path cannot self-assert a clean scan; only this separately
   * authorized service operation can move a scanning asset to available.
   */
  /**
   * Claims due scan jobs using SKIP LOCKED. Expired leases are reclaimable;
   * attempts are bounded in the database and worker identity fences completion.
   */
  async claimScanJobs(input: {
    tenantId: string; applicationId: string; workerId: string;
    scannerServiceId: string; environment: AuditEnvironment;
    limit?: number; leaseMs?: number;
  }): Promise<Array<{ uploadSessionId: string; assetId: string; correlationId: string; attempt: number; leaseExpiresAt: string }>> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.workerId, "workerId");
    this.validateId(input.scannerServiceId, "scannerServiceId");
    const limit = input.limit ?? 10;
    const leaseMs = input.leaseMs ?? 60_000;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("EPER_CUSTOMER_ASSET_SCAN_CLAIM_LIMIT_INVALID");
    if (!Number.isInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 900_000) throw new Error("EPER_CUSTOMER_ASSET_SCAN_LEASE_INVALID");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      const exhausted = await client.query<{
        upload_session_id: string; asset_id: string; correlation_id: string;
      }>(
        `UPDATE eper_customer_asset_scan_jobs
            SET state = 'dead_letter', lease_owner = NULL, lease_expires_at = NULL,
                last_error_code = 'ATTEMPTS_EXHAUSTED', updated_at = now()
          WHERE tenant_id = $1 AND application_id = $2
            AND state = 'leased' AND lease_expires_at <= now()
            AND attempt_count >= max_attempts
          RETURNING upload_session_id, asset_id, correlation_id`,
        [input.tenantId, input.applicationId],
      );
      // An exhausted lease may have expired after the worker crashed before
      // finalization. Close the asset lifecycle and append its audit event in
      // this same transaction; never leave a scanning asset behind a dead letter.
      for (const job of exhausted.rows) {
        const failed = await client.query(
          `UPDATE eper_customer_assets
              SET upload_status = 'failed', scan_status = 'error',
                  lifecycle_status = 'quarantined', updated_by = $3,
                  updated_at = now(), version = version + 1
            WHERE tenant_id = $1 AND asset_id = $2 AND upload_status = 'scanning'
            RETURNING asset_id`,
          [input.tenantId, job.asset_id, input.scannerServiceId],
        );
        if (failed.rowCount !== 1) {
          throw new Error("EPER_CUSTOMER_ASSET_EXHAUSTED_JOB_ASSET_STATE_CONFLICT");
        }
        await appendAuditEventInTransaction(client as AuditSqlClient, {
          tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
          actorType: "service", actorId: input.scannerServiceId,
          action: "customer.asset.scan.exhausted", outcome: "failure",
          reasonCode: "ATTEMPTS_EXHAUSTED", resourceType: "customer-asset",
          resourceId: job.asset_id, correlationId: job.correlation_id, source: "job",
          operationName: "customer asset scan lease recovery",
          payload: { assetId: job.asset_id, uploadSessionId: job.upload_session_id,
            scanStatus: "error", resultingAssetStatus: "failed" },
        });
      }
      const claimed = await client.query<{
        upload_session_id: string; asset_id: string; correlation_id: string;
        attempt_count: number; lease_expires_at: string | Date;
      }>(
        `WITH candidates AS (
           SELECT tenant_id, upload_session_id
             FROM eper_customer_asset_scan_jobs
            WHERE tenant_id = $1 AND application_id = $2
              AND attempt_count < max_attempts AND available_at <= now()
              AND (state = 'pending' OR (state = 'leased' AND lease_expires_at <= now()))
            ORDER BY available_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $3
         )
         UPDATE eper_customer_asset_scan_jobs j
            SET state = 'leased', lease_owner = $4,
                lease_expires_at = now() + ($5::bigint * interval '1 millisecond'),
                attempt_count = j.attempt_count + 1, updated_at = now()
           FROM candidates c
          WHERE j.tenant_id = c.tenant_id AND j.upload_session_id = c.upload_session_id
         RETURNING j.upload_session_id, j.asset_id, j.correlation_id,
                   j.attempt_count, j.lease_expires_at`,
        [input.tenantId, input.applicationId, limit, input.workerId, leaseMs],
      );
      await client.query("COMMIT");
      return claimed.rows.map((row) => ({
        uploadSessionId: row.upload_session_id, assetId: row.asset_id,
        correlationId: row.correlation_id, attempt: Number(row.attempt_count),
        leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
      }));
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async completeScanJob(input: {
    tenantId: string; applicationId: string; uploadSessionId: string; workerId: string;
  }): Promise<boolean> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.uploadSessionId, "uploadSessionId");
    this.validateId(input.workerId, "workerId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      const result = await client.query(
        `UPDATE eper_customer_asset_scan_jobs
            SET state = 'completed', lease_owner = NULL, lease_expires_at = NULL,
                updated_at = now()
          WHERE tenant_id = $1 AND application_id = $2
            AND upload_session_id = $3 AND state = 'leased' AND lease_owner = $4
            AND lease_expires_at > now()`,
        [input.tenantId, input.applicationId, input.uploadSessionId, input.workerId],
      );
      await client.query("COMMIT");
      return result.rowCount === 1;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async renewScanJobLease(input: {
    tenantId: string; applicationId: string; uploadSessionId: string;
    workerId: string; leaseMs: number;
  }): Promise<boolean> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.uploadSessionId, "uploadSessionId");
    this.validateId(input.workerId, "workerId");
    if (!Number.isInteger(input.leaseMs) || input.leaseMs < 5_000 || input.leaseMs > 900_000) {
      throw new Error("EPER_CUSTOMER_ASSET_SCAN_LEASE_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      const renewed = await client.query(
        `UPDATE eper_customer_asset_scan_jobs
            SET lease_expires_at = now() + ($5::bigint * interval '1 millisecond'),
                updated_at = now()
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3
            AND state = 'leased' AND lease_owner = $4 AND lease_expires_at > now()
          RETURNING upload_session_id`,
        [input.tenantId, input.applicationId, input.uploadSessionId, input.workerId, input.leaseMs],
      );
      await client.query("COMMIT");
      return renewed.rowCount === 1;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async retryScanJob(input: {
    tenantId: string; applicationId: string; uploadSessionId: string; workerId: string;
    errorCode: string; retryAfterMs: number;
  }): Promise<"pending" | "dead_letter" | "lease_lost"> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.uploadSessionId, "uploadSessionId");
    this.validateId(input.workerId, "workerId");
    if (!/^[A-Z0-9_]{1,64}$/.test(input.errorCode)) throw new Error("EPER_CUSTOMER_ASSET_SCAN_ERROR_CODE_INVALID");
    if (!Number.isInteger(input.retryAfterMs) || input.retryAfterMs < 1_000 || input.retryAfterMs > 3_600_000) {
      throw new Error("EPER_CUSTOMER_ASSET_SCAN_RETRY_DELAY_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      const result = await client.query<{ state: "pending" | "dead_letter" }>(
        `UPDATE eper_customer_asset_scan_jobs
            SET state = CASE WHEN attempt_count >= max_attempts THEN 'leased' ELSE 'pending' END,
                available_at = CASE WHEN attempt_count >= max_attempts THEN available_at
                  ELSE now() + ($5::bigint * interval '1 millisecond') END,
                last_error_code = $6,
                lease_owner = CASE WHEN attempt_count >= max_attempts THEN lease_owner ELSE NULL END,
                lease_expires_at = CASE WHEN attempt_count >= max_attempts THEN lease_expires_at ELSE NULL END,
                updated_at = now()
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3
            AND state = 'leased' AND lease_owner = $4 AND lease_expires_at > now()
          RETURNING CASE WHEN attempt_count >= max_attempts THEN 'dead_letter' ELSE state END AS state`,
        [input.tenantId, input.applicationId, input.uploadSessionId, input.workerId,
          input.retryAfterMs, input.errorCode],
      );
      await client.query("COMMIT");
      return result.rows[0]?.state ?? "lease_lost";
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async recordScanResult(input: {
    tenantId: string; applicationId: string; scannerServiceId: string; workerId: string;
    environment: AuditEnvironment; correlationId: string; uploadSessionId: string;
    scanStatus: "clean" | "infected" | "error" | "not_required";
  }): Promise<CustomerAsset> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.scannerServiceId, "scannerServiceId");
    this.validateId(input.workerId, "workerId");
    this.validateId(input.uploadSessionId, "uploadSessionId");
    if (!input.correlationId?.trim()) throw new Error("EPER_CUSTOMER_ASSET_CORRELATION_ID_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      const locked = await client.query<{
        asset_id: string; upload_status: string; scan_status: string;
        lifecycle_status: string; session_status: string;
        job_state: string; lease_owner: string | null; lease_active: boolean;
      }>(
        `SELECT a.asset_id, a.upload_status, a.scan_status, a.lifecycle_status,
          s.upload_status AS session_status, j.state AS job_state, j.lease_owner,
          (j.lease_expires_at > now()) AS lease_active
         FROM eper_customer_asset_upload_sessions s
         JOIN eper_customer_assets a
           ON a.tenant_id = s.tenant_id AND a.asset_id = s.asset_id
         JOIN eper_customer_asset_scan_jobs j
           ON j.tenant_id = s.tenant_id AND j.upload_session_id = s.upload_session_id
         WHERE s.tenant_id = $1 AND s.application_id = $2 AND s.upload_session_id = $3
         FOR UPDATE OF s, a, j`,
        [input.tenantId, input.applicationId, input.uploadSessionId],
      );
      const current = locked.rows[0];
      if (!current) throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_SESSION_NOT_FOUND");
      if (current.session_status !== "completed") throw new Error("EPER_CUSTOMER_ASSET_UPLOAD_NOT_COMPLETED");
      if (current.scan_status !== "pending") {
        if (current.scan_status === input.scanStatus) {
          const existing = await client.query<AssetRow>(
            `SELECT tenant_id, asset_id, repository_scope, owner_application_id, display_name,
              original_file_name, media_category, mime_type, file_extension, size_bytes,
              checksum_sha256, storage_adapter_key, upload_status, scan_status, lifecycle_status,
              version, created_by, created_at
             FROM eper_customer_assets WHERE tenant_id = $1 AND asset_id = $2`,
            [input.tenantId, current.asset_id],
          );
          await client.query("COMMIT");
          return mapAsset(existing.rows[0]);
        }
        throw new Error("EPER_CUSTOMER_ASSET_SCAN_RESULT_CONFLICT");
      }
      if (current.upload_status !== "scanning") {
        throw new Error("EPER_CUSTOMER_ASSET_NOT_AWAITING_SCAN");
      }
      if (current.job_state !== "leased" || current.lease_owner !== input.workerId || !current.lease_active) {
        throw new Error("EPER_CUSTOMER_ASSET_SCAN_LEASE_LOST");
      }
      const uploadStatus: CustomerAssetStatus =
        input.scanStatus === "clean" || input.scanStatus === "not_required" ? "available"
          : input.scanStatus === "infected" ? "rejected" : "failed";
      const lifecycleStatus = input.scanStatus === "infected" || input.scanStatus === "error"
        ? "quarantined" : "active";
      const updated = await client.query<AssetRow>(
        `UPDATE eper_customer_assets
            SET upload_status = $3, scan_status = $4, lifecycle_status = $5,
                updated_by = $6, updated_at = now(), version = version + 1
          WHERE tenant_id = $1 AND asset_id = $2
          RETURNING tenant_id, asset_id, repository_scope, owner_application_id, display_name,
            original_file_name, media_category, mime_type, file_extension, size_bytes,
            checksum_sha256, storage_adapter_key, upload_status, scan_status, lifecycle_status,
            version, created_by, created_at`,
        [input.tenantId, current.asset_id, uploadStatus, input.scanStatus, lifecycleStatus, input.scannerServiceId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error("EPER_CUSTOMER_ASSET_SCAN_RESULT_UPDATE_FAILED");
      const finalized = await client.query(
        `UPDATE eper_customer_asset_scan_jobs
            SET state = CASE WHEN $5 = 'error' THEN 'dead_letter' ELSE 'completed' END,
                lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
          WHERE tenant_id = $1 AND application_id = $2 AND upload_session_id = $3
            AND state = 'leased' AND lease_owner = $4 AND lease_expires_at > now()`,
        [input.tenantId, input.applicationId, input.uploadSessionId, input.workerId, input.scanStatus],
      );
      if (finalized.rowCount !== 1) throw new Error("EPER_CUSTOMER_ASSET_SCAN_LEASE_LOST");
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "service", actorId: input.scannerServiceId, action: "customer.asset.scan.complete",
        outcome: "success", resourceType: "customer-asset", resourceId: current.asset_id,
        correlationId: input.correlationId, source: "integration",
        operationName: "customer asset scanner callback",
        payload: { assetId: current.asset_id, scanStatus: input.scanStatus, resultingAssetStatus: uploadStatus },
      });
      await client.query("COMMIT");
      return mapAsset(row);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  async link(input: LinkCustomerAssetInput): Promise<void> {
    this.validateId(input.tenantId, "tenantId");
    this.validateId(input.applicationId, "applicationId");
    this.validateId(input.actorId, "actorId");
    this.validateId(input.assetId, "assetId");
    if (!/^[a-zA-Z0-9._:-]{16,128}$/.test(input.idempotencyKey)) throw new Error("EPER_CUSTOMER_ASSET_IDEMPOTENCY_KEY_INVALID");
    if (!input.correlationId?.trim()) throw new Error("EPER_CUSTOMER_ASSET_CORRELATION_ID_REQUIRED");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.setContext(client, input.tenantId, input.applicationId);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["eper-asset-link:" + input.tenantId + ":" + input.applicationId + ":" + input.assetId]);
      const prior = await client.query<{ asset_id: string }>(
        "SELECT asset_id FROM eper_customer_asset_application_links WHERE tenant_id = $1 AND application_id = $2 AND asset_id = $3 FOR UPDATE",
        [input.tenantId, input.applicationId, input.assetId],
      );
      if (prior.rows[0]) {
        await client.query("COMMIT");
        return;
      }
      await client.query(
        `INSERT INTO eper_customer_asset_application_links
          (tenant_id, application_id, asset_id, linked_by, link_reason, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [input.tenantId, input.applicationId, input.assetId, input.actorId, input.reason, input.idempotencyKey],
      );
      await appendAuditEventInTransaction(client as AuditSqlClient, {
        tenantId: input.tenantId, applicationId: input.applicationId, environment: input.environment,
        actorType: "human", actorId: input.actorId, action: "customer.asset.application.link",
        outcome: "success", resourceType: "customer-asset", resourceId: input.assetId,
        correlationId: input.correlationId, idempotencyKey: input.idempotencyKey,
        source: "api", operationName: "POST /customer/assets/:assetId/applications",
        payload: { assetId: input.assetId, applicationId: input.applicationId, reason: input.reason },
      });
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  private async setContext(client: AuditSqlClient, tenantId: string, applicationId: string): Promise<void> {
    await client.query("SELECT set_config('eper.tenant_id', $1, true), set_config('eper.application_id', $2, true)", [tenantId, applicationId]);
  }
  private validateId(value: string, name: string): void {
    if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{2,128}$/.test(value)) {
      throw new Error("EPER_CUSTOMER_ASSET_INVALID_" + name.toUpperCase());
    }
  }
}
