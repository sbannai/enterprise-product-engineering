# Workflow Execution Engine — Technical Design

**Status:** Proposed implementation contract  
**Scope:** First durable workflow-instance execution vertical slice  
**Target:** Local development and PostgreSQL integration tests only  
**Production/UAT status:** Not enabled; no Business UAT authorization implied

## 1. Purpose and boundary

EPER currently has workflow-definition and role configuration validation, a tenant-scoped PostgreSQL admin-configuration store, and an audit-event writer. The workflow package currently exposes lifecycle-state types rather than an instance execution service. Generated task-form previews are not business execution.

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

**Application-scope blocker:** the existing `eper_admin_configuration` table is keyed by (`tenant_id, resource_type`) and its workflow configuration has no `application_id`. It is therefore not a safe execution-definition authority for multiple applications within one tenant. Do not read the tenant-wide `workflows` blob and assume it belongs to the caller's application. The first implementation must introduce an application-scoped publication boundary in `eper_workflow_definition_versions`, populated only by a trusted publisher that receives tenant/application identity from server-side assignment context. Until that boundary exists, instance creation must remain disabled. Existing tenant-wide configuration may be used only as an administrative draft source; it must not be executed directly. The current durable admin bearer mapping resolves only tenantId and actorId, not applicationId. A publication API must therefore accept an application selector only as an untrusted request parameter and verify it server-side against both the tenant-application ownership allowlist and the actor-application active assignment store before writing the versioned snapshot. Missing assignment stores or assignment lookup failures must fail closed.

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

Migration `002_workflow_publication_events.sql` adds an append-only publication lifecycle ledger. The publisher now takes a transaction-scoped advisory lock keyed by tenant/application/workflow before allocating a version, closing the concurrent first-publication race where `SELECT ... FOR UPDATE` has no row to lock. Each successful publication appends a lifecycle event in the same transaction as the immutable definition snapshot and audit event. The latest event for a workflow is the authoritative publication pointer; retirement must append a `retired` event rather than update an immutable definition row. The lifecycle ledger has tenant/application RLS plus UPDATE/DELETE/TRUNCATE guards. Exact-head CI for this follow-on increment is pending.

## 11. Current evidence disposition

| Capability | Current evidence | Disposition |
|---|---|---|
| Workflow definition validation | Existing unit tests and service | FOUNDATION |
| Role/permission configuration | Existing validation and access checks | FOUNDATION |
| Tenant-scoped durable admin configuration | Existing PostgreSQL store and integration test | FOUNDATION; deployment mode is opt-in |
| Application-scoped immutable workflow definition versions | PostgreSQL schema and fail-closed publisher implementation added; exact-head CI pending | IN_PROGRESS |
| Immutable workflow definition versions | Publisher writes append-only versioned snapshots with SHA-256 digest; exact-head tests pending | IN_PROGRESS |
| Durable workflow instances | Schema foundation added; store/service not implemented | FOUNDATION |
| Transactional state transitions | Schema foundation added; transition service and atomic audit integration not implemented | NOT_STARTED |
| Workflow instance audit history | Not evidenced | NOT_STARTED |
| Restart/concurrency/idempotency behavior | Not evidenced for workflow instances | NOT_STARTED |
| End-to-end workflow execution API | Not evidenced | NOT_STARTED |

## 12. Publisher increment (implementation added; validation pending)

`packages/workflows/workflow-definition-publisher.ts` now implements the first publisher slice. It accepts tenant, application, actor and correlation identity only through a trusted server-side context; validates an active workflow definition; sets the tenant/application RLS context; checks active tenant-application ownership and actor-application assignment using `FOR SHARE` locks in the same transaction; assigns the next per-workflow version; stores a canonical SHA-256 digest and immutable snapshot; and appends the audit event in the same transaction. Assignment lookup errors and missing/revoked assignments fail closed. Tests cover successful publication, revoked tenant ownership, missing actor assignment, lookup failure and invalid definitions.

The publisher is not yet wired to an HTTP route and does not start or transition workflow instances. It must not be treated as production-ready. Exact-head typecheck/build/full-test CI is required before this increment is considered validated.

**Exit criterion:** Do not label the workflow execution USP as IMPLEMENTED or TESTED until the full vertical slice and the integration evidence above exist on one exact commit.
