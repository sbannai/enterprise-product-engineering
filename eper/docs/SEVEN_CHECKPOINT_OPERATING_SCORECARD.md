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


## Live evidence refresh — 2026-11-01 21:26 IST

This section supersedes earlier PR #324 head/status statements above without rewriting historical snapshots.

### Dynamically resolved refs and current exact-head Actions

- Current main: `098a47459b9be486aa6bd67f4e8c093cdbc38b99`.
- Current PR #323 documentation head before this scorecard append: `52ee5fa2f880edcca7f45ba21de831aefdbdce5d`; 10 exact-head workflows completed, 7 successful and 3 failed.
- Current PR #324 identity/browser head: `5ccc7543478ab011a5265faafb3eef524b2416ca`; it now incorporates current main (47 commits ahead, 0 behind) and all 14 exact-head workflows completed successfully.
- Only PRs #323 and #324 are open. Both remain drafts and mergeable. No review submissions or unresolved review threads were returned.
- Main branch metadata reports `protected=false`; the repository rulesets endpoint returns an empty list. Detailed branch-protection settings are inaccessible to the integration (HTTP 403), so no required-check configuration is asserted.

### Main and documentation-branch failures

Main has eight push-triggered workflows on its exact SHA: six successful and two failed.
- [Main controlled QA — 41293757246](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757246) fails when `customer-oidc-callback.test.mjs` imports missing `dist/packages/identity/customer-oidc-callback.js`.
- [Main integrated validation — 41293757271](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41293757271) fails for the same missing callback implementation.
- Main build/typecheck, the separate 228/38 matrix, six-family smoke, container smoke, release build and G9 lanes pass.

PR #323 has ten exact-head runs: seven successful and three failed:
- [Fresh-clone setup — 41318792242](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41318792242): the full suite fails on the same missing callback module (1,149 passed, 1 failed); backup/restore was not reached.
- [Controlled QA — 41318792384](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41318792384): same import failure (1,113 passed, 1 failed, 17 skipped).
- [Integrated validation — 41318792194](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41318792194): payment/PostgreSQL constituent fails on the same import.
- The callback implementation belongs to the existing PR #324. Do not duplicate it on this documentation branch.

### PR #324 exact-head evidence

All fourteen workflows for `5ccc7543478ab011a5265faafb3eef524b2416ca` completed successfully; no queued, in-progress, failed or cancelled current-head runs remain.

- [EPER CI — 41326152242](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152242) — typecheck/build and live PostgreSQL workflow, tenant/actor assignment and capability conformance checks passed.
- [Controlled QA — 41326152180](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152180) — 1,151 tests, 1,134 passed, 0 failed, 0 cancelled, 17 skipped. The bad-signature regression now passes.
- [Fresh-clone/PostgreSQL — 41326152192](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152192) — `npm run dev:verify` passed with 1,170 passed, 0 failed. All seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity) were applied and repeated. Disposable backup/restore passed with 59 source/restored base tables and 7 migration-ledger tables.
- [Browser OIDC E2E — 41326152230](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152230) — Chromium login, protected settings access, logout and post-logout denial passed (1/1).
- [PostgreSQL payment-store/scheduler integration — 41326152200](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152200) — live PostgreSQL transactions, dispatch-race and event-idempotency checks passed.
- [228/38 matrix — 41326152217](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152217), [six-family HTTP smoke — 41326152262](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152262), [container smoke — 41326152274](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152274), [release build — 41326152196](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152196), [G9 — 41326152255](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152255), [payment contracts — 41326152235](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152235), [workflow config — 41326152266](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152266) and [same-commit integrated validation — 41326152172](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152172) — all successful.

The fresh-clone workflow path filter on PR #324 now includes API, package/migration and test changes, so identity/runtime changes trigger the clean-runner PostgreSQL verification.

### Product and continuity assessment

1. **v34-to-228 reconciliation — AMBER.** All 45 v34 candidates are preserved and technically classified: zero exact full-coverage matches, 45 partial-support links, 45 additive v1.6.0 draft candidates, four approval-control overlaps, and zero changes to the approved 228 requirements / 38 chapters. Owner disposition remains pending.
2. **Fresh-clone setup — GREEN on PR #324 exact head; not integrated on main.** Clean install, `npm run dev:verify`, seven migration groups and repeatability, full live PostgreSQL suite and disposable backup/restore all pass on #324.
3. **PostgreSQL — GREEN on PR #324 exact head; production recovery remains open.** Local repeatability, live transactions and disposable restore are proven; no production restore drill or second-engineer recovery rehearsal is evidenced.
4. **Identity/OIDC — AMBER.** Provider-neutral protocol checks, browser start/callback/logout, secure session/CSRF flow, durable session storage and tenant/application assignment checks pass on #324. Browser E2E uses a synthetic local IdP, not a live production provider. Role/delegation resolution, token rotation and support-admin browser authentication remain.
5. **Customer workspace/support — AMBER.** Customer ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity and internal-note separation have implementation/test evidence. Export remains current-page CSV; full export, SLA timers/escalation, attachment lifecycle, notifications and support-admin browser auth remain.
6. **Scheduler/workflow operations — AMBER.** Durable claims, lease renewal/fencing, idempotency, retry/dead-letter, policy-denial and shutdown behavior have regression evidence. The API process does not start an independent worker and `package.json` has no worker start command. A separately supervised worker host, explicit approved dispatcher, production metrics/alerts and recovery runbook remain.
7. **Release/continuity — AMBER.** Exact-head build/container, fresh-clone and disposable restore evidence pass on #324. Main is unprotected and has no repository rulesets. Independent second-engineer release/rollback rehearsal remains unproven.

### Merged foundation evidence and boundaries

- PR #306 merge SHA `6e8dd438e5091b1802d65e4f29951389fe077859`: its PR head had 13/13 successful workflows; the merge SHA had 9/9 successful push workflows and is an ancestor of current main.
- PR #310 merge SHA `88b9708d748c19dc80a1a2d7ad4960914451db7e`: its PR head had 12/12 successful workflows; the merge SHA had six successful, one failed and one cancelled push workflows. The failed merge-SHA QA was `callback rejects a bad signature` (missing expected rejection); the cancelled integrated workflow is not acceptance. The current #324 exact-head bad-signature regression passes.
- No PR was merged, no external/provider action was dispatched, and no chargeable cloud resource was provisioned. The approved 228 requirements and 38 chapters remain unchanged.


## Live delivery update — 2026-11-01 22:05 IST

**Dynamically resolved current main:** `a554990cb7f4969bb218aad7a2e9944aec62fa05`.  
**Change since the 21:26 evidence point:** PR #324 has merged into main. Its merge commit is the current main head; the previously failing callback import is now present on main.

### Current-main exact-commit validation

All ten push-triggered workflows for main `a554990cb7f4969bb218aad7a2e9944aec62fa05` completed successfully (10/10; no queued, in-progress, failed, or cancelled runs):
- [EPER CI — 41327033352](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033352): typecheck/build, migration lanes, live PostgreSQL workflow/tenant-assignment/capability checks passed.
- [Same-commit integrated validation — 41327033337](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033337): payment/PostgreSQL, container/six-family, 228/38 matrix and release/G9 constituent lanes passed.
- [Controlled QA — 41327033377](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033377): completed successfully.
- [Chromium browser OIDC E2E — 41327033298](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033298): real-browser login, protected settings, logout and post-revocation denial passed (1/1).
- [228 requirements / 38 chapter matrix — 41327033302](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033302): all chapter suites and the 228-row matrix passed.
- [Six-family HTTP smoke — 41327033272](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033272), [container smoke — 41327033358](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033358), [G9 reconciliation — 41327033313](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033313) and [workflow configuration — 41327033325](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033325): all passed.

The main push workflow set does not include the fresh-clone/backup-restore workflow. That evidence is recorded separately against the exact PR #324 head below; it is not relabelled as a merge-commit run.

### PR #324 — merged identity/browser implementation

- PR #324 is closed and merged. Its merge commit is current main: `a554990cb7f4969bb218aad7a2e9944aec62fa05`.
- Exact PR head: `5ccc7543478ab011a5265faafb3eef524b2416ca`; all 14 PR-head workflows completed successfully.
- Exact PR-head fresh-clone run [41326152192](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152192): `npm run dev:verify` completed with 1,170 passed and 0 failed; all seven PostgreSQL migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity) were applied and repeated; disposable PostgreSQL backup/restore passed with 59 source/restored base tables and 7 migration-ledger tables.
- Exact PR-head Chromium OIDC run [41326152230](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152230): 1/1 browser lifecycle passed.
- Merge-commit/current-main push checks are separately identified above: 10/10 passed. Do not conflate those with the PR-head fresh-clone run.

Identity is now integrated in main for the tested browser lifecycle. The browser E2E uses a synthetic local IdP. Live production-provider onboarding, durable role/delegation resolution, session-token rotation and support-admin browser authentication remain unproven/outstanding.

### Current open PRs and exact-head evidence

The current open list contains PR #323 and PR #325 only. Both are drafts; neither has submitted reviews or unresolved inline review threads.

**PR #323 — documentation and requirements/scorecard reconciliation**
- Exact old head: `4904275280a603a3c7841d5fe901698e5aa0ca6b`.
- Its ten exact-head workflows completed: seven success, three failure.
- Controlled QA [41326463168](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326463168) and fresh-clone [41326462711](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326462711) both failed because that old head lacked `customer-oidc-callback.js`; the full test suite reported one import failure. The fresh-clone backup/restore step was skipped.
- This is now a stale-base integration dependency because the implementation has since merged into main. The documentation branch is being brought forward onto current main; all new validation must run on the new exact head.
- The branch's developer guide correction describes all seven migration groups and repeats all seven. Preserve it.

**PR #325 — dedicated campaign worker process**
- Exact old head: `45ab93d0a8911e34838dacbfa77347d41bb5aa2a`; it was stacked on PR #324, which has now merged.
- Five exact-head workflows completed successfully: controlled QA [41326883447](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326883447), PostgreSQL payment/scheduler integration [41326883378](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326883378), payment contracts [41326883398](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326883398), 228/38 matrix [41326883408](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326883408), plus the remaining exact-head technical build lane.
- The current patch adds a separately invokable worker entrypoint, fail-closed enablement, PostgreSQL/audit schema readiness, explicit worker identity, deployment-owned adapter loading, graceful signal cancellation and a dedicated database pool. No provider adapter is supplied, so this code cannot perform an external dispatch by itself.
- The existing QA logs exercise campaign execution-worker core behavior but do not mention the new entrypoint. Dedicated fail-closed entrypoint tests are being added before fresh validation.
- Since the PR was based on the now-merged #324 branch, it is being rebased onto current main and its base will be changed to `main` so its diff contains only worker-runtime changes.

### Seven-checkpoint assessment

1. **Product USP / v34-to-228 — AMBER.** The approved 228 requirements and 38 chapters remain unchanged. All 45 v34 source candidates and their acceptance criteria remain preserved; they are additive v1.6.0 draft candidates pending owner disposition. No baseline expansion is implied.
2. **Fresh-clone / PostgreSQL — GREEN for the exact #324 candidate; current-main CI is green.** The #324 PR-head fresh-clone proof covers clean install, all seven migration groups and repeatability, 1,170 passing tests and disposable restore. A new fresh-clone run on the rebased documentation head is still required to validate the final handover text.
3. **Identity / architecture — AMBER.** Browser OIDC callback, secure session/CSRF lifecycle, logout revocation and selected tenant/application authorization are integrated and CI-validated. Production IdP onboarding, role/delegation, token rotation and support-admin auth remain.
4. **Workflow schema / execution — AMBER.** Durable workflow/outbox, lease/fencing, idempotency, retry/dead-letter and PostgreSQL dispatch-race evidence exist. The new campaign worker entrypoint is a separate process but still has no reviewed provider adapter, restricted worker DB identity proof, deployment supervisor, metrics/alerts or recovery drill.
5. **Integrated validation — GREEN on current main for the listed push lanes.** Main `a554990...` has 10/10 completed successful push workflows. This is technical CI evidence only; it does not certify untested production operations.
6. **PR consolidation / governance — AMBER.** #324 is merged. #323 is being rebased to current main; #325 is being detached from the merged #324 base and retargeted to main. Main remains `protected=false` with no repository rulesets; required-check enforcement is not active.
7. **Release / continuity — AMBER.** Clean-clone and disposable restore passed on the #324 PR head; main's post-merge CI is green. Main branch protection, production recovery, independent second-engineer handover/release, worker supervision and operational alerting remain open.

### Scope and safety

- Preserve the 228 approved requirements and 38 chapters; keep all 45 v34 candidates additive and pending owner disposition.
- No PR is being merged by this update.
- No external/provider dispatch is being triggered; no chargeable AWS resources are being provisioned.
- Repository protection has not been changed. An owner-approved configuration change remains necessary.


## Live evidence update — 2026-11-01 22:16 IST

**Current main, dynamically resolved:** `a554990cb7f4969bb218aad7a2e9944aec62fa05`. PR #324 is merged as this exact main commit. All ten push-triggered main workflows completed successfully on this SHA; representative exact-commit evidence: [EPER CI — 41327033352](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033352), [same-commit integrated validation — 41327033337](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033337), [controlled QA — 41327033377](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033377), [browser OIDC E2E — 41327033298](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033298), [228/38 matrix — 41327033302](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033302), and [G9 — 41327033313](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033313). The main commit is still unprotected; branch metadata reports `protected=false`, required-check enforcement off, and the repository rulesets collection is empty.

### Identity and PostgreSQL integration now on main

- PR #324 merged at `a554990cb7f4969bb218aad7a2e9944aec62fa05`; exact PR head `5ccc7543478ab011a5265faafb3eef524b2416ca` had 14/14 successful exact-head workflows.
- Exact PR-head fresh-clone run [41326152192](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152192): `npm run dev:verify` passed with 1,170 passed / 0 failed; all seven PostgreSQL migration groups applied and repeated; disposable backup/restore passed with 59 source/restored base tables.
- Exact PR-head browser lifecycle [41326152230](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41326152230): Chromium login, protected settings, logout and post-revocation denial passed (1/1).
- The merge commit has its own 10/10 successful push workflows listed above. The fresh-clone result remains labelled as PR-head evidence, not as a merge-commit workflow.
- The tested IdP is synthetic/local. Live provider onboarding, durable role/delegation resolution, token rotation and support-admin browser authentication remain open.

### Current documentation PR #323

- The previous exact head `2756f9636211a7b13352cc4e3020e27f09849bfe` was based directly on current main and had 10/10 successful exact-head workflows. Fresh-clone run [41327677822](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327677822) passed `npm run dev:verify` (1,170 passed / 0 failed), applied and repeated all seven migration groups, and passed disposable backup/restore (59 source/restored base tables).
- Its change set is limited to `eper/DEVELOPER_SETUP.md` (corrects the guide to include all seven migration groups and repeatability checks) and this scorecard. This append creates a new PR head; the prior green checks must not be treated as validation for that new head until rerun.

### Campaign worker successor and PR consolidation

- PR #325 was closed unmerged after the stacked base PR #324 merged. Its clean-mainline successor is [PR #326](https://github.com/sbannai/enterprise-product-engineering/pull/326), base `main`, head `7446ed23b3545f3cb74b9a4239532bdf340ce3e9`, 5 commits ahead / 0 behind, five changed files, draft and mergeable.
- All 12 exact-head workflows on #326 completed successfully. [EPER CI — 41327722184](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722184) passed typecheck/build and live PostgreSQL workflow/assignment/capability conformance. [Fresh-clone — 41327722225](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722225) passed with 1,175 tests / 0 failures; all seven migration groups were applied and repeated; disposable backup/restore passed with 59 source/restored base tables. [Controlled QA — 41327722105](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722105) reported 1,156 tests, 1,139 passed, 0 failed, 17 skipped; all five process-level worker startup guard tests passed. [PostgreSQL scheduler/payment integration — 41327722301](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722301) passed real database transaction, dispatch-race and event-idempotency checks. [Integrated validation — 41327722204](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722204) passed; the separate [228/38 matrix — 41327722095](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722095) also passed.
- PR #326 delivers a separate worker process entrypoint, disabled-by-default startup, durable PostgreSQL/audit schema readiness, explicit worker identity, adapter path confinement, graceful shutdown and a deployment-owned adapter interface. No provider adapter is included; external dispatch remains impossible from this PR as submitted.
- Remaining worker closure: restricted worker database role/context, reviewed live-policy authorization adapter, downstream idempotency contract, real-PostgreSQL restart/recovery, independent host supervision, health/metrics/alerts and deployment runbook.
- PR #327 is a documentation-only scorecard refresh that overlaps this PR's scorecard update. This PR also contains the developer-setup correction, so #327 is being closed as superseded by #323 to retain one authoritative documentation change.

### Seven-checkpoint status at this evidence point

1. **v34-to-228 requirements reconciliation — AMBER.** Approved 228 requirements / 38 chapters remain unchanged. All 45 v34 candidates and their acceptance criteria remain preserved as additive v1.6.0 draft candidates pending owner disposition; no baseline change is implied.
2. **Fresh-clone developer setup — GREEN for the validated PR heads.** PR #323 previous head passed the corrected documented setup; PR #326 passed clean install, all seven migration groups and repeatability, 1,175 tests, and disposable restore. The new #323 evidence append requires its own exact-head rerun.
3. **PostgreSQL persistence — GREEN for local/CI integration and disposable restore.** Live transaction, tenant/application assignment, RLS/audit/rollback, scheduler dispatch-race and idempotency tests passed; production recovery objectives and a second-engineer restore rehearsal remain.
4. **Identity/OIDC — AMBER.** Browser start/callback/logout, secure session/CSRF cookies, revocation and selected tenant/application access are integrated. Synthetic IdP only; production-provider onboarding, role/delegation, token rotation and support-admin auth remain.
5. **Customer workspace/support — AMBER.** Customer ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity and internal-note separation have test evidence. Full export, SLA timers/escalation, attachment lifecycle, notifications and support-admin browser authentication remain.
6. **Scheduler/workflow operations — AMBER.** Durable leases/fencing, idempotency, retry/dead-letter and policy-denial tests exist; #326 adds a separate fail-closed worker entrypoint. No reviewed adapter, restricted worker DB role, independent supervisor, operational metrics/alerts or restart/recovery proof yet.
7. **Release/continuity — AMBER.** Clean-clone and disposable restore evidence exist on exact PR heads; main push CI is green. Main protection/required checks are disabled, production recovery and independent second-engineer release/rollback remain unproven.

**Safety:** Preserve the approved 228/38 baseline. No PR was merged by this update; no external/provider dispatch or chargeable AWS provisioning was performed.


## Live evidence refresh — 2026-11-02 01:15 IST

**Current main, resolved dynamically:** `a554990cb7f4969bb218aad7a2e9944aec62fa05`.  
**Change since the previous live update:** no main SHA change. This refresh rechecked the open PR list, exact-head workflow runs and job logs, current main push workflows, the merged #306/#310/#324 ancestry, support/identity code boundaries, and the current worker branch. No code change or merge was made during this assessment.

### Current main evidence

The branch endpoint resolves `main` to `a554990cb7f4969bb218aad7a2e9944aec62fa05` (commit date 2026-11-01 16:34:31Z). The following exact-main push workflows completed successfully:

- [EPER CI — 41327033352](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033352)
- [Same-commit integrated validation — 41327033337](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033337)
- [Controlled QA — 41327033377](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033377)
- [Chromium customer OIDC lifecycle — 41327033298](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033298)
- [228 requirements / 38 chapter matrix — 41327033302](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033302)
- [Six-family HTTP smoke — 41327033272](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033272)
- [Container runtime smoke — 41327033358](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033358)
- [G9 reconciliation — 41327033313](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033313)
- [Workflow configuration validation — 41327033325](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033325)

The Chromium run uses a synthetic local IdP and proves browser login, protected customer settings access, logout and post-revocation denial. It is not evidence of a live production identity-provider onboarding.

### Current open PRs and exact-head validation

The live open-PR query returns PR #323 and PR #326 only. Both remain drafts, mergeable and based on current main; compare results show zero commits behind. Review submissions and inline review-thread lists are empty.

**PR #323 — developer setup / requirements crosswalk / scorecard**
- Exact head: `7ec9442fe4cbb800961f021c29a5c56ba3154121`; 7 commits ahead, 0 behind; two changed files.
- All Actions runs currently associated with this exact head completed successfully. Relevant exact-head evidence:
  - [Fresh-clone developer setup — 41328380905](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380905): `npm run dev:verify`, 1,170 passed / 0 failed / 0 skipped; all seven migration groups applied and repeated; disposable backup/restore passed with 59 source/restored base tables and seven migration-ledger tables.
  - [EPER CI — 41328380898](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380898): typecheck/build, live PostgreSQL workflow and tenant/actor application-assignment tests, capability RLS, append-only audit and rollback checks passed.
  - [Controlled QA — 41328380947](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380947): 1,151 tests; 1,134 passed, 0 failed, 17 skipped.
  - [Integrated validation — 41328380970](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380970), [228/38 matrix — 41328380965](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380965), [release build — 41328380893](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380893), [container smoke — 41328380927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380927), [six-family HTTP smoke — 41328380910](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380910), and [G9 — 41328380974](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380974) completed successfully.
- The fresh-clone job log explicitly ran the clean lockfile install, documented `npm run dev:verify`, and PostgreSQL 16 backup/restore smoke. The test log ended with 1,170 tests, zero failures and zero skips; restore reported 59 source/restored base tables and seven migration-ledger tables.
- Requirements remain unchanged: 228 approved requirements / 38 chapters preserved; 45 v34 source candidates and acceptance criteria retained as additive v1.6.0 draft scope pending owner disposition. The crosswalk records zero exact full-coverage matches, 45 partial shared-control links, and four overlaps with the existing human-approval control.

**PR #326 — dedicated campaign worker process**
- Exact head: `7446ed23b3545f3cb74b9a4239532bdf340ce3e9`; 5 commits ahead, 0 behind; five changed files.
- All Actions runs currently associated with this exact head completed successfully. Relevant exact-head evidence:
  - [Fresh-clone developer setup — 41327722225](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722225): `npm run dev:verify`, 1,175 passed / 0 failed / 0 skipped; seven migration groups applied and repeated; disposable backup/restore passed with 59 source/restored base tables and seven migration-ledger tables.
  - [EPER CI — 41327722184](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722184): typecheck/build, live PostgreSQL workflow and tenant/actor application-assignment tests, capability RLS, audit immutability and rollback checks passed.
  - [Controlled QA — 41327722105](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722105): 1,156 tests; 1,139 passed, 0 failed, 17 skipped; five worker-entrypoint startup guard tests passed.
  - [PostgreSQL payment/scheduler integration — 41327722301](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722301): live PostgreSQL payment transactions/constraints, dispatch-fence race and event-idempotency checks passed.
  - [Integrated validation — 41327722204](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722204), [228/38 matrix — 41327722095](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722095), [release build — 41327722168](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722168), [container smoke — 41327722176](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722176), [six-family HTTP smoke — 41327722190](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722190), [G9 — 41327722114](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722114), and [payment contracts — 41327722201](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722201) completed successfully.
- The worker process is separately invokable and disabled by default. It requires PostgreSQL/audit readiness, an explicit worker ID, a deployment-owned adapter module and graceful shutdown. The adapter contract requires current tenant/application policy authorization and downstream idempotency.
- Remaining operational proof: no reviewed deployment adapter, no demonstrated restricted worker-specific database role/context, no independent process supervisor, no metrics/alerts, no real-PostgreSQL worker restart/recovery drill, and no adapter authorization/idempotency contract test. Keep it disabled; do not trigger provider actions.

### Merged foundation verification

- PR #306 merged as `6e8dd438e5091b1802d65e4f29951389fe077859`; current main is 14 commits ahead and 0 behind that merge SHA.
- PR #310 merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`; current main is 13 commits ahead and 0 behind that merge SHA.
- PR #324 merged as `a554990cb7f4969bb218aad7a2e9944aec62fa05`, identical to current main.
- These are verified merged ancestors; #306 and #310 are not open work.

### Product boundary findings

- **Identity:** provider-neutral OIDC discovery/JWKS and ID-token validation are implemented. Browser routes, state/nonce/PKCE callback binding, secure HttpOnly session cookie, CSRF cookie/verification, durable session resolution/revocation and browser E2E are integrated. Each customer request rechecks active tenant applications and actor/application assignment; OIDC claims do not supply the role. The browser test uses a synthetic local IdP. Production-provider onboarding, durable role/delegation resolution, token rotation and support-admin browser authentication remain unproven.
- **Customer support:** customer ticket create/list/reply APIs use tenant/application/actor scope; customer reply reads exclude internal notes. Admin queue, assignment, status, severity/P1 rationale, duplicate disposition and internal/customer-visible replies are implemented. The current admin console still requests a support-admin bearer credential and sends a Bearer Authorization header. Its CSV action exports only the currently loaded page. The ticket contract/store does not show SLA due-time, response/resolution timers or escalation fields. Full filtered-queue export, SLA timers/escalation, attachments/notifications and support-admin browser session integration remain.
- **Scheduler/workflow:** the mainline execution loop has durable claims, lease renewal/fencing, idempotency, bounded retries, dead-letter handling and authorization before the dispatch fence; the exact-head PostgreSQL dispatch-race test passes. PR #326 adds the separate process, but no production adapter or independent operational host/recovery evidence is present.
- **Release/continuity:** clean-clone setup and disposable restore are reproducible on the two exact PR heads. An independent second-engineer handover/release/rollback has not been demonstrated.

### Seven-checkpoint status (scorecard terminology)

| Checkpoint | Status | Delivered capability and exact evidence | Blocker / next action |
|---|---|---|---|
| 1. Product USP and positioning | AMBER | Approved 228/38 baseline preserved; v34 crosswalk and 45 candidate rows retained in PR #323; exact-head 228/38 matrix [41328380965](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41328380965) passed. | Obtain owner disposition of all 45 additive candidates; do not change the approved baseline. |
| 2. CI and persistence foundations | GREEN for local/CI scope | Fresh-clone `dev:verify`, seven-group migration/repeatability, live PostgreSQL tests and disposable restore pass on #323/#326 exact heads; see runs 41328380905 and 41327722225. | Independent engineer bootstrap and recovery rehearsal; production recovery objectives remain outside this proof. |
| 3. Architecture and execution boundaries | AMBER | OIDC session resolution rechecks tenant/application and actor/application assignment per request; secure cookie/CSRF and fail-closed behavior have code/test evidence on main. | Live provider onboarding, durable role/delegation and token rotation; support-admin browser auth. |
| 4. Workflow execution design and schema | AMBER | Durable workflow/outbox, lease/fencing, idempotency, retry/dead-letter and PostgreSQL dispatch-race evidence; #326 process entrypoint is separately invokable. | Reviewed adapter, restricted worker context, supervisor, metrics/alerts and restart/recovery proof. |
| 5. Integrated validation | GREEN for current technical lanes | Exact main SHA `a554990...` has successful EPER CI, integrated validation, QA, browser OIDC, 228/38 matrix, six-family, container and G9 runs listed above. | Expand full customer workspace/support browser coverage; CI pass does not certify untested product operations. |
| 6. PR consolidation and governance | AMBER | Only #323/#326 are open; exact heads are 0 behind main, all associated Actions runs succeeded, no submitted reviews or unresolved threads. Main branch metadata reports `protected=false`; repository rulesets collection is empty. | Obtain review and owner-approved branch protection/required checks; reconcile historical branch refs before declaring no orphan work. |
| 7. Workflow publisher/runtime implementation | AMBER | Continuous worker loop, lease renewal/fencing, bounded retries, dead-letter and idempotency tests pass; #326 adds fail-closed worker process startup. | Keep disabled until restricted identity, reviewed adapter, supervision, metrics, failure/restart recovery and operator runbooks are proven. |

**Owner:** repository owner / accountable engineering and operations owners; candidate disposition and repository governance require owner decision.  
**Next actions:** review the two current PRs; complete support-admin browser authentication and end-to-end support journey; then close worker identity/adapter/supervision/recovery and repository governance.  
**Safety:** no PR merged, no provider dispatch triggered, and no chargeable cloud resources provisioned by this refresh.


## 2026-11-02 01:22 IST — support export and exact-head refresh

**Current integrated main:** `a554990cb7f4969bb218aad7a2e9944aec62fa05`.  
**Change since the previous record:** a focused support-console improvement was opened as PR #328; no approved requirement or chapter was changed.

| Checkpoint | Status | Delivered capability / exact evidence | Blocker | Next action |
|---|---|---|---|---|
| 1. Product USP and positioning | AMBER | Approved 228 requirements / 38 chapters preserved. The v34 crosswalk and 45 additive candidates remain draft pending owner disposition. The exact-head 228-row / 38-chapter matrix passed on PR #328 head `cadfacfe117d1cb10175d947d44ac6a97f0d2b36` (run 41344237211). | Owner disposition of the additive candidates. | Record an explicit disposition without altering the approved baseline. |
| 2. CI and persistence foundations | GREEN for local/CI scope | PR #328 fresh-clone run 41344237279 passed: `npm run dev:verify`, 1,171 passed / 0 failed / 0 skipped; all seven migration groups, including identity, applied and repeated; disposable PostgreSQL 16 backup/restore passed with 59 source/restored base tables and seven migration-ledger tables. | Production recovery objectives and off-host backup/key custody are not established by this disposable drill. | Complete an independently witnessed recovery rehearsal and record recovery objectives. |
| 3. Architecture and execution boundaries | AMBER | Provider-neutral OIDC browser routes, secure session cookies, CSRF and per-request tenant/application assignment checks remain validated on main. The exact-main Chromium run 41327033298 proves login, protected settings, logout and revoked-session denial using a synthetic local IdP. | Support-admin browser authentication and durable role/delegation integration remain outstanding. | Define and test the authoritative support-admin role/delegation mapping before changing the admin authentication path. |
| 4. Workflow execution design and schema | AMBER | Durable execution/outbox, lease renewal/fencing, idempotency, retry/dead-letter and PostgreSQL dispatch-race tests remain CI-validated. PR #326 adds a disabled-by-default campaign worker process. | Reviewed adapter, restricted worker identity, independent supervision, metrics/alerts and restart/recovery proof. | Keep the worker disabled; implement the reviewed least-privilege runtime and recovery path. |
| 5. Integrated validation | GREEN for current technical lanes | PR #328 head `cadfacfe117d1cb10175d947d44ac6a97f0d2b36`: 11 applicable exact-head Actions workflows completed successfully, including EPER CI 41344237196, fresh clone 41344237279, QA 41344237200, integrated validation 41344237243, matrix 41344237211, six-family HTTP 41344237254, container 41344237249, OIDC browser 41344237221, G9 41344237226 and release build 41344237209. The new all-pages export regression test passed in fresh-clone and QA logs. | Full customer workspace/support browser journey is not covered by the current OIDC E2E. | Add browser E2E for ticket submission, history, replies and admin triage after admin auth is resolved. |
| 6. PR consolidation and governance | AMBER | Current open PRs are #323, #326 and #328. PR #323 and #326 exact-head workflows remain green; PR #328 is draft and its exact-head workflows are green. No submitted reviews or unresolved review threads were present when checked. | Main reports `protected=false`; repository rulesets are empty; independent review and historical branch reconciliation remain. | Obtain owner approval for required checks/branch protection and complete independent PR review. |
| 7. Workflow publisher/runtime implementation | AMBER | Campaign worker process is separately invokable, fail-closed and disabled by default. | No reviewed deployment adapter, restricted worker DB role, independent supervisor, metrics/alerts or live restart/recovery evidence. | Do not enable dispatch until the operating controls are proven. |

### Support journey increment — PR #328

- Exact head: `cadfacfe117d1cb10175d947d44ac6a97f0d2b36`; base main at `a554990cb7f4969bb218aad7a2e9944aec62fa05`; 3 commits ahead / 0 behind.
- Adds an all-pages CSV export action that reuses the existing authorized support queue endpoint and current status/type/severity/application/search filters; the existing current-page export remains.
- Fresh-clone run 41344237279: new regression `support admin queue exports every page matching the active filters` passed; 1,171 passed / 0 failed / 0 skipped; backup/restore passed.
- Controlled QA run 41344237200: 1,135 passed / 0 failed / 17 skipped; the new export regression passed.
- PR remains draft; no merge was performed.
- Still open: support-admin bearer credential rather than browser-session login; no SLA target/timer/escalation contract is defined. Do not invent SLA thresholds.

### Merged foundation verification

- PR #306 merge `6e8dd438e5091b1802d65e4f29951389fe077859` is an ancestor of current main (14 commits ahead, 0 behind).
- PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e` is an ancestor of current main (13 commits ahead, 0 behind).
- The current-main exact-head push workflows remain successful. The separate fresh-clone run above is on PR #328's exact head, not on the main SHA itself; its implementation files are unchanged from main.

**Owner / authority:** user remains the product and design authority. This record does not change the approved requirements baseline or grant production/acceptance authority.


## 2026-11-02 — live evidence refresh: customer browser-session support journey

**Current main, resolved dynamically:** `a554990cb7f4969bb218aad7a2e9944aec62fa05`.  
**Change since the previous scorecard record:** opened PR #329 to replace the customer workspace's pasted bearer credential with provider-neutral OIDC browser-session access and to exercise the customer ticket journey in Chromium. The approved 228 requirements and 38 chapters were not changed.

### Current main and merged foundations

- Main remains `a554990cb7f4969bb218aad7a2e9944aec62fa05`; its applicable exact-SHA push workflows previously completed successfully (EPER CI, integrated validation, QA, browser OIDC, 228/38 matrix, six-family HTTP, container, G9 and workflow configuration).
- PR #306 merge `6e8dd438e5091b1802d65e4f29951389fe077859` and PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e` are verified ancestors of current main. Neither is open work.
- Current open PRs are #323, #326, #328 and #329. All are draft, mergeable and based on current main with zero commits behind:
  - #323 head `515c03397895db6d22f037ff85d961d3a5a55493` (9 ahead, 2 files).
  - #326 head `7446ed23b3545f3cb74b9a4239532bdf340ce3e9` (5 ahead, 5 files).
  - #328 head `cadfacfe117d1cb10175d947d44ac6a97f0d2b36` (3 ahead, 2 files).
  - #329 head `aecdf7e1af49a866cc2f48444f3daf627006b09c` (12 ahead, 5 files).
- No submitted reviews or unresolved inline review threads were present when checked. Do not merge drafts without independent review.

### PR #329 — customer workspace OIDC browser-session integration

- Exact head `aecdf7e1af49a866cc2f48444f3daf627006b09c`, base main `a554990cb7f4969bb218aad7a2e9944aec62fa05`.
- The customer workspace preview now starts with an organization OIDC sign-in link instead of a pasted bearer credential. Browser API calls use same-origin durable session cookies; unsafe calls include the CSRF token.
- In PostgreSQL identity mode, workspace session/module/content/asset/portal APIs resolve the durable session and intersect active tenant-application and actor-application assignments on each request. The browser receives only the fixed least-privilege `customer-user` role. OIDC claims do not grant roles and the workspace resolver does not fall back to bearer mapping in PostgreSQL mode.
- Customer ticket create/history/reply and settings retain their application-scoped browser-session checks. The Chromium E2E signs in through a synthetic local IdP, bootstraps the workspace, submits a ticket, reads history, sends a customer reply, reads protected settings, signs out and verifies revoked-session denial.
- The E2E exposed a previously latent syntax error in the workspace preview's settings aggregation path; the missing parenthesis was corrected on the owning branch, and the exact-head browser run now passes.
- Exact-head Actions for `aecdf7e1af49a866cc2f48444f3daf627006b09c`:
  - [Fresh-clone developer setup — 41351773014](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773014): clean lockfile install; `npm run dev:verify`; 1,170 passed / 0 failed / 0 skipped. All seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity) applied and repeated. Disposable PostgreSQL 16 backup/restore passed: 59 source/restored base tables and seven migration-ledger tables.
  - [EPER CI — 41351772960](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772960) passed.
  - [Controlled QA — 41351773007](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773007): 1,151 tests; 1,134 passed / 0 failed / 17 skipped.
  - [Integrated validation — 41351772987](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772987): 1,158 tests; 1,156 passed / 0 failed / 2 skipped; same-commit gate passed.
  - [Chromium customer OIDC/support journey — 41351773043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773043): 1/1 passed.
  - [228/38 matrix — 41351773005](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773005), [six-family HTTP — 41351773004](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773004), [G9 — 41351773011](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773011), [container smoke — 41351772963](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772963), [release build — 41351772969](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772969), [PostgreSQL payment-store integration — 41351772979](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772979) and [payment gateway contracts — 41351772926](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772926) passed.
- This is browser integration evidence with a synthetic IdP and in-memory test stores, not production-provider onboarding or production session-store certification. Support-admin authentication remains a separate bearer-based boundary; role/delegation mapping and admin browser E2E remain open.

### Other open delivery slices

**PR #323 — developer setup, requirements crosswalk and scorecard**
- Exact previous head `515c03397895db6d22f037ff85d961d3a5a55493`; its exact-head fresh-clone run 41344392599 passed `npm run dev:verify` (1,170 passed / 0 failed / 0 skipped), all seven migration groups and repeatability, and disposable restore (59 tables / seven ledgers). EPER CI, QA, integrated validation, 228/38 matrix, G9, six-family HTTP, container and release workflows passed.
- This scorecard append changes PR #323's head. The previous green runs are not validation for the new head; exact-head Actions must rerun before review/merge.

**PR #326 — dedicated campaign worker**
- Exact head `7446ed23b3545f3cb74b9a4239532bdf340ce3e9`; exact-head fresh-clone run 41327722225 passed (1,175 passed / 0 failed / 0 skipped), seven migration groups applied/repeated and disposable restore (59 tables / seven ledgers).
- PostgreSQL scheduler integration run 41327722301 passed dispatch-fence race and event-idempotency checks; QA run 41327722105 passed with five worker startup guard tests.
- The separate worker process is fail-closed and disabled by default. A reviewed deployment adapter, restricted worker DB identity/context, independent supervisor, metrics/alerts and live restart/recovery proof remain outstanding. Do not enable provider dispatch.

**PR #328 — filtered support ticket export**
- Exact head `cadfacfe117d1cb10175d947d44ac6a97f0d2b36`; exact-head fresh-clone run 41344237279 passed (1,171 passed / 0 failed / 0 skipped), seven migration groups applied/repeated and disposable restore (59 tables / seven ledgers).
- QA run 41344237200 passed (1,135 passed / 0 failed / 17 skipped). Its job log confirms `support admin queue exports every page matching the active filters` passed.
- The export reuses the authorized admin endpoint and active status/type/severity/application/search filters. PR remains draft.

### Seven-checkpoint status

| Checkpoint | Status | Delivered capability / evidence | Blocker / next action |
|---|---|---|---|
| 1. v34-to-228 requirements reconciliation | AMBER | Approved 228 requirements / 38 chapters preserved. All 45 v34 candidates and acceptance criteria remain additive v1.6.0 draft candidates; exact-head 228/38 matrix 41351773005 passed. | Owner disposition of the 45 candidates; do not change the approved baseline. |
| 2. Fresh-clone developer setup | GREEN for validated PR heads | PR #329 run 41351773014: documented `npm run dev:verify`, 1,170 passed, all seven migration groups applied/repeated, disposable restore passed (59 tables / seven ledgers). PR #326/#328 also passed exact-head fresh-clone runs. | Repeat the handover independently with a second engineer; no reliance on chat or a single workstation. |
| 3. PostgreSQL migrations, integration and recovery | GREEN for local/CI integration; AMBER for operational recovery | All seven migration groups including identity apply and repeat; live PostgreSQL integration, tenant/actor assignment, RLS/audit/rollback and disposable backup/restore pass on exact PR heads. | Production backup destination, encryption/key custody, retention, RPO/RTO and independent recovery rehearsal are not established. |
| 4. Provider-neutral identity and tenant/application access | AMBER | OIDC browser routes, durable session cookies, CSRF, logout/revocation and per-request tenant/application plus actor/application assignment intersection; PR #329 Chromium support journey 41351773043 passed. | Production IdP onboarding, durable role/delegation model, token rotation and support-admin browser authentication. |
| 5. Customer workspace and support journey | AMBER | PR #329 covers browser sign-in, workspace bootstrap, ticket submission/history/customer reply, protected settings and logout. Existing support APIs cover tenant scoping, admin triage/assignment/severity, internal-note separation; PR #328 adds all-pages filtered export. | Support-admin browser E2E/authentication; owner-defined SLA targets, business calendar, pause and escalation rules; attachments/notifications lifecycle. |
| 6. Scheduler and workflow operations | AMBER | PR #326 adds a separate disabled-by-default worker process. Durable claims, lease/heartbeat/fencing, idempotency, bounded retry/dead-letter and dispatch authorization have PostgreSQL/test evidence. | Reviewed adapter, restricted worker DB identity, downstream idempotency contract, independent supervision, metrics/alerts and restart/recovery proof. |
| 7. Release controls and engineering continuity | AMBER | Fresh-clone setup and disposable restore runbooks/evidence exist; exact-head release/container/G9 lanes pass. | Main remains `protected=false`, repository rulesets are empty; production recovery and independent second-engineer release/rollback are unproven. Charter remains proposed pending owner review. |

**Owner decisions required:** disposition the 45 additive candidates; approve the support-admin role/delegation model; define service-level targets and calendar/escalation rules; approve repository protection/required checks and continuity ownership.

**Safety:** No PR was merged by this refresh. No real provider action or chargeable cloud resource was triggered. No approved requirement or chapter was modified.


## 2026-11-02 05:11 IST — live exact-head and operational-boundary refresh

**Current integrated main, resolved dynamically:** `a554990cb7f4969bb218aad7a2e9944aec62fa05`.  
**Change since the preceding record:** no main movement. Rechecked the complete current open-PR set, exact candidate heads, associated Actions, selected job logs, the two merged foundations, and repository governance. The approved 228 requirements / 38 chapters remain unchanged.

### Integrated main and merged foundations

- Ten applicable push-triggered Actions runs for the exact main SHA completed successfully: EPER CI [41327033352](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033352), same-commit integrated validation [41327033337](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033337), controlled QA [41327033377](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033377), customer OIDC browser [41327033298](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033298), 228/38 matrix [41327033302](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033302), six-family HTTP [41327033272](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033272), container [41327033358](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033358), G9 [41327033313](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033313), workflow configuration [41327033325](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033325), and technical simulation [41327033274](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327033274).
- PR #306 is merged as `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 is merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Commit comparisons confirm both merge commits are ancestors of current main. They are not open work.

### Current open PRs and exact-head evidence

The live open-PR search returns #323, #326, #328 and #329. Each is draft, mergeable, targets main at the current SHA, and is zero commits behind. No submitted reviews or unresolved inline review threads were returned.

| PR | Exact head at this recheck | Ahead / behind | Relevant exact-head Actions |
|---|---|---:|---|
| [#323](https://github.com/sbannai/enterprise-product-engineering/pull/323) | `a134871615015c2c622bdea4e4699e1e5b2b1a16` | 10 / 0 | Fresh clone [41352025000](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41352025000); EPER CI [41352024988](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41352024988); QA [41352024973](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41352024973); integrated [41352025099](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41352025099); 228/38 matrix [41352025012](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41352025012). |
| [#326](https://github.com/sbannai/enterprise-product-engineering/pull/326) | `7446ed23b3545f3cb74b9a4239532bdf340ce3e9` | 5 / 0 | Fresh clone [41327722225](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722225); EPER CI [41327722184](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722184); worker QA [41327722105](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722105); PostgreSQL scheduler integration [41327722301](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722301); integrated [41327722204](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722204). |
| [#328](https://github.com/sbannai/enterprise-product-engineering/pull/328) | `cadfacfe117d1cb10175d947d44ac6a97f0d2b36` | 3 / 0 | Fresh clone [41344237279](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41344237279); EPER CI [41344237196](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41344237196); QA [41344237200](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41344237200); OIDC browser [41344237221](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41344237221); integrated [41344237243](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41344237243). |
| [#329](https://github.com/sbannai/enterprise-product-engineering/pull/329) | `aecdf7e1af49a866cc2f48444f3daf627006b09c` | 12 / 0 | Fresh clone [41351773014](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773014); EPER CI [41351772960](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772960); QA [41351773007](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773007); Chromium customer support journey [41351773043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773043); integrated [41351772987](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351772987). |

The run metadata for each selected fresh-clone workflow confirms its PR head SHA and current main base SHA. Associated workflow runs for all four current heads completed successfully. Integrated-validation matrix subjobs are skipped by PR workflow design on these candidates; each has a separate successful 228/38 matrix run. No stale green run was used.

### Checkpoint 1 — Product USP and positioning

- **Status:** AMBER.
- **Delivered capability:** The approved 228 requirements / 38 chapters remain unchanged. The v34-to-228 crosswalk preserves all 45 source candidates and acceptance criteria. Its current technical classification is zero exact full-coverage matches, 45 partial-support links through shared controls, and 45 additive v1.6.0 draft candidates; four overlap the existing human-approval control.
- **Evidence:** PR #323 exact-head matrix [41352025012](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41352025012): 228 requirements, 38 chapters, 38 chapter suites passed, 259 checks passed, zero failed chapters; nine chapters have HTTP pilot apps in scope and 29 do not.
- **Blocker:** Technical classification is not owner approval of additive scope.
- **Next action:** Record owner disposition for each candidate in a versioned requirements-register change; do not edit the approved 228/38 baseline.

### Checkpoint 2 — CI and persistence foundations

- **Status:** GREEN for local/CI bootstrap and integration; operational recovery remains AMBER.
- **Delivered capability:** Each current PR head passed clean-clone `npm run dev:verify`. The seven migration groups—payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity—were applied and repeated. Fresh-clone test results: #323 1,170 passed / 0 failed / 0 skipped; #326 1,175 / 0 / 0; #328 1,171 / 0 / 0; #329 1,170 / 0 / 0. Each restore smoke logged `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`, 59 source/restored base tables and seven migration-ledger tables.
- **Evidence:** Exact-head fresh-clone runs in the PR table above. #326 PostgreSQL scheduler integration [41327722301](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722301) passed two real-PostgreSQL dispatch-fence/idempotency subtests.
- **Blocker:** A disposable local/CI restore is not production disaster-recovery certification. Production backup destination, encryption/key custody, retention, recovery objectives and an independent restore rehearsal are not evidenced.
- **Next action:** Document owner-approved recovery objectives and arrange an independently witnessed non-chargeable recovery rehearsal.

### Checkpoint 3 — Architecture and execution boundaries

- **Status:** AMBER.
- **Delivered capability:** Mainline identity includes provider-neutral OIDC protocol validation and browser transaction routes, state/nonce/PKCE binding, secure host-only session cookie, CSRF verification, sign-out/revocation and per-request intersection of active tenant/application plus actor/application assignments. The customer browser receives only the fixed `customer-user` role; OIDC claims do not grant application roles.
- **Evidence:** PR #329 exact-head Chromium run [41351773043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41351773043), 1/1 passed. The test covers synthetic IdP sign-in, workspace bootstrap, ticket creation/history/reply, protected settings, sign-out and revoked-session denial.
- **Boundary:** The browser test uses a synthetic local IdP and in-memory session/ticket stores. It does not certify production-provider onboarding or production session-store operation. Support-admin still uses a bearer credential; its role/delegation mapping is not integrated with browser sessions.
- **Next action:** Close the owner-approved support-admin role/delegation model and add negative tests before changing the admin authentication boundary.

### Checkpoint 4 — Workflow execution design and schema

- **Status:** AMBER.
- **Delivered capability:** Campaign execution code has a continuous worker loop with durable claims, due-schedule materialization, lease ownership, an atomic dispatch fence, live policy re-check, idempotency-key propagation, bounded retry/dead-letter handling and graceful shutdown. The loop currently uses a one-second idle delay between empty claims. The workflow outbox process separately loops through authorized tenant/application contexts, renews leases, fences stale workers, retries with capped exponential backoff, dead-letters exhausted claims and reports per-pass counters.
- **Evidence:** PR #326 worker startup QA [41327722105](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722105): five fail-closed startup guards passed. PostgreSQL dispatch-race integration [41327722301](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41327722301): pause-vs-dispatch fence and event idempotency passed. Mainline outbox worker/process tests cover lease renewal/loss, retry/dead-letter, context isolation and shutdown.
- **Blocker:** PR #326 has no reviewed deployment adapter or restricted worker-specific database role. Neither worker has independently demonstrated deployment supervision, restart/recovery, connected metrics/alerts, load behavior or production dispatcher idempotency. The campaign worker must remain disabled by default.
- **Next action:** Implement a restricted worker identity and reviewed no-live-provider adapter contract, then test process supervision and PostgreSQL restart/recovery without external dispatch.

### Checkpoint 5 — Integrated validation

- **Status:** GREEN for the exact technical lanes inspected.
- **Delivered capability:** Ten exact-main-SHA push workflows and all associated workflows for the four current PR heads completed successfully. The fresh-clone, typecheck/build, controlled QA, integrated gate, 228/38 matrix, browser, PostgreSQL, six-family HTTP, container, G9 and release-build lanes are represented in the evidence above.
- **Blocker:** Automated chapter and browser tests cover only their declared scope. Green CI is not production readiness or owner acceptance.
- **Next action:** Expand real-PostgreSQL customer-to-admin support E2E and operational failure/recovery coverage while preserving independent review.

### Checkpoint 6 — PR consolidation and governance

- **Status:** AMBER.
- **Delivered capability:** The live open-PR set is reconciled to #323/#326/#328/#329. All are draft, mergeable, zero behind current main; review submissions and unresolved review threads are empty. PR #306 and #310 are verified merged ancestors.
- **Evidence:** GitHub PR metadata and exact-head Actions above. Main branch metadata reports `protected=false`, required-check enforcement off, and the repository rulesets collection is empty.
- **Blocker:** Main is not protected. Direct branch-protection detail read is unavailable to the connected integration; the branch metadata and empty rulesets collection are the available evidence. No independent reviewer has submitted a review.
- **Next action:** Obtain owner approval for required checks/branch protection and independent review; do not merge draft PRs merely to reduce the queue.

### Checkpoint 7 — Workflow publisher/runtime implementation

- **Status:** AMBER.
- **Delivered capability:** The workflow outbox is implemented as a continuously running process, not a cron-triggered invocation. Its runtime contract requires a restricted platform-worker pool and an explicit dispatcher; delivery is at-least-once with event-ID idempotency, lease renewal/fencing, retry/dead-letter handling and counters for claimed/delivered/retried/dead-lettered/lease-lost/interrupted/context visits. The host adapter maps SIGINT/SIGTERM to graceful cancellation.
- **Evidence:** Mainline workflow outbox worker/process/host tests and PR #326 startup/dispatch-fence tests described above.
- **Blocker:** Deployment host must still provide restart supervision, termination grace period, metrics/log export and alerts; a reviewed dispatcher and restricted worker credentials are absent; no real restart/recovery drill or load evidence exists.
- **Next action:** Complete the host-owned supervision/observability contract and run a no-provider failure/restart rehearsal.

### Repository governance and safety

- Main remains unprotected; required status checks are not enforced and no repository rulesets are configured.
- The Engineering Continuity & Independence Charter remains **proposed** pending owner review. A second engineer has not demonstrated the full clean-clone/build/test/change/PR/release/rollback path independently.
- No PR was merged by this update. No chargeable cloud resource was provisioned and no real external/provider action was triggered. No acceptance authorization is made.

### Scorecard self-update validation boundary

This dated append is being made on PR #323's existing documentation branch. Its pre-append head `a134871615015c2c622bdea4e4699e1e5b2b1a16` and the passing runs listed above validate the pre-append candidate only. The new documentation commit changes PR #323's head; those green runs must not be treated as validation of the new head. Re-run and inspect Actions against the resulting exact head before review or merge.

## 2026-11-02 05:31 IST — matrix metric wording correction

**Current main SHA at review:** `a554990cb7f4969bb218aad7a2e9944aec62fa05`.  
**Reviewed PR #323 head:** `c84b427fb8c45231891e3238253033f10965a3b1`.

A line in the 05:11 record described the matrix output as “259 checks passed.” Inspection of the exact-head job log for [run 41363682248](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41363682248) shows the distinct fields: `chapters=38`, `chapterSummary.pass=38`, `totalTests=259`, `passedTests=259`, `failedTests=0`, and `passedChecks=28`. The accurate statement is **38/38 chapter suites passed; 259 tests passed with zero failed; the separate `passedChecks` field is 28**. This correction does not change the approved 228-requirement / 38-chapter baseline or the matrix scope (nine chapters with HTTP pilot apps; 29 without).

**Next action:** Keep future reports aligned to the raw artifact field names; do not conflate test cases and passed checks.


## Dated engineering record — 2026-11-02 07:12 IST

**Latest main resolved dynamically:** `90ce1fe731cb13a0fe4661a724c0dcdc2e3acff9`.

The latest main commits after the scorecard branch base are additive documentation changes to the v1.6.0 requirements change-control register. They add customer lifecycle, single/multi-application tariff, tariff mobility, and price-integrity controls as EPER-CW-046 through EPER-CW-054. The approved 228 requirements and 38 chapters remain unchanged. These new items are additive; the existing v34 crosswalk has not yet been re-reconciled against this later additive scope.

### Current PR evidence baseline

| PR | Exact head | Base relationship to latest main | Current capability |
|---|---|---|---|
| #323 | `74a87ed209d5d0014a3139fb95693cf5699e31bf` | 12 ahead / 3 behind | v34 crosswalk, fresh-clone guidance, scorecard correction |
| #326 | `2a62b6166537b2ff2bfddb24df639617d6f51d27` | 12 ahead / 3 behind | isolated campaign worker process and recovery/dispatch controls |
| #328 | `cadfacfe117d1cb10175d947d44ac6a97f0d2b36` | 3 ahead / 3 behind | complete filtered support queue export |
| #329 | `aecdf7e1af49a866cc2f48444f3daf627006b09c` | 12 ahead / 3 behind | customer OIDC browser session and ticket journey |
| #330 | `61812f0f9b3aa3a55647d0f2cc755c00a8f6b318` | 31 ahead / 2 behind | customer lifecycle/tariff enforcement, Product Admin tariff catalogue API/UI, maker-checker and durable audit |

All remain draft. No PR was merged in this record. PRs #323/#326/#328/#329 are based on the older `a554990cb7f4969bb218aad7a2e9944aec62fa05`; #330 is based on `6d6ad719f3e6992f3a9a19a64405df3c305a19c9`. Refresh each branch against current main and rerun its applicable exact-head checks before merge. Checks recorded on an earlier head are not evidence for a later head.

### Seven checkpoint status

| Checkpoint | Status | Evidence delivered | Remaining blocker / next action |
|---|---|---|---|
| 1. Product USP and positioning | AMBER | Approved 228/38 baseline preserved. Existing v34 crosswalk still records 45 partial-support links and 45 additive candidates; zero exact full-coverage matches. New EPER-CW-046–054 commercial controls are additive to the change register. | Reconcile the new additions into the v34 crosswalk without editing the approved baseline. Complete customer lifecycle and tariff administration, mobility, and price-integrity acceptance criteria. |
| 2. CI and persistence foundations | GREEN for inspected local/CI lanes | PR #326 exact head `2a62b6166537b2ff2bfddb24df639617d6f51d27`: fresh-clone verification passed (1,178 tests, 0 failed, 0 skipped), seven migration groups applied/repeated, disposable backup/restore passed (59 base tables, seven migration ledgers). PR #330 exact head `61812f0f9b3aa3a55647d0f2cc755c00a8f6b318`: fresh-clone verification passed (1,179 tests, 0 failed, 0 skipped); migrations 009 and 010 applied; backup/restore passed (62 base tables, seven ledgers). | Complete independent restore rehearsal, retention, encryption/key custody, and measured recovery objectives. PR #330's same-head integrated gate was still running when this record was written. |
| 3. Architecture and execution boundaries | AMBER | Merged PR #310 identity/session foundation is an ancestor of current main. PR #329 browser E2E covers synthetic OIDC sign-in, protected access, customer ticket create/history/reply, logout and revoked-session denial. PR #330 enforces customer status and purchased application-count limits at application activation and module/add-on entitlement checks. | Customer browser test still uses synthetic IdP and in-memory stores. Support-admin identity/delegation is not integrated. Customer active/inactive administration and customer-specific tariff assignment are not wired to the new runtime; the pricing UI explicitly labels the customer/application registry and access controls as not wired. |
| 4. Workflow execution design and schema | AMBER | PR #326 provides a separate disabled-by-default campaign worker, durable claims, stale recovery, dispatch fence, idempotency, bounded retries/dead-letter and graceful shutdown. Exact head checks passed. | Reviewed adapter, restricted worker DB identity, supervisor, health/metrics/alerts and live restart/recovery proof remain. Do not enable dispatch. |
| 5. Integrated validation | AMBER | Exact-head technical lanes for PRs #323/#326/#328/#329 passed on their recorded heads. PR #330 exact head `61812f0f9b3aa3a55647d0f2cc755c00a8f6b318` passed CI, live PostgreSQL payment/assignment tests, matrix, browser, release, container, six-family HTTP, QA and G9 lanes; the same-commit integrated gate was still in progress. | Refresh branches to latest main, complete PR #330 integrated gate, and add durable PostgreSQL coverage for all customer-to-admin support paths. Do not infer production readiness from synthetic/in-memory browser evidence. |
| 6. PR consolidation and governance | AMBER | PR #306 merge SHA `6e8dd438e5091b1802d65e4f29951389fe077859` and PR #310 merge SHA `88b9708d748c19dc80a1a2d7ad4960914451db7e` are confirmed ancestors of current main. Five focused open PRs remain; no duplicate replacement PR was created for these workstreams. | Rebase/refresh the five open branches, obtain independent review, enable required branch controls, and close the remaining governance evidence gaps. |
| 7. Workflow publisher/runtime implementation | AMBER | Existing workflow outbox and PR #326 worker support continuous polling, lease renewal/fencing, idempotency, retry/dead-letter and graceful termination. | Host supervision, operational metrics/alerts, restricted credentials, adapter contract and recovery rehearsal remain. |

### Commercial controls delivered in PR #330

The current exact PR #330 head adds:
- Durable customer account status and customer tariff assignment schema.
- Fail-closed application activation when the customer is inactive or the accepted application-count limit is exceeded.
- Customer status and assignment checks in module/add-on entitlement resolution.
- Versioned tariff plan drafts, Product Admin listing/creation, maker-checker approval and publication with transactional audit events.
- Product Admin tariff catalogue editor in the existing pricing workspace.
- Live PostgreSQL test coverage for concurrent application activation at the purchased limit, versioned tariff creation, maker-checker approval, publication and audit.

The exact-head CI log for `61812f0f9b3aa3a55647d0f2cc755c00a8f6b318` records the live Product Admin tariff lifecycle subtest passing, and the fresh-clone run records migrations `009_customer_commercial_controls.sql` and `010_commercial_tariff_admin_lifecycle.sql` applied.

This is a first delivery slice, not full commercial operations. Customer active/inactive mutation and customer-specific tariff assignment UI/API are not yet wired. Published-plan effective-date overlap/retirement policy, database-enforced immutability for accepted customer tariff snapshots, currency allowlist, and integration of the accepted price snapshot through quote/invoice/payment/receipt paths remain to be proven.

### Continuity and release

The fresh-clone and disposable backup/restore checks are automated on the exact PR #330 head above. The latest main documentation commit `90ce1fe731cb13a0fe4661a724c0dcdc2e3acff9` has no associated Actions runs. The repository's last observed branch metadata reported main unprotected and no repository rulesets; detailed branch-protection settings remain inaccessible through the connected integration. A second engineer has not independently demonstrated the complete clone/build/test/change/PR/release/rollback path.

No chargeable cloud resources or real external/provider actions were used for this work.
