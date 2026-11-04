# EPER database engine evaluation — Issue #388

**Status:** Evaluation plan only. No database replacement, migration, cutover, or production decision is authorized.  
**Control candidate:** PostgreSQL, as currently approved for local development and integration tests.  
**Candidates:** PostgreSQL, MySQL 8.4 LTS, MongoDB (supported current stable release to be pinned before a run).  
**Owner decision:** Pending explicit approval.

## 1. Purpose

Determine whether PostgreSQL remains the best persistence engine for EPER, or whether MySQL or MongoDB provides a materially better fit without weakening tenant isolation, authorization, transactional integrity, auditability, durability, or operational recovery.

Repeated CI failures are not, by themselves, a reason to change engines. Each failure must first be classified as one of:

- engine behavior or driver compatibility;
- migration ordering, schema or fixture defect;
- connection/pool lifecycle or transaction boundary;
- tenant context, row-level security or authorization;
- backup/restore or migration-ledger behavior;
- test harness, container startup or environment issue;
- branch integration, stale base or superseded workflow run.

## 2. EPER workload inventory to preserve

The comparison must cover the real application contracts, not a generic CRUD benchmark:

1. **Tenant and application isolation:** tenant-owned records, application scoping, trusted identity, forced server-side authorization, cross-tenant and cross-application denial.
2. **Workflow configuration and execution:** draft definitions, immutable published versions/digests, pinned in-flight versions, state transitions, actor/role assignments, rule evaluation and transactional updates.
3. **Provider operations:** operation plus encrypted payload plus audit atomicity; idempotency; unique constraints; leases/fencing; retry/dead-letter; outbox/event consistency.
4. **Customer assets:** upload-session reservation, idempotency, asset metadata, application links, scan-job state, audit and bounded access grants.
5. **Commercial and payment records:** immutable acceptance/transaction/receipt snapshots, uniqueness, payment reservation, rollback and audit.
6. **Identity and delegation:** session lifecycle, tenant/application membership, role/delegation provenance, revocation and audit.
7. **Operational records:** support tickets, scheduler dispatch, campaign execution, append-only audit and reporting queries.

## 3. Comparative acceptance matrix

Run the same logical tests and fixtures against every candidate. A candidate is not a pass if it needs weaker acceptance criteria or test-only security behavior.

| Area | Required proof | Failure condition |
|---|---|---|
| Tenant isolation | Positive in-tenant reads/writes and negative cross-tenant/application attempts, including direct repository access | Any unauthorized row becomes visible or mutable |
| Authorization | Trusted server identity and role/delegation checks; revocation takes effect | Client-supplied identity/role can grant access |
| Atomicity | Operation, payload and audit commit or roll back together | Partial durable state or orphan payload/operation |
| Idempotency | Concurrent duplicate requests produce one durable logical result | Duplicate operation, upload or payment reservation |
| Workflow integrity | Published version is immutable; in-flight instance remains pinned | Mutable published definition changes an active journey |
| Concurrency | Concurrent state transitions, leases and dispatch fencing | Double execution, lost update or stale worker commit |
| Recovery | Process interruption, transaction rollback, restart and retry | Unrecoverable partial state or duplicate side effect |
| Schema evolution | Ordered migrations, repeatability, fresh clone and forward-compatible rollout | Non-repeatable or destructive migration |
| Backup/restore | Disposable local backup/restore with row/table and integrity verification | Missing committed data, constraints or migration history |
| Performance | Representative read/write, queue and reporting workload under controlled load | SLO regression agreed by owner; thresholds must be set before testing |
| Developer setup | One documented local setup and deterministic CI execution | Candidate requires undocumented/manual repair |
| Operations/portability | Local-only operational burden, monitoring, backup, upgrade and portability assessment | Unacceptable support burden or unapproved cloud dependency |

## 4. Candidate-specific implementation checks

### PostgreSQL

- Validate migration ordering and migration-ledger repeatability.
- Validate RLS policies, forced RLS, transaction-local tenant context and privileged-role boundaries.
- Validate composite constraints, deferred constraints where required, locking and connection-pool reset behavior.
- Validate backup/restore and the current fresh-clone developer setup.

### MySQL 8.4 LTS

- Design and prove equivalent tenant isolation without assuming PostgreSQL RLS semantics.
- Demonstrate that every tenant-scoped query and write is constrained by trusted server-side context.
- Validate transaction isolation, locking, unique/composite constraints, JSON use, migration parity, pool reset and backup/restore.
- Explicitly test bypass paths such as direct repository/service calls and background workers.

### MongoDB

- Prove required multi-document transaction semantics for operation/payload/audit and workflow state changes.
- Validate unique and compound indexes, tenant/application scoping, transaction retry behavior and concurrent updates.
- Demonstrate append-only audit and outbox/event consistency, lease fencing, idempotency and recovery.
- Assess document boundaries against relational reporting, joins, workflow version pinning and migration/evolution needs.
- Validate backup/restore and local replica-set requirements for transaction-capable tests.

## 5. Test execution sequence

1. **Failure-cause baseline:** classify recent PostgreSQL CI failures before attributing any to the engine. Record run URL, exact commit, failed job/step, first failing command, error/SQLSTATE if present, and whether the run was superseded or cancelled.
2. **Contract extraction:** identify the current PostgreSQL migrations, repository contracts and integration tests for the workload inventory above.
3. **Portable contract suite:** separate engine-neutral acceptance tests from engine-specific adapters and security enforcement tests. Do not hide candidate differences behind mocks.
4. **Local candidate environments:** use disposable local containers only. Pin image and driver versions. No cloud resources, credentials, production data or external provider calls.
5. **Parity runs:** execute the same acceptance suite, concurrency cases, migration/repeatability checks and backup/restore checks for each engine.
6. **Operational comparison:** document setup complexity, observability, backup/restore, upgrade and support burden.
7. **Decision review:** publish raw evidence, deviations, unresolved gaps, migration cost, rollback plan and explicit owner disposition.

## 6. Evidence record template

For every run, record:

- candidate and exact engine/image version;
- adapter/driver version and configuration;
- source commit and test-suite commit;
- environment and reproducible command;
- test group, executed/passed/failed/skipped counts;
- failure output and classification;
- isolation/atomicity/concurrency/restore evidence links;
- known limitations and remediation owner.

Do not aggregate counts from different commits or candidates into one pass rate. A cancelled or superseded workflow is not a test failure and is not a pass.

## 7. Decision method

No weighted score is assigned in advance. First apply hard gates: tenant isolation, authorization, atomicity, idempotency, audit integrity, recovery and backup/restore must all pass. Only candidates passing every hard gate may be compared on performance, developer experience, operational burden, portability and total cost. The owner must approve any weighting and final recommendation.

The final decision record must include:

- evidence-backed comparison and any remaining unknowns;
- reasons for retaining or replacing PostgreSQL;
- schema/data migration scope and compatibility strategy;
- cutover sequencing and rollback/recovery plan;
- operational ownership and support implications;
- explicit owner approval.

## 8. Guardrails

- PostgreSQL remains the control candidate during evaluation.
- No production migration, cutover, data movement or UAT authorization.
- No chargeable cloud provisioning; local disposable environments only.
- No production secrets, customer data or real external provider dispatch.
- Do not weaken tenant isolation, auditability, durability, idempotency or existing acceptance criteria to make a candidate pass.
- Keep approved 228 requirements and 38 chapters unchanged. This evaluation is architecture evidence, not a change to the approved requirements baseline.

## Related record

- Tracking issue: [#388 — Architecture decision review: PostgreSQL vs MySQL vs MongoDB](https://github.com/sbannai/enterprise-product-engineering/issues/388)
