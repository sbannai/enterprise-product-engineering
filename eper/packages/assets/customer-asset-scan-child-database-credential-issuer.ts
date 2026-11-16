import type { CustomerAssetScanChildSpiffeIdentity } from "./customer-asset-scan-child-spiffe-identity.js";
import { isVerifiedCustomerAssetScanChildSpiffeIdentity } from "./customer-asset-scan-child-spiffe-identity.js";

/**
 * Deployment-owned signer. It must cryptographically validate the CSR signature,
 * issue for its public key, ignore the CSR subject, set the certificate CN to
 * databaseRole, add clientAuth EKU, enforce notAfter, and never receive or return
 * a private key. This adapter cannot substitute for that real signer.
 */
export interface CustomerAssetScanChildClientCertificateSigner {
  sign(input: {
    readonly csrPem: string;
    readonly databaseRole: string;
    readonly notAfterEpochSeconds: number;
  }): Promise<string>;
}

export interface CustomerAssetScanChildDatabaseCredential {
  readonly databaseRole: string;
  readonly clientCertificatePem: string;
  readonly expiresAt: number;
}

export class CustomerAssetScanChildCredentialIssuanceError extends Error {
  readonly code = "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE" as const;
  constructor() {
    super("CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_ISSUANCE_UNAVAILABLE");
    this.name = "CustomerAssetScanChildCredentialIssuanceError";
  }
}

function boundedPem(value: unknown, header: string): value is string {
  return typeof value === "string" && value.length >= 80 && value.length <= 65_536 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) &&
    value.includes(`-----BEGIN ${header}-----`) &&
    value.includes(`-----END ${header}-----`);
}

/**
 * Maps a verifier-proven workload identity to one fixed PostgreSQL login.
 * The CSR contributes only its public key: its subject/role is never used to
 * select the database role. The signer is a deployment-owned trust boundary.
 *
 * This class is a contract adapter, not a production CA or SPIRE issuer.
 */
export class CustomerAssetScanChildDatabaseCredentialIssuer {
  private readonly roleBySpiffeId: ReadonlyMap<string, string>;

  constructor(
    roleBySpiffeId: ReadonlyMap<string, string>,
    private readonly signer: CustomerAssetScanChildClientCertificateSigner,
    private readonly lifetimeSeconds = 120,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 30 || lifetimeSeconds > 300) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_POLICY_INVALID");
    }
    const snapshot = new Map(roleBySpiffeId);
    for (const [identity, role] of snapshot) {
      if (!/^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~/-]+$/.test(identity) ||
          !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
        throw new Error("CUSTOMER_ASSET_SCAN_CHILD_CREDENTIAL_POLICY_INVALID");
      }
    }
    this.roleBySpiffeId = snapshot;
  }

  async issue(input: {
    readonly workload: CustomerAssetScanChildSpiffeIdentity;
    readonly csrPem: string;
  }): Promise<CustomerAssetScanChildDatabaseCredential> {
    try {
      const workload = input?.workload;
      if (!isVerifiedCustomerAssetScanChildSpiffeIdentity(workload) ||
          !boundedPem(input?.csrPem, "CERTIFICATE REQUEST")) {
        throw new Error("untrusted issuance input");
      }
      const databaseRole = this.roleBySpiffeId.get(workload.spiffeId);
      if (!databaseRole) throw new Error("identity not entitled");
      const issuedAt = this.now();
      if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0 ||
          !Number.isSafeInteger(workload.expiresAt) || workload.expiresAt <= issuedAt) {
        throw new Error("invalid or expired workload identity");
      }
      // Never let a database credential outlive the SVID that authorized it.
      const expiresAt = Math.min(issuedAt + this.lifetimeSeconds, workload.expiresAt);
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) {
        throw new Error("invalid credential expiry");
      }
      const clientCertificatePem = await this.signer.sign({
        csrPem: input.csrPem,
        databaseRole,
        notAfterEpochSeconds: expiresAt,
      });
      if (!boundedPem(clientCertificatePem, "CERTIFICATE")) throw new Error("invalid certificate");
      return Object.freeze({ databaseRole, clientCertificatePem, expiresAt });
    } catch {
      throw new CustomerAssetScanChildCredentialIssuanceError();
    }
  }
}
