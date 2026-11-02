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

## 8. Owner-directed product USP — customer tariff mobility (2026-11-02)

**Disposition:** Explicit Product Owner direction. Treat as a distinct product differentiator and additive candidate requirement; it does not alter or renumber the approved 228 requirements or the original v34 baseline.

| Candidate ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| EPER-CW-051 | MUST / P0 | EPER shall provide a customer-facing tariff mobility experience that allows an authorized customer administrator to switch between Single-Application and Multi-Application tariff plans, subject to Platform Admin commercial policy, accepted pricing and entitlement validation. Tariff mobility shall be positioned as a core EPER USP: customers can start with one application, scale to multiple applications as they grow, and return to a smaller plan when their active usage permits. | Customer admin can compare eligible single-/multi-application plans, permitted application counts, billing interval, currency and total payable price before confirming a change; customer can request or complete an eligible switch through an authenticated, authorized workflow; the system displays the effective date and immutable price/tariff snapshot before acceptance; the switch is versioned, auditable and reflected consistently in customer workspace, Admin monitoring, entitlements, invoices and receipts; Platform Admin can configure which plans are customer-switchable, approval requirements, effective-date rules and any explicitly approved fees/proration policy; no undisclosed charge or silent repricing is permitted. |
| EPER-CW-052 | MUST / P0 | EPER shall safely manage a tariff downgrade when the customer's currently active application count exceeds the destination plan's limit. | Before confirming a downgrade, show the applications that exceed the destination limit and require the authorized customer admin to select which applications remain active or to cancel the downgrade; do not delete applications or their data; selected excess applications are deactivated only through an explicit, confirmed and audited transition at the effective time; if no valid selection is made, the downgrade is not applied; background jobs and API access for deactivated applications are blocked after the transition. |

### Tariff mobility experience and commercial safeguards

1. **Discover and compare:** Customer workspace displays the current tariff, eligible alternatives, application allowance, billing interval, currency, total price and material differences. No vague "contact sales" dead end for plans configured as self-service switchable.
2. **Single → Multi:** Customer selects an eligible multi-application plan, sees the full accepted price and effective date, confirms the change, and can activate additional applications only after the new entitlement becomes effective.
3. **Multi → Single:** Customer is shown the active applications that exceed the single-application limit and must select the one to retain, or cancel the downgrade. Data is retained for deactivated applications subject to retention policy; no silent deletion.
4. **Admin policy:** Platform Admin controls eligible plans, customer self-service availability, approval gates, effective-date rules, and any explicitly approved proration/fees. Customer actions cannot alter tariff catalogue values or bypass limits.
5. **Atomic transition:** Tariff snapshot and entitlement transition are committed consistently with concurrency control. A failed transition leaves the prior accepted tariff and entitlements intact.
6. **Transparent billing:** Display any immediate amount due, credit, proration or next renewal amount only when the applicable policy and calculation are configured and validated. Otherwise disclose that the switch is scheduled for the next billing boundary or requires Admin review; never invent a charge.
7. **Audit and monitoring:** Record requester, approver where applicable, previous and new tariff/version, selected retained applications, price snapshot, effective time, transition outcome and correlation ID. Admin dashboard reports switch requests, completions, rejections and exceptions.
8. **USP measurement:** Product analytics shall report single-to-multi upgrades, multi-to-single downgrades, time to switch, failed transitions and application growth/retention, with tenant isolation and privacy controls.

**Positioning statement:** "Start with one application. Scale to many. Switch plans as your business evolves—with transparent pricing and no platform migration."

## 9. Owner-directed product administration — tariff price management (2026-11-02)

**Disposition:** Explicit Product Owner direction. Product Admin is the authoritative owner of tariff catalogue pricing. This is additive candidate scope and does not change the approved 228 requirements, 38 chapters, or original v34 source baseline.

| Candidate ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| EPER-CW-053 | MUST / P0 | Authorized Product Admin shall be able to create, modify, version, activate, schedule and retire the cost of Single-Application and Multi-Application tariff plans, including configured application allowances and explicitly defined add-on charges. | Product Admin can edit plan price, currency, billing interval, application allowance and effective dates through a role-protected API and Admin UI; every edit creates a new immutable tariff version with actor, timestamp, reason/change reference and approval state; Admin can preview the customer-facing plan and price before publication; only an activated version effective for the relevant date is offered to customers; existing accepted customer tariff snapshots remain unchanged unless a separately authorized customer contract change is accepted; concurrent edits use optimistic version checks; all changes are durably audited and tenant-isolated. |
| EPER-CW-054 | MUST / P0 | EPER shall preserve price integrity across customer tariff switching, quotation and billing when Product Admin changes tariff catalogue prices. | A customer switching after a new tariff version becomes effective is shown the applicable new price and must explicitly accept it; an in-progress or accepted switch retains the exact quoted tariff version and price snapshot under its stated validity/effective-time rules; existing contracts are not silently repriced; invoices, payments and receipts reference the accepted customer price snapshot; expired or superseded quotes cannot be accepted without a refreshed quote and renewed customer consent. |

### Product Admin tariff pricing controls

1. **Editable commercial fields:** plan name/description, single- or multi-application billing basis, included application count, base cost, currency, billing interval, add-on pricing where explicitly supported, effective-from/effective-to, customer self-service eligibility and publication status.
2. **Draft and publish lifecycle:** Admin edits create a draft version; authorized publication activates it immediately or schedules it for a future effective date. A draft never changes customer-visible pricing or entitlement.
3. **Immutable history:** Never overwrite a published tariff version. Corrections create a successor version; retain who changed what, when, why, approval reference and before/after values.
4. **Existing customer protection:** Each accepted customer assignment keeps its own tariff/version/price snapshot. Catalogue edits affect only eligible new assignments or future customer-accepted changes, according to the configured contract policy.
5. **Switch journey integration:** Customer plan comparison and switch confirmation always resolve the currently eligible published price version. Show currency, billing interval, application allowance, effective date and any configured fees before consent.
6. **Approval and separation of duties:** Configure which Product Admin roles may draft, approve and publish prices. Where policy requires dual control, the author cannot approve their own change. Record approval evidence.
7. **Validation:** Reject invalid/negative prices, unsupported currencies or intervals, overlapping effective versions where disallowed, and application limits inconsistent with the billing basis. Do not invent tax, proration, discounts or overage rules.
8. **Operational integrity:** Persist catalogue and customer contract snapshots in PostgreSQL; use transactional/version checks; propagate the effective version consistently to plan comparison, entitlement checks, quote, invoice, payment and receipt services.
9. **Testing:** Include role/permission, draft-versus-published visibility, scheduled activation, concurrent edit conflict, immutable history, customer-consent, quote expiry, grandfathered contract, tenant-isolation and invoice/receipt snapshot tests.

**Admin workspace placement:** Plans & Tariffs → Plan Catalogue → Edit Price → Preview → Submit for Approval (when required) → Publish/Schedule. Provide version history and customer impact preview before publication.
