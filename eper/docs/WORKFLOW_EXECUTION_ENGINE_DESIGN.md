# Workflow Execution Engine — Technical Design

**Status:** Implemented technical slice; CI/integration validated; operationalization pending  
**Scope:** First durable workflow-instance execution vertical slice  
**Target:** Local development and PostgreSQL integration tests only  
**Production/UAT status:** Not enabled; no Business UAT authorization implied

## 1. Purpose and boundary

EPER now has an application-scoped workflow publisher, durable PostgreSQL instance and transition services, application-scoped role/actor assignment stores, opt-in administration and execution APIs, transactional audit/outbox records, and a continuously running outbox process component. The implementation is technically validated in CI and PostgreSQL integration tests. Generated task-form previews remain distinct from business execution; the executable backend is present, while production dispatcher/context integration and worker operations remain pending.

This design defines the first executable slice: instantiate an approved, active workflow definition; assign the first activity; accept an authorized action or approval; persist the transition and its audit event atomically; and recover the resulting state after process restart.

The campaign scheduler remains a separate subsystem. Its lease, retry, and dispatch-fence patterns may inform background work, but campaign dispatch semantics must not be used as workflow approval semantics.

## 2. Non-goals for the first slice

- No visual workflow builder redesign.
- No arbitrary script execution, dynamic code, or user-supplied SQL.
- No provider dispatch or external side effects from a workflow transition.
- No automatic AI approval or autonomous external action.
- No production deployment, cloud database, or chargeable AWS resource.
- No migration or renumbering of the approved 228 requirements / 38 chapters.
- No claim of Business UAT readiness.

## 3. Core records

### Workflow definition snapshot

A running instance must pin an immutable snapshot of the exact active definition used at creation time. Later edits to the tenant's configured definition must not silently change in-flight instances.

**Implemented boundary:** the application-scoped publication boundary now exists in `eper_workflow_definition_versions`. The publisher accepts tenant/application/actor identity only from trusted server-side context, verifies active tenant-application ownership and actor-application assignment, validates activity role grants, writes an immutable version/digest and lifecycle/audit records atomically, and fails closed on missing or failed assignment lookups. Request application selectors remain untrusted and are checked server-side. The tenant-wide admin configuration remains a draft/configuration source only; it is not executed directly.

Minimum snapshot metadata:
- tenant_id and application_id
- workflow_id and definition_version
- canonical definition JSON and SHA-256 digest
- published_by and published_at (or equivalent approved activation evidence)

If the current configuration store cannot supply a trustworthy immutable version, instance creation must fail closed until definition publication/versioning is added. Do not infer a version from mutable JSON alone.

### Workflow instance

- id (UUID)
- tenant_id, application_id
- workflow_id, definition_version, definition_digest
- status: RUNNING | COMPLETED | REJECTED | CANCELLED | FAILED
- current_activity_id
- business_reference (optional, bounded, non-secret)
- data JSONB
- version (monotonic optimistic concurrency token)
- created_by, created_at, updated_at, completed_at

### Workflow transition

Append-only transition history:
- id (UUID), instance_id, tenant_id, application_id
- from_activity_id, to_activity_id
- action: START | SUBMIT | APPROVE | REJECT | CANCEL
- actor_id and effective role/permission evidence
- expected_version and resulting_version
- idempotency_key and correlation_id
- submitted payload digest (never store credentials or secrets)
- occurred_at

The current instance row is the queryable projection; transition rows are the durable business history. Both must be written in one transaction.

## 4. Transactional invariants

1. Every query and mutation is scoped by tenant_id and application_id from trusted server-side identity; caller-supplied identity fields are rejected or ignored.
2. The selected workflow definition must be active, versioned, and validated before an instance can start.
3. An instance stores the immutable definition snapshot and digest used at creation.
4. Every state-changing request supplies expectedVersion and an idempotency key.
5. A duplicate idempotency key for the same tenant/application/instance returns the original transition result; reuse with a different request digest returns a conflict.
6. The instance row is locked with SELECT ... FOR UPDATE, and expectedVersion is checked inside the transaction.
7. The actor must be authorized for the current activity's configured role and permission at transition time. Approval requires workflow:approve; ordinary activity requires workflow:act.
8. The target activity must be in the current activity's declared nextActivityIds. No arbitrary jumps.
9. Required form fields are validated server-side against the pinned activity schema. Unknown fields are rejected.
10. Instance update, transition insert, idempotency record, and audit append commit or roll back together.
11. Rejected or completed instances are terminal unless a separately approved compensation/reopen capability is designed.
12. A retry after an uncertain client response must be safe through idempotency; no duplicate transition or audit event is allowed for the same operation.

## 5. Transition semantics

| Current state | Action | Guard | Result |
|---|---|---|---|
| Not created | START | Active published definition; creator authorized | RUNNING at first activity |
| RUNNING | SUBMIT | Current activity is TASK/FORM; actor has workflow:act; required fields valid | RUNNING at selected next activity, or COMPLETED if no next activity |
| RUNNING | APPROVE | Current activity is APPROVAL; actor has workflow:approve; required fields valid | RUNNING at selected next activity, or COMPLETED |
| RUNNING | REJECT | Current activity is APPROVAL; actor has workflow:approve | REJECTED |
| RUNNING | CANCEL | Actor has explicit workflow admin/cancel authority | CANCELLED |
| Terminal | Any transition | Always denied | No mutation |

Branching must be explicit: if an activity has multiple nextActivityIds, the action must provide one permitted target. If there is exactly one, the service may select it deterministically. A zero-next activity completes the instance.

## 6. Proposed PostgreSQL objects

Use a dedicated migration directory under `eper/packages/workflows/migrations` and the existing migration runner pattern. Proposed tables:

- `eper_workflow_definition_versions`: immutable tenant/application/workflow/version snapshot, digest, status, publication metadata. This table is the authoritative execution boundary; it must not inherit tenant-wide scope from `eper_admin_configuration`.
- `eper_workflow_instances`: current instance projection, pinned definition version/digest, current activity, data, status and optimistic version.
- `eper_workflow_transitions`: append-only transition history with actor, action, version pair, idempotency key, correlation and payload digest.
- `eper_workflow_idempotency`: request digest and stored response/transition identifier, unique by tenant/application/instance/key.
- `eper_workflow_actor_role_assignment`: durable actor-to-role membership keyed by tenant/application/actor/role. Grants require active tenant/application ownership and active actor/application membership under row locks; mutations append audit evidence in the same transaction. The table enforces tenant/application RLS. Runtime authorization must resolve the activity's required role against this store, never from request JSON or the tenant-wide role configuration blob.

Use composite tenant/application foreign keys and indexes for tenant-scoped list/history reads. Add CHECK constraints for statuses/actions, bounded identifiers, positive versions, JSON object payloads, and unique idempotency keys. Avoid storing sensitive form fields in audit payloads; store only approved business fields in instance data and a digest/reference in audit.

## 7. Service/API boundary

Keep transport-independent logic in `packages/workflows`:
- `WorkflowDefinitionPublisher`: validates and creates immutable definition versions only after trusted tenant/actor resolution plus server-side tenant-application and actor-application assignment checks.
- `PostgresWorkflowExecutionStore`: transactional persistence and readiness checks.
- `WorkflowExecutionService`: start, submit, approve, reject, cancel, get and list operations; owns transition guards and authorization.
- `WorkflowExecutionError`: stable error codes/status mapping.

HTTP routes should be feature-flagged and disabled by default. Resolve tenant, application, actor, roles and permissions from trusted identity middleware / server-side assignment stores. Do not accept principal, tenant, application, role, or permission claims from request JSON.

Initial route shape (subject to existing API naming conventions):
- POST `/workflows/:workflowId/instances`
- GET `/workflow-instances/:instanceId`
- POST `/workflow-instances/:instanceId/transitions`
- GET `/workflow-instances/:instanceId/history`

Use standard API response/error envelopes already established in EPER. Return 404 for cross-tenant resources to avoid existence disclosure; 409 for stale versions or idempotency conflicts; 422 for invalid transition/form data; 403 for authenticated but unauthorized actions.

## 8. Required test evidence

### Unit tests
- Definition snapshot validation and deterministic digest.
- Transition matrix for TASK, FORM and APPROVAL activities.
- Required/unknown field validation.
- Single-next, multi-next and terminal activity handling.
- Unauthorized actor, wrong role, wrong permission and inactive definition denial.
- Terminal instance cannot transition.
- Stale expectedVersion conflict.
- Duplicate idempotency key replay and mismatched request digest conflict.

### PostgreSQL integration tests
- Start instance, restart/recreate service, and read identical state and pinned definition.
- Transition and audit event commit atomically.
- Audit failure rolls back instance and transition changes.
- Concurrent transitions with same expectedVersion produce one winner.
- Cross-tenant and cross-application reads/mutations return not-found and do not leak data.
- Same idempotency key cannot create duplicate transition/audit evidence.
- Definition changes after instance creation do not mutate the pinned snapshot.
- Migration readiness fails closed when any required table/index/constraint is absent.

### API tests
- Feature flag disabled means routes are absent and stores are not touched.
- Request body cannot override tenant/application/actor/role identity.
- All routes use trusted auth context and consistent response envelopes.
- No external provider calls occur during workflow transitions.

## 9. Delivery sequence and merge gate

1. Add application-scoped immutable definition-version publication and migration; define the trusted tenant/application publisher boundary before any instance route is enabled.
2. Add instance/transition/idempotency schema and PostgreSQL store.
3. Add service transition guards and deterministic unit tests.
4. Add API wiring behind a disabled-by-default feature flag.
5. Add PostgreSQL restart, concurrency, tenant-isolation and audit-atomicity integration tests.
6. Run EPER build/typecheck/full test suite and all required same-head GitHub Actions.
7. Review migration rollback/forward safety and confirm no existing configuration/API behavior regresses.
8. Merge only when the exact PR head has passing required checks and code review; keep Business UAT blocked until the existing entry gates are evidenced.

## 10. First implementation increment (schema foundation)

The branch includes `packages/workflows/migrations/001_workflow_execution.sql`, a dedicated `migrate:workflows` command, and a migration contract test. The migration creates application-scoped definition-version records, durable instance projections, append-only transition records, and idempotency response records. It includes composite tenant/application foreign keys, pins the exact definition digest in each instance, binds idempotency rows to the matching instance/transition pair, and forces tenant/application row-level security using the `eper.tenant_id` and `eper.application_id` session settings.

The integrated PostgreSQL CI lane applied this migration successfully, applied it a second time to verify repeatability, and passed the full EPER test suite with PostgreSQL enabled on commit `1d8d456a962c4a71d2156c5d7aca455609ed4b2f`. This is ephemeral CI database evidence, not a production or UAT deployment.

Migration `002_workflow_publication_events.sql` adds an append-only publication lifecycle ledger. The publisher now takes a transaction-scoped advisory lock keyed by tenant/application/workflow before allocating a version, closing the concurrent first-publication race where `SELECT ... FOR UPDATE` has no row to lock. Each successful publication appends a lifecycle event in the same transaction as the immutable definition snapshot and audit event. The latest event for a workflow is the authoritative publication pointer; retirement must append a `retired` event rather than update an immutable definition row. The lifecycle ledger has tenant/application RLS plus UPDATE/DELETE/TRUNCATE guards. The lifecycle migration and publisher were subsequently validated on exact PR head `daf6a9bdc7f179a037e947d4510346665310355b`; all 12 associated GitHub Actions workflows passed.

## 11. Current evidence disposition

| Capability | Current evidence | Disposition |
|---|---|---|
| Workflow definition validation | Existing unit tests and service | FOUNDATION |
| Role/permission configuration | Existing validation and access checks | FOUNDATION |
| Tenant-scoped durable admin configuration | Existing PostgreSQL store and integration test | FOUNDATION; deployment mode is opt-in |
| Application-scoped immutable workflow definition versions | Publisher writes immutable snapshots, serializes version allocation with a transaction advisory lock, and appends a publication lifecycle event plus audit record atomically; all 12 workflows passed on `daf6a9bdc7f179a037e947d4510346665310355b` | CI-VALIDATED |
| Immutable workflow definition versions | SHA-256 snapshot digest, append-only definition and publication ledgers, RLS, UPDATE/DELETE/TRUNCATE guards; exact-head build and test suite passed | CI-VALIDATED |
| Durable workflow instances | PostgreSQL instance projection with exact definition version/digest pinning; start service and real PostgreSQL persistence test passed | CI-VALIDATED |
| Application-scoped role catalogue | `004_workflow_role_definitions.sql` and `PostgresWorkflowRoleDefinitionStore` provide versioned role definitions and permission grants under tenant/application RLS with atomic audit writes | CI-VALIDATED |
| Application-scoped actor role assignments | `003_workflow_actor_role_assignments.sql` and `PostgresWorkflowActorRoleAssignmentStore` provide audited grant/revoke, optimistic versioning and atomic permission checks against active tenant, application, actor and role state | CI-VALIDATED |
| Transactional state transitions | Submit/approve/reject/cancel state machine implemented with expected-version checks, role authorization, field validation, branching, idempotency and same-transaction audit | CI-VALIDATED |
| Workflow instance audit history | Start and transition audit events persisted atomically with state, transition and idempotency records; real PostgreSQL integration passed | CI-VALIDATED |
| Restart/concurrency/idempotency behavior | PostgreSQL integration test covers concurrent duplicate starts, concurrent duplicate submits, competing approvals with the same expected version, cross-application and cross-tenant denial, service recreation and original-response replay; advisory locks, instance row locks and RLS isolation are exercised | INTEGRATION-TESTED; LOAD TEST PENDING |
| End-to-end workflow execution API | Admin role/publish routes and customer start/transition routes implemented behind an explicit opt-in flag; API tests verify trusted identity, body allowlists and tenant/application scoping | CI-VALIDATED; DISABLED BY DEFAULT |
| Transactional outbox and continuous worker component | Immutable transactional event outbox and continuous worker with bounded claims, normal-failure retry/dead-letter handling, authorised-scope discovery, bounded drain, cancellation and failure isolation. Current main does not renew in-flight leases or enforce the attempt budget when a process crashes before `markFailed`; PR #300 proposes those hardening changes. Tenant-scoped dead-letter inspection and audited replay remain backend-only work in PRs #298/#299, with no operator route/UI | CI-VALIDATED; HOST OPERATIONS PENDING |

## 12. Publisher increment (CI-validated)

`packages/workflows/workflow-definition-publisher.ts` now implements the first publisher slice. It accepts tenant, application, actor and correlation identity only through a trusted server-side context; validates an active workflow definition; sets the tenant/application RLS context; checks active tenant-application ownership and actor-application assignment using `FOR SHARE` locks in the same transaction; validates every activity's role and permission against the application-scoped role catalogue; assigns the next per-workflow version; stores a canonical SHA-256 digest and immutable snapshot; and appends the audit event in the same transaction. Assignment lookup errors and missing/revoked assignments fail closed. Tests cover successful publication, revoked tenant ownership, missing actor assignment, lookup failure and invalid definitions.

Historical milestone note: this paragraph described the publisher-only increment before the subsequent role catalogue, durable execution service, opt-in API routes, transactional outbox and continuous worker process were merged. The current implementation and remaining operational boundary are recorded in Sections 11 and 13–16. Earlier PR-head evidence must not be mistaken for current-main evidence.

**Exit criterion (updated):** the technical execution slice may be labelled IMPLEMENTED / CI-VALIDATED only while the exact-main implementation and PostgreSQL integration evidence remain green. Do not label it production-ready or operationally complete until the trusted context provider, production dispatcher, independently hosted/supervised worker, monitoring/alerting, load/recovery evidence and runbooks are complete.


## 13. Application-scoped role assignment increment (CI-validated)

The branch adds `003_workflow_actor_role_assignments.sql`, `004_workflow_role_definitions.sql`, `PostgresWorkflowActorRoleAssignmentStore` and `PostgresWorkflowRoleDefinitionStore`. Role definitions and memberships are keyed by tenant/application; memberships additionally bind actor and role. The stores use forced tenant/application RLS, optimistic version checks, transaction-scoped advisory locks and atomic audit writes. Grants require active tenant/application, actor/application and role-definition records. Runtime role reads and `hasPermission` checks join the current active tenant, application, actor, role and explicit permission state in one transaction. RLS settings are transaction-local so pooled connections do not retain a prior caller's scope. The publisher refuses to publish a workflow activity unless its role is active and grants that activity's required permission.

Unit and migration contract tests cover role definition writes, successful grant/audit, inactive actor and disabled-role denial, explicit permission checks, transaction-local RLS context, application-scoped constraints and publication-ledger controls. One QA fixture-ordering defect was corrected; the subsequent full exact-head test suite and all 12 GitHub Actions workflows passed on `daf6a9bdc7f179a037e947d4510346665310355b`.

**Remaining boundary:** the role catalogue and assignment stores are wired to the opt-in admin API, and the execution service checks current role grants on every transition. Continue hardening role/delegation/threshold/separation-of-duties policy and operational administration before enabling the feature.


## 14. Durable workflow execution service (CI-validated)

`PostgresWorkflowExecutionService` implements the first executable service slice:

- `start` resolves the latest publication event, rejects retired/unpublished workflows, verifies the immutable definition digest, checks active tenant/application and actor/application membership, authorizes the first activity's role/permission, and creates a durable instance pinned to the exact definition version and digest.
- Start idempotency is stored on the instance with a request fingerprint and a unique tenant/application key. A retry returns the original start response; key reuse with a different request is rejected.
- `transition` locks the instance, enforces the expected version, reloads the pinned definition and verifies its digest, rechecks current membership and activity permission, validates submitted fields, enforces allowed next-activity branches, and supports submit, approve, reject and cancel.
- Instance projection update, append-only transition row, idempotency response and audit event are committed in one transaction. A transaction-scoped advisory lock serializes retries with the same idempotency key; the instance row lock and expected-version check protect concurrent state changes.
- Live PostgreSQL integration tests verify one instance under concurrent duplicate starts, submit idempotency under concurrent duplicate requests, exactly one winner for competing approvals at the same expected version, cross-application and cross-tenant isolation, service recreation, original-response replay, exact definition pin, and atomic audit/transition records.

The workflow migration runner applies all seven numbered workflow migrations (001–007, including the action-approval execution ledger) and the CI lane applies them twice to verify repeatability. **Historical note:** at the referenced PR head `ec5080af429e3847d270d1428b6a48d63d3c1b1b`, the execution service readiness check verified seven tenant/application-RLS tables. **Current main correction (2026-11-01):** the readiness check in `packages/workflows/postgres-workflow-execution-service.ts` now verifies nine tenant/application-RLS tables: `eper_workflow_definition_versions`, `eper_workflow_publication_events`, `eper_workflow_instances`, `eper_workflow_transitions`, `eper_workflow_idempotency`, `eper_workflow_actor_role_assignment`, `eper_workflow_role_definition`, `eper_workflow_outbox_events`, and `eper_workflow_outbox_delivery`, plus the `start_idempotency_key` column. Each table must have forced row-level security and the `tenant_application_isolation` policy. Do not use the historical seven-table count as the current readiness contract.

**Remaining boundary:** the service is now exposed through the opt-in HTTP route layer described in section 15. Do not enable the execution feature or authorize Business UAT until production-like tenant bootstrap, admin credential provisioning, concurrent transition stress tests, operational monitoring and all existing UAT entry-gate evidence are complete.


## 15. Opt-in HTTP API and deployment boundary (CI-validated)

The API server now exposes the service layer only when `EPER_WORKFLOW_EXECUTION_API_ENABLED=true`. It remains disabled by default. Startup wiring requires PostgreSQL, durable audit, PostgreSQL tenant/actor application assignments and durable admin configuration; the server fails closed if the required stores or schema readiness checks are absent.

**Admin routes** (also require `EPER_ADMIN_CONFIG_API_ENABLED=true` and `EPER_ADMIN_CONFIG_PERSISTENCE=postgres`):

- `GET /admin/applications/:applicationId/workflow-roles`
- `PUT /admin/applications/:applicationId/workflow-roles/:roleId`
- `GET|POST|DELETE /admin/applications/:applicationId/workflow-role-assignments`
- `POST /admin/applications/:applicationId/workflows/:workflowId/publish`

Admin identity comes from the server-side `EPER_ADMIN_CONFIG_IDENTITIES_JSON` mapping. Application ownership is checked against the durable tenant/application assignment store, and the administrator must also have active actor/application membership. Publishing additionally requires the publisher actor to have active actor/application membership and the workflow's required role grants.

**Customer routes**:

- `POST /customer/applications/:applicationId/workflows/:workflowId/instances`
- `POST /customer/applications/:applicationId/workflow-instances/:instanceId/transitions`

Customer identity comes from `EPER_CUSTOMER_ACCESS_IDENTITIES_JSON`. Tenant and actor IDs are never accepted from request bodies; application ID and workflow/instance IDs are taken from the route, validated, and checked by the durable service. Request bodies use explicit allowlists for idempotency, business reference/data, expected version, action, payload and target activity.

The API contract tests cover customer authentication, body identity spoofing rejection, admin tenant ownership and active admin application membership, execution context propagation, and the disabled-by-default feature flag. Publisher and store behavior are covered by dedicated unit and live PostgreSQL integration tests. The exact PR head `ec5080af429e3847d270d1428b6a48d63d3c1b1b` passed all 12 associated GitHub Actions workflows, including the API identity-boundary tests and the integrated PostgreSQL validation.

**Deployment decision:** do not set the workflow feature flag in a hosted or UAT environment yet. The route layer is CI-validated, but production-like tenant bootstrap, admin credential provisioning, concurrent transition stress tests, operational monitoring and all existing Business UAT entry-gate evidence remain outstanding. No cloud resources were provisioned.


## 16. Continuous workflow outbox process (CI-validated)

The workflow outbox now has both a bounded delivery pass (`WorkflowOutboxWorker.runOnce`) and a long-running host process (`WorkflowOutboxProcess.run(signal)`).

- The process repeatedly obtains authorised tenant/application scopes from an injected `WorkflowOutboxContextSource`, deduplicates repeated scopes, and drains each scope in bounded batches.
- When events are available it continues draining without waiting for a cron expression or request traffic. When no events are available, it uses a bounded idle poll interval to avoid a hot loop.
- A scope-level database or dispatch failure is reported and isolated; other scopes in the same pass continue. Observability callback failures cannot terminate delivery.
- The process accepts an `AbortSignal` for graceful shutdown and passes it to the context source. Per-event delivery remains at-least-once; external dispatchers must deduplicate by immutable `eventId`.
- Tests cover continuous drain behavior, duplicate context discovery, per-scope failure isolation, graceful cancellation and option bounds.

**Current-main reliability limits (`880674ac`):** the worker has no heartbeat to renew a claim during a long dispatch, so another worker can reclaim the event after lease expiry while the original dispatch may still be running. The `maxAttempts` dead-letter decision occurs in `markFailed`; a crash before that call can bypass the budget because main's claim path has no exhaustion sweep. PR #300 proposes lease renewal, lease-loss fencing, claim-time exhaustion handling and metric propagation; these are not current-main capabilities. PRs #298 and #299 propose tenant-scoped dead-letter inspection and audited replay services, but neither currently supplies an operator-facing API/UI.

The exact PR head `ec5080af429e3847d270d1428b6a48d63d3c1b1b` passed all 12 associated GitHub Actions workflows, including TypeScript typecheck/build, the full test suite, live PostgreSQL workflow execution and same-commit integrated validation.

**Remaining boundary:** this process is a reusable worker component, not yet an independently deployed worker service. The PostgreSQL context-source adapter exists but the production host must wire it to a restricted platform-worker pool; the host must also supply an approved dispatcher and external process supervision/restart policy. The SIGINT/SIGTERM host adapter provides graceful shutdown but does not replace supervision. Delivery dashboards/alerts, load/recovery evidence and deployment-specific operational configuration remain pending. The workflow feature remains disabled by default and Business UAT remains unauthorized pending all existing entry-gate evidence.


## 17. Current main verification record (2026-11-01)

The current main commit is `880674ac86c1c33581280b94732a792b3fb9b90f`. All 13 check-runs attached to this exact commit completed successfully. The checks include build/test, container health, six-family HTTP exercise, PostgreSQL/payment/receipt contracts, 228-requirement / 38-chapter pilot matrix, G9 reconciliation, controlled QA re-execution, release artifact checks, and the integrated gate. This is repository CI evidence for the merged technical slice; it is not evidence of production deployment, production operations, or business acceptance. External dispatch remains disabled by default and the production dispatcher/worker hosting, supervision, delivery observability, and load/recovery exercises remain open.
