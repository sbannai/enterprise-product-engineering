# ADR-001: Transactional Persistence for EPER Capability Services

- **Status:** Approved target and scope; implementation in progress
- **Decision date:** 2026-10-26
- **Scope:** Six shared capability families serving the existing 228-requirement registry
- **Constraints:** Preserve 228 requirements and 38 chapters (463–500); local development/integration tests only; no cloud resources; Business UAT remains unauthorized

## Decision

PostgreSQL is approved as EPER's target persistence engine. The initial implementation scope is local development and integration testing only. Do not provision or connect to cloud database resources as part of this work. This approval selects the target engine; it does not approve production deployment, Business UAT, or requirement acceptance.

The six capability families must retain the route:

**228 requirements → one registry → six capability families → one execution routing layer.**

Business validation remains stateless. All persisted capability operations must use asynchronous store interfaces and explicit tenant-scoped database transactions. Existing synchronous in-memory/JSON stores may remain as test adapters during migration, but they must not be presented as production-safe.

## Required schema and controls

| Table | Purpose | Key controls |
|---|---|---|
| `authoritative_records` | Current record state | PK `(tenant_id, record_id)`; integer version; JSONB data; optimistic compare-and-swap |
| `authorization_policies` | Governed authorization rules | Tenant-scoped policy ID; validated effects/actions/resources; deny-overrides; default deny |
| `audit_evidence` | Append-only evidence | PK `(tenant_id, evidence_id)`; principal/correlation/requirement/timestamp/payload/hash; no application update/delete path |
| `workflow_exceptions` | Current exception lifecycle state | PK `(tenant_id, exception_id)`; unique `(tenant_id, idempotency_key)`; state/retry/version/timestamps |
| `governed_reports` | Immutable report publications | PK `(tenant_id, report_id, publication_id)`; provenance and generation metadata |
| `transactional_outbox` | Durable integration-event delivery | Unique event ID; tenant, aggregate, event type, payload, retry/delivery status |

Every tenant-owned row has a non-null tenant ID. Tenant scope comes from authenticated execution context, never from an untrusted payload. Every query must include tenant predicates and database row-level security must enforce the same boundary. Use parameterized SQL only.

## Transaction boundaries

- **Record mutation:** write state using tenant + ID + expected version, append audit evidence, and enqueue an outbox event in one transaction. A conflict or failure must not leave success evidence or an event.
- **Exception create/transition:** enforce tenant-scoped idempotency and allowed transitions; update state, append lifecycle audit evidence, and enqueue event atomically. A replay must not duplicate lifecycle evidence.
- **Policy change:** validate tenant and policy, persist versioned policy and audit/outbox records atomically; retain explicit-deny precedence and default-deny.
- **Report publication:** validate provenance and persist immutable snapshot plus audit/outbox records atomically.
- **Event delivery:** never publish externally before commit. Use tenant-scoped claims, retry metadata, and idempotent consumers.

Audit hashes are tamper evidence, not proof of origin or a substitute for access controls. Define canonicalization version. Database privileges must prevent ordinary application roles from updating/deleting audit rows.

## Implementation sequence

1. Create versioned local migration and tenant transaction/outbox primitives.
2. Refactor capability store interfaces and services to async APIs without changing requirement IDs, chapter assignments, capability families, or routing.
3. Implement PostgreSQL adapters for authoritative records, authorization policies, audit evidence, exception lifecycle, and governed reporting. Business validation remains stateless.
4. Reuse one adapter conformance suite across in-memory, JSON, and PostgreSQL adapters.
5. Prove tenant isolation, optimistic concurrency, idempotency, audit/outbox atomicity, rollback injection, restart/reconnect, and concurrent-writer behavior against a local PostgreSQL instance.
6. Keep credentials local/environment-provided. Do not add cloud resources or production connection configuration.

## Gates

- **P1 — Adapter implementation:** all stateful capability stores use async contracts and PostgreSQL implementations.
- **P2 — Contract conformance:** common adapter suite passes across applicable adapters.
- **P3 — Transaction proof:** failure-injection tests show domain state, audit, and outbox commit/rollback together.
- **P4 — Recovery proof:** migration and local restart/reconnect tests pass; production recovery/backup controls remain separately unproven.
- **P5 — Business UAT authorization:** separately gated; requires an approved target, identity/roles, test data, requirement-level scenarios, acceptance locators, evidence archive, and explicit business-owner authorization.
- **P6 — Release/certification:** only after requirement-level evidence and required sign-offs.

## Current implementation evidence and non-claims

The initial migration schema, local migration runner, tenant transaction helper, outbox helpers, and unit tests are being added. They are foundational code, not proof that the capability services have been fully refactored or that PostgreSQL integration tests have run. PostgreSQL is not provisioned by this change. No cloud resources are authorized. Business UAT remains unauthorized and no requirement is accepted by this ADR.
