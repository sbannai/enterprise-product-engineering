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
      const result = await client.query<{ assets: string | null; links: string | null; sessions: string | null }>(
        "SELECT to_regclass('public.eper_customer_assets')::text AS assets, to_regclass('public.eper_customer_asset_application_links')::text AS links, to_regclass('public.eper_customer_asset_upload_sessions')::text AS sessions",
      );
      const row = result.rows[0];
      if (!row?.assets || !row.links || !row.sessions) throw new Error("EPER_CUSTOMER_ASSET_SCHEMA_NOT_APPLIED");
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
      const inserted = await client.query<AssetRow>(
        `INSERT INTO eper_customer_assets (
          tenant_id, asset_id, repository_scope, owner_application_id, display_name,
          original_file_name, media_category, mime_type, file_extension, size_bytes,
          checksum_sha256, storage_adapter_key, storage_object_reference, upload_status,
          scan_status, lifecycle_status, created_by, updated_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending','pending','active',$14,$14)
        RETURNING tenant_id, asset_id, repository_scope, owner_application_id, display_name,
          original_file_name, media_category, mime_type, file_extension, size_bytes,
          checksum_sha256, storage_adapter_key, upload_status, scan_status, lifecycle_status,
          version, created_by, created_at`,
        [input.tenantId, assetId, input.scope, input.ownerApplicationId ?? null,
          input.displayName, input.originalFileName, input.mediaCategory, input.mimeType,
          input.fileExtension.toLowerCase().replace(/^\\./, ""), input.sizeBytes,
          input.checksumSha256 ?? null, input.storageAdapterKey, input.storageObjectReference, input.actorId],
      );
      const row = inserted.rows[0];
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
    if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{2,128}$/.test(value)) {
      throw new Error("EPER_CUSTOMER_ASSET_INVALID_" + name.toUpperCase());
    }
  }
}
