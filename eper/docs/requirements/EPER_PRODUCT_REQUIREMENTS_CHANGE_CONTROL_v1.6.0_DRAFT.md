# EPER Product Requirements Addendum — v1.6.0 (DRAFT)

**Document ID:** EPER-PRD-ADD  
**Status:** Draft for owner approval; not an implementation authorization  
**Supersedes:** None  
**Baseline preserved:** 228 approved requirements across Chapters 463–500  
**Source:** Customer & Admin Workspace Wireframe v34 (2026-10-27)

## 1. Purpose

This draft carries forward the 45 candidate requirements captured from the owner-selected v34 wireframe. The original requirement IDs, complete statements, acceptance criteria, proposed priorities and wireframe source locators are preserved in:

- `source/EPER_CW_Wireframe_v34_Requirements_Source_Export.csv`
- `../product-baselines/EPER_Customer_Admin_Workspace_Wireframe_v34_Campaign_Scheduler_Agents_Ticketing_2026-10-27.html`

The technical reconciliation is in [EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md](EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md).

## 2. Version decision

The existing controlled register already records EPER-ACT-APPROVAL-001 as version 1.5.0. The source workbook's proposal to call v34 requirements v1.5.0 is therefore superseded by repository history. This candidate feature set is carried as **v1.6.0 DRAFT**. Do not update the controlled current version to 1.6.0 until the owner approves the 45-row additive scope and proposed priorities.

## 3. Candidate population

The draft population is exactly 45 IDs:

- EPER-CW-001 through EPER-CW-045.
- Original requirement statements and acceptance criteria are retained verbatim in the source CSV.
- Proposed Must/Should classifications remain proposals, not approved delivery commitments.
- All 45 are additive at the customer-workspace feature level because the 228 registry exposes shared generic control patterns rather than detailed workspace feature acceptance criteria.
- Existing shared controls and additive requirements are linked in the crosswalk; no exact 228 REQ-ID mapping is claimed where the source does not establish one.

## 4. Mandatory cross-cutting acceptance

Every candidate feature must, where applicable:
1. Resolve tenant, actor, role, application and entitlements from trusted server-side identity and assignment state.
2. Enforce tenant/application scope on reads, writes, exports, downloads, events and asynchronous worker actions.
3. Persist authoritative state in PostgreSQL with migrations, versioning, concurrency and restart tests.
4. Record attributable audit events and fail closed where protected persistence/audit is unavailable.
5. Use stable API contracts, request/correlation IDs, safe error messages and bounded pagination.
6. Provide accessible responsive UI with loading, empty, disconnected, error and success states.
7. Provide executable positive and negative acceptance tests tied to exact commit SHA and workflow run.
8. Keep external sends, publishing and CRM mutations blocked until the exact action has durable human approval and is re-authorized at execution.

## 5. Candidate requirements

See the complete 45-row source export. The source IDs are immutable and must not be reused. Each implementation PR, test, defect and release note must reference the candidate ID and v1.6.0 draft.

## 6. Approval and change control

- Owner decision: approve, revise or defer the v1.6.0 candidate scope and priority classifications.
- Until approval, candidates remain DRAFT and must not be reported as approved baseline requirements.
- Any owner-directed changes must update this draft, crosswalk and source trace without deleting the original source statements.
- The approved 228 requirements and 38 chapters remain unchanged.
- Business UAT authorization remains a separate gate and is not granted by this addendum.

## 7. Owner-directed commercial-control delta — 2026-11-02

**Disposition:** Added to the v1.6.0 draft register from the Product Owner's explicit direction. These requirements are additive to the 45 v34-derived candidates; they do not renumber or alter the 228 approved requirements, the 38 chapters, or the original v34 source export. Treat the requirements below as owner-directed scope, with detailed tariff values and operational policies still requiring configuration/confirmation.

| Candidate ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| EPER-CW-046 | MUST / P0 | Platform Admin shall manage each customer's lifecycle status as Active, Inactive/Suspended, or Disabled, with effective date, reason, actor and audit history. | Admin can change status through an authorized API; status is visible in the customer registry; changes are version-checked and durably audited; inactive/suspended/disabled customers cannot initiate protected application operations; reactivation restores only otherwise-valid entitlements and does not erase history. |
| EPER-CW-047 | MUST / P0 | Platform Admin shall assign a versioned commercial tariff using an explicit billing basis: customer-wide single-application tariff or multi-application tariff, including the permitted application count and any explicitly configured per-application/add-on charges. | Each customer has one effective accepted tariff assignment (or a documented contract-specific schedule); tariff records include currency, amount, billing interval, effective dates, version, status and approval reference; quote, invoice, payment and receipt use the same immutable accepted price snapshot; tariff changes do not silently reprice an existing contract. |
| EPER-CW-048 | MUST / P0 | EPER shall measure and continuously reconcile each customer's active applications and billable application scope against the accepted tariff and entitlements. | Metering is server-side and derived from authoritative customer/application lifecycle events and persisted assignments, not browser state; Admin can inspect contracted versus actual application count, plan, tariff version, exceptions and effective dates; reconciliation is repeatable and auditable; tenant isolation is enforced. |
| EPER-CW-049 | MUST / P0 | EPER shall enforce tariff and entitlement boundaries before allowing a customer to create, activate, access or execute an application or billable feature outside the accepted plan. | An operation that would exceed the permitted application count or use an unentitled feature is rejected server-side before mutation or execution; the same rule applies to APIs, UI actions, scheduled jobs, workers and integrations; no UI-only restriction; denied attempts return a stable actionable error and create a correlated audit/security event; existing data is retained and no unauthorized extra application is activated. |
| EPER-CW-050 | MUST / P0 | Platform Admin shall have a commercial compliance and exception-monitoring view with controlled remediation and override. | View identifies customer, applications, accepted tariff, actual usage, deviation type, first-seen/last-seen time, enforcement outcome and billing/reconciliation status; authorized Admin can correct assignment, upgrade tariff or issue a time-bounded exception with reason and approval/audit evidence; customer self-service cannot alter tariff, limits or enforcement state; overrides cannot silently bypass tenant isolation or audit controls. |


| EPER-CW-051 | MUST / P0 | A customer authorized to manage its account shall be able to switch between currently published Single-Application and Multi-Application tariff versions through an explicit acceptance flow. | The switch requires a trusted customer-admin identity, explicit acceptance reference, expected assignment version and an effective published tariff; the accepted amount, currency, billing interval, application allowance and tariff version are snapshotted transactionally; customer status must be Active; stale concurrent changes are rejected; the operation is audited. |
| EPER-CW-052 | MUST / P0 | EPER shall retain immutable history for every customer tariff assignment and accepted plan switch. | Every accepted assignment version records the tariff key/version, billing basis, application allowance, accepted price/currency/interval, effective dates, accepting actor/time and acceptance reference; prior history is never overwritten; switching to a lower allowance is rejected until active applications fit the new limit. |
| EPER-CW-053 | MUST / P0 | Product Admin shall be able to create and modify tariff catalogue prices and commercial terms. | Authorized Product Admin can create versioned drafts with plan key, Single/Multi basis, application allowance, amount, currency, billing interval, effective dates and change reason; the operation is durable and auditable; published versions cannot be edited in place. |
| EPER-CW-054 | MUST / P0 | Product Admin shall control tariff publication and any required independent approval. | Configured maker-checker approval prevents the draft author approving their own change; only approved or explicitly approval-exempt drafts can be published; publication records actor/time and approval reference; new prices do not silently reprice existing accepted customer contracts. |
| EPER-CW-055 | MUST / P0 | Customer Admin shall explicitly select application assignments to revoke when accepting a tariff downgrade that has a lower application allowance. | The customer workspace displays active tenant applications and their assignment versions; the customer explicitly selects which assignments to revoke and accepts the new tariff; selected revocations and the tariff assignment/history/audit writes commit in one PostgreSQL transaction under the tenant commercial lock; stale versions or any failed write roll back all changes; no application is silently selected or revoked. |

### Enforcement and fail-closed policy

1. **Single-application tariff:** only one application may be entitled and active for the customer at a time. Creating or activating a second application must be rejected unless an approved tariff change or time-bounded Admin exception is effective.
2. **Multi-application tariff:** the customer may activate only the number of applications included in the accepted tariff, plus explicitly purchased and effective add-ons. An application-count increase must be checked transactionally to prevent concurrent requests from exceeding the limit.
3. **Deviation response:** block the specific prohibited operation at the authoritative API/domain boundary and prevent corresponding asynchronous work from starting. Do not delete, corrupt, or silently suspend unrelated entitled applications or customer data.
4. **Customer lifecycle precedence:** an inactive/suspended/disabled customer cannot bypass the customer-level restriction through an active child application, cached session, API token, worker, webhook or scheduled task. Define and test the treatment of already-running work and sessions.
5. **Admin exception:** only a specifically authorized platform role may grant an exception; it must have scope, reason, approver where required, start/end time and immutable audit evidence. Expiry automatically restores normal enforcement.
6. **Commercial integrity:** a plan/tariff change takes effect only from its approved effective time and accepted contract snapshot. Do not infer currency conversion, tax or overage charges. Where no explicit overage policy exists, fail closed for the out-of-plan operation rather than inventing a charge.
7. **Observability:** emit versioned events for customer status changes, application activation/deactivation, entitlement assignment changes, tariff deviations, denied operations, exceptions and reconciliation results.

### Cross-cutting implementation dependencies

- Extend the existing Customers & Applications, Plans & Tariffs and Client Access admin areas beyond preview-only placeholders and connect them to durable PostgreSQL-backed APIs.
- Use transactional constraints/locking or an equivalent concurrency-safe entitlement check so parallel application-creation requests cannot exceed the purchased limit.
- Apply a shared server-side entitlement decision to synchronous APIs and asynchronous execution entry points; cached UI state is never authoritative.
- Preserve immutable tariff/contract snapshots and reconcile them with payment, invoice and receipt records.
- Add positive, negative, concurrency, tenant-isolation, restart/recovery and audit tests. Evidence must be tied to the exact commit and CI run.
- These requirements do not authorize live payment processing, chargeable cloud provisioning or Business UAT. Business UAT remains separately gated.
