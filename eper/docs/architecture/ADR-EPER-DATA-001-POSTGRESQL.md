# ADR-EPER-DATA-001 — PostgreSQL as the target persistence engine

- **Status:** Accepted owner decision
- **Decision date:** 2026-10-30
- **Recorded:** 2026-11-07
- **Decision owner:** EPER product owner
- **Scope:** Local development and integration testing; production/cloud provisioning is not authorized by this ADR

## Context

EPER requires durable transactional workflows, tenant/application isolation, database-enforced authorization, idempotent operations, append-only audit evidence, outbox processing, migration repeatability, and predictable backup/restore behavior.

A comparative PostgreSQL/MySQL/MongoDB evaluation was proposed in Issue #388. Repeated CI failures by themselves are not evidence that the selected database engine is unsuitable; failures must first be classified as engine, schema/migration, pool lifecycle, RLS/security, backup/restore, test harness, or branch-integration defects.

## Decision

PostgreSQL is the approved target persistence engine for EPER. PostgreSQL is the implementation baseline for local development and integration tests.

This decision does not authorize:
- a production database deployment or cloud provisioning;
- chargeable AWS or other cloud resources;
- production data migration, cutover, or Business UAT;
- weakening tenant isolation, auditability, durability, idempotency, or acceptance criteria.

## Required engineering controls

1. Use versioned, deterministic, replay-safe SQL migrations.
2. Enforce tenant/application boundaries in PostgreSQL using least-privilege roles and RLS where applicable; use both ENABLE and FORCE RLS for protected tables.
3. Test cross-tenant and cross-application negative cases with the actual restricted runtime roles, not only a superuser or table owner.
4. Verify transaction rollback, idempotency, concurrency/locking, outbox consistency, and uncertain-outcome recovery.
5. Verify clean install, upgrade, migration replay, checksum drift detection, and preservation of existing data on PostgreSQL 16 in disposable CI databases.
6. Maintain backup/restore and fresh-clone developer verification.
7. Measure connection budgets and representative tenant workloads before making capacity or throughput claims.

## Reconsideration criteria

Reopen the engine decision only if reproducible evidence demonstrates a material requirement that PostgreSQL cannot meet at acceptable operational cost, or if the product owner explicitly requests a new comparative review. Any reconsideration must use equivalent workload contracts, security tests, migration/rollback proof, measured operational cost, and an explicit owner decision.

## Related work

- Issue #388 — comparative engine review (superseded by this owner decision).
- Issue #409 — PostgreSQL capacity benchmark (remains open; required for measured capacity claims).
- `eper/docs/postgres-capacity-and-load-testing.md` — local/disposable capacity validation guidance.
- PostgreSQL remains local/integration-only until separately authorized.
