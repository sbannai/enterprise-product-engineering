# EPER Product Requirements — Versioned Feature Additions

**Document ID:** EPER-PRD-ADD  
**Current document version:** 1.4.0  
**Effective date:** 2026-10-31  
**Status:** Owner-directed product decisions recorded; detailed acceptance and implementation evidence remain subject to review  
**Product:** EPER multi-tenant enterprise workflow and application platform  
**Baseline preservation:** Existing 228 requirements across 38 chapters are immutable under this addendum. This document adds separately identified requirements; it does not renumber, replace, or silently reinterpret any existing REQ-* identifier.

---

## 1. Purpose and control rule

This is the controlled, append-only register for product feature additions and changes. It exists so that product decisions are recorded once and can be traced into design, UI, API, data, events, tests, releases, and user documentation.

**Mandatory rule: no new feature starts implementation until its requirement is recorded here (or in a linked approved addendum), assigned a unique ID, given a document version, and supplied with testable acceptance criteria.**

Every new feature addition increments the document's MINOR version. A correction that does not change behaviour increments PATCH. A change to the approved product baseline, compatibility contract, or requirement identity scheme requires a MAJOR version and explicit owner approval.

### 1.1 Versioning policy

| Change type | Version rule | Example |
|---|---|---|
| New feature or additive capability | Increment MINOR once for each separately approved feature | 1.4.0 → 1.5.0 |
| New independently deliverable feature in the same release | Increment MINOR again | 1.5.0 → 1.6.0 |
| Clarification/typo with no behaviour change | Increment PATCH | 1.6.0 → 1.6.1 |
| Breaking change, baseline replacement, or requirement identity scheme change | Increment MAJOR, with explicit approval | 1.x.x → 2.0.0 |

- Each feature receives a stable requirement ID that is never reused.
- The version recorded against a requirement is the version in which it was introduced. Later changes create a new change record and increment the document version; do not overwrite history.
- Existing requirement IDs, chapter numbers, and approved acceptance criteria remain unchanged unless an explicit change request authorizes a controlled amendment.
- Each PR, commit, test case, and release note must reference the relevant requirement IDs and the version.
- A feature is not “complete” merely because a wireframe exists. Completion requires implementation and evidence for every applicable layer.

## 2. Version history and feature additions

| Document version | Feature addition | Requirement IDs | Decision / status |
|---|---|---|---|
| 1.0.0 | Existing approved product baseline reference | Existing 228 REQ IDs / 38 chapters | Preserved; not reproduced or renumbered here |
| 1.1.0 | Teal Horizon product theme and Light default | EPER-UI-THEME-001 | Owner selected Teal Horizon with Light appearance on 2026-10-31 |
| 1.2.0 | User-facing theme changer and appearance selection | EPER-UI-THEME-002 | Feature addition recorded; implementation/evidence required |
| 1.3.0 | Role switcher and role-context navigation | EPER-UI-RBAC-001 | Feature addition recorded; UI switching must never bypass server authorization |
| 1.4.0 | Collapsible/expandable application navigation | EPER-UI-NAV-001 | Feature addition recorded; keyboard and responsive behaviour required |\n| 1.5.0 | Approval-controlled external actions and CRM writes | EPER-ACT-APPROVAL-001 | Owner-directed mandatory human approval control; implementation/evidence outstanding |

**Current controlled version: 1.5.0.** The next new feature addition must create version 1.6.0 and a new requirement ID. The history above establishes the version increments for the theme and shell features in the current scope; it does not imply that all those features have passed implementation acceptance.

## 3. New requirements introduced by this document

### 3.1 EPER-UI-THEME-001 — Teal Horizon / Light product default

**Introduced in:** 1.1.0  
**Priority:** P1 — product-wide UI baseline  
**Decision:** Teal Horizon with Light appearance is the selected EPER default.

The EPER application shall use Teal Horizon as its default product theme and Light as its default appearance. The shared design system and all first-party product surfaces shall consume the same semantic theme tokens rather than defining independent page-level colour palettes.

**Default token set**

| Token | Value | Intended use |
|---|---|---|
| Navigation | #123F43 | Primary application navigation |
| Navigation active | #1B6265 | Selected navigation item |
| Primary | #167C80 | Primary actions, links, active controls |
| Primary soft | #E4F2EF | Selected/hover surfaces and soft emphasis |
| Accent / focus | #45B5A8 | Focus and secondary accent |
| Background | #F6FAF9 | Application background |
| Surface | #FFFFFF | Cards, dialogs and panels |
| Text | #183638 | Primary text |
| Muted text | #607879 | Secondary text |
| Border | #DCE9E6 | Dividers and component borders |

**Functional requirements**
1. The product shall load Teal Horizon and Light when no user or tenant preference is configured.
2. Shared semantic tokens shall be used consistently across the application shell, dashboard, forms, tables, workflow studio, pricing/payment screens, reports, notifications, dialogs and responsive views.
3. Theme tokens shall be centrally defined and consumed by shared components; individual pages shall not reintroduce a conflicting blue default.
4. Theme customisation shall preserve readable contrast, visible focus indicators, disabled states, error/success states and semantic meaning.
5. Tenant branding may override only validated, supported theme properties and shall not weaken accessibility or tenant isolation.

**Acceptance criteria**
- A clean session with no saved preference renders Teal Horizon / Light.
- The same token values are applied across all supported first-party application surfaces.
- No legacy blue default remains in shared product-shell styling or primary action styling.
- Keyboard focus, hover, active, disabled, error and success states remain distinguishable.
- Automated visual/token tests verify the default token set and key components.

**Traceability:** Shared theme package; shared design system; application shell; theme configuration; visual regression/accessibility tests.  
**Security:** Theme settings are presentation-only and must not alter permissions, data scope or business logic.

### 3.2 EPER-UI-THEME-002 — Theme changer and appearance preference

**Introduced in:** 1.2.0  
**Priority:** P2 — user experience capability

The application shall provide an authenticated theme preference control that allows users to select a supported colour preset and appearance mode.

**Initial colour presets**
- Teal Horizon (default)
- Emerald Executive
- Royal Plum
- Graphite & Copper
- Burgundy Classic

**Appearance modes**
- Light (default)
- Dark
- System (follows the device preference)

**Functional requirements**
1. The user shall be able to preview and apply a supported theme without navigating away from the current screen.
2. The selected colour preset and appearance shall be applied consistently to all shared product components.
3. User preference shall persist across authenticated sessions.
4. Tenant administrators may define a tenant default. An explicit user preference takes precedence over the tenant default; otherwise the tenant default takes precedence over the product default.
5. Invalid or unsupported theme values shall be rejected and the last valid/default theme shall remain active.
6. The control shall expose the currently selected theme and appearance to assistive technology.
7. Theme preference changes shall not change market, contracted currency, price, locale, timezone, tenant, role, or permissions.

**Acceptance criteria**
- All five presets can be selected and applied.
- Light, Dark and System modes render correctly and preserve accessible contrast.
- User preference persists after sign-out/sign-in; tenant default is applied when no user preference exists.
- Invalid theme payloads are rejected server-side.
- Preference reads/writes are scoped to the authenticated user and tenant.
- Theme selection does not mutate commercial or authorization state.

**Traceability:** Theme package/configuration; authenticated preference API; user/tenant preference persistence; theme selector UI; integration and accessibility tests.  
**Implementation note:** A client-only dropdown is a prototype, not proof of persisted preference support.

### 3.3 EPER-UI-RBAC-001 — Role switcher and role-context navigation

**Introduced in:** 1.3.0  
**Priority:** P1 — administration and operations usability

The application shall provide a role/context switcher for users who are legitimately assigned more than one role or delegated operating context. The switcher shall show only contexts granted to the authenticated actor.

**Functional requirements**
1. The switcher shall list only roles/contexts returned by trusted server-side identity and authorization services.
2. Selecting a role/context shall request a server-validated context change; the server shall re-evaluate permissions for every subsequent API request.
3. Navigation visibility shall reflect the active authorized context, but hiding a menu item shall never be treated as authorization enforcement.
4. The switcher shall not allow a user to elevate privileges, impersonate another actor, cross tenant boundaries, or bypass separation-of-duties rules.
5. Context changes shall be audited with actor, tenant, prior context, new context, timestamp and correlation ID.
6. If the context change is rejected or the role is revoked, the application shall retain or return to a valid authorized context and show a clear message.
7. A demo/preview role selector must be visibly labelled as preview-only and must not be presented as production RBAC.

**Acceptance criteria**
- A multi-role test actor sees only the roles actually assigned to that actor.
- A user cannot activate an unassigned role by modifying browser state or API payloads.
- API requests are authorized using server-side active context, not a client-provided role label alone.
- Tenant boundary and separation-of-duties negative tests pass.
- Context switching and denied attempts produce audit evidence.
- The UI clearly distinguishes a preview-only role selector from a production-authorized context switcher.

**Traceability:** Identity and authorization service; role/delegation/threshold/separation-of-duties matrix; session/context API; navigation policy; audit event catalogue; security tests.  
**Governance:** Existing authorization decisions and least-privilege rules remain authoritative.

### 3.4 EPER-UI-NAV-001 — Collapsible and expandable navigation

**Introduced in:** 1.4.0  
**Priority:** P2 — usability and responsive navigation

The application shall provide an accessible control to collapse and expand the primary navigation while preserving the current screen and application context.

**Functional requirements**
1. The user shall be able to collapse and expand the navigation using a visible control.
2. Collapsed mode shall preserve discoverability through icons with accessible names, tooltips or equivalent labels.
3. The selected navigation item shall remain identifiable in both expanded and collapsed modes.
4. The layout shall adapt without horizontal overflow at supported desktop, tablet and mobile widths.
5. Keyboard users shall be able to operate the control and navigate all available items.
6. The application may persist the user's collapsed/expanded preference, provided this does not affect authorization or tenant state.
7. Role-based navigation visibility shall continue to be derived from the active server-authorized context.

**Acceptance criteria**
- Toggle repeatedly between expanded and collapsed states without losing the current route or form state.
- Current route remains visibly indicated in both modes.
- All navigation items remain keyboard reachable and have accessible names.
- No content overlap or horizontal overflow at supported viewport breakpoints.
- Role restrictions remain identical before and after collapse/expand.
- Automated UI tests cover toggle, keyboard operation, active item, responsive layout and role-specific menu visibility.

**Traceability:** Shared application shell; navigation component; responsive layout; accessibility and UI regression tests.

### 3.5 EPER-ACT-APPROVAL-001 — Human approval gate for external actions and CRM writes

**Introduced in:** 1.5.0  
**Priority:** P0 — security, governance and customer trust  
**Decision source:** Explicit owner direction: human approval is mandatory for every external action and every CRM write.

EPER shall prevent an external side effect or CRM mutation from executing unless a valid, durable, attributable human approval exists for the exact proposed action and the exact version of the proposal being executed. Creating a draft, generating an AI recommendation, approving a workflow step unrelated to the side effect, or merely marking a draft as approved shall not itself execute an external action.

**Scope**
- External communications, publication, sending, scheduling, audience export, provider/API actions, and other side effects outside EPER.
- All CRM create, update, merge, delete, stage-change, assignment, and bulk mutation operations, whether initiated by a user, workflow, integration, or AI agent.
- Internal workflow state transitions that do not create an external side effect or CRM mutation are not automatically subject to this external-action approval gate; they remain subject to normal workflow authorization.

**Functional requirements**
1. Every proposed side effect shall be persisted as a versioned action proposal with tenant/application scope, action type, target/resource, requester, source job/draft, canonical payload hash, idempotency key, creation time and expiry.
2. Approval shall be a separate durable record identifying the human approver, authenticated principal, effective role/delegation, decision, decision time, reason/comment, proposal ID/version/hash, tenant/application and correlation ID.
3. The proposal creator shall not approve their own proposal. Approval must be performed by a distinct authorized human principal; service/system identities cannot satisfy the human approval requirement.
4. Approval must be scoped to the exact proposal hash and version. Any material payload, target, recipient, audience, CRM field, amount, or action change invalidates the prior approval and requires a new decision.
5. Approval policy and approver authority shall be checked server-side at decision time and again immediately before execution. Missing, expired, revoked, stale, mismatched, or unverifiable approval shall fail closed.
6. Execution shall be a distinct operation from approval. It shall atomically claim/consume the approved proposal using a durable idempotency key and record the execution boundary before invoking an adapter; retries must not create duplicate effects.
7. The executor shall revalidate tenant/application scope, current actor/service identity, action permission, approval validity, proposal hash/version and any configured separation-of-duties or threshold policy immediately before dispatch.
8. Approval shall not override consent, opt-out/suppression, data protection, provider readiness, commercial limits, or any other independent authorization gate.
9. Rejection, expiry, revocation, failed authorization, execution attempt, success, retry and dead-letter outcomes shall be attributable and durably audited. Approval records and audit evidence shall be append-only; corrections are new events, not destructive edits.
10. The system shall expose no live external execution path until durable approval persistence, enforcement, audit/outbox coupling, idempotency and negative tests are complete and enabled by an explicit deployment configuration.
11. If approval storage, authorization, audit persistence or policy lookup is unavailable, the operation shall not execute. No in-memory approval fallback is permitted.
12. The user interface and APIs shall distinguish proposed, awaiting approval, approved, rejected, expired, revoked, executing, executed, failed and cancelled states; preview-only controls shall never be represented as live enforcement.

**Acceptance criteria**
- A requester cannot approve their own proposal, including through API payload manipulation or role/context switching.
- A different but unauthorized human cannot approve; a service identity cannot approve.
- Approval for proposal version N cannot authorize changed version N+1 or a different target/recipient.
- Expired, revoked, rejected, missing, stale or unresolvable approval blocks execution with a stable reason code and no adapter invocation.
- A CRM write and an external action both require this gate; internal workflow-only events do not accidentally trigger external dispatch.
- Concurrent/replayed execution attempts produce at most one logical effect under the idempotency contract.
- Tenant/application cross-scope approval and execution attempts are denied.
- Approval decision, execution attempt and outcome are auditable with approver, requester, action, payload hash, tenant/application, correlation and idempotency references.
- Approval/audit storage failure fails closed; no external adapter is called.
- Tests cover positive approval, maker-checker, tampering, stale hash, expiry, revocation, policy outage, audit failure, tenant isolation, replay and concurrency.

**Traceability:** Native CRM write service; workflow outbox dispatcher; agent execution router; authorization and delegation policy; PostgreSQL approval/action-proposal persistence; immutable audit; transactional outbox; API/UI review queue; security and concurrency tests.

**Status:** Owner-directed requirement recorded. Design, implementation, migration, API/UI, provider adapters and exact-head test evidence remain outstanding. This requirement does not authorize enabling any external provider or Business UAT.

## 4. Cross-layer implementation and evidence matrix

Every feature addition must be mapped through all applicable layers. A blank or “not applicable” entry requires a reason and owner approval.

| Layer | Required artefact/evidence | Completion rule |
|---|---|---|
| Product | BRD/PRD requirement ID and version | Approved/recorded decision |
| UX/UI | Screen, state, responsive behaviour and accessibility | Implemented and reviewed |
| API | Contract, authorization, validation and error responses | Contract tests pass |
| Data | Entities, ownership, tenant scope, constraints and migrations | Persistence tests pass where state is stored |
| Events/audit | Event names, actor, tenant, correlation and retention | Event/audit tests pass where applicable |
| Security | Threat/negative tests and least-privilege checks | No unauthorized path |
| QA | Positive, negative, boundary, regression and accessibility tests | Exact commit test evidence |
| Release | PR, commit, CI, release note and rollback considerations | Exact-head checks pass; merge recorded |
| User documentation | Manual/help text and known limitations | Updated with release |

## 5. Mandatory feature intake/change workflow

1. **Capture:** record the user's feature request and the exact product decision.
2. **Version:** increment MINOR for each new feature; create a unique requirement ID.
3. **Specify:** write behaviour, scope, priority, dependencies, permissions, data, API/event impacts and acceptance criteria.
4. **Trace:** map to existing BRD/SRS, the 228 requirement baseline, six capability families and implementation packages. Do not force-fit a new feature into an unrelated legacy ID.
5. **Review:** obtain the designated product/design/security approval where applicable. Owner-directed choices such as the Teal Horizon selection are recorded as decisions, not inferred approvals for unrelated security or commercial behaviour.
6. **Implement:** code and UI/API/data changes reference the requirement ID and version.
7. **Verify:** add tests and collect exact-head CI evidence; test failures must be fixed before merge.
8. **Release:** merge only under repository review and CI policy; update user manual and release notes.
9. **Close:** mark a requirement implemented only when all applicable evidence is linked. Otherwise keep it Open, In Progress, Blocked or Implemented-Unverified.

## 6. Change register template — mandatory for every future addition

| Field | Required value |
|---|---|
| Change ID | Unique, permanent identifier |
| Requirement document version | New MINOR/PATCH/MAJOR version |
| Date and requester | Source of request |
| Feature name | Concise name |
| Problem/business outcome | Why it is needed |
| Scope / exclusions | What changes and what does not |
| Priority | P0/P1/P2/P3 with rationale |
| Functional requirements | Testable shall-statements |
| Acceptance criteria | Observable pass/fail conditions |
| UX/UI impact | Screens, states, responsive/accessibility |
| API impact | Endpoints/contracts/errors/auth |
| Data impact | Entities, persistence, migration, tenant scope |
| Events/audit impact | Events, actor, correlation, evidence |
| Security/privacy impact | Roles, permissions, threat/negative tests |
| Dependencies | Other requirements/services/providers |
| Tests/evidence | Test IDs, exact commit, CI/artifact links |
| Release/rollback | PR, commit, release and rollback |
| Status/owner | Accountable owner and current state |

## 7. Baseline and implementation status

- The existing 228 requirement IDs and 38 chapters are preserved and are not redefined by this document.
- The payment gateway/receipt addendum remains a separate historical controlled change record; it is not silently folded into the 228 baseline.
- This document records the Teal Horizon theme, theme changer, role switcher and collapsible navigation as additive requirements.
- The source changes proposed in PR #274 are implementation work in progress. A wireframe or open PR is not acceptance evidence.
- Role switching requires real server-side authorization; the current preview selector alone does not satisfy EPER-UI-RBAC-001.
- Theme preference persistence requires an authenticated user/tenant persistence path; a browser-only preview does not satisfy EPER-UI-THEME-002.
- Requirement status must be updated from repository evidence, not assumed from the presence of a design or code change.

## 8. Next version

The next independently approved feature addition will create **EPER-PRD-ADD v1.6.0** and a new permanent requirement ID. The document history must remain append-only; prior version rows and requirement IDs must not be edited away.
