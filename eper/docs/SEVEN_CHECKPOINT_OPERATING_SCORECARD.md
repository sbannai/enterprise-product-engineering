# EPER Seven-Checkpoint Operating Scorecard

**Purpose:** Durable, evidence-led operating model for the seven-checkpoint engineering brief.  
**Baseline at creation:** `a1b93decff2f292a0a81453c27801607ca5f7946`  
**Last reviewed:** 2026-11-01  
**Approved product baseline:** 228 requirements across 38 chapters.  
**Authority:** This scorecard operationalizes reporting; it does not change requirements or authorize UAT/production.

## Reporting rules

Every checkpoint update must resolve the current `main` SHA dynamically and report:
- Status: GREEN (criteria met for the stated scope), AMBER (partially implemented or evidence incomplete), RED (failed/blocked), NOT ASSESSED (no current evidence).
- Exact evidence: commit SHA, workflow run, test artifact, PR or issue URL.
- Change since previous report.
- Remaining blockers and one next concrete action.
- Product capability actually delivered—not number of commits, PRs, tasks or elapsed hours.

A green CI result means only that the checked code passed that workflow. It is not production readiness, business acceptance or UAT authorization. Do not publish percentages unless a reproducible denominator and evidence-backed numerator exist.

## The seven checkpoints

### 1. Product USP and positioning
**Question:** Does EPER deliver a differentiated, coherent enterprise application platform, and are USP claims supported by implemented product behavior?

Track the approved USP register and each USP disposition: discovery, foundation, partial, implemented/CI-validated, operationally proven. Require traceability to requirement IDs, UI/API/data implementation and tests. For USP-001 workflow engine, distinguish implemented/CI-validated behavior from operational readiness. Do not promote discovery/foundation items to implemented based on design documents.

**Evidence:** USP/completeness register, customer journey tests, feature demonstrations, requirement traceability, operational evidence.  
**Current focus:** Complete customer-facing vertical slices and validate the product's five pillars—Build, Automate, Understand, Integrate and Govern—against real requirements.  
**Next action:** Prioritize a complete customer journey and close the highest-value USP gaps without expanding scope silently.

### 2. CI and persistence foundations
**Question:** Can the product be built and tested reproducibly, with durable and isolated data behavior?

Track exact-main CI, lint/typecheck/build, unit/integration tests, PostgreSQL migrations, tenant/application RLS, transaction boundaries, idempotency, backup/restore and recovery. Record which tests use real PostgreSQL versus mocks or simulations.

**Evidence:** Exact-head Actions runs, migration contract tests, PostgreSQL integration results, schema and RLS checks, restore drills.  
**Current focus:** PostgreSQL remains the approved target persistence engine; local development and CI/integration first. No chargeable AWS resources.  
**Next action:** Expand real-database end-to-end coverage and document repeatable local bootstrap, migration and recovery procedures.

### 3. Architecture and execution boundaries
**Question:** Are the six capability families and shared routing/authorization boundaries consistent, secure and maintainable?

Preserve: 228 requirements → one registry → six capability families → one execution routing layer. Track XX01 authoritative records, XX02 authorization, XX03 business validation, XX04 audit evidence, XX05 exception handling and XX06 governed reporting. Verify tenant/application scope, least privilege, role/delegation, separation of duties and human approval boundaries.

**Evidence:** HLD/LLD, API contracts, architecture tests, authorization tests, cross-tenant denial tests, audit records.  
**Current focus:** No duplicate authorization layer; all routes use the approved execution and authorization boundaries.  
**Next action:** Close remaining identity/bootstrap, delegation and separation-of-duties gaps with negative tests.

### 4. Workflow execution design and schema
**Question:** Are workflow definitions, publication, execution state and event delivery durable, versioned and recoverable?

Track immutable definition publication, digest/version pinning, PostgreSQL instances/transitions, actor-role assignments, idempotency, transactional audit/outbox, migrations, RLS and schema compatibility. Distinguish migration count from table count and from requirement count.

**Evidence:** Migration files, schema contract tests, PostgreSQL integration tests, execution state transitions and recovery tests.  
**Current focus:** Treat worker execution and outbox delivery as distinct from the existence of an API or schema.  
**Next action:** Validate the full workflow lifecycle against a real PostgreSQL instance, including restart and duplicate-delivery cases.

### 5. Integrated validation
**Question:** Does one exact source commit pass reproducible, integrated tests across the required product scope?

Track CI, integrated same-commit validation, six-family HTTP smoke, container runtime, 228-requirement pilot matrix, chapter suites, payment/receipt contracts, controlled QA technical simulation and test artifacts. State exact scope and exclusions.

**Evidence:** Workflow URLs, run IDs, artifacts, exact source SHA, test counts and failures.  
**Required wording:** A pilot pass is not business acceptance. Technical simulation is not Business UAT.  
**Next action:** Increase end-to-end coverage of real customer journeys and persistence; preserve separate business acceptance gates.

### 6. PR consolidation and governance
**Question:** Is the integrated baseline coherent, reviewed, traceable and free of unexplained orphan work?

Track all open PRs, branch head/base SHAs, exact-head CI, unresolved review threads, mergeability, superseded branches, issue linkage and resulting main SHA. Require branch protection and required checks through an owner-approved repository configuration change. Never merge a stale green head without rerunning checks on the updated head.

**Evidence:** GitHub PR state, review threads, Actions runs, merge SHA, branch/ruleset settings.  
**Current focus:** PR #302 (continuity charter) has been merged as `a1b93decff2f292a0a81453c27801607ca5f7946`.  
**Next action:** Reconcile the open-PR list and prepare a separately reviewed branch-protection/ruleset change; do not assume protection is active.

### 7. Workflow publisher/runtime implementation
**Question:** Can published workflows execute continuously and safely under load, failure, retry, restart and operational intervention?

Track publisher, runtime worker, durable claim/lease lifecycle, lease renewal, fencing, attempt exhaustion, dead-letter inspection/replay, approved dispatcher, worker hosting/supervision, metrics/alerts, load/recovery and audit. A replay must not itself be described as external dispatch.

**Evidence:** Runtime code and tests, worker deployment manifests/configuration, lease/fencing tests, dead-letter audit records, metrics/alerts and failure-injection evidence.  
**Current focus:** Lease renewal/fencing and dead-letter claim-time handling are integrated; audited tenant-scoped dead-letter inspection/replay is integrated. Production dispatcher, restricted platform-worker context, independent host supervision, delivery dashboards/alerts, load/recovery evidence and deployment configuration remain operational closure items.  
**Next action:** Complete and test the restricted worker context and approved dispatcher path, then prove restart/recovery and delivery observability.

## Baseline snapshot (2026-11-01)

- Integrated main SHA at creation: `a1b93decff2f292a0a81453c27801607ca5f7946`.
- PR #302 continuity charter merged; merge SHA above.
- PR #293 product/workflow documentation refresh merged before the charter.
- PR #300 lease renewal/fencing and claim-time dead-letter handling merged.
- PR #301 tenant/application-scoped outbox administration and audited replay API merged.
- PR #297 was closed as superseded by the consolidated #300 implementation.
- Nine PR #302 validation workflows passed before merge, including exact-head EPER CI and same-commit integrated validation. This validates the documentation change's pipeline, not all production requirements.
- Business UAT remains unauthorized until all approved entry gates are evidenced and owner-approved.
- Chargeable cloud provisioning remains prohibited.

## Required update template

For each checkpoint, append one dated record:

| Field | Required value |
|---|---|
| Assessment date/time | Timestamp and timezone |
| Main SHA | Exact current main commit |
| Status | GREEN / AMBER / RED / NOT ASSESSED |
| Delivered capability | Observable behavior now working |
| Evidence | Exact test/run/PR/artifact link and SHA |
| Change since last update | Specific merged code or verified result |
| Blockers | Concrete unresolved items |
| Next action | One actionable engineering task |
| Owner | Named accountable person/team |

Do not overwrite historical evidence. Append dated updates or link immutable run artifacts.

## Scope and release guardrails

- Preserve all 228 approved requirements and 38 chapters.
- Any requirement change must update the requirements register and traceability in the same change.
- No Business UAT authorization from this scorecard.
- No chargeable AWS provisioning.
- Keep API, UI and database maturity aligned.
- Human approval remains required for external actions and CRM writes.
- A production-ready claim requires tested operations, security, recovery, monitoring and owner acceptance—not merely green CI.


## Dated evidence update — 2026-11-01 13:55 IST

**Current main:** `c23b921c66f3d646643217727d4461b42fe61b83` (PR #317 merge SHA; PR #318 base SHA).  
**Current product PR:** [#318 — secure customer application list with browser sessions](https://github.com/sbannai/enterprise-product-engineering/pull/318), head `ebf1d4e71803b38dae192c72d3c5024224dcf0a0`. Its Actions jobs checked out merge candidate `77901cf17a1928e5069b4fa1e837b5b756d820a2`; the PR remains open and was not merged in this update. A duplicate `parseCookieHeader` import was removed from `eper/apps/api/server.ts` in the current head. All 11 applicable exact-head workflow runs completed successfully after that correction.

### Checkpoint 1 — v34 to approved requirements reconciliation

- **Status:** AMBER.
- **Delivered capability:** The v34 HTML wireframe and all 45 source requirement rows (`EPER-CW-001`–`EPER-CW-045`) are preserved in the repository. The technical crosswalk classifies 45 as partially supported by shared baseline controls, zero as exact full-coverage matches, and all 45 as additive v1.6.0 draft candidates. Four candidates overlap the existing human-approval control. The approved 228 requirement IDs and 38 chapters remain unchanged.
- **Evidence:** PR #304 merge `b4e2fb1d5f066cda0b5e8bbba5f43c7c8648e1bb`; PR #311 merge `2a43f5217a6847c936961c9a1421539003a14673`; `eper/docs/requirements/EPER_WIREFRAME_V34_REQUIREMENTS_RECONCILIATION.md`; `eper/docs/requirements/EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md`.
- **Change since last update:** The source wireframe/export and the explicit no-baseline-change reconciliation are now repository-owned and merged.
- **Blockers:** Technical classification is not owner approval of the additive v1.6.0 scope. No exact REQ-to-CW mappings are asserted where acceptance criteria do not support them.
- **Next action:** Obtain owner disposition for each v1.6.0 candidate and update the controlled register without modifying the 228/38 baseline.
- **Owner:** EPER product owner.

### Checkpoint 2 — reproducible fresh-clone developer setup

- **Status:** GREEN for the documented local/CI bootstrap scope.
- **Delivered capability:** Local loopback-only PostgreSQL 16 setup, lockfile install, one-command `npm run dev:verify`, migration/repeatability checks, Bash/PowerShell setup instructions and disposable backup/restore smoke.
- **Evidence:** PR #306 merged as `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Fresh-clone run [41284365448](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41284365448) checked out the PR merge ref `a978801` (PR #310 head `f4da0bd6e51ead368387ce0bfdce7a3f8af91dd1` integrated with #306). It passed all 1,128 tests. The log shows all seven migration groups: payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity; repeatability checks for workflows, ticketing, capabilities and identity; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; and `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS` with 59 source/restored base tables and 7 migration-ledger tables.
- **Change since last update:** Identity migration and identity repeatability are now included in the same fresh-clone verification path.
- **Blockers:** A second engineer has not yet independently executed the documented handover on a separate workstation.
- **Next action:** Have a second engineer perform the clean-clone bootstrap and record environment/version/output evidence.
- **Owner:** EPER engineering.

### Checkpoint 3 — PostgreSQL migrations, repeatability, integration and restore

- **Status:** GREEN for local/CI integration scope.
- **Delivered capability:** PostgreSQL is the tested persistence target for capability, payment, audit, workflow, scheduler, ticketing, tenant/actor assignment and identity data. Migration checksums/ledgers, repeatability, live transaction/RLS/audit checks and disposable restore smoke are present.
- **Evidence:** Fresh-clone run [41284365448](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41284365448); PostgreSQL integration run [41284365591](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41284365591); current PR #318 candidate EPER CI [41288859744](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41288859744) checked out `77901cf17a1928e5069b4fa1e837b5b756d820a2` and passed typecheck/build, applicable migration application and repeatability, live PostgreSQL workflow/assignment integration and capability RLS/audit conformance.
- **Change since last update:** The current-main-derived #318 candidate revalidated the API/build and the applicable PostgreSQL migration/integration lanes after the browser-session route change.
- **Blockers:** Disposable CI restore is not production disaster-recovery certification; production recovery objectives and a production restore drill remain unproven.
- **Next action:** Define owner-approved recovery objectives and execute a separately evidenced restore/recovery exercise when an approved non-chargeable environment is available.
- **Owner:** EPER engineering / database operations.

### Checkpoint 4 — provider-neutral customer identity, OIDC and durable sessions

- **Status:** AMBER.
- **Delivered capability:** Provider-neutral Authorization Code + PKCE protocol client; discovery/JWKS and ID-token validation; durable subject bindings, one-time state/nonce/PKCE transactions, hashed opaque sessions, expiry/revocation; secure host-only cookie and session-bound CSRF primitives; durable tenant/application and actor/application assignment checks; application session-context route; browser-session protection for customer ticket APIs; and browser-session protection for the customer application list in PR #318.
- **Evidence:** PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e`; PRs #312–#317 merged sequentially through current main `c23b921c66f3d646643217727d4461b42fe61b83`; PR #318 exact head `ebf1d4e71803b38dae192c72d3c5024224dcf0a0`; PR #318 EPER CI [41288859744](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41288859744); identity protocol/session tests are included in the passing full suite.
- **Change since last update:** Durable browser-session authorization is now integrated into ticket reads/mutations and the customer application list. The duplicate import introduced in #318 was corrected and all applicable exact-head checks passed.
- **Blockers:** Production login initiation/callback/logout routes, session issuance/rotation and cookie issuance are not wired. Role resolution/role-to-permission integration and full browser E2E remain incomplete. OIDC protocol tests use controlled test endpoints; no real identity provider is selected or exercised.
- **Next action:** Implement the complete login/callback/logout and session-issuance flow, connect durable role/application authorization, and add browser E2E including revocation and CSRF-negative paths.
- **Owner:** EPER engineering / identity security.

### Checkpoint 5 — customer workspace and support journey

- **Status:** AMBER.
- **Delivered capability:** Customer ticket submission, history/listing and replies are tenant/application scoped; PostgreSQL identity mode requires browser sessions and CSRF for customer mutations. The support console provides tenant-scoped queue/filtering, status and assignment changes, severity classification with rationale, duplicate disposition, internal-only notes versus customer-visible replies, and current-page CSV export. Internal notes are filtered in the customer read query, not merely hidden in the UI.
- **Evidence:** PR #317 merge `c23b921c66f3d646643217727d4461b42fe61b83`; PR #318 candidate EPER CI [41288859744](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41288859744); `eper/tests/ticketing-api.test.mjs`; `eper/tests/ticketing-admin-api.test.mjs`; `eper/packages/ticketing/postgres-ticket-store.ts`; `eper/apps/api/admin-support-ticket-ui.ts`.
- **Change since last update:** Customer ticket API browser-session/CSRF protection and application-list session authorization are integrated. Support queue includes current-page CSV export and explicit internal-note visibility.
- **Blockers:** SLA targets/age/escalation evidence, attachment lifecycle, notification delivery, full export semantics, browser-session authentication for support-admin routes and cross-client mutation scope require completion/verification. The current admin export is limited to the already-authorized page.
- **Next action:** Complete the SLA/notification/attachment and export contracts, then verify admin role scoping and cross-client mutation/audit behavior end to end.
- **Owner:** EPER product engineering / support operations.

### Checkpoint 6 — scheduler, workflow operations and remaining product capabilities

- **Status:** AMBER.
- **Delivered capability:** Campaign scheduler has durable claims/leases, idempotency, a live schedule/approval check immediately before the dispatch fence, retry/dead-letter and stale-worker recovery. Workflow outbox has a continuous process loop, tenant/application context discovery, lease renewal/fencing, bounded retry/dead-letter, metrics callbacks and audited tenant-scoped dead-letter inspection/replay. The six capability families pass local HTTP smoke.
- **Evidence:** Current PR #318 candidate EPER CI [41288859744](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41288859744); six-family HTTP smoke [41288859827](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41288859827); campaign policy/worker tests in `eper/tests/campaign-dispatch-authorization.test.mjs` and `eper/tests/campaign-scheduler-worker.test.mjs`; outbox tests in `eper/tests/workflow-outbox-worker.test.mjs` and `eper/tests/workflow-outbox-process.test.mjs`.
- **Change since last update:** Current-main-derived validation includes the live-policy, dispatch-fence and worker/outbox regression suites.
- **Blockers:** No approved provider dispatcher is enabled; independent worker host supervision/restart policy, production metrics/alerts, load testing and operational recovery evidence remain outstanding. A dispatcher is an explicit host dependency and no real provider action is invoked by the tested path.
- **Next action:** Complete a restricted worker-host adapter with supervision, metrics and recovery evidence while keeping real external dispatch disabled until separately approved.
- **Owner:** EPER engineering / operations.

### Checkpoint 7 — release controls, recovery and independent handover

- **Status:** AMBER.
- **Delivered capability:** Fresh-clone setup and PostgreSQL restore runbooks; reproducible release-candidate build, immutable SHA metadata, container health/build-identity smoke and packaged checksum evidence.
- **Evidence:** Current PR #318 candidate release build [41288859783](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41288859783); integrated validation [41288859765](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41288859765); fresh-clone/restore run [41284365448](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41284365448). The continuity charter records the need for branch/ruleset hardening and independent second-engineer release proof.
- **Change since last update:** Release candidate build and container identity are validated on the current-main-derived #318 merge candidate; local backup/restore smoke is evidenced.
- **Blockers:** Current branch-protection/ruleset settings were not exposed by the available repository integration and therefore remain unverified. A second engineer has not completed an independent build/test/package/rollback path. Production recovery objectives and restore certification remain open.
- **Next action:** Obtain owner-approved branch/ruleset controls and complete a witnessed second-engineer release/rollback and restore rehearsal.
- **Owner:** EPER product owner / engineering operations.

**Evidence interpretation:** These statuses describe only the stated engineering scope. Passing automated checks do not establish production readiness or owner acceptance. The 228 approved requirements, 38 chapters, no-charge cloud boundary and human-approval boundary remain unchanged.
