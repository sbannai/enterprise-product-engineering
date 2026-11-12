import type { CustomerAssetScanChildStart } from "./customer-asset-scan-child-protocol.js";
import type { CustomerAssetScanChildSpiffeIdentity } from "./customer-asset-scan-child-spiffe-identity.js";
import type {
  CustomerAssetScanChildResolvedInput,
  PostgresCustomerAssetScanChildInputResolver,
} from "./customer-asset-scan-child-input-resolver.js";
import { CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY } from "./customer-asset-scan-child-identity.js";

export interface CustomerAssetScanChildDatabaseCredentialResolver<TCredentials> {
  resolveScanCredentials(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
    scannerServiceId: string;
    capability: typeof CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY;
  }): Promise<TCredentials>;
}

export interface CustomerAssetScanChildDatabaseAuthorization<TCredentials> {
  readonly context: CustomerAssetScanChildResolvedInput;
  readonly credentials: TCredentials;
}

/**
 * Database-authoritative child authorization path. The only authorization
 * scope passed to provider credential resolution is returned by the
 * session_user-bound PostgreSQL context function after its SPIFFE ID matches
 * the independently verified current-process SVID. No JWT-like claims object
 * or tenant/connection claim from IPC is accepted here.
 */
export class CustomerAssetScanChildDatabaseAuthorizationService<TCredentials> {
  constructor(
    private readonly contextResolver: Pick<PostgresCustomerAssetScanChildInputResolver, "resolve">,
    private readonly credentials: CustomerAssetScanChildDatabaseCredentialResolver<TCredentials>,
  ) {}

  async authorize(input: {
    start: CustomerAssetScanChildStart;
    workload: CustomerAssetScanChildSpiffeIdentity;
  }): Promise<CustomerAssetScanChildDatabaseAuthorization<TCredentials>> {
    const context = await this.contextResolver.resolve(input);
    let credentials: TCredentials;
    try {
      credentials = await this.credentials.resolveScanCredentials({
        tenantId: context.tenantId,
        applicationId: context.applicationId,
        connectionId: context.providerConnectionId,
        scannerServiceId: context.scannerServiceId,
        capability: CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY,
      });
    } catch {
      throw new CustomerAssetScanChildDatabaseAuthorizationError();
    }
    if (credentials === null || credentials === undefined) {
      throw new CustomerAssetScanChildDatabaseAuthorizationError();
    }
    return Object.freeze({ context, credentials });
  }
}

export class CustomerAssetScanChildDatabaseAuthorizationError extends Error {
  constructor() {
    super("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_AUTHORIZATION_UNAVAILABLE");
    this.name = "CustomerAssetScanChildDatabaseAuthorizationError";
  }
}
