# Persistence Adapter Conformance Matrix

- **Status:** Test plan / implementation gate
- **Date:** 2026-10-09
- **Scope:** Six capability families; existing 228 requirement bindings and 38 chapters remain unchanged
- **Related ADR:** [ADR-001 — Transactional Persistence](./ADR-001-transactional-persistence.md)

## Current adapter coverage

| Capability family | Contract / service | In-memory implementation | Local JSON adapter | Existing integration coverage | Production transactional adapter |
|---|---|---|---|---|---|
| Authoritative records | `AuthoritativeRecordStore` / `AuthoritativeRecordService` | Yes | `JsonFileAuthoritativeRecordStore` | Create/reload through service; separate store tests cover tenant scope, versioning, stale-write rejection | Implemented (local/integration only; live conformance pending) |
| Authorization | `AuthorizationPolicyStore` / `AuthorizationService` | Yes | `JsonFileAuthorizationPolicyStore` | Policy reload, tenant/principal isolation, default deny, explicit deny | Implemented (local/integration only; live conformance pending) |
| Business validation | Stateless capability service | Not applicable | Not applicable | Capability boundary tests; no persistence expected | Not applicable |
| Audit evidence | `AuditEvidenceStore` / `AuditEvidenceService` | Yes | `JsonFileAuditEvidenceStore` | Append/reload and integrity verification | Implemented (local/integration only; live conformance pending) |
| Exception lifecycle | `ExceptionStore` plus lifecycle evidence contract / `ExceptionHandlingService` | Yes | `JsonFileExceptionStore` | Create/transition, restart recovery, lifecycle evidence reload and verification | Implemented (local/integration only; live conformance pending) |
| Governed reporting | Reporting store / `GovernedReportingService` | Yes | `JsonFileGovernedReportingStore` | Publish/reload/query, tenant filtering, provenance | Implemented (local/integration only; live conformance pending) |

## Required adapter contract suite

Run the same behavioral tests against in-memory and JSON adapters now, then against PostgreSQL when a driver-backed adapter is approved and implemented.

| ID | Behavior | Required assertion |
|---|---|---|
| PC-001 | Create and read | Created value round-trips without caller-owned mutable references leaking into storage |
| PC-002 | Tenant isolation | A different tenant cannot read, update, delete, query, or infer another tenant's data |
| PC-003 | Optimistic concurrency | Stale expected version fails with a stable conflict code and leaves stored state unchanged |
| PC-004 | Idempotency | Same tenant/key/request replays the original outcome; same key with different request fails |
| PC-005 | Authorization | No match denies; explicit deny overrides allow; tenant/principal scope is enforced |
| PC-006 | Audit integrity | Evidence is append-only through the service contract; altered evidence fails integrity verification |
| PC-007 | Exception transition | Only permitted transitions succeed; retry counters/version changes are deterministic |
| PC-008 | Exception/audit transaction | Failure injecting audit or outbox insert rolls back exception state and evidence together |
| PC-009 | Report provenance | A report without source requirement IDs is rejected; query results remain tenant-scoped |
| PC-010 | Restart/reconnect | Committed values remain available after adapter/service recreation |
| PC-011 | Failure atomicity | Simulated write failure leaves no partial logical state; production tests verify database rollback |
| PC-012 | Concurrent writers | Parallel version updates cannot both commit against the same expected version |
| PC-013 | Serialization | Unsupported/cyclic/non-serializable payloads fail before a success result is returned |
| PC-014 | Schema migration | Empty database migration, upgrade from previous schema, and restore rehearsal are repeatable |
| PC-015 | Outbox delivery | Events are committed with business state; redelivery is idempotent and observable |

## Current known gaps

1. The local JSON adapters are development/UAT tools only. Atomic rename protects against partial file replacement, but does not provide multi-process locking, database transactions, or durable cross-store atomicity.
2. The exception adapter stores state and lifecycle evidence in one document, but they are still written in separate file replacements. A crash between those writes can leave state and evidence inconsistent.
3. A transactional outbox and database-level constraints are not implemented.
4. PostgreSQL adapters and migrations are implemented for local development/integration. Dedicated live conformance is now wired into EPER CI, but its first execution on the current PR head must pass before this gate can be considered evidenced.
5. CI passing demonstrates code/test gates only. It does not mean business UAT has executed or any requirement has business acceptance.


## PostgreSQL implementation checkpoint (2026-10-26)

The implementation workstream in PR #224 currently includes:
- Versioned schema migrations for the five stateful capability families and transactional outbox, with tenant RLS and an append-only audit trigger.
- Async PostgreSQL store implementations for authoritative records, authorization policies, audit evidence, exception lifecycle, and governed report publication/query.
- Exception create/transition and report publication paths that write state, audit evidence, and outbox intent in one transaction.
- Unit tests using a deterministic fake PostgreSQL client for tenant transaction setup, rollback, record compare-and-swap predicates, default-deny policy behavior, audit hashing, exception atomicity, and report publication atomicity.

This is a code checkpoint only. An explicit `persistence: "postgres"` option now wires the async PostgreSQL capability service factory without changing the default in-memory mode. The legacy in-memory/JSON service contracts remain synchronous and separate. A dedicated live PostgreSQL conformance test now runs against the ephemeral CI database using a non-superuser, non-owner role with RLS forced. It checks tenant isolation/cross-tenant write rejection, database-enforced audit immutability and audit hash round-trip, and transaction rollback. The workflow applies capability migrations before this test. This new test has been committed but has not yet been confirmed by a completed CI run on the current head. Do not mark G4 complete until that live test passes; do not mark G1–G4 complete solely on the previous mocked tests.

## Merge / production gates

- **G1 — Existing behavior:** all current EPER CI and capability integration tests pass.
- **G2 — Adapter conformance:** PC-001 through PC-007 and PC-009 through PC-010 pass against in-memory and local JSON adapters.
- **G3 — Database approval:** design authority approves the database, tenant model, schema, and transaction boundaries.
- **G4 — Transaction proof:** PC-008, PC-011, PC-012, and PC-015 pass against PostgreSQL using deterministic failure injection.
- **G5 — Operational recovery:** PC-014, backup/restore, secrets, TLS, least privilege, monitoring, and retention controls are evidenced.
- **G6 — Business UAT:** approved target, identity and roles, test data, requirement-level scenarios, acceptance-source locators, evidence archive, and business authorization are independently verified.

## Safety and scope controls

- No AWS resources are provisioned by this test plan.
- Do not change requirement IDs, chapter assignments, the registry, six capability families, or routing layer as part of persistence work.
- Do not promote local JSON results to production readiness or business acceptance.
- Any database driver/dependency or hosted database introduction must be reviewed in its own implementation change after the design-authority decision.
