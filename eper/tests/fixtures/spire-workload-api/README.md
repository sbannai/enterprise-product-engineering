# Local SPIRE Workload API fixture (Issue #459)

This fixture is a disposable, CI-only integration test for SPIRE v1.16.0. It uses the immutable GHCR image digests already verified by the separate digest gate.

## What it proves

- A locally bootstrapped SPIRE Server and Agent can start on an isolated Compose network.
- A registered workload process with UID/GID 20001 can obtain the expected JWT-SVID through the Agent's public Workload API socket.
- Unregistered UID/GID 20002 and sibling UID/GID 20003 do not receive that scanner SPIFFE identity.

The probe runs under its tested UID inside the Agent container so the Unix WorkloadAttestor can resolve its caller PID. The Agent data directory is mode 0700, and the Agent config containing the ephemeral join token is mode 0600 and owned by UID/GID 1000, keeping both inaccessible to the probe. The public socket directory grants traversal without directory listing; the probe runs with its registered primary GID 20001, so both Unix UID and GID selectors are verified. No host PID namespace, Docker socket, privileged container, or host filesystem mount is used.

## Ephemeral material and cleanup

The runner creates a one-day, test-only upstream CA and a 10-minute join token under a temporary directory. The CA private key is mode 0600 and owned by the non-root SPIRE identity. Neither the key nor token is committed or uploaded as an artifact. The script tears down the Compose project and named volumes on exit.

## Run locally

Requires Docker Engine, Docker Compose v2, OpenSSL, Bash, and sudo (to assign the temporary fixture files to UID/GID 1000):

```bash
bash eper/tests/fixtures/spire-workload-api/run.sh
```

This fixture exercises SPIRE infrastructure only. It does not select or add a Node SPIFFE SDK, prove EPER's Node adapter integration, enable production composition, deploy SPIRE outside the local disposable test, or authorize Business UAT.
