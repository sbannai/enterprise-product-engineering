# ADR: Scanner child workload identity with SPIFFE/SPIRE

- **Status:** Accepted for the scanner-child design; implementation remains gated
- **Date:** 2026-11-11
- **Scope:** Issue #459 / PR #481 only
- **Decision owner:** EPER product owner

## Context

The scanner child must prove its own process identity independently of its parent. Job IPC, inherited general-purpose environment variables, parent database pools, and parent credentials are not identity sources. The child also needs narrowly scoped PostgreSQL access and provider credentials without exposing opaque references or secret material through IPC or logs.

The repository currently has a Node.js 20 runtime, PostgreSQL 16 integration coverage, and a minimal API Docker image. The Docker image does not package or launch the customer-asset scan worker. The local Compose file provisions PostgreSQL only. There is no SPIFFE Workload API client, SPIRE agent, Vault client, or workload-identity deployment configuration in the repository.

## Decision

Use **SPIFFE/SPIRE as the workload identity mechanism** for scanner child processes.

1. A SPIRE Agent exposes the SPIFFE Workload API to the scanner child over a local Unix Domain Socket. The agent must attest the actual child process using platform-level evidence; possession of the socket path alone is not accepted as proof.
2. The child requests a short-lived JWT-SVID for a fixed EPER scanner-child audience. The returned SPIFFE ID must match an explicitly configured scanner workload identity. The child must fail closed if the Workload API is unavailable, the identity is unexpected, or the token is expired or invalid.
3. The SPIFFE ID authenticates the scanner workload, not a tenant, application, asset, or provider connection. Those per-job scopes continue to come from the child’s restricted PostgreSQL identity and the existing scan-input resolver. Do not put per-job authorization claims in the parent IPC envelope.
4. The child uses a dedicated PostgreSQL LOGIN role provisioned and mapped by an operator. The existing eper_resolve_customer_asset_scan_child_input function remains the only route to scan input; the child role receives EXECUTE only, not direct table access.
5. Provider credentials are resolved inside the child through EPER's existing provider runtime/credential chain, after the child identity and database-derived job scope are verified. The SPIFFE identity may authenticate to an approved secret broker, but no specific secret-manager implementation is selected by this ADR.
6. No JWT-SVID, private key, database URL/password, secret reference, upload reference, or customer bytes may be sent through parent-child IPC or logs.
7. The parent remains responsible for claim, lease renewal, finalization, audit and retry policy. A child is one job attempt; timeout handling must terminate it and await process exit before retry.

## Why this choice

SPIFFE standardizes workload identity across hosting environments and avoids binding EPER to a single cloud IAM implementation. The Workload API is designed for local workload identity delivery, supports JWT-SVID and X.509-SVID profiles, and uses gRPC over a Unix Domain Socket by preference. SPIRE can make the identity decision using out-of-band process attestation rather than trusting a token or claims supplied by the parent.

## Node.js client assessment (2026-11-11)

The SPIFFE ecosystem SDK catalogue lists `jeengbe/spiffe` as its TypeScript client. Its published package is `@jeengbe/spiffe`. The public npm package page inspected on 2026-11-12 lists version 2.1.0; the previously recorded 2.1.1 candidate could not be independently verified and must not be treated as an approved or published version. The package documentation describes a ConnectRPC Workload API client over gRPC, including the required `workload.spiffe.io: true` metadata and Unix-domain-socket transport. It exposes `getJwtSvid(audience, { spiffeId })` for the calling workload and `validateJwt(audience, token)` for validating an incoming token.

No SDK version is approved for EPER yet. Before adding the dependency, retrieve and review the exact published tarball manifest and integrity metadata for the selected version, capture every resolved transitive version and integrity hash in EPER's npm lockfile, and review the dependency tree. The package documentation confirms an opt-out retry setting (`retry: { enabled: false }`), optional `AbortSignal` support on `getJwtSvid`, and client cleanup through `close()`/async disposal. The scanner child must use those controls: the parent supervisor owns retry policy, and nested SDK retries would make the hard deadline and attempt accounting harder to reason about. The explicit Workload API socket must be configured from the child deployment contract rather than inherited ambient environment.

This is a community TypeScript SDK, not one of SPIRE's officially maintained Go or Java SDKs. It is MIT-licensed, but has a single named maintainer and a comparatively small adoption footprint. Treat it as a candidate, not as a trusted security boundary by itself. Pin an exact version, review its dependency tree and source, and run protocol-level tests against a local SPIRE Agent before production composition. Keep the EPER adapter interface so the SDK can be replaced without changing scanner authorization logic.

Important API distinction: `getJwtSvid` obtains the current process's own SVID; SPIRE's Workload API attests the caller out-of-band. `validateJwt` is for validating an incoming JWT-SVID and is not required merely to prove the caller's own identity after a successful local fetch. EPER must still compare the returned SPIFFE ID exactly and must not derive tenant/application scope from the token.

## Implementation sequence and gates

1. Add the child-local SDK adapter using `getJwtSvid(fixedAudience, { spiffeId })`. The local Workload API performs caller attestation and audience-scoped SVID delivery. Compare the returned SPIFFE ID exactly and enforce a bounded remaining lifetime. Do not call `ValidateJWTSVID` merely to revalidate the same workload's locally fetched SVID; reserve it for incoming SVIDs from other workloads. Do not implement a home-grown JWT parser.
2. Add child bootstrap that reads only the explicitly configured Workload API socket endpoint and obtains identity from SPIRE. No fallback to environment credentials or parent-supplied claims.
3. Select and implement an approved secret broker integration. It must authorize the exact scanner SPIFFE ID and resolve only the selected tenant/application provider connection; it must not expose secret references to IPC.
4. Define operator deployment evidence for SPIRE Agent, process selectors/attestation, socket permissions/mount, dedicated DB LOGIN role, database TLS/authentication, and secret-broker policy. The current API-only Dockerfile and PostgreSQL-only local Compose are not sufficient deployment evidence.
5. Test valid identity, wrong trust domain, wrong SPIFFE ID, wrong audience, expired/revoked token, unavailable agent, socket substitution, cross-tenant scope, provider binding revocation, secret-broker denial, and child restart/rotation.
6. Only after the above passes may the child identity verifier and provider credential resolver be composed in the worker. Production startup remains fail-closed until then.

## Explicit non-goals

- No SPIRE Agent installation, cloud resource, paid service, or hosted infrastructure is provisioned by this change.
- No real provider SDK/network call or customer file is enabled.
- No scanner worker activation, production readiness, Business UAT authorization, or PR merge is implied.
- This ADR does not choose Vault or another concrete secret manager; that remains a separate security decision.

## Consequences

- The SDK adapter and verifier are still test-only until the pinned SDK dependency, explicit socket configuration, and local SPIRE integration tests are completed.
- The provider credential resolver adapter is groundwork only; it cannot establish process identity.
- The worker must not be wired to the child supervisor until the Workload API verifier and approved secret-broker adapter exist.
- Production scanner startup remains unconditionally disabled.
