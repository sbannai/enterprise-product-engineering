# ADR-001: Transactional Persistence for EPER Capability Services

- **Status:** Proposed for design-authority approval
- **Date:** 2026-10-09
- **Scope:** Six shared capability families serving the existing 228-requirement registry
- **Constraints:** Preserve 228 requirements and 38 chapters (463–500); no chargeable AWS resources; local JSON adapters remain development/UAT-only

## Context

The six capability services now have injectable store boundaries. Local JSON adapters exercise persistence and adapter recreation for authoritative records, authorization policies, audit evidence, exception state/lifecycle evidence, and governed reports. Business validation is stateless. The JSON adapters are not safe for concurrent multi-process writers and do not provide production database transaction guarantees.

Production persistence must not introduce 228 requirement-specific stores or wrappers. It must preserve the existing execution route:

**228 requirements → one registry → six capability families → one execution routing layer.**

## Decision proposed

Use PostgreSQL as the production transactional persistence engine, behind the existing capability store contracts. Do not connect to or provision a cloud database as part of this ADR. A local PostgreSQL container may be used for integration testing once the repository accepts the database driver and test dependency.

All tenant-owned tables carry a non-null `tenant_id`. Every read, update, and delete is tenant-scoped. The application derives the effective tenant from the authenticated execution context and rejects payload/context mismatches. Database constraints and repository predicates must both enforce tenant boundaries.

## Logical schema

| Table | Purpose | Key controls |
|---|---|---|
| `authoritative_records` | Current record state | PK `(tenant_id, record_id)`; integer `version`; JSONB data; optimistic compare-and-swap update |
| `authorization_policies` | Governed authorization rules | Tenant-scoped policy ID; validated effect/actions/resources; deny-overrides; default deny |
| `audit_evidence` | Append-only evidence | PK `(tenant_id, evidence_id)`; requirement/action/principal/correlation/timestamp/payload/hash; no application update/delete path |
| `workflow_exceptions` | Current exception lifecycle state | PK `(tenant_id, exception_id)`; unique `(tenant_id, idempotency_key)`; state/retry/version/timestamps |
| `governed_reports` | Published report snapshots | PK `(tenant_id, report_id, publication_id)`; source requirement IDs and generation metadata |
| `transactional_outbox` | Durable integration-event delivery | Unique event ID; tenant, aggregate, event type, payload, creation/delivery status; retryable publisher |

Use relational columns for keys, tenant scope, state, versions, timestamps, and query-critical fields. Use JSONB only for governed variable payloads; validate payloads against the DATA contract before persistence. Keep API and EVENT identifiers aligned with the controlled EM-API-001 and EM-EVT-001 baselines.

## Transaction boundaries

### Authoritative record mutation
1. Begin transaction.
2. Select or update using `tenant_id`, record ID, and expected version.
3. Increment version only when the expected version matches.
4. Insert required audit evidence and an outbox event in the same transaction.
5. Commit; on version mismatch, return a stable conflict error and do not emit success evidence.

### Exception create or transition
1. Begin transaction and lock the tenant-scoped exception row (or use a guarded compare-and-swap update).
2. Enforce idempotency and the allowed lifecycle transition.
3. Write the new exception state, append-only lifecycle audit evidence, and outbox event in the same transaction.
4. Commit all three or roll back all three.
5. A repeated idempotent request returns the original result without duplicating lifecycle evidence.

### Authorization policy update
1. Validate the policy and its tenant scope.
2. Write policy change and a policy-change audit event in one transaction.
3. Apply explicit-deny precedence and default-deny evaluation in the decision service.
4. Record policy version/cache invalidation so stale policy snapshots cannot silently remain authoritative.

### Governed report publication
1. Validate provenance and source requirement identifiers.
2. Persist an immutable publication snapshot and audit/outbox event in one transaction.
3. Query only by effective tenant and report scope; enforce pagination/limits.

## Audit integrity and event delivery

- Canonicalize the evidence material before computing SHA-256; define the canonicalization version in the stored record.
- Treat a hash as tamper evidence, not as proof of origin or an immutable ledger by itself.
- Restrict audit table privileges so the application writer can insert and read but cannot update/delete evidence.
- Record principal, tenant, correlation ID, requirement ID, event type, and UTC timestamp.
- Use the transactional outbox for external notifications; consumers must be idempotent. Do not publish externally before the database transaction commits.

## Migration and compatibility

1. Keep current store interfaces as the capability boundary; implement PostgreSQL adapters behind them.
2. Add a versioned migration tool and schema migration table. Migrations must be forward-only in production; provide a tested restore/rollback procedure rather than assuming schema downgrade is safe.
3. Import fixture data only for tests. Do not automatically migrate ephemeral JSON files into production.
4. Run adapter contract tests against in-memory, JSON-file, and PostgreSQL implementations.
5. Add PostgreSQL integration tests for tenant isolation, uniqueness/idempotency, optimistic concurrency, rollback on audit/outbox failure, restart/reconnect, and transaction retry behavior.
6. Require backups, restore drills, least-privilege database roles, secret management, TLS, connection limits, health checks, and retention controls before production approval.

## Security and operations

- No tenant-wide query without an explicit tenant scope.
- Use parameterized SQL only.
- Use a least-privilege runtime role; migrations use a separate privileged role.
- Keep credentials out of source and logs.
- Apply retention/legal-hold rules from the approved governance baseline before defining audit deletion or archival behavior.
- Monitor connection pool saturation, transaction failures, lock waits, outbox lag, and replication/backup health where applicable.

## Rollout gates

- **P0 — Design approval:** design authority approves the database choice, logical schema, tenant isolation, and transaction boundaries.
- **P1 — Adapter implementation:** PostgreSQL store contracts implemented without changing requirement IDs, chapter boundaries, or router shape.
- **P2 — Contract conformance:** same behavioral contract suite passes against all adapters.
- **P3 — Transaction proof:** failure-injection tests demonstrate exception state, lifecycle audit, and outbox commit/rollback together.
- **P4 — Recovery proof:** backup/restore drill and migration rehearsal pass in a non-production environment.
- **P5 — UAT authorization:** approved hosted target, identity/roles, test data, evidence archive, acceptance locators, and business-owner authorization verified.
- **P6 — Release/certification:** only after requirement-level evidence and required sign-offs are complete.

## Explicit non-claims

This ADR is a proposed design, not an implementation or approval. It does not establish that PostgreSQL is provisioned, that any cloud resource exists, that business UAT ran, or that any of the 228 requirements are accepted. Existing local JSON adapters remain unsuitable for concurrent production workloads.
