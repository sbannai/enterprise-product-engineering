# EPER Product Ticketing, Feedback and P1 Issue Register

**Status:** Proposed product requirement; not yet implemented  
**Decision:** No new feature-development scope is authorized until the P1 discovery threshold is reached and reviewed. Work to capture, classify, deduplicate and validate issues is allowed so the threshold is evidence-based.

## Operating rule

- Target: **100 distinct, evidence-backed P1 issues** recorded in the central register.
- Count only unique issues after triage; duplicate reports link to a canonical issue and do not increase the count.
- Feedback, feature requests, questions and confirmed defects are separate types. They do not count toward the P1 target unless triage confirms a qualifying P1 defect.
- Reaching 100 is a **triage and prioritization checkpoint**, not automatic approval to resume feature development. The owner reviews the list, critical dependencies, risk and proposed closure sequence.
- Continue existing Dev + Tested closure work and regression testing only within the already-approved scope. Do not expand functionality based solely on this document.

## Intake channels

1. In-product customer feedback.
2. Support tickets and help-center requests.
3. Internal QA and regression defects.
4. UAT findings when execution is explicitly authorized.
5. Security, privacy, reliability, payment and data-integrity reports.

All channels should converge into one canonical issue register; avoid parallel spreadsheets and disconnected ticket IDs.

## Required record fields

- Immutable issue ID and created/updated timestamps.
- Record type: defect, customer support, feedback, feature request, security/privacy, operational incident.
- Title, description, expected result, actual result, reproduction steps and environment/build.
- Severity (P0/P1/P2/P3), impact, affected capability/requirement, affected tenant reference where appropriate.
- Evidence links, reporter, owner, triage decision, duplicate/canonical link, root cause, workaround.
- Status, priority rationale, target milestone, SLA target, due date and escalation history.
- Linked commit/PR, test case/run, release and verification evidence.
- Audit events for creation, edits, assignment, severity/status changes, comments, merges and closure.

Never store passwords, access tokens, payment-card data or unnecessary personal data in tickets. Attachments require access control, malware scanning, retention rules and auditability.

## P1 triage policy

P1 should mean a severe production/UAT-blocking impact such as core workflow unavailable, payment/receipt integrity compromised, cross-tenant data exposure, material data loss/corruption, or a security/privacy risk requiring urgent containment. The triage owner must document the impact and evidence. Suspected security/privacy issues are restricted and escalated immediately; do not wait for the 100-issue target.

A P1 is counted toward the threshold only when:
1. It is not a duplicate.
2. The affected behavior and impact are described.
3. Evidence or reproducible steps are attached, or the lack of evidence and reason are documented.
4. Severity is confirmed by triage.
5. An accountable owner is assigned.

## Lifecycle

New → Needs triage → Confirmed / Duplicate / Not a defect → Prioritized → In progress (only when authorized) → Fix ready → Verification → Closed / Reopened.

Customer feedback lifecycle: Received → Reviewed → Accepted / Declined / Needs clarification → Linked to issue or roadmap decision. Acknowledgement and closure should be visible to the reporter where permissions allow.

## Access and tenant isolation

- Customer users can create and view only tickets belonging to their trusted server-resolved tenant and can access only permitted comments/attachments.
- Never accept tenant identity from request body/query as authority.
- Support can access only cases assigned to or authorized for their role.
- Admin access is role-based, audited and least-privilege.
- Internal security reports and sensitive attachments require restricted visibility.
- Do not expose one tenant's existence, ticket identifiers, metadata or content to another tenant.

## Dashboards and gates

Required metrics: total distinct confirmed P1, count to target (x/100), P1 age, ownerless/overdue P1, duplicate rate, severity changes, reopened rate, top affected capability, evidence completeness, and Dev/Test verification status.

**Gate A — Discovery:** 100 distinct confirmed P1 issues are registered with evidence and ownership, or the owner explicitly revises the threshold.

**Gate B — Triage review:** Review and deduplicate the complete list, confirm severity and dependencies, agree the closure sequence and define the next authorized scope.

**Gate C — Existing KPI:** For each approved functionality, track Dev, Tested, Production Ready and UAT separately. Current phase KPI remains Dev + Tested; UAT follows after that, and production readiness follows accepted UAT. Technical CI/UAT simulations are not business UAT acceptance.

## Implementation sequence

1. Establish the central issue schema, severity rubric, intake form and CSV import/export.
2. Build the admin triage queue and dashboard.
3. Add tenant-scoped customer ticket creation/status and feedback submission.
4. Add durable comments/attachments, SLA/escalation, notifications and audit history.
5. Link tickets to requirements, functionality, test evidence, commits and releases.
6. Add authorization, tenant-isolation, duplicate, audit and retention tests before enabling customer access.

This specification does not claim any of these product UI/API capabilities are implemented.

## Admin product dashboard and menu access

The EPER administrator product must expose a dedicated **Feedback & Ticketing** menu entry and dashboard. This is an administrative/support capability, separate from the customer ticket submission experience.

### Navigation and authorization
- Add a top-level admin navigation item named **Feedback & Ticketing** (or a clearly grouped **Support Operations** menu with Feedback & Ticketing as a visible child).
- The menu is visible only to authorized product-admin/support roles according to RBAC. Do not grant access merely because a user can access the admin shell.
- Keep customer-facing ticket submission and ticket status in the customer login; admin users use this dashboard to triage and manage tickets.
- Enforce authorization on every API endpoint and record, not only by hiding the menu. Tenant-scoped support access and any cross-tenant support access must be explicit, role-gated and audited.

### Dashboard requirements
- KPI cards: total open tickets, untriaged feedback, confirmed P1 count / 100 target, tickets breaching SLA, awaiting customer response, resolved-awaiting-verification.
- Queue views and filters: ticket type, severity, status, tenant, application, owner, age/SLA, created/updated date, and evidence completeness.
- Ticket detail view: title, description, impact, reproduction steps, attachments/evidence references, reporter, tenant/application, timeline, comments, owner, severity, root cause, linked duplicates and related test/requirement references.
- Actions: triage, assign/reassign, change severity with reason, request evidence, link duplicate to canonical ticket, add internal note, post customer-visible update, move through permitted status transitions, and attach resolution/verification evidence.
- P1 gate panel: show only distinct confirmed P1 defects in the count; display excluded duplicate/unconfirmed/enhancement records separately; reaching 100 changes the gate to **Review Required**, never automatic approval.
- Audit timeline: show actor, timestamp, action, before/after values where applicable, outcome and correlation/reference ID. Internal notes must never leak into customer-facing ticket views.
- Bulk operations, exports and attachments must apply the same RBAC and tenant-scope checks as individual ticket operations; exports must redact secrets.

### Acceptance criteria
1. Authorized product-admin/support roles can reach the dashboard from the admin product menu.
2. Unauthorized roles cannot see the menu and are denied by the server if they call its APIs directly.
3. Filters, KPI counts and ticket details agree with the canonical ticket store and show the basis for the P1 count.
4. Internal notes, tenant boundaries and evidence attachments are protected; every administrative change is audited.
5. Customer-facing ticket submission/status remains in the customer workspace and does not become admin-only.
6. No P1 threshold or dashboard KPI can be represented as complete without verified source records and evidence.
