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


## Post-merge live-state correction — 2026-11-01

The preceding 13:55 snapshot recorded PR #318 while it was still open. A subsequent live repository read shows that PR #318 has merged. Preserve the preceding record as historical evidence; this section supersedes only its current-head and PR-state fields.

- **Current main SHA:** `91a8e3bdbe579fd1d3b123305bb422f4efc44bac`, the PR #318 merge commit.
- **PR #318:** merged; PR head `ebf1d4e71803b38dae192c72d3c5024224dcf0a0`; merge candidate tested by its PR workflows `77901cf17a1928e5069b4fa1e837b5b756d820a2`; final merge SHA `91a8e3bdbe579fd1d3b123305bb422f4efc44bac`. The 11 applicable PR-head workflows completed successfully, including EPER CI, controlled QA, the 228/38 chapter matrix, PostgreSQL integration, release candidate build, integrated validation and six-family HTTP smoke. The merge SHA itself returned no separate PR-triggered workflow run or combined-status contexts in the available repository integration. The next main-derived PR validation is therefore tracked below rather than inferred from the merge state.
- **Current open product PR #320:** [secure customer settings with browser sessions](https://github.com/sbannai/enterprise-product-engineering/pull/320), base `91a8e3bdbe579fd1d3b123305bb422f4efc44bac`, head `f164e81e2d1566219718b2a2eab79a61bd7d6876`, merge candidate `e9ffb94ffe70d2d0fbc1acae72189a2db4d62ae1`. It adds durable browser-session, tenant-assignment and actor-assignment checks to the customer settings GET route; bearer identity-map fallback is rejected in PostgreSQL mode and only safe presentation settings are returned. Its two completed lanes at this snapshot are the 228/38 matrix and six-family HTTP smoke (both successful); EPER CI, controlled QA, payment contract and container smoke are in progress; G9, PostgreSQL payment-store, technical simulation and release-candidate lanes are queued. No failure or cancellation has been observed in this exact-head snapshot. Do not treat queued/in-progress lanes as passed.
- **Checkpoint 4 delta:** Customer application-list session protection is now merged on main. Customer settings session protection is under exact-head validation in #320. Production OIDC login/callback/logout routes, session issuance/rotation, role resolution and browser E2E remain incomplete; do not describe this as production login.
- **Checkpoint 5 delta:** No change to support-completeness blockers. The customer settings route adds another browser-session-protected workspace surface, but SLA/escalation evidence, attachment lifecycle, notification delivery, full export semantics and support-admin browser authentication remain open.
- **Next action:** Complete exact-head validation of #320, then continue the customer browser-session integration across the remaining workspace routes without bypassing durable tenant/application assignments.

The 228 approved requirements, 38 chapters, PostgreSQL local/CI scope, no-charge cloud boundary and human-approval boundary remain unchanged.


## Further live evidence update — 2026-11-01

**Current main remains:** `91a8e3bdbe579fd1d3b123305bb422f4efc44bac`.

### PR #320 — customer settings browser-session successor

- The first exact head `f164e81e2d1566219718b2a2eab79a61bd7d6876` exposed one failing assertion in the new HTTP test: it expected the session store to be called even when a bearer-only request supplied no browser cookie. The route correctly returned 401 without attempting session resolution. This was a test expectation defect, not an authorization bypass.
- The owning branch was corrected to assert that no session lookup occurs when the cookie is absent, then to verify session, tenant assignment and actor assignment on the cookie-authenticated path.
- **Current head:** `994d6dec9077ed83d99e87182dc3d796e65b00d3`; merge candidate `311e4048b3db9b0cfde820fdac58852955c90862`.
- **Evidence:** Controlled QA [41289375438](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375438) passed 1,112 of 1,129 tests with zero failures; the new settings-session test passed. EPER CI [41289375519](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375519), integrated validation [41289375493](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375493), PostgreSQL integration [41289375517](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375517), release build [41289375495](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375495), six-family HTTP smoke [41289375476](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375476), chapter matrix [41289375427](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375427), payment contract [41289375451](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375451), container smoke [41289375936](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375936), G9 [41289375409](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375409) and technical simulation [41289375466](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289375466) all completed successfully.
- **Disposition:** PR #320 remains open and unmerged. Customer settings GET is now protected by durable browser session plus tenant/actor assignments in PostgreSQL mode. This does not add OIDC login initiation/callback/logout or session issuance.

### PR #321 — complete migration repeatability in fresh-clone verification

- **Gap found:** `npm run dev:verify` applied all seven migration groups but previously repeated only workflows, ticketing, capabilities and identity. Payment, audit and campaign-scheduler migration groups were not explicitly re-run by the one-command fresh-clone verification.
- **Correction:** The owning branch now uses one shared seven-group migration list for both initial application and repeatability checks. A regression test ensures the same seven groups are applied and repeated.
- **Current head:** `c48ebd65f038951651f529bdfb17eb983524e4af`; merge candidate `91c0942963780e47987a5d040d378635d3534d86`.
- **Evidence:** Fresh-clone run [41289449907](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449907) completed successfully on a clean runner. Its log confirms application and repeatability for payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; 1,148 tests passed with zero failures; and `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS` with 59 source/restored base tables and 7 migration-ledger tables. EPER CI [41289449915](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449915) passed the new migration-coverage regression test; controlled QA [41289449931](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449931) passed 1,112 of 1,129 tests with zero failures. The chapter matrix [41289449891](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449891), G9 [41289449916](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449916), six-family smoke [41289449896](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449896), container smoke [41289449964](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449964), release build [41289449889](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449889) and technical simulation [41289449917](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449917) also completed successfully.
- **Remaining validation:** Same-commit integrated validation run [41289449924](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449924) was still in progress at this snapshot; no pass is claimed for that lane until its completed result is observed.
- **Disposition:** PR #321 remains open and unmerged. The fresh-clone migration-repeatability requirement is now evidenced on its exact PR merge candidate, subject to the remaining integrated gate.

### Current open PR register

- [#319 — this seven-checkpoint scorecard evidence update](https://github.com/sbannai/enterprise-product-engineering/pull/319), head `8ae2b41b434bb797946f21de787ce8653ca053a6` at the time of this update.
- [#320 — secure customer settings with browser sessions](https://github.com/sbannai/enterprise-product-engineering/pull/320), head `994d6dec9077ed83d99e87182dc3d796e65b00d3`.
- [#321 — verify repeatability of all PostgreSQL migration groups](https://github.com/sbannai/enterprise-product-engineering/pull/321), head `c48ebd65f038951651f529bdfb17eb983524e4af`.

No PR was merged by this evidence update. The 228 approved requirements, 38 chapters, no-charge cloud boundary and human-approval boundary remain unchanged.


## Final live validation correction — 2026-11-01

- **Main remains** `91a8e3bdbe579fd1d3b123305bb422f4efc44bac`.
- **PR #320 current head** `994d6dec9077ed83d99e87182dc3d796e65b00d3`, merge candidate `311e4048b3db9b0cfde820fdac58852955c90862`: all 11 applicable exact-head Actions completed successfully. The corrected customer-settings browser-session test passed; the controlled QA suite recorded 1,112 passed, zero failed, 17 skipped. The earlier failing run belonged to superseded head `f164e81e2d1566219718b2a2eab79a61bd7d6876` and is not current-head evidence.
- **PR #321 current head** `c48ebd65f038951651f529bdfb17eb983524e4af`, merge candidate `91c0942963780e47987a5d040d378635d3534d86`: all 10 applicable exact-head Actions completed successfully, including fresh-clone developer setup and same-commit integrated validation. The fresh-clone run applied and repeated all seven migration groups, completed 1,148 tests with zero failures, and passed disposable PostgreSQL backup/restore with 59 base tables and 7 migration-ledger tables.
- **PR #319 documentation head** is now `59bf7d55c236631ab98cdbd75296ce396fe5e646` (base `91a8e3bdbe579fd1d3b123305bb422f4efc44bac`). Its previous head `8ae2b41b434bb797946f21de787ce8653ca053a6` had nine successful runs, but those results are stale after this documentation-head change. On the current head, G9, chapter matrix, six-family smoke, technical simulation, release build, controlled QA and container smoke are complete-success; EPER CI and integrated validation remain in progress. No failed or cancelled current-head run has been observed.
- **Current open PRs:** #319 scorecard evidence update; #320 customer settings browser-session integration; #321 all-migration repeatability verification. All remain unmerged.

This correction supersedes the prior status snapshots only where newer exact-head results are listed above. No approved requirements or chapters were changed.


## Mainline advancement and current PR heads — 2026-11-01

- **Current main SHA:** `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17`. This is the merge commit for PR #321, so the all-seven-migration repeatability change is now on main.
- **PR #321:** merged as `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17`. Its exact head `c48ebd65f038951651f529bdfb17eb983524e4af` completed all 10 applicable Actions successfully on merge candidate `91c0942963780e47987a5d040d378635d3534d86`. The exact fresh-clone run [41289449907](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449907) proved all seven migration groups apply and repeat, all 1,148 tests pass with zero failures, and disposable PostgreSQL backup/restore passes (59 base tables; 7 ledgers). The exact-head CI and controlled QA runs [41289449915](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449915) and [41289449931](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449931) also completed successfully. The merge SHA returned no separate PR-triggered run/status contexts; the merge commit is current main.
- **PR #320 successor validation:** the customer-settings browser-session branch was advanced after its first test-only failure was corrected. Current head is `5e712320ca4b3ab3ea89495becbedfc366bdf949`; it adds an explicit tenant-assignment denial case in addition to session-required, bearer-denial, actor-assignment denial and safe-settings filtering. Its prior head `994d6dec9077ed83d99e87182dc3d796e65b00d3` had all 11 applicable checks pass, but those runs are not current-head evidence after this additional test commit. The new head must complete its own checks against the current main base before acceptance.
- **PR #319 documentation branch:** this scorecard branch is being advanced to incorporate current main `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17` and the PR #321 merge. Prior green checks on older documentation heads are not evidence for the new head.
- **Current open PRs:** #319 (this scorecard record) and #320 (customer settings browser-session integration). PR #321 is merged and is no longer open.

The mainline now has reproducible fresh-clone verification for all seven migration groups, including repeatability and disposable backup/restore. Production recovery certification, complete OIDC browser login, full support SLA/notification lifecycle, worker-host supervision and independent second-engineer release proof remain separate open capabilities.


## Final exact-head closeout snapshot — 2026-11-01

- Main SHA remains `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17`.
- PR #319 current head `a4340502c2d3d55b0d2358fc7bc74749ff4faa21`, merge candidate `efd3982d2342777506af86b8cd9a5fc81278047d`: all nine applicable exact-head Actions completed successfully, including EPER CI, controlled QA, 228/38 chapter matrix, G9, six-family HTTP smoke, container smoke, release build and same-commit integrated validation.
- PR #320 current head `5e712320ca4b3ab3ea89495becbedfc366bdf949`, merge candidate `793b9f1f02b4d33472a0cdd45602d1a74e8fe17a`: all eleven applicable exact-head Actions completed successfully. Controlled QA recorded 1,113 passed and zero failed; the session, tenant-assignment denial, actor-assignment denial and safe-settings assertions passed.
- Current open PRs remain #319 and #320. PR #318 and #321 are merged into main. No merge was issued by this scorecard update.
- The two current PR merge candidates are based on main `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17`; no stale pre-#321 green run is used as current evidence.

This is the final live-state correction for this reporting cycle. Earlier snapshots remain historical records.


## Mainline advancement — 2026-11-01 (post #320 merge)

**Current main SHA:** `a9d3eb677220b540350166c4a5d7fa8576e5ad50`.

### Checkpoint 4 — customer browser-session authorization

- **Status:** AMBER; one additional workspace route is now merged, but the complete OIDC login lifecycle remains outstanding.
- **Delivered:** PR [#320](https://github.com/sbannai/enterprise-product-engineering/pull/320) merged to main as `a9d3eb677220b540350166c4a5d7fa8576e5ad50`. The customer settings route in PostgreSQL identity mode now requires a durable browser session and durable tenant plus actor application assignments. Bearer identity-map fallback is blocked for this route; non-PostgreSQL compatibility remains.
- **Exact-head evidence:** PR #320 head `5e712320ca4b3ab3ea89495becbedfc366bdf949`, merge candidate `793b9f1f02b4d33472a0cdd45602d1a74e8fe17a`, based on prior main `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17`. The integrated same-commit validation run [41289726499](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289726499) completed successfully; the PR's applicable checks were completed successfully before merge.
- **Remaining blockers:** Login initiation, browser-bound OIDC callback, session issuance/rotation, logout/revocation, role-to-permission integration and browser E2E are not yet implemented as a complete flow.
- **Next action:** Implement issue [#322 — complete customer OIDC browser login and logout lifecycle](https://github.com/sbannai/enterprise-product-engineering/issues/322), with explicit active subject binding, browser-bound state, safe return paths, secure cookies, CSRF and replay/fixation tests.
- **Scope controls:** No real provider dispatch, no chargeable cloud resources, and no changes to the approved 228 requirements / 38 chapters.

### Documentation branch reconciliation

This update supersedes the prior current-head snapshot where PR #320 was described as open. Earlier dated sections remain historical evidence and are not rewritten. Current main is `a9d3eb677220b540350166c4a5d7fa8576e5ad50`; PR #319's prior branch is behind/diverged and must not be merged without reconciliation.

## Live evidence update — 2026-11-01 (OIDC browser-transaction guard)

**Current main SHA:** `a9d3eb677220b540350166c4a5d7fa8576e5ad50`.

### Official seven-checkpoint status

1. **Product USP and positioning — AMBER.** The v34-to-228 crosswalk preserves all 45 source candidates, makes no unsupported exact REQ-ID mappings, and records 45 additive v1.6.0 draft candidates. Owner disposition remains open; the approved 228 requirements and 38 chapters are unchanged.
2. **CI and persistence foundations — GREEN for local/CI scope.** Current main `dev-verify.mjs` contains all seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity) and repeats the same seven. The source blob `82c033e18e3912624bb4d556bfd26f47248138bc` is identical to the PR #321 tested head. Fresh-clone run [41289449907](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449907) on PR #321 head `c48ebd65f038951651f529bdfb17eb983524e4af` passed all seven apply/repeat groups, 1,148 tests with zero failures, and disposable backup/restore (59 source/restored base tables; 7 migration-ledger tables). No direct workflow/status context was returned for current main SHA `a9d3eb6`; this is not production recovery certification.
3. **Architecture and execution boundaries — AMBER.** OIDC protocol and durable session/assignment foundations exist. Browser-session authorization is integrated for customer tickets, application listing and settings. Production login/callback/logout, session issuance/rotation, durable role resolution and remaining workspace-route integration are incomplete. No identity or role is inferred from arbitrary OIDC claims.
4. **Workflow execution design and schema — AMBER.** Durable workflow definitions/versions, role assignments, execution state, transitions, transactional outbox, leases/fencing, retry/dead-letter and audited dead-letter operations are implemented and have CI coverage. A full restart/duplicate-delivery lifecycle proof against an independently supervised worker host remains outstanding.
5. **Integrated validation — AMBER.** PR #324's exact head passed its nine applicable Actions, including controlled QA, chapter matrix, technical simulation and same-commit integrated validation. The current main merge SHA has no separate workflow runs or combined-status contexts returned by the available integration; do not infer merge-SHA acceptance from PR-head success.
6. **PR consolidation and governance — AMBER.** Current open PRs are #323 (scorecard/developer-guide documentation) and #324 (OIDC browser transaction guards). PR #320 is merged as current main `a9d3eb677220b540350166c4a5d7fa8576e5ad50`. PR #319 was closed unmerged and superseded by #323; its fresh-clone documentation correction was carried forward. Branch-protection/ruleset configuration remains unverified and requires owner-approved hardening.
7. **Workflow publisher/runtime implementation — AMBER.** Worker/process logic, lease renewal/fencing, retry/dead-letter and audit operations exist. The API package exposes only the API start script; the API startup does not instantiate an independently supervised outbox/scheduler worker. Restricted platform-worker context, approved dispatcher, host supervision/restart policy, production metrics/alerts, load and recovery evidence remain open.

### PR #324 — browser-bound OIDC transaction guard

- Current exact head: `18e31d4c058feb2ee7fe180329d510a16022fb15`, based directly on main `a9d3eb677220b540350166c4a5d7fa8576e5ad50`.
- All nine applicable exact-head Actions completed successfully: EPER CI [41293166633](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166633), controlled QA [41293166620](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166620), 228/38 matrix [41293166652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166652), G9 [41293166662](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166662), six-family HTTP smoke [41293166636](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166636), container smoke [41293166638](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166638), release build [41293166625](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166625), technical simulation [41293166640](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166640) and integrated validation [41293166675](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293166675).
- Controlled QA recorded 1,119 passed, zero failed and 17 skipped. The chapter matrix recorded 259 passed and zero failed.
- Delivered in this slice: host-only short-lived HttpOnly/Secure/SameSite=Lax state cookie, constant-time callback-state comparison, duplicate/missing/mismatched-state rejection, state-cookie clearing, and same-origin return-path normalization that rejects unsafe absolute/protocol-relative/backslash/control/encoded-separator forms.
- This PR does **not** implement login-start/callback/logout routes, session issuance/rotation, durable role resolution or browser E2E. Issue [#322](https://github.com/sbannai/enterprise-product-engineering/issues/322) remains the implementation objective. Do not describe PR #324 as production customer login.

### PR #323 — scorecard and fresh-clone documentation

- Current head before this append: `b80296f0aba5986dab96dcd437b6feb6ff81ce90`; it is documentation-only and has no PR-triggered Actions or commit-status contexts.
- The branch updates `eper/DEVELOPER_SETUP.md` to document the exact seven-group apply/repeat sequence in current main `dev-verify.mjs`. The prior closed-unmerged PR #319 branch is superseded; the documentation correction is carried in this successor.
- No approved requirement or chapter changes, no chargeable cloud resources and no real external/provider dispatch.

### Current merge and evidence boundaries

- PR #306 merge SHA `6e8dd438e5091b1802d65e4f29951389fe077859` is an ancestor of current main; current main is 11 commits ahead and zero behind.
- PR #321 merge SHA `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17` is an ancestor of current main.
- PR #320 exact head `5e712320ca4b3ab3ea89495becbedfc366bdf949` had 11/11 applicable PR-head workflows pass (controlled QA: 1,113 passed, zero failed). It merged as current main `a9d3eb677220b540350166c4a5d7fa8576e5ad50`; no separate merge-SHA Actions or combined-status contexts were returned.
- No chargeable cloud resources were provisioned and no real provider/external dispatch was triggered.


## Live evidence update — 2026-11-01 20:22 IST (current-main and browser OIDC validation)

**Current integrated main:** `098a47459b9be486aa6bd67f4e8c093cdbc38b99` (resolved from the repository's latest commit and confirmed in exact-main Actions artifacts).  
**Current open PRs:** #323 and #324 only.  
**Approved baseline:** 228 requirements across 38 chapters; unchanged.

### Mainline evidence on the exact current SHA

- EPER CI [41293757248](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757248) — completed successfully. Typecheck/build, workflow and tenant/actor assignment PostgreSQL integration, campaign-scheduler migration, capability and ticketing migration/repeatability, and live capability RLS/audit/rollback conformance passed.
- 228-requirement / 38-chapter matrix [41293757308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757308) — 259 automated tests passed, zero failed; all 28 HTTP checks passed; no failed chapters. The artifact explicitly labels this as an automated pilot matrix, not acceptance evidence.
- Six-family HTTP smoke [41293757309](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757309), container smoke [41293757276](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757276), G9 reconciliation [41293757262](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757262) and controlled technical simulation [41293757225](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757225) completed successfully.
- Controlled QA [41293757246](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757246), job [124810201471](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757246/job/124810201471) — 1,113 passed, 1 failed, 17 skipped. Exact failure: `ERR_MODULE_NOT_FOUND` for `dist/packages/identity/customer-oidc-callback.js`, imported by `eper/tests/customer-oidc-callback.test.mjs`.
- Payment/PostgreSQL/receipt validation [41293757271](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757271), job [124810202068](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757271/job/124810202068) — 1,135 passed, 1 failed, 2 skipped; the same missing callback module is the single test failure. Typecheck/build and migration steps passed.
- The same-commit integrated gate [job 124810449961](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757271/job/124810449961) failed because the payment/PostgreSQL lane failed.
- The failing main jobs' artifacts identify branch `main` and head SHA `098a47459b9be486aa6bd67f4e8c093cdbc38b99`. The build is not the root cause: the callback test is present on main, but its imported implementation source is not. The implementation source is present on the existing PR #324 branch. Do not rerun the deterministic main failure before that implementation is integrated.

### PR #323 — fresh-clone guide and scorecard

- Exact head before this append: `df1d950af8f1679faca297055d64c0ed60635937`; branch `docs/eper-seven-checkpoint-post-320`; open, draft, mergeable, 3 commits ahead / 2 behind main by ancestry.
- Its 10 exact-head workflows completed successfully. Fresh-clone run [41293394616](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293394616) recorded 1,149 passed, zero failed, zero skipped; all seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity) were applied and then repeated; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; disposable PostgreSQL 16 backup/restore passed with 59 source/restored base tables and 7 migration-ledger tables.
- The current-main `dev-verify.mjs` source contains all seven groups and repeats all seven, but the current-main `eper/DEVELOPER_SETUP.md` still describes only six groups and a narrower repeatability sequence. This branch corrects the guide.
- The scorecard previously ended at main `a9d3eb677220b540350166c4a5d7fa8576e5ad50` and described an older PR #324 head as lacking browser login routes. That description is superseded by the current PR #324 implementation below. This append preserves the earlier record as history.
- This documentation append creates a new PR #323 head. All green runs above belong to the previous exact head and are stale for the new head until the new workflows complete.

### PR #324 — current browser-bound OIDC/session integration

- Current exact head: `6303393ec70e1a3977a209acb2132435ca9e1462`; branch `feat/322-oidc-browser-transaction-guards`; open, draft, mergeable, 19 commits ahead / 2 behind main by ancestry.
- All 11 exact-head workflow runs completed successfully; no queued, in-progress, failed or cancelled current-head runs were returned.
- Controlled QA [41301483984](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483984) — 1,129 passed, zero failed, 17 skipped. The bad-signature regression (test 715), browser-state mismatch (test 384), replay rejection (test 389), configured ticket-mutation CSRF regression (test 364) and logout CSRF/revocation tests passed.
- PostgreSQL integration [41301483985](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483985) — live PostgreSQL payment-store and campaign scheduler integration passed, including pause-versus-dispatch fencing and bounded event-ID/idempotency cases.
- EPER CI [41301483909](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483909), payment gateway contracts [41301483960](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483960), 228/38 matrix [41301483928](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483928), G9 [41301483961](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483961), six-family HTTP smoke [41301483966](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483966), container smoke [41301483938](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483938), release build [41301483939](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483939), technical simulation [41301483958](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483958) and same-commit integrated validation [41301483969](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41301483969) also completed successfully. The matrix job embedded inside integrated validation was skipped; the separate matrix workflow above passed.
- Delivered on this branch: provider-neutral OIDC client wiring; customer login-start, callback and logout routes; browser-bound one-time state cookie; active pre-provisioned issuer/subject binding; durable opaque browser session; secure session and CSRF cookies; logout revocation; selected customer ticket/application/session/settings routes protected by durable tenant/application assignments.
- Remaining: browser E2E from login through protected workspace to logout/denied access; durable role/delegation resolution; token rotation; support-admin browser authentication. OIDC claims do not auto-provision tenant/actor/role/application assignments. Do not describe this as production login until the remaining browser and authorization integration is tested.

### Seven-checkpoint status at this evidence point

1. **Product USP and positioning — AMBER.** The v34 crosswalk preserves 45 wireframe candidates, does not invent exact 228 REQ-ID mappings, and carries all 45 as additive v1.6.0 DRAFT. Owner disposition is pending; the approved 228/38 baseline is unchanged.
2. **CI and persistence foundations — AMBER.** Main CI build/migration/live-PostgreSQL conformance passes. The fresh-clone run with all seven migration groups and disposable restore passed on the prior PR #323 head, not current main. The developer guide correction is in this documentation PR; production backup/recovery certification remains open.
3. **Architecture and execution boundaries — AMBER.** Durable identity/session foundation is merged; browser OIDC routes and cookie/CSRF protections are on PR #324. Browser E2E, roles/delegation and token rotation remain.
4. **Workflow execution design and schema — AMBER.** Durable workflow state, transactional outbox, leases/fencing, idempotency, retries, dead-letter and audited replay have CI evidence. Independent worker host, restricted worker identity, approved dispatcher, supervision and recovery remain.
5. **Integrated validation — RED on current main; GREEN for the stated PR #324 head.** Main controlled QA and payment/PostgreSQL lanes fail on the missing callback implementation source. PR #324's 11 exact-head workflows pass; do not substitute those PR-head results for main acceptance.
6. **PR consolidation and governance — AMBER.** The only open PRs are #323 and #324. Both are drafts and are mergeable; both are 2 commits behind main by ancestry. This scorecard append changes #323's head, so its prior checks must be rerun. Repository protection/ruleset enforcement is not established by this evidence.
7. **Workflow publisher/runtime — AMBER.** Worker lease/fencing, retries, dead-letter and shutdown behavior have test evidence. Independent worker process supervision, restricted execution context, approved dispatcher, operational metrics/alerts, load and restart/recovery evidence remain.

### Merged foundations and merge evidence boundary

- PR #306 merged as `6e8dd438e5091b1802d65e4f29951389fe077859`; its PR head `a0020a46a026f727e01b24927e6cc2245945b7eb` had 13/13 exact-head workflows successful, including fresh-clone run [41283462371](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41283462371). The merge SHA is an ancestor of current main.
- PR #310 merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`; its PR head `f4da0bd6e51ead368387ce0bfdce7a3f8af91dd1` had 12/12 exact-head workflows successful, including fresh-clone run [41284365448](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41284365448). The merge SHA is an ancestor of current main. Its historical merge-SHA QA/integrated failure/cancellation remains recorded in the prior report; current main and PR #324 pass the bad-signature regression.
- PR #321 merged as `f7efa6045b2fa8cca8f14d7120f1c8f1a6226e17`; its PR head `c48ebd65f038951651f529bdfb17eb983524e4af` had 10/10 exact-head workflows successful, including fresh-clone run [41289449907](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41289449907). The merge SHA is an ancestor of current main.
- The current commit-workflow endpoint returns PR-triggered runs only; it returned no PR-triggered run contexts for the three merge SHAs. The descendant main runs above are separately identified and are not presented as merge-SHA checks.

### Product baseline and operating controls

- Preserve all 228 approved requirements and 38 chapters. No baseline edits were made.
- The 45 v34 candidates remain additive v1.6.0 DRAFT; do not promote them without owner disposition.
- No external/provider dispatch or chargeable cloud provisioning was performed.
- No merge was performed by this reporting update.
