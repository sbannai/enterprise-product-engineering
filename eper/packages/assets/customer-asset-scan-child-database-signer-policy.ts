/**
 * Signer-side authorization core. This code belongs in the isolated signer
 * process, which must have its own SPIRE Workload API identity and CA access.
 * The scanner child cannot supply an authoritative role, audience, SPIFFE ID,
 * trust domain, or certificate expiry.
 */
export interface CustomerAssetScanChildJwtSvidValidator {
  validateJwt(
    audience: string,
    token: string,
  ): Promise<{
    readonly spiffeId: string;
    readonly claims: Readonly<Record<string, unknown>>;
  } | null>;
}

export interface CustomerAssetScanChildCertificateAuthority {
  sign(input: {
    readonly csrPem: string;
    readonly databaseRole: string;
    readonly notAfterEpochSeconds: number;
  }): Promise<string>;
}

export interface CustomerAssetScanChildSignerPolicy {
  readonly expectedAudience: string;
  readonly roleBySpiffeId: ReadonlyMap<string, string>;
  readonly maximumLifetimeSeconds?: number;
}

function validPem(value: unknown): value is string {
  return typeof value === "string" && value.length >= 80 && value.length <= 65_536 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) &&
    value.includes("-----BEGIN CERTIFICATE REQUEST-----") &&
    value.includes("-----END CERTIFICATE REQUEST-----");
}

export class CustomerAssetScanChildSignerAuthorizationError extends Error {
  readonly code = "CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED" as const;
  constructor() {
    super("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_DENIED");
    this.name = "CustomerAssetScanChildSignerAuthorizationError";
  }
}

/**
 * Independently validates a scanner JWT-SVID, derives its DB LOGIN from
 * signer-owned policy, and delegates CSR signing to a CA adapter that must
 * validate the CSR proof-of-possession and issue only clientAuth certificates.
 */
export class CustomerAssetScanChildDatabaseSignerPolicy {
  private readonly roleBySpiffeId: ReadonlyMap<string, string>;
  private readonly maximumLifetimeSeconds: number;
  private readonly audience: string;

  constructor(
    policy: CustomerAssetScanChildSignerPolicy,
    private readonly validator: CustomerAssetScanChildJwtSvidValidator,
    private readonly authority: CustomerAssetScanChildCertificateAuthority,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    const lifetime = policy.maximumLifetimeSeconds ?? 120;
    if (typeof policy.expectedAudience !== "string" || policy.expectedAudience.length < 1 ||
        policy.expectedAudience.length > 256 ||
        !Number.isSafeInteger(lifetime) || lifetime < 30 || lifetime > 300 ||
        !(policy.roleBySpiffeId instanceof Map) || policy.roleBySpiffeId.size === 0) {
      throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_POLICY_INVALID");
    }
    const snapshot = new Map(policy.roleBySpiffeId);
    for (const [spiffeId, role] of snapshot) {
      if (!/^spiffe:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~/-]+$/.test(spiffeId) ||
          !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
        throw new Error("CUSTOMER_ASSET_SCAN_CHILD_SIGNER_POLICY_INVALID");
      }
    }
    this.roleBySpiffeId = snapshot;
    this.maximumLifetimeSeconds = lifetime;
    this.audience = policy.expectedAudience;
  }

  async sign(input: {
    readonly csrPem: string;
    readonly workloadJwtSvid: string;
  }): Promise<string> {
    try {
      if (!validPem(input?.csrPem) ||
          typeof input?.workloadJwtSvid !== "string" ||
          input.workloadJwtSvid.length < 20 ||
          input.workloadJwtSvid.length > 16_384 ||
          /[\u0000-\u0020\u007f]/.test(input.workloadJwtSvid)) {
        throw new Error("invalid request");
      }
      const validated = await this.validator.validateJwt(
        this.expectedAudience(),
        input.workloadJwtSvid,
      );
      if (!validated || typeof validated.spiffeId !== "string") {
        throw new Error("invalid workload SVID");
      }
      const databaseRole = this.roleBySpiffeId.get(validated.spiffeId);
      if (!databaseRole) throw new Error("identity not authorized");
      const now = this.now();
      const svidExpiry = validated.claims.exp;
      if (!Number.isSafeInteger(now) || now <= 0 ||
          typeof svidExpiry !== "number" || !Number.isSafeInteger(svidExpiry) ||
          svidExpiry <= now) {
        throw new Error("expired or malformed workload SVID");
      }
      const notAfterEpochSeconds = Math.min(
        now + this.maximumLifetimeSeconds,
        svidExpiry,
      );
      if (notAfterEpochSeconds <= now) throw new Error("invalid certificate lifetime");
      const certificate = await this.authority.sign({
        csrPem: input.csrPem,
        databaseRole,
        notAfterEpochSeconds,
      });
      if (typeof certificate !== "string" ||
          !certificate.includes("-----BEGIN CERTIFICATE-----") ||
          !certificate.includes("-----END CERTIFICATE-----")) {
        throw new Error("invalid signer output");
      }
      return certificate;
    } catch {
      throw new CustomerAssetScanChildSignerAuthorizationError();
    }
  }

  private expectedAudience(): string {
    return this.audience;
  }
}
