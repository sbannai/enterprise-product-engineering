# Local SPIRE Workload API fixture (Issue #459)

This fixture is a disposable, CI-only integration test for SPIRE v1.16.0. It uses the immutable GHCR image digests already verified by the separate digest gate.

## What it proves

- A locally bootstrapped SPIRE Server and Agent can start on an isolated Compose network.
- A registered workload process with UID/GID 20001 can obtain the expected JWT-SVID through the Agent's public Workload API socket.
- Unregistered UID/GID 20002 and sibling UID/GID 20003 do not receive that scanner SPIFFE identity.
- A separate Node.js 24.22.2 container, sharing the Agent PID namespace and only its public socket directory, obtains the JWT-SVID through `@jeengbe/spiffe@2.1.1` and EPER's actual SDK adapter and identity verifier.

The probe runs under its tested UID inside the Agent container so the Unix WorkloadAttestor can resolve its caller PID. The Agent data directory is mode 0700, and the Agent config containing the ephemeral join token is mode 0600 and owned by UID/GID 1000, keeping both inaccessible to the probe. The public socket directory grants traversal without directory listing; the probe runs with its registered primary GID 20001, so both Unix UID and GID selectors are verified. No host PID namespace, Docker socket, privileged container, or host filesystem mount is used.

## Ephemeral material and cleanup

The runner creates a one-day, test-only upstream CA and a 10-minute join token under a temporary directory. The CA private key is mode 0600 and owned by the non-root SPIRE identity. Neither the key nor token is committed or uploaded as an artifact. The script tears down the Compose project and named volumes on exit.

## Run locally

Requires Docker Engine, Docker Compose v2, OpenSSL, Bash, and sudo (to assign the temporary fixture files to UID/GID 1000):

```bash
bash eper/tests/fixtures/spire-workload-api/run.sh
```

The Node SDK probe is an integration-test-only install inside its disposable image; it is not added to EPER's production package manifest or lockfile. This fixture does not enable production composition, deploy SPIRE outside the local disposable test, or authorize Business UAT.

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
