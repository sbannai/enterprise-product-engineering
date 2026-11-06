# EPER Functionality Closure and Responsive Acceptance

- **Purpose:** move the delivery loop from repeated UAT readiness checks to incremental feature completion and verified regression coverage.
- **Baseline:** preserve 228 requirements, 38 chapters (463–500), six capability families XX01–XX06, and the single execution routing layer.
- **Delivery rule:** each feature is implemented in its owning module, connected through authorized tenant-scoped APIs, and tested before the next feature is considered complete.
- **Release rule:** passing automated tests is engineering evidence, not Business UAT acceptance. Business UAT remains unauthorized until its approved entry gates are met.
- **Environment rule:** local development and CI only; do not provision chargeable cloud resources.

## Definition of done for every feature

1. Requirement IDs and acceptance expectations are traceable to the existing registry; no requirement or chapter is silently removed or renumbered.
2. UI, API, domain/service, persistence, and audit responsibilities remain separated into modules with explicit contracts.
3. Server-side authentication, role/entitlement checks, tenant boundary enforcement, input validation, and stable response/error envelopes are covered.
4. State-changing operations use durable audit events and transaction/outbox semantics where applicable; retries and idempotency are tested.
5. Automated tests cover the happy path, validation failures, permission denial, cross-tenant access, concurrency/idempotency, persistence/restart, and dependency failure as applicable.
6. Regression tests run in CI; no test is labelled passed without a captured successful run on the current commit.
7. UI changes pass desktop, tablet, and mobile viewport checks and keyboard/accessibility checks before feature closure.
8. Documentation, support/help content, and configuration are updated with the feature rather than deferred to a later UAT-only phase.

## Ticket visibility acceptance contract

- Customer ticket history is application-scoped: only tickets for the selected application assigned to the authenticated customer identity may be returned.
- Admin ticket triage is tenant-scoped: authorized admins may see and filter client-submitted tickets across applications in their authenticated tenant, but not tickets from other tenants.
- The server derives tenant, actor, role, and application authorization from trusted identity. Caller-controlled tenant IDs, actor IDs, role headers, and query filters must not broaden access.
- Admin assignment/status changes must enforce allowed transitions and persist durable audit evidence. UI copy and hidden controls are not authorization controls.
- Test both allowed access and explicit cross-application/cross-tenant denials. Do not label this workstream PASS until focused tests and current-commit CI results are recorded. No platform-wide admin access is implied; that needs a separately approved authorization contract.

## Responsive UI acceptance

Test at minimum at 320px, 375px, 390px, 768px, 1024px, and 1440px viewport widths.

- No horizontal page overflow; long identifiers, messages, and table values wrap or use a deliberate contained scroll region.
- Navigation collapses to a touch-friendly mobile pattern and can be opened, closed, and used with keyboard focus.
- Forms stack vertically on narrow screens; labels remain visible; validation and server errors are associated with the relevant field or form.
- Primary actions remain visible and operable without hover; interactive targets are at least 44 by 44 CSS pixels where practical.
- Tables switch to a responsive card/list presentation or a clearly bounded horizontal scroll area without hiding critical actions.
- Dialogs and menus fit the viewport, preserve focus, support Escape where appropriate, and do not trap users outside the page.
- Loading, empty, success, validation, authorization-denied, and server-error states remain legible and distinguishable.
- Payment, transaction status, receipt download, ticket submission, and ticket administration flows are exercised at mobile and desktop sizes.
- Role/entitlement-based navigation and actions are checked on every supported viewport; hiding a control is never treated as a substitute for API authorization.

## Feature closure ledger

Use this ledger as a release engineering checklist. Set a feature to **PASS** only when implementation and its required tests are evidenced on the current commit; use **BLOCKED** for missing dependencies and **NOT RUN** for unexecuted tests.

| Workstream | Minimum focused verification | Status |
|---|---|---|
| Authentication, tenant context, RBAC/entitlements | Allowed/denied roles, missing identity, cross-tenant read/write | NOT RUN — assess current evidence per feature |
| Customer application and settings | Tenant/application isolation, validation, persistence/reload, audit | NOT RUN — assess current evidence per feature |
| Workflow configuration and execution | Valid/invalid transitions, authorization, concurrency, audit trail | NOT RUN — assess current evidence per feature |
| Pricing, payment and transactions | Trusted amount source, idempotency, failure recovery, tenant boundary | NOT RUN — assess current evidence per feature |
| Receipt generation and download | Unique ID, stable response envelope, repeat request, content type and authorization | NOT RUN — assess current evidence per feature |
| Customer feedback and ticket submission | Customer form separate from admin triage, tenant scope, durable persistence/audit | NOT RUN — assess current evidence per feature |
| Admin ticket triage | Role enforcement, state transitions, audit history, failure handling | NOT RUN — assess current evidence per feature |
| Help Centre and Growth Hub | Customer-login placement, entitlement checks, responsive navigation and content states | NOT RUN — assess current evidence per feature |
| Notifications/integrations | Secret-safe configuration, retries, idempotency, human approval for external actions | NOT RUN — assess current evidence per feature |
| Reporting and KPI dashboards | Tenant-scoped queries, filters, provenance, bounded pagination, mobile layout | NOT RUN — assess current evidence per feature |
| Audit and API response standards | Stable codes/envelopes, request correlation, no sensitive leakage, durable audit | NOT RUN — assess current evidence per feature |
| Responsive design system/navigation | Viewport matrix, overflow, keyboard/touch interactions, role-aware navigation | NOT RUN — browser evidence required |

This ledger intentionally does not assert that a workstream is complete merely because a related API, prototype, or general CI workflow exists. Replace each status only after its feature-specific tests and responsive checks are run and the evidence is linked to the tested commit.

## Suggested implementation order

1. Stabilize shared API response/error envelopes, identity/tenant context, authorization, and audit contracts.
2. Close persistence and transaction contracts, including migration repeatability and failure-injection tests.
3. Complete customer-facing flows before their admin counterparts where the customer action is the source of the data.
4. Complete admin configuration/triage and ensure admin-only operations are server-enforced.
5. Complete integrations, reporting, support content, and responsive refinements.
6. Run the complete regression suite and generate a feature-by-feature evidence report.
7. Start Business UAT only after the formal entry gates are independently satisfied and authorized.
