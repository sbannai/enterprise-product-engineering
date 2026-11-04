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

| EPER-CW-055 | MUST / P0 | Customer Admin shall explicitly select application assignments to revoke when accepting a tariff downgrade that has a lower application allowance. | The customer workspace lists active tenant applications and their assignment versions; the customer explicitly selects which assignments to revoke and accepts the new tariff; selected revocations and tariff assignment/history/audit writes commit in one PostgreSQL transaction under the tenant commercial lock; stale versions or any failed write roll back all changes; no application is silently selected or revoked. |

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


## 10. Owner-directed customer workflow design capability — 2026-11-02

**Disposition:** Added from explicit Product Owner direction as additive v1.6.0 draft scope. These requirements do not alter or renumber the approved 228 requirements, the 38 chapters, or the original v34 source export.

**Ownership boundary:** The Customer Admin is the workflow-design owner within the Customer Admin's own tenant and authorized application scope. Product Admin owns platform-level product configuration, shared capability governance and platform policy; Product Admin is not the routine designer or editor of an individual customer's business workflows.

| Candidate ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| EPER-CW-056 | MUST / P0 | Customer Admin shall have a tenant- and application-scoped workflow Rule Engine that simplifies workflow activity design through configurable, versioned business rules. | Authorized Customer Admin can define and maintain rules for activity entry/exit conditions, conditional routing, approvals, actor/role assignment constraints, due dates, SLA timers, escalations, notifications and exception paths using validated configuration rather than custom code; rules can be composed with AND/OR conditions and supported operators against typed workflow/application data; rule sets are versioned, testable against sample cases, explainable through evaluation traces and attached to a workflow draft/version; rules execute server-side and consistently across UI, APIs and background execution; rules are deterministic and fail closed on invalid, missing or unauthorized inputs; rule evaluation is tenant/application isolated, permission-checked and audited; no arbitrary script, dynamic code or user-supplied SQL execution is permitted. |
| EPER-CW-057 | MUST / P0 | Customer Admin shall be able to create and modify their tenant/application workflows using a visual Workflow Designer, including editing workflows previously created or published, subject to versioning and publication controls. | Authorized Customer Admin can visually add, edit, remove and reorder activities; define transitions, dependencies, decision branches, approvals, assigned roles/actors, due dates and exception paths; attach Rule Engine rules to activities and transitions; open an existing workflow definition in the designer and modify it as a new draft version without mutating a published version or changing running instances; validate completeness, unreachable activities, invalid transitions, missing role assignments and rule references; preview and simulate representative paths before publication; compare versions and review a change summary; publish only after required permissions and configured approvals; persist immutable versions/digests, author, timestamps, reason and audit events; existing workflow instances remain pinned to their original definition version unless an explicitly authorized migration is performed. |

### Customer Admin workflow design experience

1. **Design entry point:** Customer Admin → Application → Workflow Studio, with separate but integrated Rule Engine and Visual Designer workspaces.
2. **Rule Engine first:** Customer Admin can define reusable conditions and actions once, test them with sample data, and attach them to one or more activities or transitions within the authorized application.
3. **Visual Designer:** Customer Admin can build a workflow from activities, transitions, decision branches, approvals, roles, deadlines and exception routes; can also reopen and modify an existing workflow as a new draft.
4. **Two-way consistency:** Rules attached or changed in either workspace are reflected in the same versioned workflow draft. The designer must show rule references and the Rule Engine must show where each rule is used.
5. **Safe lifecycle:** Draft → Validate → Simulate → Review/Approve (where configured) → Publish. Published versions are immutable; changes create a successor version.
6. **Execution integrity:** Runtime evaluates the pinned version's rules server-side, enforces tenant/application and actor authorization, and records decisions and transitions in durable PostgreSQL state with audit evidence.
7. **Separation of duties:** Product Admin governs platform-wide capabilities and policy boundaries. Customer Admin manages the customer's workflow definitions and rules only within authorized tenant/application scope. Neither role bypasses workflow publication, authorization or audit controls.
8. **Testing:** Include positive and negative rule evaluation, tenant-crossing denial, unauthorized designer access, invalid graph detection, rule-to-designer consistency, version immutability, running-instance pinning, concurrent draft edits, publication approval and restart/recovery tests.

**Product distinction:** EPER should let each customer shape how their own work gets done—without needing Product Admin intervention or bespoke development for ordinary workflow changes.

## 11. Owner-directed customer application alert and video settings — 2026-11-02

**Disposition:** Added following explicit Product Owner agreement. This is additive v1.6.0 draft scope; it does not change or renumber the approved 228 requirements, 38 chapters, or existing candidate IDs.

| Candidate ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| EPER-CW-058 | MUST / P1 | EPER shall provide customer-wide default alert and video-conferencing settings that are inherited by the customer's applications, with authorized application-level overrides. | Customer Admin can configure organisation defaults for permitted alert channels, sender identity, templates/language, timezone, quiet hours, meeting provider and standard meeting preferences; each application inherits these defaults when created; authorized Customer Admin can override supported settings for an individual application without changing other applications; each setting exposes whether its effective value is inherited or customised; resetting an override restores inheritance; changes are version-checked, durably persisted and audited. |
| EPER-CW-059 | MUST / P1 | EPER shall enforce central platform and customer policy boundaries over inherited and application-specific alert/video settings. | Product Admin platform restrictions and customer-level security, consent, privacy and provider-eligibility policies are authoritative; an application override cannot weaken or bypass them; effective settings are resolved server-side for UI, APIs, workflow execution and background dispatch; unavailable, suspended or revoked provider connections fail closed without silent fallback; settings and resolution are tenant/application isolated and auditable. |

### Customer and application settings model

1. **Hierarchy:** Product Admin platform policy → Customer Admin general defaults → Application-specific overrides → Workflow action parameters. More specific settings may refine defaults but never weaken a higher-level restriction.
2. **Customer defaults:** Configure supported alert channels, sender identities, templates/locales, timezone, quiet hours, default video provider, meeting duration and reminder preferences.
3. **Application overrides:** Allow a customer administrator to customise only the settings permitted by central policy. An override in one application must not affect another application.
4. **Effective-value visibility:** Show each setting as Inherited, Customised or Restricted. Provide an application-by-application comparison so Customer Admin can identify deviations from customer defaults.
5. **Provider configuration boundary:** Credentials and provider connections remain in the provider-connection management boundary; workflow definitions and settings store only safe connection references and preferences, never raw secrets.
6. **Workflow integration:** Workflow actions consume the resolved effective configuration at execution time. Workflow JSON must not duplicate or become the source of truth for customer/application-wide preferences.
7. **Policy enforcement:** Consent, retention, recording, security and provider availability restrictions are centrally enforced. An application override may narrow a policy but cannot broaden permissions beyond the governing policy.
8. **Change and audit:** Record actor, scope, prior and new values, version, reason, effective time and correlation ID. Concurrent updates use optimistic version checks.
9. **Testing:** Include inheritance, explicit override, reset-to-inherit, cross-application isolation, tenant isolation, central-policy denial, provider suspension/revocation, concurrency, audit and background-dispatch resolution tests.

**Admin workspace placement:** Customer Admin → General Settings → Alerts & Video; Application → Settings → Alerts & Video. The application screen shows inherited values and permits only policy-approved overrides.


## 12. Owner-directed client asset repository and workflow-driven application experience — 2026-11-03

**Disposition:** Added from explicit Product Owner direction for the 4 November 2026 design session. These are additive v1.6.0 draft candidates. They do not alter or renumber the approved 228 requirements, 38 chapters, original v34 source export, or previously assigned candidate IDs.

| Candidate ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| EPER-CW-060 | MUST / P1 | EPER shall provide a tenant-isolated client-level asset repository through which an authorized Customer Admin can upload, organize and manage images, videos and office documents (DOCX, PPTX and XLSX), and make eligible client assets available to authorized applications. | Customer Admin can upload the explicitly supported image, video, DOCX, PPTX and XLSX formats to the customer-level repository; the system validates file extension, detected MIME type, size and configured upload limits; rejects mismatches and unsafe files; records tenant, owner, uploader, timestamps, checksum, media type, size, tags and optional description; enforces tenant and actor authorization on upload, list, preview, download, replace and delete; supports safe metadata listing and authorized retrieval without exposing raw storage credentials or internal storage references; allows eligible applications to reference customer-level assets without copying binaries; prevents an application or user from accessing assets outside its tenant and granted scope; records version/change and audit history; supports resumable or bounded uploads for large files, clear progress/error/retry feedback, and accessible responsive UI; uses a provider-neutral storage adapter with explicit configured provider, server-side credentials, allowlisted retrieval and short-lived download grants; and includes malware-scanning integration, retention/deletion policy, quota/usage visibility, backup/recovery and failure-path tests. |
| EPER-CW-061 | MUST / P1 | EPER shall provide a customer application experience whose screens, task journeys and actions are derived from the application's configured and published workflow, with explicit attention to usability and responsive UI ergonomics. | For each authorized application, the customer-facing UI resolves the active published workflow and the signed-in actor's authorized roles/assignments from trusted server-side context; presents only tasks, activities, forms, approvals and actions relevant to that actor and current workflow state; renders supported form fields, validation, conditional visibility, rule-driven routing outcomes, due dates and SLA/escalation context from the workflow contract; provides clear application navigation, task queues, status/progress, next-action guidance, contextual help and confirmation for consequential actions; preserves entered data safely across validation and recoverable network errors; shows accessible loading, empty, success, warning, disconnected and error states; supports keyboard navigation, screen-reader semantics, focus management, readable hierarchy, responsive desktop/tablet/mobile layouts and sensible density; avoids exposing workflow internals, unauthorized activities or other users' work; rechecks authorization and workflow/version state server-side on every action; and includes usability-oriented browser tests for primary journeys, narrow viewports, keyboard-only operation, validation recovery, role differences, tenant/application isolation and workflow-version pinning. |

### Client asset repository design boundaries

1. **Scope hierarchy:** Customer-level assets are owned by the tenant. Applications may reference eligible customer assets; application-private assets remain scoped to their owning application. A reference does not widen the user's or application's authorization.
2. **Supported initial formats:** Images, videos, DOCX, PPTX and XLSX. Validate both declared extension and detected content type; do not trust browser-supplied MIME metadata.
3. **Storage abstraction:** Keep binary storage behind a provider-neutral adapter. Product configuration selects an explicitly configured provider; credentials and storage keys remain server-side. Do not assume a cloud provider is configured merely because an adapter exists.
4. **Security and governance:** Enforce tenant/application/actor access at every operation; audit upload, view/download grant, replacement and deletion; apply configured size/quota, malware-scan, retention and deletion controls. Fail closed when required scanning, authorization, storage or audit dependencies are unavailable.
5. **Application consumption:** Workflow activities may attach or reference authorized customer assets as instructions, templates or supporting evidence. The workflow payload stores opaque authorized asset identifiers, not public URLs, secrets or binary blobs.
6. **Lifecycle and reliability:** Use checksums, bounded/resumable upload sessions where needed, immutable object references, safe replacement/version semantics, orphan cleanup, retryable failures and tested backup/restore behavior.

### Workflow-driven client application UX design boundaries

1. **Workflow is the source of truth:** The UI is generated from the published application workflow and its version-pinned schema; do not hard-code a separate client journey that can drift from workflow configuration.
2. **Role-aware experience:** Task visibility and available actions derive from trusted actor, role, assignment and permission state. Hiding a button is not authorization; every action is re-authorized by the API.
3. **Ergonomics before decoration:** Prioritize task completion speed, clear information hierarchy, predictable navigation, minimal cognitive load, accessible controls, responsive layouts and recovery from errors over visual effects.
4. **State clarity:** Make current status, completed steps, pending actions, ownership, due dates and next steps understandable without exposing internal implementation details.
5. **Safe workflow evolution:** Existing instances remain pinned to their published workflow version. The UI must render the instance's actual version and handle retired/superseded workflows without silently changing an in-flight journey.
6. **Evidence:** Design review must cover representative workflow types and roles, browser-based end-to-end journeys, accessibility, responsive breakpoints, API/persistence consistency and negative authorization cases before the capability is reported as complete.
7. **Administration boundary:** Customer Admin owns tenant/application-scoped workflow design, rules, forms, workflow roles and actor assignments. Product Admin owns platform-wide customer lifecycle, tariffs/price book, entitlements and platform catalogues. These are separate control planes; neither role receives implicit access to applicant business content or the other's controls. A Customer Admin is not automatically a reviewer or approver.
8. **Configuration inheritance:** Customer-wide defaults may be inherited by an application, with explicit application-level overrides. For alerts and video conferencing, recipients, credentials, delivery history and application-specific policies remain scoped to the application.
9. **Runtime/admin separation:** Applicant, reviewer and approver journeys use the runtime application workspace. Workflow authoring and application configuration remain in the Customer Admin workspace; commercial and platform lifecycle controls remain in the Product Admin console.

**Design review completed:** 2026-11-04. The detailed design and first implementation slice are recorded in `../CLIENT_APPLICATION_EXPERIENCE_DESIGN_v1.0_DRAFT.md`. This review records design scope only; it is not evidence of implementation, approval of the v1.6.0 draft, or Business UAT acceptance.
