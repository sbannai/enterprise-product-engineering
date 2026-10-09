# Persistence Adapter Conformance Matrix

- **Status:** Test plan / implementation gate
- **Date:** 2026-10-09
- **Scope:** Six capability families; existing 228 requirement bindings and 38 chapters remain unchanged
- **Related ADR:** [ADR-001 — Transactional Persistence](./ADR-001-transactional-persistence.md)

## Current adapter coverage

| Capability family | Contract / service | In-memory implementation | Local JSON adapter | Existing integration coverage | Production transactional adapter |
|---|---|---|---|---|---|
| Authoritative records | `AuthoritativeRecordStore` / `AuthoritativeRecordService` | Yes | `JsonFileAuthoritativeRecordStore` | Create/reload through service; separate store tests cover tenant scope, versioning, stale-write rejection | Not implemented |
| Authorization | `AuthorizationPolicyStore` / `AuthorizationService` | Yes | `JsonFileAuthorizationPolicyStore` | Policy reload, tenant/principal isolation, default deny, explicit deny | Not implemented |
| Business validation | Stateless capability service | Not applicable | Not applicable | Capability boundary tests; no persistence expected | Not applicable |
| Audit evidence | `AuditEvidenceStore` / `AuditEvidenceService` | Yes | `JsonFileAuditEvidenceStore` | Append/reload and integrity verification | Not implemented |
| Exception lifecycle | `ExceptionStore` plus lifecycle evidence contract / `ExceptionHandlingService` | Yes | `JsonFileExceptionStore` | Create/transition, restart recovery, lifecycle evidence reload and verification | Not implemented |
| Governed reporting | Reporting store / `GovernedReportingService` | Yes | `JsonFileGovernedReportingStore` | Publish/reload/query, tenant filtering, provenance | Not implemented |

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
4. PostgreSQL adapter and migration scripts are not implemented; ADR-001 is a proposed design, not approval or implementation evidence.
5. CI passing demonstrates code/test gates only. It does not mean business UAT has executed or any requirement has business acceptance.

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
