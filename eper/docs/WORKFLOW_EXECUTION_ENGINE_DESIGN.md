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

- `eper_workflow_definition_versions`: immutable tenant/application/workflow/version snapshot, digest, status, publication metadata.
- `eper_workflow_instances`: current instance projection, pinned definition version/digest, current activity, data, status and optimistic version.
- `eper_workflow_transitions`: append-only transition history with actor, action, version pair, idempotency key, correlation and payload digest.
- `eper_workflow_idempotency`: request digest and stored response/transition identifier, unique by tenant/application/instance/key.

Use composite tenant/application foreign keys and indexes for tenant-scoped list/history reads. Add CHECK constraints for statuses/actions, bounded identifiers, positive versions, JSON object payloads, and unique idempotency keys. Avoid storing sensitive form fields in audit payloads; store only approved business fields in instance data and a digest/reference in audit.

## 7. Service/API boundary

Keep transport-independent logic in `packages/workflows`:
- `WorkflowDefinitionPublisher`: validates and creates immutable definition versions.
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

1. Add immutable definition-version publication and migration.
2. Add instance/transition/idempotency schema and PostgreSQL store.
3. Add service transition guards and deterministic unit tests.
4. Add API wiring behind a disabled-by-default feature flag.
5. Add PostgreSQL restart, concurrency, tenant-isolation and audit-atomicity integration tests.
6. Run EPER build/typecheck/full test suite and all required same-head GitHub Actions.
7. Review migration rollback/forward safety and confirm no existing configuration/API behavior regresses.
8. Merge only when the exact PR head has passing required checks and code review; keep Business UAT blocked until the existing entry gates are evidenced.

## 10. Current evidence disposition

| Capability | Current evidence | Disposition |
|---|---|---|
| Workflow definition validation | Existing unit tests and service | FOUNDATION |
| Role/permission configuration | Existing validation and access checks | FOUNDATION |
| Tenant-scoped durable admin configuration | Existing PostgreSQL store and integration test | FOUNDATION; deployment mode is opt-in |
| Immutable workflow definition versions | Not evidenced | NOT_STARTED |
| Durable workflow instances | Not evidenced | NOT_STARTED |
| Transactional state transitions | Not evidenced | NOT_STARTED |
| Workflow instance audit history | Not evidenced | NOT_STARTED |
| Restart/concurrency/idempotency behavior | Not evidenced for workflow instances | NOT_STARTED |
| End-to-end workflow execution API | Not evidenced | NOT_STARTED |

**Exit criterion:** Do not label the workflow execution USP as IMPLEMENTED or TESTED until the full vertical slice and the integration evidence above exist on one exact commit.
