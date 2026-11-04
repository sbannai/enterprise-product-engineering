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
