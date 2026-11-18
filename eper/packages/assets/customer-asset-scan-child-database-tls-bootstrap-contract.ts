import type { CustomerAssetScanChildSpiffeIdentityVerifier } from "./customer-asset-scan-child-spiffe-identity.js";
import type { CustomerAssetScanChildDatabaseCredentialIssuer } from "./customer-asset-scan-child-database-credential-issuer.js";

export interface CustomerAssetScanChildDatabaseTlsBootstrap {
  readonly identity: Pick<CustomerAssetScanChildSpiffeIdentityVerifier, "verifyCurrentProcessIdentity">;
  readonly issuer: Pick<CustomerAssetScanChildDatabaseCredentialIssuer, "issue">;
  readonly caPem: string;
  readonly databaseCaPem: string;
  close?: () => void | Promise<void>;
}

export function assertCustomerAssetScanChildDatabaseTlsBootstrap(value: unknown):
  asserts value is CustomerAssetScanChildDatabaseTlsBootstrap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_TLS_BOOTSTRAP_INVALID");
  }
  const bootstrap = value as Record<string, unknown>;
  const identity = bootstrap.identity as Record<string, unknown> | null;
  const issuer = bootstrap.issuer as Record<string, unknown> | null;
  if (!identity || typeof identity.verifyCurrentProcessIdentity !== "function" ||
      !issuer || typeof issuer.issue !== "function" ||
      typeof bootstrap.caPem !== "string" ||
      typeof bootstrap.databaseCaPem !== "string" ||
      (bootstrap.close !== undefined && typeof bootstrap.close !== "function")) {
    throw new Error("CUSTOMER_ASSET_SCAN_CHILD_DATABASE_TLS_BOOTSTRAP_INVALID");
  }
}
