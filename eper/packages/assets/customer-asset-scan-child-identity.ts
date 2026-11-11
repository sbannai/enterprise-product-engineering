/**
 * Independently authenticated, scan-only runtime identity for a per-job child.
 *
 * The child obtains its identity through a platform bootstrap channel (for
 * example, a workload-identity socket or inherited dedicated file descriptor).
 * No identity token, secret reference, credential or parent DB handle is carried
 * in the job IPC envelope or inherited from the parent process environment.
 */
export const CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE = "eper:customer-asset-scan-child" as const;
export const CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY = "storage.object.scan" as const;

export interface CustomerAssetScanChildIdentityClaims {
  issuer: string;
  subject: string;
  audience: typeof CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE;
  tenantId: string;
  applicationId: string;
  connectionId: string;
  scannerServiceId: string;
  capability: typeof CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY;
  issuedAt: number;
  expiresAt: number;
  tokenId: string;
}

/**
 * Implementations must authenticate the current child process out-of-band.
 * They must verify signature/attestation, issuer, audience, expiry and token
 * integrity before returning claims. They must never accept identity claims
 * supplied by the parent IPC message.
 */
export interface CustomerAssetScanChildIdentityVerifier {
  verifyCurrentProcessIdentity(): Promise<unknown>;
}

/**
 * Resolves credentials only after identity validation. Implementations must
 * revalidate the live tenant/application provider binding and policy, require
 * the exact connectionId in the authenticated identity, and resolve the
 * opaque secret reference server-side. No reference is accepted from IPC.
 */
export interface CustomerAssetScanChildCredentialResolver<TCredentials> {
  resolveScanCredentials(input: {
    tenantId: string;
    applicationId: string;
    connectionId: string;
    scannerServiceId: string;
    capability: typeof CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY;
  }): Promise<TCredentials>;
}

export interface CustomerAssetScanChildAuthorization<TCredentials> {
  identity: Readonly<CustomerAssetScanChildIdentityClaims>;
  credentials: TCredentials;
}

export class CustomerAssetScanChildIdentityError extends Error {
  constructor(readonly code:
    | "CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_UNAVAILABLE"
    | "CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_INVALID"
    | "CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_EXPIRED"
    | "CUSTOMER_ASSET_SCAN_CHILD_SCOPE_MISMATCH"
    | "CUSTOMER_ASSET_SCAN_CHILD_CREDENTIALS_UNAVAILABLE"
    | "CUSTOMER_ASSET_SCAN_CHILD_RUNTIME_DISABLED") {
    super(code);
    this.name = "CustomerAssetScanChildIdentityError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedIdentity(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseClaims(value: unknown): CustomerAssetScanChildIdentityClaims {
  const keys = [
    "issuer", "subject", "audience", "tenantId", "applicationId", "connectionId",
    "scannerServiceId", "capability", "issuedAt", "expiresAt", "tokenId",
  ] as const;
  if (!isRecord(value) || !exactKeys(value, keys) ||
      !boundedIdentity(value.issuer) || !boundedIdentity(value.subject) ||
      value.audience !== CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE ||
      !boundedIdentity(value.tenantId) || !boundedIdentity(value.applicationId) ||
      !boundedIdentity(value.connectionId) || !boundedIdentity(value.scannerServiceId) ||
      value.capability !== CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY ||
      !boundedIdentity(value.tokenId) ||
      !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt) ||
      (value.issuedAt as number) <= 0 || (value.expiresAt as number) <= 0) {
    throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_INVALID");
  }
  return Object.freeze({
    issuer: value.issuer,
    subject: value.subject,
    audience: CUSTOMER_ASSET_SCAN_CHILD_AUDIENCE,
    tenantId: value.tenantId,
    applicationId: value.applicationId,
    connectionId: value.connectionId,
    scannerServiceId: value.scannerServiceId,
    capability: CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY,
    issuedAt: value.issuedAt as number,
    expiresAt: value.expiresAt as number,
    tokenId: value.tokenId,
  });
}

/**
 * Child-local authorization boundary. The verifier is responsible for proving
 * process identity cryptographically; this service then pins the proof to the
 * exact scan tenant/application/scanner and a single scan capability.
 */
export class CustomerAssetScanChildIdentityService<TCredentials> {
  constructor(
    private readonly verifier: CustomerAssetScanChildIdentityVerifier,
    private readonly credentials: CustomerAssetScanChildCredentialResolver<TCredentials>,
    private readonly options: {
      now?: () => number;
      expectedIssuer: string;
      maximumLifetimeSeconds?: number;
      clockSkewSeconds?: number;
    },
  ) {}

  async authorize(input: {
    tenantId: string;
    applicationId: string;
    scannerServiceId: string;
  }): Promise<CustomerAssetScanChildAuthorization<TCredentials>> {
    if (!boundedIdentity(input?.tenantId) || !boundedIdentity(input?.applicationId) ||
        !boundedIdentity(input?.scannerServiceId)) {
      throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SCOPE_MISMATCH");
    }

    let raw: unknown;
    try {
      raw = await this.verifier.verifyCurrentProcessIdentity();
    } catch {
      throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_UNAVAILABLE");
    }
    const identity = parseClaims(raw);
    if (!boundedIdentity(this.options.expectedIssuer) || identity.issuer !== this.options.expectedIssuer) {
      throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_INVALID");
    }
    const now = Math.floor((this.options.now ?? (() => Date.now()))() / 1000);
    const skew = this.options.clockSkewSeconds ?? 30;
    const maximumLifetime = this.options.maximumLifetimeSeconds ?? 300;
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(skew) || skew < 0 || skew > 120 ||
        !Number.isSafeInteger(maximumLifetime) || maximumLifetime < 30 || maximumLifetime > 900 ||
        identity.issuedAt > now + skew || identity.expiresAt <= now - skew ||
        identity.expiresAt <= identity.issuedAt ||
        identity.expiresAt - identity.issuedAt > maximumLifetime) {
      throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_IDENTITY_EXPIRED");
    }
    if (identity.tenantId !== input.tenantId ||
        identity.applicationId !== input.applicationId ||
        identity.scannerServiceId !== input.scannerServiceId ||
        identity.capability !== CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY) {
      throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_SCOPE_MISMATCH");
    }

    let credentials: TCredentials;
    try {
      credentials = await this.credentials.resolveScanCredentials({
        tenantId: identity.tenantId,
        applicationId: identity.applicationId,
        connectionId: identity.connectionId,
        scannerServiceId: identity.scannerServiceId,
        capability: CUSTOMER_ASSET_SCAN_CHILD_CAPABILITY,
      });
    } catch {
      throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_CREDENTIALS_UNAVAILABLE");
    }
    if (credentials === null || credentials === undefined) {
      throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_CREDENTIALS_UNAVAILABLE");
    }
    return { identity, credentials };
  }
}

/**
 * Production composition must be explicitly supplied by an independently
 * authenticated workload-identity adapter. There is intentionally no fallback
 * to parent credentials, process.env, IPC claims or synthetic credentials.
 */
export function requireCustomerAssetScanChildIdentityRuntime<TCredentials>(input: {
  environment: "development" | "test" | "uat" | "production";
  verifier?: CustomerAssetScanChildIdentityVerifier;
  credentials?: CustomerAssetScanChildCredentialResolver<TCredentials>;
  synthetic: boolean;
  expectedIssuer: string;
}): CustomerAssetScanChildIdentityService<TCredentials> {
  if (!input || !["development", "test", "uat", "production"].includes(input.environment) ||
      !input.verifier || !input.credentials || typeof input.synthetic !== "boolean" ||
      !boundedIdentity(input.expectedIssuer)) {
    throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_RUNTIME_DISABLED");
  }
  // No production bootstrap adapter has been approved or implemented yet.
  // Even a caller-supplied interface implementation is not sufficient proof
  // of independent workload authentication; keep production unconditionally closed.
  if (input.environment === "production") {
    throw new CustomerAssetScanChildIdentityError("CUSTOMER_ASSET_SCAN_CHILD_RUNTIME_DISABLED");
  }
  return new CustomerAssetScanChildIdentityService(input.verifier, input.credentials, {
    expectedIssuer: input.expectedIssuer,
  });
}
