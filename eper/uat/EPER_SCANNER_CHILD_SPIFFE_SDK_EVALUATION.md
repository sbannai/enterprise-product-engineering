# EPER Scanner Child SPIFFE SDK Evaluation

**Requirement priority:** P1 — High / critical path  
**Scope:** Local integration evaluation only  
**Approved candidate:** `@jeengbe/spiffe@2.1.1`  
**Runtime target:** Node.js 20  
**Related issue:** #459

## Decision boundary

The owner approved the exact SDK candidate for a pinned local-integration evaluation. This does not approve production activation, cloud provisioning, customer-data processing, external provider calls, or Business UAT.

## Existing EPER contract

The mainline adapter at `packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.ts` expects:

- An explicitly supplied absolute Unix socket endpoint.
- SDK retries disabled; the parent supervisor owns retry and deadline policy.
- `getJwtSvid(audience, { spiffeId }, signal)`.
- Returned SPIFFE ID and expiry only; the JWT must not escape the adapter.
- Idempotent client close.

The mainline `package.json` and lockfile do not yet contain the SPIFFE SDK dependency.

## Evaluation requirements

1. Pin exactly `@jeengbe/spiffe@2.1.1`; verify npm dist integrity, package provenance/attestation where published, license, transitive dependency tree, Node 20 engine compatibility, and shipped files before installation.
2. Install as a development/integration dependency for this evaluation. Do not add it to production runtime dependencies.
3. Build a separate Node 20 scanner-child container. Mount only the SPIRE Agent public Workload API socket directory, with explicit least-privilege ownership and permissions.
4. Construct the SDK using the deployment-supplied socket path; do not rely on `SPIFFE_ENDPOINT_SOCKET` or default endpoint discovery.
5. Request the fixed EPER audience and exact expected scanner SPIFFE ID. Validate the returned identity and expiry through the existing EPER verifier. Never log, persist, or upload the JWT.
6. Verify cancellation is forwarded and bounded by the parent job deadline; close the SDK client exactly once on success, failure, timeout, and cancellation.
7. Prove that an unregistered UID and sibling UID cannot obtain the scanner identity.
8. Exercise unavailable socket, permission denied, missing SVID, wrong SPIFFE ID, malformed response, expired SVID, timeout, cancellation, and cleanup.
9. Run from a clean CI environment and attach redacted test evidence.

## Explicit capability boundary

The candidate's published API documentation describes JWT-SVID retrieval and validation as its higher-level API. EPER's current adapter is JWT-SVID based. This evaluation does not establish X.509-SVID or mTLS capability; those remain a separate requirement if the scanner architecture later needs them.

## Pass/fail criteria

**Pass** only when the real Node 20 child process in its own container retrieves the exact expected JWT-SVID through the mounted SPIRE Agent socket, all negative identity tests fail closed, cancellation and cleanup pass, and CI reproduces the result.

**Fail / fallback** if package integrity or provenance cannot be verified, Node 20 compatibility fails, API behavior diverges from the EPER adapter contract, or any isolation/lifecycle test fails. Record evidence before evaluating the alternative SDK.

## Non-goals

- Production composition or deployment.
- Cloud infrastructure or chargeable resources.
- Production CA, signer, secret broker, provider credentials, storage drivers, or scanner engine activation.
- Business UAT authorization.
