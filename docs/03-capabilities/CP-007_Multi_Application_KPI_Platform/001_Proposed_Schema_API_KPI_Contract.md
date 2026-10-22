# Proposed Multi-Tenant Applications, Authorization, APIs, and KPI Contract

**Status:** PROPOSED — design review required  
**Baseline impact:** No change to the approved 228 requirements / 38 chapters.  
**Implementation status:** Specification only; no database migration or runtime behavior is changed by this document.  
**Repository context:** EPER currently has a tenant context guard and a capability execution API; the existing contract README explicitly notes that descriptor IDs are not full field-level DATA/API/EVENT contracts. This proposal must be reconciled with the actual service and persistence implementation before code is promoted.

## 1. Product outcome

Each customer (tenant) can manage multiple applications. Each application has its own workflow definitions and versions, actors and assignments, enabled capabilities, operational status, and KPI dashboard. Platform administrators manage global tenant lifecycle and capability catalogues. Tenant administrators manage only their tenant. Application users receive narrowly scoped capability bundles. The browser persona selector in the POC is illustrative and is not an identity or security boundary.

## 2. Logical data model

This is a logical model, not a migration script. Confirm database technology, ORM, identifier conventions, existing tenant tables, and migration tooling before implementation.

| Entity | Key fields / constraints | Purpose |
|---|---|---|
| Tenant | tenant_id PK, name, status, plan_id, created_at, updated_at | Customer boundary and lifecycle |
| TenantMembership | tenant_id FK, user_id, status; unique(tenant_id,user_id) | Tenant-level membership |
| Application | application_id PK, tenant_id FK, name, status, environment, current_published_version_id, created_at, updated_at; unique(tenant_id,application_id) | Independently managed application |
| ApplicationMembership | tenant_id, application_id, user_id, status; unique(application_id,user_id) | App-scoped membership |
| CapabilityBundle | bundle_id, scope (platform/tenant/application), name, status | Named set of permitted actions |
| CapabilityBundleVersion | bundle_version_id, bundle_id, version, grants, created_by, approved_by, created_at; unique(bundle_id,version) | Immutable/versioned policy definition |
| MembershipBundleAssignment | assignment_id, tenant_id, application_id nullable, user_id/group_id, bundle_version_id, effective_from, effective_to, assigned_by | Scope-aware assignment |
| WorkflowDefinition | workflow_id, tenant_id, application_id, name, status | Workflow identity |
| WorkflowVersion | workflow_version_id, workflow_id, version, status, created_by, reviewed_by, approved_by, published_at | Immutable workflow version and separation of duties |
| WorkflowStep | step_id, workflow_version_id, ordinal, step_type, configuration | Ordered workflow behavior |
| WorkflowActorAssignment | workflow_version_id, step_id, actor_id/group_id, permitted_actions | Who can act at each step |
| AuditEvent | event_id, tenant_id, application_id nullable, actor_id, action, resource_type, resource_id, decision, correlation_id, occurred_at | Security and change audit |
| KpiDefinition | metric_key, version, name, unit, formula, aggregation, allowed_dimensions, active | Governed metric semantics |
| ApplicationMetricEvent | event_id, tenant_id, application_id, metric_key, occurred_at, outcome, duration_ms nullable, correlation_id, safe_dimensions | Source telemetry; idempotent event identity |
| ApplicationKpiRollup | tenant_id, application_id, metric_key, bucket_start, bucket_size, dimensions_hash, value, numerator nullable, denominator nullable, computed_at | Efficient dashboard queries |

### Data integrity and isolation

- All tenant-owned records carry tenant_id; application-owned records also carry application_id where appropriate.
- Enforce composite relationships such as (tenant_id, application_id) and validate tenant ownership at every relationship boundary.
- Add indexes for (tenant_id, application_id, occurred_at) and KPI query dimensions based on measured workload.
- Use database row-level security where supported, as defence in depth, not as a replacement for application authorization.
- Avoid secrets, payment credentials, raw personal payloads, and unbounded/high-cardinality values in KPI dimensions.
- Preserve execution's workflow_version_id at start so publishing a newer version cannot silently alter in-flight executions.
- Revoked memberships and disabled capabilities must be evaluated at request time, not only when the UI loads.

## 3. API contract proposal

All paths below are proposed versioned REST routes. Resolve naming and existing server routing conventions before implementation.

### Application and membership

- `GET /api/v1/tenants/{tenantId}/applications`
- `POST /api/v1/tenants/{tenantId}/applications`
- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}`
- `PATCH /api/v1/tenants/{tenantId}/applications/{applicationId}`
- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}/members`
- `PUT /api/v1/tenants/{tenantId}/applications/{applicationId}/members/{userId}/bundles`

### Workflow lifecycle

- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}/workflows`
- `POST /api/v1/tenants/{tenantId}/applications/{applicationId}/workflows`
- `POST /api/v1/tenants/{tenantId}/applications/{applicationId}/workflows/{workflowId}/versions`
- `POST /api/v1/tenants/{tenantId}/applications/{applicationId}/workflows/{workflowId}/versions/{versionId}/submit-review`
- `POST /api/v1/tenants/{tenantId}/applications/{applicationId}/workflows/{workflowId}/versions/{versionId}/approve`
- `POST /api/v1/tenants/{tenantId}/applications/{applicationId}/workflows/{workflowId}/versions/{versionId}/publish`

Review, approval, and publication are distinct transitions with explicit policy checks and audit events. Do not expose one generic action that bypasses the transition model.

### KPI and operations

- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}/kpis?from=&to=&bucket=&metric=`
- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}/kpis/{metricKey}/series?from=&to=&bucket=`
- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}/kpis/definitions`
- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}/health`
- `GET /api/v1/tenants/{tenantId}/applications/{applicationId}/audit-events`

Every API contract must define authentication requirements, required capability/action, path and query validation, request/response schemas, error schema, pagination, correlation ID, rate limits where applicable, and audit behavior. Write operations should use idempotency keys where duplicate submissions would cause harm. Export endpoints require the same tenant and permission enforcement as dashboard queries.

## 4. Authentication and authorization requirements

1. Derive tenant identity and membership from the verified server-side principal/session. A tenantId in the URL is a requested resource scope, not proof of authorization.
2. Resolve application ownership and verify that the requested application belongs to the authorized tenant before accessing data.
3. Evaluate action-level grants server-side for every API request; frontend navigation and disabled buttons are usability only.
4. Treat platform administration as a separate privileged scope with explicit, audited, time-bounded support access. Do not grant unrestricted customer-secret visibility by default.
5. Bundle grants are versioned and assigned at tenant or application scope. Define deny precedence, inheritance, revocation behavior, and conflict resolution before implementing policy evaluation.
6. Keep designer, reviewer, approver, publisher, finance operator, auditor, and end-user actions distinct. Prevent self-approval by default unless an approved business policy explicitly permits it.
7. Return consistent non-disclosing denial responses so resource IDs cannot be used to enumerate other tenants' data.
8. Include actor, tenant, application, action, resource, decision, correlation ID, and timestamp in audit events without copying secrets or sensitive payloads.

## 5. Customer KPI dashboard

### Initial metrics

| Metric key | Definition / notes |
|---|---|
| workflow.started | Count of workflow executions started in the selected window |
| workflow.completed | Count of executions completed in the selected window |
| workflow.failed | Count of executions ending in failure in the selected window |
| workflow.success_rate | completed / eligible terminal executions; publish denominator semantics |
| workflow.duration_p50 | Median duration for completed executions |
| workflow.duration_p95 | 95th percentile duration for completed executions |
| approval.pending | Current count of pending approvals at query time |
| approval.oldest_pending_age | Age of the oldest currently pending approval |
| sla.attainment_rate | On-time eligible outcomes / all eligible outcomes; SLA policy version required |
| api.error_rate | Server-side error responses / eligible API requests |
| api.latency_p95 | 95th percentile latency for eligible requests |
| payment.success_rate | Only where a real payment event source exists and the viewer has finance permission |
| payment.reconciled_amount | Only from an approved reconciliation source; never infer from UI totals alone |

### Dashboard behavior

- Select application and time range; show metric definition, timezone, bucket size, last-updated timestamp, and source/freshness status.
- Support KPI cards, time-series, status breakdowns and authorized drill-down.
- Show empty/unavailable states honestly; sample values must carry a visible DEMO label and must never be presented as live telemetry.
- Define late-event handling, duplicate-event idempotency, bucket boundaries, timezone behavior, rounding, missing denominators, and rollup recomputation.
- Finance metrics require finance-specific authorization and an authoritative source; never expose payment secrets or raw gateway payloads.
- CSV/export must use the same authorization and row filters as the interactive dashboard.

## 6. Acceptance tests (release-blocking)

1. Tenant A cannot read, mutate, enumerate, aggregate, or export Tenant B's applications, members, workflows, audits, or KPI values, including through guessed IDs and cache keys.
2. A user assigned to Application A cannot access Application B in the same tenant without an explicit grant.
3. Client-supplied tenant IDs, role labels, or capability lists cannot elevate privileges.
4. Hidden UI controls do not bypass API authorization; unauthorized calls return a denial and create the required audit event.
5. Revoked membership, expired assignment, or disabled capability is enforced on the next authorized request.
6. A designer cannot approve/publish their own draft by default; workflow transitions are auditable and policy checked.
7. In-flight workflow execution stays pinned to its starting workflow version.
8. KPI queries and exports cannot leak data via dimensions, filters, cache keys, pagination, error messages, or aggregation joins.
9. KPI formula tests cover numerator/denominator, empty windows, timezone boundaries, duplicate and late events, and rollup consistency.
10. API contract tests verify request/response/error schemas and backward-compatibility policy.

## 7. Implementation sequence

1. Inventory current tenant context, API routes, persistence adapters, test harness, and migrations. Do not assume a relational DB or ORM until verified.
2. Agree on schema and API naming with the domain/design authority; resolve all ownership and approval fields.
3. Implement tenant/application scope guards and policy evaluation tests before exposing new endpoints.
4. Add migrations using the repository's established database tooling; add safe backfill and rollback strategy.
5. Publish OpenAPI request/response/error schemas and contract tests.
6. Instrument workflow/application events and implement KPI query/rollup services.
7. Connect customer console to live APIs only after tests pass; keep demo mode visibly separate.
8. Run the vertical slice in an isolated authorized environment and capture reproducible evidence.

## 8. Explicit non-goals / governance

- This proposal does not alter the approved 228 requirements or 38 chapters.
- This document is not evidence of a deployed service, approved schema, production security, or completed UAT.
- No AWS resources, paid infrastructure, production migration, release, or merge to the default branch is authorized by this proposal.
- Missing source-owner decisions remain OPEN / NOT EVIDENCED until approved through the project's governance path.
