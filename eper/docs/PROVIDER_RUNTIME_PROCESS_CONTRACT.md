# Provider Runtime Process Contract

**Status:** Design/implementation gate; no production process is enabled by this document.

## Purpose

Define the minimum safe boundary for running the provider-operation worker as an independently supervised process. The process must be independently deployable from the API, disabled unless explicitly enabled, and incapable of external dispatch unless its complete production composition has been validated.

This contract supplements `PROVIDER_CONNECTION_API_CONTRACT.md`. It does not authorize provider integrations, cloud resources, production credentials, deployment, or Business UAT.

## Non-negotiable boundaries

1. **No synthetic production mode.** Synthetic adapters, synthetic secret resolvers, in-memory stores, test wake sources, and network-free fixtures are restricted to test/development composition. Production startup rejects them; a configuration label alone is not proof that an adapter is safe.
2. **Explicit adapter provenance.** Each production adapter must be statically registered by reviewed application code, pinned to an exact semantic version, and matched exactly by the deployment allowlist (provider key, adapter key, version, and capability set). Do not load arbitrary module paths from environment variables or catalogue data.
3. **Server-side secret custody.** The process receives only an opaque secret reference from the scoped connection repository. A production secret-manager adapter resolves it in memory immediately before dispatch. Secret values and references must not enter logs, audit payloads, durable operation/payload rows, health responses, exception text, or telemetry.
4. **Durable scoped persistence.** Queue, encrypted payload, provider connection/binding, and audit stores must use explicitly configured least-privilege service identities. Tenant and application context must be set for every scoped transaction. RLS and grants must be verified at startup; the worker identity must not own protected tables, be superuser, or bypass RLS.
5. **No implicit enablement.** Missing or malformed configuration is a startup failure. The API process must not start this worker as a side effect of API startup. A distinct process owner controls startup and shutdown.
6. **No readiness by configuration alone.** Readiness is true only after dependency checks and listener registration succeed. Liveness reports process responsiveness, not provider availability. Health endpoints must never expose tenant identifiers, connection identifiers, secret references, database URLs, adapter internals, or raw exception messages.

## Composition contract

The process entrypoint must call one statically imported production composition factory. That factory must validate and return the following concrete dependencies before constructing the host:

| Boundary | Required production implementation | Fail-closed condition |
|---|---|---|
| Operation repository | PostgreSQL provider-operation repository using a dedicated worker role | Missing schema, invalid role/grants, RLS failure, or connection failure |
| Payload store | Transactional encrypted payload store with configured key provider and key version | Missing key provider, unsupported key version, plaintext fallback, or decryption/integrity failure |
| Connection authorization | PostgreSQL connection/binding repository with tenant + application scope and pre/post-secret-resolution checks | Missing, revoked, suspended, stale-version, or capability-mismatched binding |
| Secret reference store | Server-only lookup returning opaque references for the exact active connection/binding | Any scope/version/status mismatch or missing reference |
| Secret resolver | Approved production secret-manager implementation | Missing secret, access denied, invalid secret shape, timeout, or resolver failure |
| Adapter registry | Static, reviewed, exact-version executable adapter registrations | Empty, duplicate, unapproved, synthetic, mismatched or unsupported registration |
| Deployment allowlist | Independently controlled deployment configuration matching the static registrations exactly | Missing, extra, stale, or capability-divergent entry |
| Wake source | Dedicated PostgreSQL LISTEN connection using a fixed channel and fixed non-sensitive payload | Listener cannot connect, subscribe, or re-establish after disconnect |
| Audit | Durable audit writer using the worker identity and production audit environment | Audit store unavailable or audit transaction failure |
| Telemetry | Bounded event sink with fixed event schemas and no raw exceptions or tenant data | Missing production sink or schema/size validation failure |

The composition factory must not start the process, open unbounded background loops, load executable code dynamically, or perform a provider action. It must expose explicit ownership/close methods for every pool/client it creates. If dependencies are injected by a process supervisor, ownership must be explicit so resources are closed exactly once.

The current `createProviderRuntimeComposition` factory is an inert construction seam. Its `executionClass: "approved"` field is a deployment assertion only; it is not cryptographic provenance. It must not be treated as sufficient production attestation without the independent release review described below.

## Startup sequence

The process owner must perform these steps in order:

1. Validate an explicit enable flag and an allowed runtime environment. Reject synthetic mode in production before opening any secret-manager connection.
2. Validate required configuration presence and bounded numeric settings. Do not include configuration values in thrown errors or logs.
3. Create the dedicated worker database pool and verify connectivity, schema/migration readiness, role identity, grants, RLS enforcement, and non-ownership of protected tables.
4. Verify audit and encrypted payload/key-provider readiness. Never fall back to plaintext, a general application credential, or an alternate store silently.
5. Construct the statically registered adapter registry and compare the complete deployment allowlist to the registry. Reject unknown, missing, duplicate, unapproved, or capability-divergent entries.
6. Verify secret-manager access using a non-secret readiness operation. Do not resolve customer credentials as a startup probe.
7. Create and start the dedicated PostgreSQL wake listener. LISTEN must be established before the first queue scan to avoid a scan/subscribe race.
8. Start the host. The first bounded queue pass occurs only after all preceding gates succeed.
9. Publish readiness only after the host has entered its running state. If any step fails, startup remains not-ready and all resources already acquired are closed.

A failed dependency check must not be converted into a successful but idle process. Do not report ready when the runtime is disabled.

## Runtime and dispatch invariants

- The queue remains authoritative; notifications are hints only. The bounded reconciliation timeout recovers delayed retries, expired leases, and missed notifications.
- Claiming remains tenant/application scoped and uses existing lease/fencing/idempotency protections.
- The executable adapter allowlist is checked before secret-manager access.
- Connection and application binding authorization is checked before secret resolution and rechecked after resolution immediately before dispatch.
- Credential material is transient in-process dispatch input only. It must not be retained in process-global caches or attached to operation context beyond the dispatch call.
- A deterministic configuration, authorization, secret-resolution, or integrity failure is parked for operator attention using a stable redacted code; it is not retried as an ordinary provider outage.
- Retryable provider failures follow the bounded retry policy already owned by the operation worker. Do not create a second scheduler or a second source of retry truth.
- Telemetry events use fixed schemas, bounded counters, and stable failure categories. Raw exception objects, provider response bodies, payloads, credentials, opaque references, and tenant/application identifiers are prohibited.

## Readiness, liveness, and operational signals

The process supervisor should consume these distinct signals:

- **Liveness:** the process event loop and health handler respond. This must not depend on the provider API or secret manager being reachable.
- **Readiness:** startup gates passed, database/audit/payload dependencies are usable, wake listener is subscribed, and the host is running.
- **Operational health:** bounded worker-pass counters and stable failure categories from the host telemetry stream. A process may be live and ready while a provider operation is parked for operator attention; surface that as an operational alert, not as a secret-bearing health detail.

Required bounded metrics/events include host start/stop, worker pass completed/failed, claimed/succeeded/retried/needs-attention/lease-lost/recovered counts, wake wait, wake reconnect, and dependency readiness transitions. Metrics must not label by tenant, application, connection, operation, or other unbounded/customer-identifying values.

## Shutdown and resource ownership

On SIGTERM or SIGINT:

1. Stop accepting new wakeups and abort the host signal.
2. Allow the current bounded worker pass to observe cancellation and complete its safe lease/transaction boundary. Do not start another pass.
3. Close the wake listener, then close worker-owned database pools and secret-manager clients in reverse acquisition order.
4. Emit a bounded stopped event only after cleanup has completed.
5. Exit non-zero if startup or cleanup failed; do not log raw exception messages.

Shutdown must be idempotent. Repeated signals must not trigger concurrent cleanup. A failed listener close must not prevent attempts to close the remaining resources. The supervisor must enforce a bounded termination grace period and treat forced termination as an interrupted worker; lease expiry/fencing provides recovery.

## Required test gates before production enablement

### Unit/contract tests
- Reject disabled, missing, malformed, synthetic, empty, duplicate, unapproved and mismatched adapter configuration.
- Reject allowlist entries not represented by a statically registered adapter and vice versa.
- Reject secret resolver failures without exposing exception text, opaque references, or credentials.
- Verify pre-resolution and post-resolution authorization checks, including revocation/version/capability changes during secret resolution.
- Verify wake listener reconnect, notification payload filtering, pending wake behavior, timeout reconciliation, and cancellation.
- Verify telemetry sink failures do not stop queue execution and no raw exception or customer identifier reaches telemetry.
- Verify readiness remains false until every startup gate passes.

### Process-level tests
- Disabled process performs no database, secret-manager, or provider operation.
- Each startup gate fails closed and closes all resources acquired earlier in the sequence.
- SIGTERM/SIGINT during idle wait and during a worker pass stop subsequent passes and close listener, pools, and secret clients exactly once.
- Repeated signals do not race cleanup.
- Listener close failure does not skip database/secret-client cleanup.
- Liveness and readiness have distinct behavior and return only fixed, non-sensitive fields.
- Supervisor restart after forced termination recovers expired leases without duplicate external effects; adapter idempotency contract must be exercised with a deterministic fake.
- Production tests use no live provider, customer binary, production credential, or chargeable cloud resource.

### Release evidence
- Exact-head CI includes fresh-clone verification, provider lifecycle, PostgreSQL integration, security/contract tests, and the 228/38 pilot matrix.
- Review the static adapter code, dependency tree, secret-manager permissions, key custody/rotation, database grants/RLS, telemetry schemas, process supervisor settings, alert routing, rollback, and recovery runbook.
- Record a second-engineer review and owner approval before production enablement.
- Keep the process disabled until every item is evidenced. A green synthetic suite alone is not production authorization.

## Current implementation status

Implemented in the current draft stack: registry/allowlist matching, scoped credential resolver boundary, pre/post-resolution authorization checks, inert composition factory, LISTEN/NOTIFY wake source, bounded host loop, stable host failure categories, and focused unit/integration coverage.

Not yet implemented/evidenced: production secret-manager adapter and key custody, approved concrete storage/provider/scanner adapters, independently controlled production allowlist/provenance review, dedicated worker DB-role deployment proof, concrete process entrypoint/supervisor, process-level readiness/liveness and shutdown tests, production alerting, second-engineer review, and owner release approval.

**Current decision:** keep provider runtime disabled in production. Keep related PRs draft/unmerged. No live dispatch, deployment, cloud provisioning, or Business UAT authorization.
