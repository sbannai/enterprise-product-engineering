# EPER Wireframe-to-Product Alignment Matrix

**Status date:** 2026-10-22  
**Branch:** `proposal/multi-tenant-app-kpi-contracts`  
**Related PR:** https://github.com/sbannai/enterprise-product-engineering/pull/180  
**Purpose:** Single reconciliation register for UI wireframes, API contracts, persistence, authorization, and test evidence.

> This is a working implementation baseline, not a completion certificate. “Present” means source structure was located; it does not imply production readiness. All rows require verification against a runnable build and acceptance tests before being marked Done.

## Status definitions

- **Present (partial):** a source component, contract, or prototype exists; end-to-end behavior is not proven.
- **Needs verification:** source or runtime evidence has not yet demonstrated the complete requirement.
- **Missing / not verified:** no evidence currently establishes the required production capability.
- **Done:** only permitted with linked code, passing automated tests, and environment/evidence references.

## Cross-layer baseline

| Layer | Current evidence | Alignment status | Exit evidence |
|---|---|---|---|
| Requirements | Registry contains 228 bindings across chapters 463–500; six requirement patterns | Present; preserve unchanged | Registry integrity test confirms exactly 228 unique IDs and 38 chapters |
| Capability services | Six service families exist: authoritative records, authorization, business validation, audit evidence, exception handling, governed reporting | Present, partial | Service-level tests prove real domain behavior and error paths |
| API | Node HTTP API has health endpoint and opt-in bearer-protected local/UAT requirement execution routes | Partial; not a complete screen API | Versioned endpoint inventory, request/response schemas, auth tests, API integration tests |
| Persistence | Capability services default to in-memory stores; optional JSON-file stores exist | Not production-ready / DB unverified | Approved relational/database schema, migrations, indexes, tenant constraints, backup/restore and integration tests |
| UI | Standalone HTML wireframe prototype exists | Prototype only | Product UI routes/components connected to live API, accessibility/responsive checks, UI integration tests |
| User permissions | Permission editor proposed in the wireframe package; server-side action-level enforcement not yet verified | Needs implementation/verification | Persisted grants, deny-by-default policy, server enforcement on every protected route, negative tests |
| Multi-tenancy | Capability context carries tenant/principal/correlation IDs and tenant mismatch checks exist in parts of capability layer | Partial | Tenant isolation tests for every read/write/list/report/export and API route |
| CI/release | Draft PR #180 is open; source baseline docs distinguish typecheck from deployable artifact | Not release-cleared | Green CI for final SHA, reviewed/merged PR, immutable artifact and checksum, deploy and health evidence |
| UAT | No evidence in this matrix of a currently deployed, end-to-end production-like UI/API/DB release | Not cleared | UAT endpoint, build ID, test run evidence, exceptions, and explicit human approval |

## Screen-to-API-to-data acceptance matrix

| Wireframe area | Required product behavior | API/data contract required | Current status | Acceptance evidence required |
|---|---|---|---|---|
| Overview / dashboard | Role- and tenant-scoped summary cards and recent activity | Dashboard summary query; tenant/app-scoped reporting and audit read models | Needs verification | API/UI test proves values match source records and do not leak across tenants |
| Applications | List, create/edit, select and manage customer-owned applications | Application CRUD, tenant ownership, membership and lifecycle schema | PR #180 proposes contracts; runtime not verified | CRUD tests, validation, ownership and cross-tenant denial tests |
| Flow Studio | Create/edit/version flows; validate configuration; simulate/execute safely | Flow definitions, versions, validation/execute endpoints, execution records | Prototype/simulator exists; product integration not verified | Versioning, validation, failure/retry and end-to-end execution tests |
| Run History | Filter and inspect runs, outcomes, errors and correlation IDs | Run/execution query with tenant/app scope and pagination | Needs verification | Persisted run visible after restart; filters and authorization tests |
| Users & Access | Manage users, memberships, role assignment and scope | User/membership/role APIs and persisted identity mapping | Needs verification | Assignment lifecycle tests, audit records, least-privilege tests |
| Permissions | Configure Allow/Deny per action and scope, preview changes, reset defaults | Permission grants with principal, tenant, app, environment, action, effect, version and audit fields | Wireframe only / enforcement unverified | Denied actions rejected server-side; changes persist; policy-change audit trail |
| App KPIs | Show defined metrics from authoritative events, with time range and app scope | KPI definitions, event ingestion, rollups and freshness metadata | PR #180 proposes design; runtime not verified | Reconciliation against source events; duplicate-event and tenant-isolation tests |
| Audit & Evidence | Search/export evidence and view actor, action, target, timestamp and correlation | Append-only audit event storage, scoped search/export, integrity metadata | Capability service exists; end-to-end workflow unverified | Audit generated for privileged changes and denied actions; export authorization tests |
| Payment / receipts (where applicable) | Create transaction and downloadable receipt with unique identifiers and checkout lines | Payment intent/order/transaction/receipt APIs and durable records | Requirement established; current implementation not verified here | Gateway-authoritative paid amount reconciles to line items, taxes/discounts/total; unique IDs and duplicate-webhook tests |

## Required canonical permission model

Use a consistent server-enforced permission decision across UI and API:

- **Principal:** stable user/service identity.
- **Scope:** tenant + application + environment (with explicit global scope only for authorized platform administrators).
- **Action:** named operation such as `application.read`, `flow.publish`, `run.execute`, `user.manage`, `permission.manage`, `kpi.export`, `audit.read`, `receipt.download`.
- **Effect:** Allow or Deny. Explicit Deny takes precedence; no matching grant means Deny.
- **Governance:** who changed the grant, when, reason/ticket, effective time, version, and approval where required.
- **Enforcement:** evaluate on the server for every read/write/export/execute request. UI hiding/disablement is convenience only.
- **Separation of duties:** prevent self-escalation and restrict sensitive approvals or production actions to authorized independent principals.

Never trust a tenant, user, role, or environment supplied only by the browser. Derive the authenticated principal from the server-validated identity and verify every requested scope against persisted memberships and grants.

## API and database alignment rules

1. Every screen action maps to an API operation or is explicitly labelled prototype-only.
2. Every API operation maps to a versioned request/response schema and a defined persistence/event effect.
3. Every persisted entity has an ID, tenant ownership where applicable, created/updated metadata, and documented uniqueness/retention rules.
4. Every write path validates input and authorization before mutating data.
5. All list, search, export, report, and receipt paths enforce the same tenant/application scopes as detail endpoints.
6. Use idempotency keys for payment callbacks and other externally retried commands; preserve unique transaction, receipt, run, and correlation identifiers.
7. Do not claim an API, DB migration, or UI flow is complete until its automated evidence passes on the same commit SHA.

## Implementation sequence and exit gates

| Wave | Scope | Exit gate |
|---|---|---|
| 0 — Inventory | Enumerate every wireframe screen, control, action, route, API, entity and test | No orphan UI actions or undocumented endpoints |
| 1 — Identity & authorization | Principal resolution, tenant/app memberships, action-level permissions, audit | Positive and negative authorization tests pass |
| 2 — Persistence & contracts | Approved schema/migrations and repositories; replace in-memory defaults for target environment | Restart persistence, uniqueness, isolation and migration tests pass |
| 3 — Core application workflows | Applications, flow definitions/versioning, run execution/history | UI-to-API-to-DB end-to-end tests pass |
| 4 — Reporting & evidence | KPI event source/rollups, audit search/export | Reconciliation, scope, freshness and audit tests pass |
| 5 — Payments/receipts where applicable | Gateway reconciliation, unique IDs, downloadable receipts | Test-gateway callbacks, duplicate/replay and amount reconciliation pass |
| 6 — Release & UAT | Full CI, artifact, deployment, smoke tests, evidence archive | All release blockers resolved or explicitly accepted; human UAT sign-off |

## Definition of Done

A screen or feature is Done only when all are true:

- UI is implemented in the product, not only in standalone wireframe HTML.
- API contract and error behavior are documented and tested.
- Data is persisted through the approved store and survives restart.
- Authorization is enforced server-side for allowed and denied actions.
- Tenant/application/environment isolation is tested.
- Automated unit, API integration, and relevant end-to-end tests pass on the same commit.
- Audit/evidence exists for sensitive actions.
- The build artifact and environment deployment are identifiable.
- UAT result is recorded; final business approval remains a human decision.

## Current decision

**Overall status: NOT END-TO-END COMPLETE.** The source contains useful capability and API scaffolding, and PR #180 proposes multi-application/API/KPI contracts, but the PR remains a draft and explicitly says no runtime code or database migration changed in that proposal. Treat this matrix as the common baseline; update each row only with verifiable source and test evidence.
