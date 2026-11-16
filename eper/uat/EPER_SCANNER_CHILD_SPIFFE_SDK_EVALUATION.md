# EPER Scanner Child SPIFFE SDK Evaluation

**Requirement priority:** P1 — High / critical path  
**Scope:** Local integration evaluation only  
**Approved candidate:** `@jeengbe/spiffe@2.1.1`  
**Runtime target:** Node.js 20  
**Related issue:** #459

## Decision boundary

The owner approved the exact SDK candidate for a pinned local-integration evaluation. This does not approve production activation, cloud provisioning, customer-data processing, external provider calls, or Business UAT.

## Source and package inspection

Inspected the exact-version package manifest at the upstream repository path `jeengbe/ts-packages/packages/spiffe/package.json`, plus the implementation at commit `f97e382f909827aed0ae5f0b8550f70438dc7f86`.

- Version is exactly `2.1.1`; license is MIT.
- Published source repository is `https://github.com/jeengbe/ts-packages`, package directory `packages/spiffe`. The older `jeengbe/ts-spiffe` repository is archived and is not the current source for this version.
- Manifest sets `publishConfig.provenance: true`. This is publisher configuration, not independent proof that this exact npm tarball's attestation and registry signature have been verified.
- Runtime dependencies declared by this version: `@bufbuild/protobuf ^2.13.0`, `@connectrpc/connect ^2.1.2`, `@connectrpc/connect-node ^2.1.2`, `@isaacs/ttlcache ^2.1.4`, `p-retry ^8.0.1`.
- No `engines` field is declared in the package manifest; Node 20 compatibility must be established by the EPER CI run, not inferred from metadata.
- The implementation exposes `SpiffeClient({ connection, retry })`, `getJwtSvid(audience, filter, signal)`, and `close()`. It returns `spiffeId`, `token`, and `expiresAtMs` (plus optional hint), and accepts an `AbortSignal`.
- `close()` closes internal caches and aborts the SDK-owned HTTP/2 session manager. `retry.enabled: false` is supported.
- The SDK's high-level API is JWT-SVID focused. X.509-SVID access is through its raw Workload API client, not a high-level X.509 abstraction.

The npm profile currently lists 2.1.1 as published, while a package-page crawl may lag at 2.1.0. Pin the exact approved 2.1.1 and use registry metadata/CLI verification as the authoritative artifact check.

## Existing EPER contract

The mainline adapter at `packages/assets/customer-asset-scan-child-spiffe-sdk-adapter.ts` expects:

- An explicitly supplied absolute Unix socket endpoint.
- SDK retries disabled; the parent supervisor owns retry and deadline policy.
- `getJwtSvid(audience, { spiffeId }, signal)`.
- Returned SPIFFE ID and expiry only; the JWT must not escape the adapter.
- Idempotent client close.

The mainline `package.json` and lockfile do not yet contain the SPIFFE SDK dependency.

## Evaluation requirements

1. Pin exactly `@jeengbe/spiffe@2.1.1`; obtain exact npm dist integrity and tarball, run `npm audit signatures --json --include-attestations` in a clean Node 20 runner, and inspect the attestation's source repository, commit, workflow and publisher. The source manifest's provenance setting alone is not a pass.
2. Inspect the exact tarball contents, MIT license, complete transitive dependency tree and Node 20 behavior. Do not claim engine compatibility from an absent `engines` field.
3. Install as a development/integration dependency for this evaluation. Do not add it to production runtime dependencies.
4. Build a separate Node 20 scanner-child container. Mount only the SPIRE Agent public Workload API socket directory, with explicit least-privilege ownership and permissions.
5. Construct the SDK using the deployment-supplied socket path; do not rely on `SPIFFE_ENDPOINT_SOCKET` or default endpoint discovery.
6. Request the fixed EPER audience and exact expected scanner SPIFFE ID. Validate the returned identity and expiry through the existing EPER verifier. Never log, persist, or upload the JWT.
7. Verify cancellation is forwarded and bounded by the parent job deadline; close the SDK client exactly once on success, failure, timeout, and cancellation.
8. Prove that an unregistered UID and sibling UID cannot obtain the scanner identity.
9. Exercise unavailable socket, permission denied, missing SVID, wrong SPIFFE ID, malformed response, expired SVID, timeout, cancellation, and cleanup.
10. Run from a clean CI environment and attach redacted test evidence.

## Explicit capability boundary

EPER currently requires JWT-SVID for the scanner-child identity contract. This SDK's high-level API matches that need. This evaluation does not establish high-level X.509-SVID or mTLS capability; treat those as separate requirements if the scanner architecture later needs them.

## Pass/fail criteria

**Pass** only when exact npm artifact integrity and attestation are independently verified, and the real Node 20 child process in its own container retrieves the exact expected JWT-SVID through the mounted SPIRE Agent socket, all negative identity tests fail closed, cancellation and cleanup pass, and CI reproduces the result.

**Fail / fallback** if artifact integrity or provenance cannot be verified, Node 20 behavior fails, API behavior diverges from the EPER adapter contract, or any isolation/lifecycle test fails. Record evidence before evaluating the alternative SDK.

## Non-goals

- Production composition or deployment.
- Cloud infrastructure or chargeable resources.
- Production CA, signer, secret broker, provider credentials, storage drivers, or scanner engine activation.
- Business UAT authorization.


## 2026-11-16 registry preflight results

The Node 20 hosted preflight completed successfully for registry integrity/signature/provenance verification and lockfile generation.

Verified evidence:
- Exact tarball: `@jeengbe/spiffe@2.1.1`, 37,698 bytes.
- Registry SRI: `sha512-Sel0giVDmHq74NSkXAf9F5Qu/+x+JrvKmz9jzCLFyF44j/d11xFypFvx3zQp9bmeYHM2yul6BNlkWj7i3Jg68g==`.
- Independently computed SHA-512 of the downloaded tarball matches the registry SRI and the SLSA provenance subject digest.
- `npm audit signatures --json --include-attestations`: 3 verified packages, 0 invalid, 0 missing. The SDK entry includes a SLSA v1 provenance attestation.
- Provenance identifies source repository `https://github.com/jeengbe/ts-packages`, source commit `f97e382f909827aed0ae5f0b8550f70438dc7f86`, workflow `.github/workflows/ci.yml`, and GitHub-hosted builder.
- Clean `npm ci --ignore-scripts` passed; exact generated lockfile records SDK as `dev: true`.

**Compatibility blocker discovered:** the resolved transitive dependency `p-retry@8.0.1` declares `engines.node >=22`. EPER's existing Node 20 target is therefore outside the declared support range of the resolved SDK dependency tree. The install passed only because npm's default engine-strict setting is false; that is not proof of supported Node 20 runtime behavior. Do not treat the SDK as Node 20-compatible without an explicit compatibility decision and real runtime tests.

**Platform runtime context:** Node.js 20 reached EOL on 2026-03-24. Node.js 22 is in Maintenance LTS; Node.js 24 is LTS as of this evaluation. The recommended platform direction is to evaluate Node.js 24 LTS as EPER's supported runtime baseline, rather than pinning an unsupported older transitive dependency merely to preserve Node 20. This is a recommendation, not an approved runtime change.

The generated package manifest and lockfile remain CI artifacts only. No dependency has been committed to EPER's source manifest or lockfile pending the Node runtime decision.


## 2026-11-16 Node 24 runtime preflight results

The isolated scanner-child dependency preflight was rerun on Node.js 24 and completed successfully. This validates package installation and provenance checks on Node 24; it does not yet validate live SPIRE socket behavior.

- CI runtime: Node.js `v24.22.2`; npm `11.21.2`.
- Exact package: `@jeengbe/spiffe@2.1.1`; the downloaded tarball is 37,698 bytes.
- Independently computed SHA-512 matches both npm registry SRI and the `npm pack` integrity value: `sha512-Sel0giVDmHq74NSkXAf9F5Qu/+x+JrvKmz9jzCLFyF44j/d11xFypFvx3zQp9bmeYHM2yul6BNlkWj7i3Jg68g==`.
- `npm audit signatures --json --include-attestations`: 4 verified packages, 0 invalid, 0 missing. The SDK and its three verified Connect/Protobuf dependencies have SLSA v1 provenance attestations.
- Generated dependency tree contains `p-retry@8.0.1` with declared Node engine `>=22`; Node 24 satisfies that declared engine.
- Exact development-only lockfile generated; `npm ci --ignore-scripts` passed; npm audit reported 0 vulnerabilities; `npm ls --all --json` reported no dependency-tree problems.
- Evidence artifact: `eper-spiffe-sdk-2.1.1-preflight-evidence`, artifact ID `14249142445`, from workflow run `43914417656` (head commit `142df7d1085ece72b6a2ec765e63756fef186241`).

**Decision:** Node 24 passes the package/dependency preflight and is the working runtime target for the isolated scanner-child evaluation. This is not approval to migrate the EPER parent service or whole platform to Node 24. The previous Node 20 limitation remains: the resolved dependency tree declares Node >=22.

**Still outstanding before SDK integration/merge:** implement and test the actual Node 24 scanner-child process against a local SPIRE Agent Workload API Unix socket; verify exact audience and SPIFFE ID, JWT containment (never returned/logged/persisted), expiry validation, cancellation/deadline propagation, idempotent close, and fail-closed behavior for unavailable/permission-denied socket, missing/expired SVID, wrong identity, malformed response, timeout, cancellation, and unregistered/sibling UIDs. No production activation, cloud provisioning, or Business UAT is authorized by this preflight.
