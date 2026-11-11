/**
 * SPIFFE Workload API identity adapter boundary for scanner child processes.
 *
 * The concrete transport must use gRPC over the local Workload API Unix socket.
 * SPIRE performs caller attestation out-of-band; this adapter never treats an
 * environment variable, parent IPC claim, or caller-provided token as identity.
 *
 * JWT signature, issuer, expiry and audience validation are delegated to the
 * Workload API ValidateJWTSVID RPC, as recommended by the SPIFFE specification.
 */
export const CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE =
  "eper:customer-asset-scan-child" as const;

export interface SpiffeWorkloadApiJwtSvid {
  spiffeId: string;
  svid: string;
}

export interface SpiffeWorkloadApiValidatedJwtSvid {
  spiffeId: string;
  claims: Readonly<Record<string, unknown>>;
}

/**
 * Narrow port implemented by the gRPC transport. The implementation must
 * connect only to the configured local SPIFFE Workload Endpoint and use its
 * FetchJWTSVID and ValidateJWTSVID RPCs.
 */
export interface SpiffeWorkloadApiClient {
  fetchJwtSvid(input: {
    audience: readonly [typeof CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE];
    spiffeId: string;
  }): Promise<readonly SpiffeWorkloadApiJwtSvid[]>;
  validateJwtSvid(input: {
    audience: typeof CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE;
    svid: string;
  }): Promise<SpiffeWorkloadApiValidatedJwtSvid>;
}

export interface CustomerAssetScanChildSpiffeIdentity {
  readonly spiffeId: string;
  readonly trustDomain: string;
  readonly audience: typeof CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly tokenId: string;
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
  // SPIFFE IDs are URI values. Reject credentials, query, fragment, and path
  // traversal; the expected ID is compared byte-for-byte after this check.
  return /^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value) &&
    !value.includes("..") && !value.includes("//", 9);
}

function validTrustDomain(value: string): boolean {
  return /^[a-z0-9.-]+$/.test(value) && value.length <= 253 &&
    !value.startsWith(".") && !value.endsWith(".") && !value.includes("..");
}

function stringClaim(claims: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = claims[key];
  return typeof value === "string" && value.length > 0 && value.length <= 512 ? value : undefined;
}

function numericClaim(claims: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = claims[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function audienceIncludes(value: unknown): boolean {
  return value === CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE ||
    (Array.isArray(value) && value.includes(CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE));
}

/**
 * Obtains a short-lived SVID for the current process and asks the local SPIFFE
 * Workload API to validate it. No JWT is parsed or cryptographically verified
 * in application code, and the token is never returned or logged.
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

  async verifyCurrentProcessIdentity(): Promise<CustomerAssetScanChildSpiffeIdentity> {
    try {
      const fetched = await this.client.fetchJwtSvid({
        audience: [CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE],
        spiffeId: this.expectedSpiffeId,
      });
      if (!Array.isArray(fetched) || fetched.length !== 1 ||
          fetched[0]?.spiffeId !== this.expectedSpiffeId ||
          typeof fetched[0]?.svid !== "string" || fetched[0].svid.length < 16 ||
          fetched[0].svid.length > 16_384) {
        throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID");
      }

      const validated = await this.client.validateJwtSvid({
        audience: CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
        svid: fetched[0].svid,
      });
      const claims = validated?.claims;
      if (!validated || validated.spiffeId !== this.expectedSpiffeId ||
          !claims || typeof claims !== "object" || Array.isArray(claims)) {
        throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID");
      }

      const subject = stringClaim(claims, "sub");
      const issuer = stringClaim(claims, "iss");
      const tokenAudience = claims.aud;
      const issuedAt = numericClaim(claims, "iat");
      const expiresAt = numericClaim(claims, "exp");
      const tokenId = stringClaim(claims, "jti");
      const trustDomain = this.expectedSpiffeId.slice("spiffe://".length).split("/")[0];
      const nowSeconds = Math.floor(this.now() / 1000);

      if (!validTrustDomain(trustDomain) ||
          subject !== this.expectedSpiffeId ||
          issuer !== trustDomain ||
          !audienceIncludes(tokenAudience) ||
          !issuedAt || !expiresAt || !tokenId ||
          issuedAt > nowSeconds + 30 ||
          expiresAt <= nowSeconds ||
          expiresAt <= issuedAt ||
          expiresAt - issuedAt > 300) {
        throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_INVALID");
      }

      return Object.freeze({
        spiffeId: this.expectedSpiffeId,
        trustDomain,
        audience: CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_AUDIENCE,
        issuedAt,
        expiresAt,
        tokenId,
      });
    } catch (error) {
      if (error instanceof CustomerAssetScanChildSpiffeIdentityError) throw error;
      throw new CustomerAssetScanChildSpiffeIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SPIFFE_UNAVAILABLE");
    }
  }
}
