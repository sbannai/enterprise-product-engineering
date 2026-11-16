/**
 * SPIFFE Workload API identity adapter boundary for scanner child processes.
 *
 * The SDK fetch operation is made by the child itself through the local
 * Workload API. SPIRE attests the calling process out-of-band. No parent IPC,
 * environment claim, or caller-provided token is accepted as identity.
 */
export const CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE =
  "eper:customer-asset-scan-child" as const;

export interface SpiffeWorkloadApiJwtSvid {
  spiffeId: string;
  expiresAtMs: number;
}

/** Narrow port implemented by the SPIFFE SDK adapter. */
export interface SpiffeWorkloadApiClient {
  fetchJwtSvid(input: {
    audience: readonly [typeof CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE];
    spiffeId: string;
    signal?: AbortSignal;
  }): Promise<readonly SpiffeWorkloadApiJwtSvid[]>;
}

export interface CustomerAssetScanChildSpiffeIdentity {
  readonly spiffeId: string;
  readonly trustDomain: string;
  readonly audience: typeof CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE;
  readonly expiresAt: number;
}

// A WeakSet makes verification provenance unforgeable by constructing a structurally
// identical object. Only this module's successful Workload API verifier can register it.
const verifiedCurrentProcessIdentities = new WeakSet<object>();

export function isVerifiedCustomerAssetScanChildSpiffeIdentity(
  value: unknown,
): value is CustomerAssetScanChildSpiffeIdentity {
  return typeof value === "object" && value !== null &&
    verifiedCurrentProcessIdentities.has(value);
}

export class CustomerAssetScanChildSpiffeIdentityError extends Error {
  constructor(readonly code:
    | "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_UNAVAILABLE"
    | "CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID") {
    super(code);
    this.name = "CustomerAssetScanChildSpiffeIdentityError";
  }
}

function validSpiffeId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  return /^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value) &&
    !value.includes("..") && !value.includes("//", 9);
}

function validTrustDomain(value: string): boolean {
  return /^[a-z0-9.-]+$/.test(value) && value.length <= 253 &&
    !value.startsWith(".") && !value.endsWith(".") && !value.includes("..");
}

/**
 * Fetches the current process's own short-lived SVID. The SDK delegates
 * caller attestation to SPIRE through the local Workload API. We deliberately
 * do not call ValidateJWTSVID on this locally fetched token: that RPC is for
 * validating an incoming SVID from another workload.
 */
export class CustomerAssetScanChildSpiffeIdentityVerifier {
  constructor(
    private readonly client: SpiffeWorkloadApiClient,
    private readonly expectedSpiffeId: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!validSpiffeId(expectedSpiffeId)) {
      throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID");
    }
  }

  async verifyCurrentProcessIdentity(signal?: AbortSignal): Promise<CustomerAssetScanChildSpiffeIdentity> {
    try {
      const fetched = await this.client.fetchJwtSvid({
        audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
        spiffeId: this.expectedSpiffeId,
        ...(signal ? { signal } : {}),
      });
      if (!Array.isArray(fetched) || fetched.length !== 1 ||
          fetched[0]?.spiffeId !== this.expectedSpiffeId ||
          !Number.isSafeInteger(fetched[0]?.expiresAtMs)) {
        throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID");
      }

      const expiresAt = Math.floor(fetched[0].expiresAtMs / 1000);
      const nowSeconds = Math.floor(this.now() / 1000);
      const trustDomain = this.expectedSpiffeId.slice("spiffe://".length).split("/")[0];

      if (!validTrustDomain(trustDomain) ||
          expiresAt <= nowSeconds ||
          expiresAt - nowSeconds > 300) {
        throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID");
      }

      const identity: CustomerAssetScanChildSpiffeIdentity = Object.freeze({
        spiffeId: this.expectedSpiffeId,
        trustDomain,
        audience: CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
        expiresAt,
      });
      verifiedCurrentProcessIdentities.add(identity);
      return identity;
    } catch (error) {
      if (error instanceof CustomerAssetScanChildSpiffeIdentityError) throw error;
      throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_UNAVAILABLE");
    }
  }
}
