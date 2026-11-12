import { isCustomerAssetScanChildStart, type CustomerAssetScanChildStart } from "./customer-asset-scan-child-protocol.js";
import { CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE, type CustomerAssetScanChildSpiffeIdentity } from "./customer-asset-scan-child-spiffe-identity.js";

/** Structural subset of node-postgres used by the dedicated child LOGIN pool. */
export interface CustomerAssetScanChildSqlExecutor {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface CustomerAssetScanChildResolvedInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly workerId: string;
  readonly scannerServiceId: string;
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
    value.length <= maximum && !/[\\u0000-\\u001f\\u007f]/.test(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
 * Resolves authorization scope and scan metadata from the authenticated
 * PostgreSQL session_user mapping via migration 053. Tenant, application,
 * worker, scanner and provider connection are not supplied to SQL by IPC or
 * by an independently supplied claims object. The verified current-process
 * SVID must match the operator-provisioned SPIFFE ID returned by PostgreSQL.
 */
export class PostgresCustomerAssetScanChildInputResolver {
  constructor(private readonly sql: CustomerAssetScanChildSqlExecutor) {}

  async resolve(input: {
    start: CustomerAssetScanChildStart;
    workload: CustomerAssetScanChildSpiffeIdentity;
  }): Promise<CustomerAssetScanChildResolvedInput> {
    const { start, workload } = input ?? {};
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!isCustomerAssetScanChildStart(start) ||
        !validWorkloadIdentity(workload, nowSeconds) ||
        !isUuid(start.input.assetId) ||
        !boundedText(start.input.tenantId, 128) ||
        !boundedText(start.input.applicationId, 128) ||
        !boundedText(start.workerId, 128) ||
        !boundedText(start.scannerServiceId, 128) ||
        !Number.isSafeInteger(start.claimGeneration) || start.claimGeneration < 1) {
      throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_INPUT_INVALID");
    }

    try {
      const result = await this.sql.query<{
        tenant_id: string;
        application_id: string;
        worker_id: string;
        scanner_service_id: string;
        spiffe_id: string;
        provider_connection_id: string;
        asset_id: string;
        storage_adapter_key: string;
        storage_object_reference: string;
        provider_upload_reference: string;
        checksum_sha256: string;
        size_bytes: number | string;
        mime_type: string;
        attempt: number | string;
      }>(
        "SELECT * FROM public.eper_resolve_customer_asset_scan_child_context($1,$2)",
        [start.input.assetId, start.claimGeneration],
      );
      if (result.rows.length !== 1) {
        throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_INPUT_STALE");
      }
      const row = result.rows[0];
      const sizeBytes = Number(row.size_bytes);
      const attempt = Number(row.attempt);
      if (!boundedText(row.tenant_id, 128) ||
          !boundedText(row.application_id, 128) ||
          !boundedText(row.worker_id, 128) ||
          !boundedText(row.scanner_service_id, 128) ||
          !boundedText(row.spiffe_id, 512) ||
          !boundedText(row.provider_connection_id, 128) ||
          row.tenant_id !== start.input.tenantId ||
          row.application_id !== start.input.applicationId ||
          row.worker_id !== start.workerId ||
          row.scanner_service_id !== start.scannerServiceId ||
          row.spiffe_id !== workload.spiffeId) {
        throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_PROVIDER_BINDING_INVALID");
      }
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

      return Object.freeze({
        tenantId: row.tenant_id,
        applicationId: row.application_id,
        workerId: row.worker_id,
        scannerServiceId: row.scanner_service_id,
        assetId: row.asset_id,
        storageAdapterKey: row.storage_adapter_key,
        providerObjectReference: row.storage_object_reference,
        providerUploadReference: row.provider_upload_reference,
        checksumSha256: row.checksum_sha256.toLowerCase(),
        sizeBytes,
        mimeType: row.mime_type,
        attempt,
        providerConnectionId: row.provider_connection_id,
      });
    } catch (error) {
      if (error instanceof CustomerAssetScanChildInputResolverError) throw error;
      // Do not leak SQL, connection, provider, tenant or secret diagnostics.
      throw new CustomerAssetScanChildInputResolverError("CUSTOMER_ASSET_SCAN_CHILD_INPUT_UNAVAILABLE");
    }
  }
}
