# Scanner-child end-to-end composition fixture — Issue #459

Status: implementation branch work item; **not production composition**.

This fixture is deliberately separate from `Dockerfile.scanner-worker` and the Node 20 parent worker. It must run only in a disposable local/CI environment with synthetic data and an ephemeral CA.

## Existing runtime contract

The actual entrypoint is `dist/apps/worker/customer-asset-scan-child-main.js`. It accepts a composition module only from the trusted, non-group/world-writable directory `dist/packages/assets/scanners/` and requires two exports:

- `createCustomerAssetScanChildDatabaseTlsBootstrap({ env, signal, onStage })`
- `createCustomerAssetScanChildRuntimeDependencies({ pool, env, identity, signal, registerCleanup })`

The TLS bootstrap must return the SPIFFE verifier, database credential issuer and CA PEM. The entrypoint itself generates the child-local private key/CSR, asks the issuer for a certificate, validates the certificate/key match, CA chain, CN, clientAuth EKU and expiry, then connects with PostgreSQL TLS verification. The runtime factory receives the resulting authenticated pool and must return the exact same identity verifier plus input resolver, provider dispatcher and scanner.

## Fixture composition requirements

### SPIRE identity

- Use the existing pinned SPIRE Server/Agent v1.16.0 fixture and exact `@jeengbe/spiffe@2.1.1` SDK.
- Construct the SDK with the explicit fixture Unix socket and retries disabled.
- Verify the exact expected child SPIFFE ID and audience in the child process itself.
- Never pass a JWT/SVID or identity claims over parent IPC; never log or artifact the token.
- Only the registered child UID/GID may receive the scanner SVID.

### Ephemeral test CA and PostgreSQL mTLS

- Create a fixture-only CA and PostgreSQL server certificate with DNS SAN `postgres`; private keys mode 0600, fixture directories mode 0700.
- PostgreSQL accepts only TLS client certificates signed by the fixture CA. The client certificate CN maps to one dedicated fixture LOGIN role.
- The test signer must first run `openssl req -verify` against the generated CSR, then sign the CSR public key with the fixture CA. It must ignore the CSR subject, override CN to the preconfigured database role, set clientAuth EKU, and set notAfter no later than the current SVID expiry.
- The issuer mapping must be an exact allowlist from the expected SPIFFE ID to the fixture LOGIN role. No role name or tenant/provider scope may come from IPC or CSR subject.
- Keep CA keys, client keys, join tokens and certificates outside the repository and artifacts. Teardown removes Compose volumes and temporary material on success, failure, timeout and cancellation.

### PostgreSQL authorization

- Apply the complete ordered EPER audit migrations to a disposable database (not a hand-written approximation of the production schema).
- Provision the fixture LOGIN as a member of `eper_customer_asset_scan_child_access`; do not grant direct table privileges.
- Seed only synthetic tenant/application/asset/upload/leased-job rows and the exact SPIFFE-to-LOGIN identity binding, including provider connection.
- Verify the real `PostgresCustomerAssetScanChildInputResolver` calls the two-argument session-derived context function and that the authenticated `session_user` mapping is the source of tenant, application, worker, scanner and provider connection.
- Assert the LOGIN can execute the resolver but cannot SELECT source tables directly; wrong tenant/application/worker, disabled identity, mismatched SPIFFE ID, wrong LOGIN, stale lease/generation and missing provider binding fail closed.

### Actual child execution

- Build this test composition into `dist/packages/assets/scanners/` only for the fixture image.
- Launch `customer-asset-scan-child-main.js` as the registered UID/GID, passing a valid synthetic start message over stdin.
- Use the real SDK adapter/verifier, real TLS credential provisioning path, real PostgreSQL resolver and real child runtime.
- Use a deterministic in-memory provider byte-stream adapter and scanner implementation. These are explicit test doubles, not a real provider driver or malware scanner. The child must consume the complete byte stream so its size/SHA-256 verification runs to EOF.
- Assert a clean result only for the expected tenant/application/asset/connection and expected bytes; assert wrong process identity, invalid DB certificate, expired certificate, wrong LOGIN/scope, direct table access and incomplete stream all fail closed.
- Assert SDK client, provider iterator, PostgreSQL pool, TLS material and fixture volumes are cleaned up exactly once.

## Important scope boundary

A passing fixture proves the local scanner child composition and database authorization path with test-only signing and provider/scanner doubles. It does **not** select a production signer/CA, secret broker, real provider driver, malware scanner, deployment platform or substrate attestor. Those remain separate Issue #459 deployment-owner decisions. No cloud provisioning, production credentials, production activation or Business UAT is authorized.

## Current implementation blocker to resolve before declaring the fixture runnable

The current repository fixture proves SPIRE SDK retrieval only; it does not start PostgreSQL or invoke the child entrypoint. The complete ordered audit migration chain and its prerequisites must be bootstrapped into the disposable database before the mTLS child composition can be exercised. Do not replace those migrations with a reduced schema: that would not prove the deployed resolver contract.
