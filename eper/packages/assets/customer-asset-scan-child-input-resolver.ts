import { isCustomerAssetScanChildStart, type CustomerAssetScanChildStart } from "./customer-asset-scan-child-protocol.js";
import type { CustomerAssetScanChildIdentityClaims } from "./customer-asset-scan-child-identity.js";
import { CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE, type CustomerAssetScanChildSpiffeIdentity } from "./customer-asset-scan-child-spiffe-identity.js";

/** Structural subset of node-postgres used by the dedicated child LOGIN pool. */
export interface CustomerAssetScanChildSqlExecutor {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface CustomerAssetScanChildResolvedInput {
  readonly assetId: string;
  readonly storageAdapterKey: string;
  readonly providerObjectReference: string;
  readonly providerUploadReference: string;
  readonly checksumSha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly attempt: number;
  readonly providerConnectionId: string;
}

export class CustomerAssetScanChildInputResolverError extends Error {
  constructor(readonly code:
    | "CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID"
    | "CUSTOMER_ASSET_SCAN_CHILD_INPUT_UNAVAILABLE"
    | "CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE"
    | "CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_BINDING_INVALID") {
    super(code);
    this.name = "CustomerAssetScanChildInputResolverError";
  }
}

function boundedText(value: unknown, maximum = 2048): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validIdentityClaims(value: unknown, nowSeconds: number): value is CustomerAssetScanChildIdentityClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Record<string, unknown>;
  return boundedText(claims.issuer, 128) &&
    boundedText(claims.subject, 128) &&
    claims.audience === "eper:customer-asset-scan-child" &&
    boundedText(claims.tenantId, 128) &&
    boundedText(claims.applicationId, 128) &&
    boundedText(claims.connectionId, 128) &&
    boundedText(claims.scannerServiceId, 128) &&
    claims.capability === "storage.object.read.internal" &&
    boundedText(claims.tokenId, 128) &&
    typeof claims.issuedAt === "number" && Number.isSafeInteger(claims.issuedAt) &&
    typeof claims.expiresAt === "number" && Number.isSafeInteger(claims.expiresAt) &&
    claims.issuedAt > 0 && claims.expiresAt > claims.issuedAt &&
    claims.issuedAt <= nowSeconds + 30 &&
    claims.expiresAt > nowSeconds - 30 &&
    claims.expiresAt - claims.issuedAt <= 300;
}

function validWorkloadIdentity(value: unknown, nowSeconds: number): value is CustomerAssetScanChildSpiffeIdentity {
  if (!value || typeof value !== "object") return false;
  const workload = value as Record<string, unknown>;
  if (typeof workload.spiffeId !== "string" || typeof workload.trustDomain !== "string" ||
      workload.audience !== CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE ||
      typeof workload.expiresAt !== "number" || !Number.isSafeInteger(workload.expiresAt)) return false;
  const match = /^spiffe:\/\/([a-z0-9.-]+)\/([A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)$/.exec(workload.spiffeId);
  return !!match && !workload.spiffeId.includes("..") &&
    match[1] === workload.trustDomain &&
    workload.expiresAt > nowSeconds &&
    workload.expiresAt - nowSeconds <= 300;
}

/**
 * Resolves scan metadata only through the SECURITY DEFINER functions installed
 * by migrations 046 and 052. The supplied executor must be a dedicated child
 * LOGIN connection with EXECUTE grants only; never pass the parent worker pool.
 * No direct business-table query or secret reference is accepted here.
 */
export class PostgresCustomerAssetScanChildInputResolver {
  constructor(private readonly sql: CustomerAssetScanChildSqlExecutor) {}

  async resolve(input: {
    start: CustomerAssetScanChildStart;
    identity: CustomerAssetScanChildIdentityClaims;
    workload: CustomerAssetScanChildSpiffeIdentity;
  }): Promise<CustomerAssetScanChildResolvedInput> {
    const { start, identity, workload } = input ?? {};
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!isCustomerAssetScanChildStart(start) ||
        !validIdentityClaims(identity, nowSeconds) ||
        !validWorkloadIdentity(workload, nowSeconds) ||
        !isUuid(start.input.assetId) ||
        !boundedText(start.input.tenantId, 128) ||
        !boundedText(start.input.applicationId, 128) ||
        !boundedText(start.workerId, 128) ||
        !boundedText(start.scannerServiceId, 128) ||
        !Number.isSafeInteger(start.claimGeneration) || start.claimGeneration < 1 ||
        identity.tenantId !== start.input.tenantId ||
        identity.applicationId !== start.input.applicationId ||
        identity.scannerServiceId !== start.scannerServiceId ||
        identity.capability !== "storage.object.read.internal" ||
        !boundedText(identity.connectionId, 128) ||
        !boundedText(workload.spiffeId, 512) ||
        !/^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(workload.spiffeId) ||
        workload.spiffeId.includes("..")) {
      throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID");
    }

    try {
      const result = await this.sql.query<{
        asset_id: string;
        storage_adapter_key: string;
        storage_object_reference: string;
        provider_upload_reference: string;
        checksum_sha256: string;
        size_bytes: number | string;
        mime_type: string;
        attempt: number | string;
      }>(
        "SELECT * FROM public.eper_resolve_customer_asset_scan_child_input($1,$2,$3,$4,$5,$6,$7)",
        [start.input.tenantId, start.input.applicationId, start.input.assetId,
          start.workerId, start.scannerServiceId, start.claimGeneration, workload.spiffeId],
      );
      if (result.rows.length !== 1) {
        throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE");
      }
      const row = result.rows[0];
      const sizeBytes = Number(row.size_bytes);
      const attempt = Number(row.attempt);
      if (row.asset_id !== start.input.assetId ||
          !boundedText(row.storage_adapter_key, 128) ||
          !boundedText(row.storage_object_reference) ||
          !boundedText(row.provider_upload_reference) ||
          !/^[a-f0-9]{64}$/i.test(row.checksum_sha256) ||
          !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 ||
          !Number.isSafeInteger(attempt) || attempt < 1 ||
          row.checksum_sha256.toLowerCase() !== start.input.checksumSha256.toLowerCase() ||
          sizeBytes !== start.input.sizeBytes || row.mime_type !== start.input.mimeType) {
        throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE");
      }

      const binding = await this.sql.query<{ provider_connection_id: string }>(
        "SELECT * FROM public.eper_resolve_customer_asset_scan_child_provider_binding($1,$2,$3,$4,$5,$6,$7)",
        [start.input.tenantId, start.input.applicationId, start.input.assetId,
          start.workerId, start.scannerServiceId, start.claimGeneration, workload.spiffeId],
      );
      if (binding.rows.length !== 1 ||
          !boundedText(binding.rows[0]?.provider_connection_id, 128) ||
          binding.rows[0].provider_connection_id !== identity.connectionId) {
        throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_BINDING_INVALID");
      }

      return Object.freeze({
        assetId: row.asset_id,
        storageAdapterKey: row.storage_adapter_key,
        providerObjectReference: row.storage_object_reference,
        providerUploadReference: row.provider_upload_reference,
        checksumSha256: row.checksum_sha256.toLowerCase(),
        sizeBytes,
        mimeType: row.mime_type,
        attempt,
        providerConnectionId: binding.rows[0].provider_connection_id,
      });
    } catch (error) {
      if (error instanceof CustomerAssetScanChildInputResolverError) throw error;
      // Do not leak SQL, connection, provider, tenant or secret diagnostics.
      throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_INPUT_UNAVAILABLE");
    }
  }
}
