# Local SPIRE Workload API fixture (Issue #459)

This fixture is a disposable, CI-only integration test for SPIRE v1.16.0. It uses the immutable GHCR image digests already verified by the separate digest gate.

## What it proves

- A locally bootstrapped SPIRE Server and Agent can start on an isolated Compose network.
- A registered workload process with UID/GID 20001 can obtain the expected JWT-SVID through the Agent's public Workload API socket.
- Unregistered UID/GID 20002 and sibling UID/GID 20003 do not receive that scanner SPIFFE identity.
- A separate Node.js 24.22.2 container, sharing the Agent PID namespace and only its public socket directory, obtains the JWT-SVID through `@jeengbe/spiffe@2.1.1` and EPER's actual SDK adapter and identity verifier.

The probe runs under its tested UID inside the Agent container so the Unix WorkloadAttestor can resolve its caller PID. The Agent data directory is mode 0700, and the Agent config containing the ephemeral join token is mode 0600 and owned by UID/GID 1000, keeping both inaccessible to the probe. The public socket directory grants traversal without directory listing; the probe runs with its registered primary GID 20001, so both Unix UID and GID selectors are verified. No host PID namespace, Docker socket, privileged container, or host filesystem mount is used.

## Disposable PostgreSQL migration gate

Before the SPIRE server is started, `run.sh` now invokes `run-audit-postgres.sh`. That script starts a separate PostgreSQL 16 service on the fixture's internal Compose network, builds the existing Node 24 test image, and runs the repository's actual `npm run migrate:audit` entrypoint against a fresh database.

It verifies:

- The migration ledger row count equals the checked-in audit migration file count.
- The authenticated scanner-child context resolver exists with the exact `(uuid, bigint)` signature.
- The child access role can execute that resolver.
- The child access role has no direct SELECT privilege on `eper_customer_assets`.
- A second invocation of the migration runner is idempotent and preserves the checksum ledger.

The PostgreSQL service is disposable and has no host port published. Its volume is removed by the existing Compose cleanup trap. The fixture then provisions one dedicated LOGIN, maps its certificate CN to that LOGIN, and tests the migration-defined session_user-bound resolver over verified PostgreSQL mTLS. The fixture client certificate is static test material signed by the disposable CA; it is not issued from, nor cryptographically bound to, the live SPIFFE JWT-SVID. This stage therefore proves PostgreSQL certificate authentication and the SQL privilege boundary, not a production SVID-to-client-certificate issuance chain.

## Ephemeral material and cleanup

The runner creates a one-day, test-only upstream CA and a 10-minute join token under a temporary directory. The CA private key is mode 0600 and owned by the non-root SPIRE identity. Neither the key nor token is committed or uploaded as an artifact. The script tears down the Compose project and named volumes on exit.

## Run locally

Requires Docker Engine, Docker Compose v2, OpenSSL, Bash, and sudo (to assign the temporary fixture files to UID/GID 1000):

```bash
bash eper/tests/fixtures/spire-workload-api/run.sh
```

The Node SDK probe is an integration-test-only install inside its disposable image; it is not added to EPER's production package manifest or lockfile. This fixture does not enable production composition, deploy SPIRE outside the local disposable test, or authorize Business UAT.

## Combined PostgreSQL + SPIRE fixture result — 17 Nov 2026

The combined fixture passed on work-branch head `522f7762904f32880ed7b396aa0f992eb707ce51` (GitHub Actions run `44034225206`, job `133873109926`).

Observed assertions:
- All 57 checked-in audit migrations applied to a fresh PostgreSQL 16 database.
- The authenticated `(uuid, bigint)` scanner-child context resolver exists and is executable by the scanner-child access role.
- The scanner-child access role has no direct SELECT privilege on `eper_customer_assets`.
- A second migration-runner invocation preserved the 57-row checksum ledger.
- Registered UID/GID 20001 obtained the expected SPIFFE identity.
- EPER's Node SDK adapter and verifier obtained and verified the current process JWT-SVID.
- Missing and permission-restricted Workload API sockets failed closed as unavailable.
- Unregistered UID 20002 and sibling UID 20003 received no scanner SVID.
- Compose cleanup completed successfully.

The first combined attempt exposed a race between Agent startup/registration and the SDK probe. The fixture now waits for the registered identity to be confirmed by the Agent CLI before running the Node SDK verifier. The passing run above validates that ordering.

This evidence proves the fresh-schema migration and local SPIRE workload-attestation stages. It still does not prove the scanner child entrypoint, PostgreSQL LOGIN-to-SPIFFE mapping, mTLS database access, production signer, secret broker, live provider driver, or deployment composition.

## Hosted Node SDK integration result — 17 Nov 2026

The first clean GitHub-hosted run passed on PR #506 head `7d9a668e2d8d0eb64dc55a57fcb7e7b8545daae4` (workflow run `44011071457`).

Observed assertions:
- Node 24.22.2 image built successfully; EPER TypeScript build completed.
- Exact `@jeengbe/spiffe@2.1.1` installed inside the disposable probe image.
- `PASS: Node SDK obtained and EPER verified the current process JWT-SVID`.
- Registered UID 20001 obtained the expected SPIFFE identity.
- Unregistered UID 20002 and sibling UID 20003 did not obtain the scanner SVID.
- The fixture completed and its cleanup ran.

This is live local SPIRE Agent socket integration evidence for the SDK adapter/verifier path. It does not yet cover the full failure/cancellation matrix, deployment-owned composition, production activation, or Business UAT.


## Combined PostgreSQL mTLS + SPIRE fixture result — 17 Nov 2026

The combined fixture passed on work-branch commit `9254ad0b3f71edb20610febed439da8d59ff87ce` (GitHub Actions run [44035332515](https://github.com/sbannai/enterprise-product-engineering/actions/runs/44035332515), job `133876753128`).

Observed assertions from the completed hosted run:

- All 57 checked-in audit migrations applied to a fresh PostgreSQL 16 database.
- The authenticated `(uuid, bigint)` context resolver exists and is executable.
- The scanner-child access role has no direct SELECT privilege on `eper_customer_assets`.
- A second migration-runner invocation preserved the 57-row checksum ledger.
- A dedicated LOGIN authenticated as `eper_fixture_scanner` using PostgreSQL TLS client-certificate authentication.
- The authenticated LOGIN inherited resolver EXECUTE and had no direct asset-table SELECT.
- The LOGIN invoked the `session_user`-bound resolver successfully; the synthetic fixture returned zero rows.
- Registered UID/GID 20001 received the expected SPIFFE identity; EPER's Node SDK adapter and verifier obtained and verified the current process JWT-SVID.
- Missing and permission-restricted Workload API sockets failed closed.
- Unregistered UID 20002 and sibling UID 20003 received no scanner SVID.
- Compose cleanup completed successfully.

The migration runner now verifies the disposable PostgreSQL server certificate using the fixture CA and hostname (`sslmode=verify-full`). The earlier failures were caused first by directory traversal permissions and then by the migration container not trusting the disposable CA; both were corrected before this passing run.

**Evidence boundary:** the PostgreSQL client certificate used in this fixture is static test material. Its subject is mapped to the dedicated test LOGIN, but the certificate was not issued in response to a CSR from the verified live SPIFFE process identity. The passing run does not prove SVID-bound certificate issuance, live scanner-child entrypoint composition, tenant/application seeded-data isolation, secret-broker integration, real provider scanning, production deployment, or Business UAT.
