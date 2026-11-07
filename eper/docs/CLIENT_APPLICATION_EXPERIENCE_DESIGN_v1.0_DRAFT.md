# EPER Client Application Experience Design v1.0 (DRAFT)

- **Status:** Design proposal; not an implementation or UAT approval
- **Date:** 2026-11-04
- **Scope:** Tenant-facing applicant and operational application workspace
- **Baseline:** Additive design; does not alter the approved 228 requirements / 38-chapter baseline
- **Related candidate requirements:** EPER-CW-061 (workflow-driven client application experience), EPER-CW-060 (customer-level asset repository)

## 1. Product principle

The configured and published workflow is the source of truth. EPER translates workflow steps, forms, rules, assignments, SLAs and transitions into a role-appropriate experience. Users should not need to understand workflow-engine terminology or identifiers.

Show the full high-level journey to provide orientation, but disclose only role-authorized details and actions. Future milestones may be visible as informational states; internal queues, reviewer identities, decision notes, confidential attachments and operational routing must not leak to unauthorized actors.

## 2. Experience goals

1. Make the next permitted action obvious on every application screen.
2. Preserve entered data across navigation, recoverable errors and interrupted sessions.
3. Keep the user in one coherent application workspace rather than sending them through unrelated pages.
4. Derive forms, validation, conditional visibility, tasks and transitions from the published workflow version.
5. Enforce tenant, application, actor and object-level authorization on the server; UI hiding is not authorization.
6. Make progress and history understandable without exposing internal workflow implementation.
7. Support responsive layouts, keyboard use, accessible names, focus management and screen readers.

## 3. Information architecture

### 3.1 Shared application shell

- **Header:** tenant/customer identity, current application context, help, notification centre, profile/session controls.
- **Primary navigation:** My applications, My tasks, shared resources where permitted, help.
- **Context panel:** application reference, service name, current user-facing status and last-saved time.
- **Main workspace:** selected task, form, document or timeline content.
- **Responsive behaviour:** desktop uses persistent navigation; tablet/mobile collapses navigation into a compact drawer or bottom navigation. No essential action is desktop-only.

Navigation items and application records are filtered by authenticated role and server-side authorization.

### 3.2 Application workspace

Use five stable areas:

1. **Overview** — reference, service, status, progress, next action, key dates and safe summary.
2. **Tasks** — actions currently assigned or available to the signed-in actor.
3. **Form / activity** — the current workflow activity and its dynamic form.
4. **Documents** — required evidence, uploaded files, validation state and permitted downloads.
5. **Activity** — user-visible chronological events and notifications.

The shell remains stable as the workflow advances. The current activity may change, but the user should not have to relearn navigation at each transition.

## 4. Screen-level wireframe contracts

These are layout contracts, not pixel-perfect visual specifications.

### 4.1 My applications

```
┌────────────────────────────────────────────────────────────────┐
│ EPER / Customer                         Help  Notifications User │
├───────────────┬────────────────────────────────────────────────┤
│ My applications│ My applications                               │
│ My tasks       │ [Search] [Status filter] [New application]*    │
│ Help           │                                                │
│                │ Reference   Service       Status      Updated  │
│                │ APP-...     Service A     Draft       ...      │
│                │ APP-...     Service B     Action req. ...      │
│                │ APP-...     Service C     In review   ...      │
└───────────────┴────────────────────────────────────────────────┘
```

*New application is shown only when the tenant's service catalogue and actor permissions allow it.*

Acceptance:
- Search and filters operate only over the actor's authorized applications.
- Status labels are user-facing, localized and mapped from governed application/workflow state.
- Empty, loading, error and no-results states provide useful next steps.
- The list never reveals another tenant's records or inaccessible application metadata.

### 4.2 Application overview

```
┌────────────────────────────────────────────────────────────────┐
│ APP-2026-000123  |  Service name              [Current status]  │
├────────────────────────────────────────────────────────────────┤
│ Progress: Started ── Submitted ── Review ── Decision ── Complete│
│ (show full high-level journey; future stages are informational)│
├────────────────────────────────────────────────────────────────┤
│ NEXT ACTION                                                     │
│ Upload the requested proof of address                           │
│ Due date / instructions / [Continue task]                       │
├─────────────────────────────┬──────────────────────────────────┤
│ Application summary         │ Important information            │
│ Applicant / service / dates │ Last saved / submitted / notices  │
└─────────────────────────────┴──────────────────────────────────┘
```

Acceptance:
- Full high-level journey is visible where the workflow provides a safe public milestone mapping.
- Future stages do not expose internal assignees, approval thresholds, internal comments or confidential evidence.
- The next-action card is generated from the actor's currently authorized actionable task; if none exists, show a clear waiting state.
- Progress is not calculated by naive step count; workflow branches, parallel tasks and skipped/optional steps use explicit milestone mapping.

### 4.3 Dynamic activity / form

```
┌────────────────────────────────────────────────────────────────┐
│ Application reference                    Saved just now         │
├────────────────────────────────────────────────────────────────┤
│ Activity: Applicant details                                      │
│ Step guidance and contextual help                                │
│                                                                 │
│ [Section title]                                                  │
│ Field label *       [........................................]   │
│ Field label         [........................................]   │
│ Conditional section (rendered only when server-provided rules   │
│ evaluate true for this actor and current form state)             │
│                                                                 │
│ [Save draft]                              [Continue / Submit]     │
└────────────────────────────────────────────────────────────────┘
```

Acceptance:
- Form schema, field constraints, conditional visibility and transition eligibility are workflow-version-bound.
- Client validation improves usability; server validation is authoritative.
- Autosave is debounced and explicit save remains available. Show saving, saved, offline/failed and conflict states.
- Recoverable errors retain user input. A stale workflow version or conflicting update must not silently overwrite data.
- Required fields, error summaries, inline errors and focus movement are accessible.
- Sensitive values are masked or omitted in logs, analytics and user-visible history as appropriate.

### 4.4 Documents

- Group documents by workflow activity or requirement, not by opaque storage path.
- For each requirement show: purpose, accepted formats/size, required/optional, upload state, validation/scanning state and permitted next action.
- Support images, videos, DOCX, PPTX and XLSX as allowed by customer policy and the specific workflow activity.
- Reuse a customer-level asset only through an authorized reference; application-level access must be explicit and auditable.
- Uploads use bounded/resumable transfer where supported, server-side MIME/extension/size checks, malware-scanning integration, checksum and metadata capture, and short-lived authorized download grants.
- Do not expose storage provider credentials, bucket/container names, raw object keys or permanent public URLs.

### 4.5 Activity timeline

- Show safe, chronological user-facing events: draft saved, submitted, information requested, response received, decision issued, document made available.
- Each event has timestamp, clear description and actor label only where disclosure is authorized.
- Internal audit events remain in the audit system; the applicant timeline is a filtered projection, not the audit log.
- Event ordering and pagination must be deterministic.

### 4.6 Clarification / return-for-information

- Present the exact requested information and permitted due date.
- Link each request to the relevant form section or document requirement.
- Preserve prior answers; mark only requested fields as needing attention.
- Allow a response preview and explicit resubmission.
- Record request/response linkage and actor attribution in durable state and audit.

### 4.7 Final outcome

- Display the configured terminal outcome in plain language.
- Provide decision date and authorized explanation.
- Expose generated letters/certificates only after authorization and successful document generation.
- Do not imply approval or completion based solely on a UI transition; read authoritative persisted application state.

## 5. Role-specific experience

| Role | Workspace emphasis | Permitted action examples |
|---|---|---|
| Applicant / external submitter | My applications, next action, forms, documents, progress | Create, save, submit, respond, download authorized outputs |
| Reviewer / processor | Assigned task queue, case context, evidence and SLA | Review, annotate, request information, recommend/complete configured activity |
| Approver | Decision queue, policy context, decision evidence | Approve, reject, return, delegate only where explicitly authorized |
| Customer Admin | Customer configuration and operational oversight | Configure workflow/rules/forms/assignments within tenant boundary; inspect authorized application metrics |
| Product Admin | Product-wide administration | Customer lifecycle, product configuration, tariff and platform-level controls; no implicit access to customer application content |

Role switching, where supported, must be explicit, authorized, audited and visually unambiguous. Never infer authority from a client-supplied role field.

## 6. Workflow-to-experience mapping

| Workflow concept | Experience projection | Enforcement |
|---|---|---|
| Published workflow version | Application's pinned journey and activity definitions | Persist version reference at application start |
| Workflow step/activity | Task or form activity | Server validates current step and actor |
| Form schema | Dynamic form fields and sections | Schema/version validation server-side |
| Rule / condition | Conditional fields, guidance and routing outcome | Evaluate trusted rule engine; do not trust browser result |
| Actor assignment | My tasks / authorized task queue | Tenant + application + actor authorization |
| SLA / due date | Due-date indicator and permitted escalation messaging | Server-derived clock and policy |
| Transition | Next activity and updated milestone | Transactional state transition with idempotency |
| Notification rule | In-app/email/SMS notice according to configured channels | Provider configuration, consent and delivery policy |
| Terminal state | Final outcome screen | Authoritative persisted state |

## 7. State, concurrency and workflow evolution

- An application instance is pinned to the exact published workflow version used at creation.
- Editing a workflow creates a successor draft; publication does not mutate running instances.
- Any migration of an in-flight application is a separately authorized, validated and audited operation. No implicit migration.
- Form autosave and submission use optimistic concurrency/version checks.
- Submission and workflow transition are idempotent under a stable request/idempotency key.
- State change, task completion, audit event and outbox notification intent are committed transactionally where applicable.
- UI refresh/retry must not create duplicate applications, tasks, payments or notifications.
- On stale data, show the conflict and offer refresh/reconciliation; never silently discard a user's work.

## 8. Security, privacy and tenant isolation

- Every read and write is authorized server-side against tenant, application, actor, role, assignment and resource scope.
- Tenant context comes from authenticated server-side identity, not an untrusted request body.
- Object identifiers are not authorization tokens.
- Document download grants are short-lived, scoped, revocable where supported and never logged with secrets.
- Internal notes, risk signals, reviewer deliberations, hidden fields and provider secrets are not exposed to applicants.
- Audit events capture actor, action, resource, decision, correlation and timestamp without storing sensitive form bodies or file contents.
- Rate limits, upload quotas, session expiry and abuse controls apply at tenant and actor boundaries.
- Accessibility telemetry and product analytics must not collect sensitive form values.

## 9. Accessibility and responsive acceptance

- Meet WCAG 2.2 AA as the design target, subject to formal verification.
- Full keyboard operation; visible focus; logical focus order; no keyboard traps.
- Programmatic labels, descriptions, required state and error association.
- Status and asynchronous save updates announced to assistive technology.
- Colour is never the sole indicator of status or validation.
- Reflow at narrow viewport widths without horizontal scrolling for primary tasks.
- Touch targets and modal/drawer interactions remain usable on mobile.
- Reduced-motion preference respected.

## 10. Operational and failure states

Every workspace area must define loading, empty, permission-denied, not-found, validation-failed, network-interrupted, server-error and stale-version states. Error messages must be actionable and must not disclose stack traces, database details, internal route names or secrets.

For upload failures, retain the upload session where safe and provide retry/resume guidance. For notification-provider failures, preserve the application transition and durable notification intent; do not falsely report delivery. For unavailable integrations, clearly distinguish queued, pending, failed and delivered states.

## 11. Functional acceptance scenarios

1. Applicant sees only applications in their tenant and authorized scope.
2. Applicant sees the full high-level milestone journey but not hidden internal tasks or reviewer-only notes.
3. Applicant can save a draft, leave, return and continue without losing data.
4. Conditional fields change only according to server-authoritative workflow rules.
5. An unauthorized actor cannot read, mutate or download an application asset by guessing its identifier.
6. A clarification request reopens only the permitted activity and preserves prior answers.
7. Duplicate submit/retry does not create duplicate applications or transitions.
8. A newly published workflow does not alter an existing application's pinned version.
9. A concurrent edit is detected and reconciled without silent data loss.
10. Reviewer and approver queues show only authorized assigned work.
11. Terminal outcome and generated documents are shown only after durable state confirms them.
12. Keyboard and screen-reader users can complete the primary journey.
13. Responsive layouts support the complete journey on mobile.
14. Upload rejection explains the specific policy failure without exposing storage internals.
15. Timeline shows user-visible events only and does not substitute for the immutable audit record.

## 12. Delivery decomposition

| Work package | Scope | Exit evidence |
|---|---|---|
| UX shell and navigation | Responsive shell, role-aware menu, application list | Component tests and responsive browser tests |
| Application read model | Overview, milestone projection, next-action projection | API contract tests; authorization matrix |
| Dynamic activity renderer | Workflow-bound forms, rules, validation, autosave | Schema tests, rule tests, browser tests |
| Task queues | Applicant/reviewer/approver task projections | Assignment/RBAC and tenant-isolation tests |
| Document workspace | Customer assets and application references | Upload security, RLS, malware and download-grant tests |
| Timeline and outcomes | Filtered activity, decisions, generated outputs | Audit separation and outcome-state tests |
| Reliability and accessibility | Idempotency, concurrency, offline/retry, WCAG | E2E, accessibility and failure-injection evidence |

## 13. Explicit non-goals / controls

- This design does not authorize Business UAT.
- This design does not authorize real email/SMS/video-provider dispatch or external side effects.
- This design does not authorize cloud provisioning or chargeable AWS resources.
- This design does not select a visual brand palette, final copy deck or pixel-level component library.
- This design does not change the approved 228 requirements / 38 chapters baseline.
- No feature is marked implemented or accepted by virtue of this document.

## 14. Open design decisions for later evidence-based closure

1. Customer-specific milestone labels and which milestones are safe for applicant disclosure.
2. Applicant identity assurance and account recovery requirements per service.
3. Upload size limits, video duration limits, scanning provider and retention policy.
4. Accessibility conformance test tooling and formal sign-off owner.
5. Exact task delegation and substitution rules for reviewer/approver roles.
6. Notification preference, consent, quiet-hour and delivery policy.

These decisions must be resolved through explicit product/customer policy and recorded before implementation depends on them.

## 15. Design review disposition — 2026-11-04

This section records the design-session outcome and distinguishes previously owner-directed decisions from implementation recommendations. The document remains a draft design contract; it does not promote EPER-CW-061 or EPER-CW-060 to the approved 228-requirement baseline.

### 15.1 Owner-directed decisions carried forward

| Decision | Disposition for this design |
|---|---|
| Workflow drives the client journey | Confirmed. The published, application-scoped workflow definition and its pinned version drive activities, forms, rules, task eligibility and transitions. Do not maintain a second hard-coded journey. |
| Workflow versioning | Confirmed. Publishing creates a successor immutable version. An existing application instance remains pinned to its original version unless a separately authorized migration is performed. |
| Customer Admin owns workflow design | Confirmed. Customer Admin owns the tenant/application-scoped Workflow Studio, rule engine, visual workflow designer, application workflow roles and actor assignments. |
| Product Admin is a separate control plane | Confirmed. Product Admin owns platform-wide customer lifecycle, price book/tariffs, commercial entitlements, platform catalogue and explicitly delegated platform support. Product Admin does not become a workflow author or gain default access to customer business records. |
| Customer/application configuration hierarchy | Confirmed. Customer-wide defaults may be inherited by applications, with explicit application-level overrides. This applies to alert and video-conferencing policy; recipients, credentials, delivery history and application-specific rules remain application-scoped. |
| Customer asset reuse | Confirmed. Customer-level assets may be referenced by applications only through explicit, authorized application links. A shared asset reference never widens tenant, actor or application access. |
| External actions | Confirmed. Email/SMS/WhatsApp, publishing, conferencing actions and CRM writes remain subject to explicit human approval and execution-time authorization where the action policy requires it. A UI success message must not imply external delivery. |
| Approved requirements baseline | Confirmed. The approved 228 requirements across 38 chapters remain unchanged. CW-060 and CW-061 remain additive v1.6.0 draft candidates pending owner approval. |

A Customer Admin is not automatically a reviewer or approver. If the same person must operate on a business application, that person needs an explicit application-scoped actor/role assignment and the same activity authorization checks as any other operator.

### 15.2 Three distinct experience surfaces

Do not combine these into one navigation tree or use a Product Admin menu as the application's runtime menu.

1. **Runtime application workspace**
   - Audience: applicant/external submitter, processor/reviewer and approver.
   - Primary navigation: My Applications, My Tasks and Help.
   - Within an application: Overview, Tasks, Documents and Activity.
   - Only the signed-in actor's permitted tasks, fields, evidence and actions are shown.
   - Application settings and workflow authoring are not exposed to applicants by default.

2. **Customer Admin workspace**
   - Entry: Customer workspace → Applications → select application → Configure.
   - Areas: Workflow Studio (visual designer and rule engine), workflow roles and actor assignments, application settings, customer asset repository, application-level operational metrics.
   - Customer Admin can set customer-wide defaults and explicit application overrides according to policy.
   - Workflow publication is a controlled action that validates the definition and role grants and creates a new immutable version. It does not rewrite running instances.
   - Access to business-instance content is still assignment- and permission-based; the Customer Admin role alone is not blanket access to every applicant record.

3. **Product Admin console**
   - Areas: customer lifecycle, commercial plans/tariffs, price book, entitlements, platform provider catalogue and delegated cross-tenant support controls.
   - These controls remain outside the Customer Admin Workflow Studio and outside the applicant runtime journey.
   - Any exceptional support access to customer content must be separately authorized, time-bounded where applicable, attributable and audited.

Role or application context changes must be explicit and visually obvious. Do not infer a role from a query parameter, form value, OIDC claim or hidden UI control.

### 15.3 Task and form ergonomics

**Task queue**
- Default view is "Assigned to me"; separate "Available to my role" only when the workflow policy permits claiming or team pickup.
- Each row/card shows a human task title, application reference, service name, user-facing status, due date/SLA and one clear action.
- Default sort is actionable/overdue first, then due date, then most recently updated. Filters are status and application; avoid a large filter panel by default.
- Desktop may use a compact table with readable row height. Tablet/mobile uses stacked cards with the primary action visible without horizontal scrolling.
- Do not display internal workflow IDs, raw routing expressions, confidential reviewer notes or another actor's queue.

**Task detail**
- Header: application reference, service, current safe status and save state.
- Main column: short, clearly titled form sections with labels above controls, concise help and grouped related fields.
- Context column on wide screens: task instructions, due date, permitted evidence and safe application summary. Collapse it below the form on narrow screens.
- Consequential actions are grouped in a persistent action area: Save draft, Submit, Approve, Reject or Return for information, but only actions permitted by the current activity and actor are rendered.
- Return/reject actions collect a required reason when the workflow policy says so. Destructive or terminal actions require a clear confirmation that states the consequence.
- Prevent double submission while a request is pending. Preserve the original idempotency key and payload when the outcome is uncertain; do not create a new request on a blind retry.

**Dynamic forms**
- Use the workflow's pinned activity schema. The renderer must not invent fields or actions absent from that schema.
- Use one-column fields on mobile and at most two columns for short, related fields on desktop. Long text, complex choices and evidence controls span the full width.
- Show required state, constraints and contextual help before submission. Do not rely on placeholder text as a label.
- Validate on blur and submit, not aggressively on every keystroke. Show an error summary plus inline field errors; move focus to the summary after a failed submit and associate each error programmatically with its field.
- Debounced autosave is supplementary; retain an explicit Save draft action and a visible last-saved timestamp/state.
- Conditional visibility and allowed values come from the server-evaluated workflow rules. The server remains authoritative for required fields, hidden fields, transitions and submitted values.

### 15.4 User-facing status and progress semantics

The workflow engine's internal state is not copied directly into customer-facing labels. Each workflow must define an explicit, safe milestone projection.

Recommended normalized application labels are Draft, Submitted, In progress, Action required, Awaiting review, Awaiting decision, Completed, Not approved and Cancelled. A customer may configure display wording, but the underlying semantic mapping must remain stable for filters, metrics and accessibility. Internal states such as lease, retry, dead-letter, routing and worker failure are never shown as business milestones.

- "Action required" is shown only when the current actor has an actionable task.
- "Awaiting review" or "Awaiting decision" is shown when the application is waiting on another authorized actor; do not disclose their identity unless policy permits.
- SLA labels are derived from the configured due date and policy time zone; use text such as Due tomorrow or Overdue, not colour alone.
- Do not calculate progress as completed activity count divided by total activity count. Branches, parallel activities, optional steps and skipped paths require explicit milestone metadata and a defined projection.
- If the workflow does not provide a safe milestone mapping, show the current user-facing status and next permitted action without inventing a percentage or journey stage.

Task status is distinct from application status. A task may be Available, In progress, Waiting, Completed or Returned while its application has a different overall status.

### 15.5 Current implementation review and gaps

Source review of main at `2c380d79c55c9183a42ed534ffd1a504f7d41316` found:

- The customer portal already has an OIDC-oriented shell, tenant/application assignment checks, module-aware navigation and basic loading/error/empty messaging. Its My Applications view currently renders application IDs and an assignment message, not an application journey or task experience.
- `GET /customer/applications` returns the actor's assigned application IDs. It is not yet a workflow-aware application read model.
- Workflow execution has opt-in POST routes for starting an instance and submitting a transition. `PostgresWorkflowExecutionService` currently exposes the start/transition write path; customer-facing GET projections for instance overview, task queues and user-visible history are not present in that service/API.
- The existing workflow configuration and Customer Admin Studio support application-scoped drafts, role definitions, publication, a basic activity/transition map and a simple routing-rule editor. The domain supports nested rule expressions, but the richer multi-condition visual group editor and a fully integrated runtime task UI are follow-on work.
- The generated task-form preview is still a preview; it is not a connected business application screen.
- The customer workflow start/transition route currently resolves the compatibility customer access identity directly. Before wiring it to the OIDC browser workspace, use the durable browser-session identity resolver in PostgreSQL identity mode, intersect current tenant/application and actor/application assignments on every request, and apply the browser CSRF control to cookie-authenticated writes. The compatibility bearer mapping must not silently become the durable browser identity path.
- The customer asset repository work is a separate dependency. Its current repository foundation does not yet provide the complete upload, scan, publish and customer-facing upload journey. Do not present Documents upload as available until those API/storage/security steps exist.

These are implementation gaps, not reasons to change the workflow-first product design.

### 15.6 Next implementation slice — role-aware application read model and first runtime journey

Build one thin, end-to-end vertical slice before expanding the screen catalogue or polishing the visual designer.

**Scope**
1. Add a PostgreSQL-backed application read model that can return, for a trusted actor and one authorized application:
   - safe application summary and current user-facing status;
   - workflow instance overview with the exact pinned definition version/digest;
   - the actor's currently actionable tasks and permitted actions;
   - current activity form schema and safe guidance;
   - explicit safe milestone projection; and
   - a filtered user-visible activity history.
2. Add bounded, tenant/application/actor-scoped read APIs for the task queue, instance overview and user-visible history. Preserve the existing response envelope, pagination conventions and non-disclosing cross-tenant behavior.
3. Align workflow start/transition browser calls with the durable OIDC session resolver and CSRF checks when PostgreSQL browser identity is enabled. Never accept tenant, actor, role or permission from the browser body.
4. Extend My Applications from ID-only cards into an application list and stable application shell. Add My Tasks, Overview, current Task/Form and Activity screens. Use the existing supported field types for this slice; do not introduce arbitrary scripts or client-side rule execution.
5. Connect Submit/Approve/Reject/Return controls to the existing transactional transition service with expected-version and idempotency handling. Keep the workflow API disabled by default until its exact-head security and integration evidence is complete.

**Representative acceptance journey**
- An authorized applicant opens an assigned application, sees a safe milestone and next action, completes a workflow-defined form, saves, refreshes and resumes without data loss, then submits once.
- The assigned reviewer sees the task in their own queue, opens the same pinned application version and performs only the permitted review action.
- An authorized approver sees the decision task only if assigned and permitted; the applicant then sees the persisted terminal outcome and only the public history entries.
- A duplicate request, stale version, unauthorized actor, cross-application identifier, interrupted network or unavailable persistence produces a safe, recoverable state without duplicate transitions or silent data loss.

**Exit evidence**
- Unit and API tests for task projection, safe milestone mapping, role/assignment filtering, status mapping and response allowlists.
- Live PostgreSQL tests for tenant/application isolation, instance-version pinning, concurrent transitions, expected-version conflicts, idempotency and atomic audit.
- Browser tests for applicant, reviewer and approver journeys using the OIDC browser session; include keyboard-only operation and narrow viewport coverage at approximately 375 px, 768 px and 1280 px.
- Accessibility checks for labels, error associations, focus order, live status announcements, contrast and reflow.
- Exact-head CI and integrated validation. A skipped PostgreSQL or browser test is not a pass.

**Explicitly out of this slice**
- New workflow field types, arbitrary scripts and a complete drag-and-drop workflow designer redesign.
- Full asset upload/scan/download UI until the customer asset API and storage adapter lifecycle is complete.
- Real email/SMS/WhatsApp/video-provider delivery, autonomous AI actions, live CRM writes, production deployment or chargeable cloud resources.
- Product Admin commercial controls inside the Customer Admin or applicant runtime navigation.
- Business UAT authorization.

The first slice is complete only when the representative journey is backed by durable read/write state and exact-head evidence. A static wireframe or preview-only task form does not satisfy this exit criterion.
