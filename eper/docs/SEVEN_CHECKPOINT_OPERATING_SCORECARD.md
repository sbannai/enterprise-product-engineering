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


## Dated operating update — 2026-11-02 08:15 IST

**Current main SHA:** `566bd7ffbccf088ab44338e01af5eb572c0bb6c9`  
**Assessment basis:** PR #326 and PR #330 merged; PR #330 reconciliation head `e6f3d28671e9017f9ce95c9b4d619b073fca4667` passed all 13 applicable exact-head workflows. Nine post-merge workflows have been queued on the new main SHA and are not yet counted as passed.  
**Baseline:** 228 approved requirements across 38 chapters preserved. CW-046 through CW-055 remain additive candidates in the v1.6.0 draft register.

| Checkpoint | Status | Delivered capability / evidence | Remaining blocker | Next action |
|---|---|---|---|---|
| 1. Product USP and positioning | AMBER | Customer lifecycle, tariff catalogue management, customer tariff mobility and explicit downgrade selection merged in PR #330; CW-046–055 preserved. | Commercial invoice issuance and billing reconciliation are not connected to accepted tariff snapshots. | Implement the trusted tariff-to-invoice bridge without inventing tax, FX, proration or recurring-billing rules. |
| 2. CI and persistence foundations | AMBER | PR #330 exact-head fresh-clone, PostgreSQL payment-store integration and migration checks passed; main now includes both merged slices. | Post-merge main workflows are still queued; local fresh-clone and migration evidence must be rechecked on the resulting main SHA. | Close the post-merge main workflow set and inspect any failures before further integration. |
| 3. Architecture and execution boundaries | AMBER | Customer identity/role checks, tenant-scoped application assignments, commercial advisory locking and transactional audit are merged. | Full delegation, role/threshold and separation-of-duties coverage remains incomplete. | Extend negative authorization and cross-tenant tests for commercial and admin operations. |
| 4. Workflow execution design and schema | AMBER | Campaign worker entrypoint, adapter contract, lease renewal and restart recovery tests are merged through PR #326. | Full publisher-to-worker lifecycle, event delivery/replay, operational controls and production worker isolation remain incomplete. | Continue the restricted worker context, approved dispatcher and recovery/observability work. |
| 5. Integrated validation | AMBER | PR #330 reconciled head `e6f3d286` passed 13/13 applicable workflows, including same-commit integrated validation (run [41379110947](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379110947)), fresh-clone (run [41379110953](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379110953)), PostgreSQL payment integration (run [41379110930](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379110930)), customer OIDC browser (run [41379111041](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379111041)) and 228 matrix (run [41379111003](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379111003)). | The post-merge main SHA still needs its own green workflow evidence. | Verify all post-merge runs against `566bd7ff`. |
| 6. PR consolidation and governance | AMBER | PR #326 merged as `6041d08b`; PR #330 reconciled with main and merged as `566bd7ff`. No unresolved review threads were returned for PR #330. | Complete open-PR inventory, stale-branch disposition and branch-protection/ruleset verification remain. | Audit all open PRs and compare each head/base with current main. |
| 7. Workflow publisher/runtime implementation | AMBER | Worker process entrypoint, deployment adapter contract, lease renewal through in-flight dispatch shutdown and restart recovery coverage merged in PR #326. Worker remains disabled by default. | Provider adapter implementation, restricted DB role, host supervision, delivery telemetry/alerts and load/recovery evidence remain. | Close worker isolation and operational-control prerequisites before enabling dispatch. |

### Mainline merge evidence

- PR [#326](https://github.com/sbannai/enterprise-product-engineering/pull/326) merged at `6041d08b0de233bc7ffbe643d126b3f75b6b8b97`.
- PR [#330](https://github.com/sbannai/enterprise-product-engineering/pull/330) merged at `566bd7ffbccf088ab44338e01af5eb572c0bb6c9`.
- PR #330 reconciliation head `e6f3d28671e9017f9ce95c9b4d619b073fca4667` is a two-parent merge of the then-current main and the complete commercial feature branch; the requirements register was reconciled to retain both mainline worker changes and CW-046–055.
- Post-merge workflows on `566bd7ff` were queued: EPER CI [41379254328](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254328), integrated validation [41379254336](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254336), 228 matrix [41379254344](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254344), customer OIDC [41379254355](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254355), G9 [41379254398](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254398), six-family smoke [41379254288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254288), container smoke [41379254341](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254341), RE-EXEC-001 [41379254285](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254285) and REEXEC-002 [41379254635](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379254635). Their queued state is not a pass.

## Dated requirements crosswalk addendum — 2026-11-02 08:12 IST

**Main baseline at review:** `c4c1c0d05292be5c7b47e034b60c487c6d7cc262` (resolved dynamically from `refs/heads/main`).

The v34-to-228 crosswalk has been extended in the same delivery branch that carries the commercial change-control record. EPER-CW-046 through EPER-CW-055 are separately mapped to shared SRS controls and XX01–XX06 capability families. These ten owner-directed commercial additions are **not** extra rows from the original v34 wireframe export.

- Original v34 source population remains 45 rows; all original IDs, statements, acceptance criteria and wireframe locators are retained.
- Original v34 disposition remains 0 exact full-coverage matches, 45 partial-support links to shared controls, and 45 additive v1.6.0 draft candidates.
- The ten commercial additions are separately identified as owner-directed v1.6.0 draft scope. No exact REQ-463xx…REQ-500xx match is fabricated.
- The approved baseline remains 228 requirements across Chapters 463–500 (38 chapters); no baseline ID, chapter or acceptance criterion is changed.
- The v1.6.0 addendum remains draft pending the owner's formal disposition. Mapping to shared controls is not evidence of implementation or acceptance.

### Mainline delivery since the previous scorecard record

- PR #326 merged as `6041d08b0de233bc7ffbe643d126b3f75b6b8b97`: isolated, disabled-by-default campaign worker runtime. Adapter, restricted worker identity, independent supervision, telemetry and recovery remain open.
- PR #330 merged as `566bd7ffbccf088ab44338e01af5eb572c0bb6c9`: customer lifecycle and tariff enforcement, Product Admin tariff lifecycle, customer tariff acceptance/history and explicit atomic downgrade selection. The final pre-merge head's exact-head CI is recorded in its PR and Actions; post-merge checks must be distinguished from that pre-merge evidence.
- Earlier foundations PR #306 (`6e8dd438e5091b1802d65e4f29951389fe077859`) and PR #310 (`88b9708d748c19dc80a1a2d7ad4960914451db7e`) remain merged ancestors.

### Current open-PR disposition

- PR #323 is refreshed onto the current mainline and carries the seven-migration-group developer setup plus the expanded commercial crosswalk. Its new merge commit requires exact-head Actions validation.
- PR #328 remains an isolated support-export UI/test change and can be refreshed without overlapping the current mainline file set; its old exact-head checks are not evidence for a refreshed head.
- PR #329 remains a separate customer OIDC browser-session change. Its `customer-portal-preview.ts` and `server.ts` changes overlap the commercial workspace implementation now on main. GitHub reports it non-mergeable; it needs deliberate code-level reconciliation, not a blind branch refresh.

### Checkpoint implications

- **1 — Product USP:** technical crosswalk now includes CW-046–055 without changing 228/38; v1.6.0 owner approval and feature-by-feature delivery evidence remain.
- **2 — CI/persistence:** fresh-clone `npm run dev:verify`, seven migration groups, repeatability, live PostgreSQL tests and disposable restore are evidenced on exact pre-merge heads. Production backup retention, encryption/key custody, RPO/RTO and independent recovery rehearsal remain.
- **3 — Architecture/identity:** provider-neutral OIDC protocol and customer browser integration exist, but production IdP onboarding, support-admin OIDC/delegation and durable PostgreSQL customer-to-admin browser E2E remain.
- **4 — Workflow schema/execution:** campaign worker is merged and disabled by default; reviewed adapter, restricted worker database role, supervisor, metrics/alerts and restart/recovery proof remain.
- **5 — Integrated validation:** current PR evidence is technical and exact-head scoped. Synthetic/in-memory browser tests do not prove the complete durable support journey.
- **6 — PR governance:** PR #323 is refreshed; #328 needs refresh; #329 needs manual conflict reconciliation and review. Branch protection/ruleset enforcement remains unverified.
- **7 — Workflow publisher/runtime:** continuous worker logic is integrated; production dispatch and operational independence remain incomplete.

**Next action:** complete exact-head validation on the refreshed #323 branch, then refresh #328 and reconcile #329's overlapping customer workspace files. Keep the worker disabled until its operational prerequisites are proven. Owner: Engineering for implementation/evidence; Product Owner for v1.6.0 disposition and release-control decisions.

## Dated engineering record — 2026-11-02 08:16 IST

**Integrated main at record start:** `599691c1d8c39eee74a04f1e9756aa3468ef67e2`, resolved dynamically from `refs/heads/main`.

### Mainline delivery and exact evidence

- PR #323 merged as `1a31c860e96220f42eef8593221832db5cdbe9d8`. It brings the seven-migration-group fresh-clone guide and the v34-to-228 crosswalk addendum mapping owner-directed EPER-CW-046–055 separately from the original 45 v34 source rows. The approved 228 requirement IDs and 38 chapters remain unchanged.
- PR #328 merged as `599691c1d8c39eee74a04f1e9756aa3468ef67e2`. It adds all-pages support-queue export with active filters and formula-safe CSV handling.
- PR #326 merged as `6041d08b0de233bc7ffbe643d126b3f75b6b8b97`: isolated campaign worker process, still disabled by default.
- PR #330 merged as `566bd7ffbccf088ab44338e01af5eb572c0bb6c9`: customer lifecycle/tariff enforcement, Product Admin tariff catalogue lifecycle and explicit atomic downgrade application selection.
- PR #306 (`6e8dd438e5091b1802d65e4f29951389fe077859`) and PR #310 (`88b9708d748c19dc80a1a2d7ad4960914451db7e`) remain merged ancestors.

PR #328's final exact head `d0652dd9d1427d1a43fb413c2212919e7c4ecd0c` passed all 11 applicable workflows before merge:
- Fresh clone [41379978604](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978604): 1,192 passed / 0 failed / 0 skipped; `npm run dev:verify`; seven migration groups including identity applied and repeated; disposable backup/restore PASS; 63 source/restored base tables and seven migration ledgers.
- CI [41379978505](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978505), controlled QA [41379978530](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978530) (1,151 passed / 0 failed / 18 skipped), integrated [41379978581](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978581), browser [41379978553](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978553), matrix [41379978586](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978586), G9 [41379978544](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978544), HTTP [41379978516](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978516), container [41379978665](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978665), release [41379978513](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978513) and technical simulation [41379978514](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41379978514): PASS.
- The merged main commit `599691c1` has nine push workflows completed successfully: CI [41380166271](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166271), integrated [41380166269](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166269), matrix [41380166544](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166544), G9 [41380166226](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166226), browser [41380166252](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166252), QA [41380166412](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166412), container [41380166289](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166289), HTTP [41380166232](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166232), technical simulation [41380166223](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380166223).
- Main CI's live PostgreSQL assignment suite passed 11/11, including concurrent application-limit enforcement, tariff switching with immutable accepted-price history and downgrade-audit rollback. Main matrix: 38 chapter suites, 259 tests passed, 0 failed; separate `passedChecks=28`.

### Current open PR and integration boundary

Only PR #329 remains open. Its head is `aecdf7e1af49a866cc2f48444f3daf627006b09c`, its original base is `a554990cb7f4969bb218aad7a2e9944aec62fa05`, and GitHub reports it non-mergeable and 83 commits behind current main. Its customer portal and server edits overlap the tariff workspace now merged by PR #330. Keep it open and draft for deliberate integration; do not blindly select either side.

### Seven-checkpoint status

| Checkpoint | Status | Evidence and remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | Original 45 v34 source rows retained; CW-046–055 separately mapped as owner-directed v1.6.0 draft additions. 228/38 unchanged. Owner disposition of v1.6.0 remains. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER operations | Fresh-clone verification, all seven migration groups including identity, repeatability, live PostgreSQL tests and disposable backup/restore pass. Production backup destination, encryption/key custody, retention, RPO/RTO and independent recovery rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER | Provider-neutral OIDC protocol, start/callback/logout routes, durable subject/session store, secure host cookies, CSRF and per-request tenant/application + actor/application checks exist in main. The customer portal preview still renders the bearer-credential connection panel; OIDC sign-in UI and session-bound workspace integration remain in conflicted PR #329. No production IdP onboarding or durable PostgreSQL browser E2E of the full workspace is evidenced. |
| 4. Workflow execution design and schema | AMBER | Campaign worker is merged, continuous, lease-renewed/fenced, idempotent and bounded-retry/dead-letter capable, with policy recheck and graceful shutdown. Keep disabled: concrete approved adapter, restricted worker DB identity, independent host supervision, metrics/alerts and restart/recovery rehearsal remain. |
| 5. Integrated validation | GREEN for inspected technical lanes; AMBER journey | PostgreSQL ticket APIs cover tenant/application scope, creation idempotency, status/assignment, replies, internal-note filtering and audit rollback. PR #328 adds all-filtered-page export. The customer browser workspace journey remains incomplete; support-admin browser identity and owner-defined SLA policy remain. |
| 6. PR consolidation and governance | AMBER | PR #323 and #328 merged; only PR #329 remains open, draft and non-mergeable due to overlap with commercial workspace code. Main branch reports `protected=false`; repository rulesets collection is empty. |
| 7. Workflow publisher/runtime implementation | AMBER | Continuous worker/outbox, lease/fencing, retries/dead-letter, counters and graceful shutdown exist. Provider adapter, restricted credentials, process supervision, alerting and operational recovery proof remain. |

### Release and continuity

The Engineering Continuity & Independence Charter remains a proposed control baseline requiring owner review. Main branch protection is false and the rulesets collection is empty; the detailed branch-protection endpoint is inaccessible to the integration. A second engineer has not independently demonstrated the complete clone/build/test/change/PR/release/rollback sequence. Disposable restore smoke is not production disaster-recovery proof.

**Next action:** reconcile PR #329's OIDC sign-in/session behavior with the merged Plan & Billing UI and current server authorization helper; extend the browser journey against disposable PostgreSQL identity and ticket stores; then rerun every applicable workflow on its new exact head. Define support SLAs with the owner. Keep campaign dispatch disabled until the worker's operational prerequisites are proven. No UAT authorization is implied.


## Dated engineering record — 2026-11-02 08:37 IST

**Integrated main baseline:** `4767042af97aeceaec4b776d587556f1f2da1b7f`, resolved from `refs/heads/main`.  
**Current open customer-workspace PR head at record time:** `a8448c7ee21a947ae026e7ef75d86624cff58384`. GitHub reports the PR mergeable; `main...head` comparison is 16 commits ahead and 0 behind. The PR remains draft and requires review before merge.

### Exact-head correction and validation

After the branch was reconciled with main, the first exact-head run exposed two customer-workspace defects:
- The settings-view `Promise.all` callback had an unclosed API call, so the inline browser script failed to parse.
- The preview test still required the retired pasted-bearer credential form after the workspace had moved to provider-neutral OIDC sign-in.

The source was corrected and the preview test now asserts the OIDC sign-in/sign-out path and explicitly rejects the legacy credential form. The inline script was syntax-checked before the new Actions run.

The final exact head `a8448c7ee21a947ae026e7ef75d86624cff58384` passed every applicable PR workflow. The exact-head evidence includes:
- CI [41381550346](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550346).
- Fresh-clone/PostgreSQL [41381550492](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550492).
- PostgreSQL payment/scheduler integration [41381550498](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550498).
- Customer OIDC browser [41381550319](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550319).
- Requirements matrix [41381550461](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550461).
- Controlled QA [41381550356](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550356).
- Integrated same-commit gate [41381550261](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550261).
- G9 [41381550403](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550403), six-family HTTP [41381550456](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550456), container [41381550454](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550454), release build [41381550445](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550445), payment contract [41381550360](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550360), and technical simulation [41381550496](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41381550496).

Fresh-clone run 41381550492 executed `npm run dev:verify`: 1,192 passed, 0 failed, 0 skipped. All seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity) were applied and the repeatability pass completed. Disposable PostgreSQL backup/restore returned `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`, with 63 source/restored base tables and seven migration-ledger tables.

The chapter matrix run 41381550461 reports 38 chapter suites, 259 tests passed, 0 failed; its separate `passedChecks` metric is 28. Controlled QA run 41381550356 reports 1,151 passed, 0 failed, 18 skipped. The browser run 41381550319 reports 1/1 passed.

**Browser evidence boundary:** the browser journey uses a synthetic identity provider and in-memory identity/session and ticket stores. It verifies the OIDC browser route, session cookies/CSRF behavior, customer workspace bootstrap, ticket submission/history/reply, protected settings, logout and revoked-session denial. It is not yet an end-to-end browser test against the durable PostgreSQL identity and ticket stores, nor production IdP onboarding evidence.

### Current open-PR and merge inventory

The live open-PR search returns only PR #329. The branch has been reconciled with the latest main; the actual `main...head` file delta is limited to customer portal UI, API server integration, the workspace API contract and the two browser/preview tests. The repository's PR base metadata still shows the older recorded base SHA, so the compare-against-current-main result is the authoritative divergence check.

PR #306 merge `6e8dd438e5091b1802d65e4f29951389fe077859`, PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e`, PR #323 merge `1a31c860e96220f42eef8593221832db5cdbe9d8`, PR #326 merge `6041d08b0de233bc7ffbe643d126b3f75b6b8b97`, PR #328 merge `599691c1d8c39eee74a04f1e9756aa3468ef67e2`, and PR #330 merge `566bd7ffbccf088ab44338e01af5eb572c0bb6c9` were each compared with current main; all are ancestors of the current main commit.

### Seven-checkpoint delta

| Checkpoint | Current status | Evidence and remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | The approved 228 requirements and 38 chapters remain unchanged. The original v34 export remains 45 source rows: 0 exact full-coverage mappings, 45 partial shared-control links and 45 additive v1.6.0 draft candidates. CW-046–055 remain a separate owner-directed commercial addendum. Owner disposition of v1.6.0 remains required. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER operations | Fresh-clone dev verification, seven migration groups including identity, repeatability, live PostgreSQL suites and disposable backup/restore pass on the exact PR head. Production backup destination, encryption/key custody, retention, RPO/RTO and independently witnessed recovery remain. |
| 3. Architecture and execution boundaries | AMBER | Provider-neutral OIDC routes, secure host-only session cookie, CSRF checks, durable session store and tenant/application plus actor/application checks exist. This PR adds the customer browser sign-in/session journey. Production IdP onboarding, durable PostgreSQL browser E2E and support-admin role/delegation integration remain. |
| 4. Workflow execution design and schema | AMBER | Campaign worker and outbox process have continuous execution, claims, lease/fencing, idempotency, bounded retry/dead-letter, policy recheck and graceful shutdown. Keep dispatch disabled: reviewed provider adapter, restricted worker identity, independent supervision, metrics/alerts and restart/recovery proof remain. |
| 5. Integrated validation | GREEN for inspected technical lanes; AMBER journey | Exact-head CI, PostgreSQL, matrix, browser, HTTP, container and release lanes pass. Customer ticket APIs cover scoped create/history/reply and audit; admin queue/assignment/severity/internal-note and export paths exist. A single durable PostgreSQL customer-to-admin browser journey and owner-defined SLA targets/timers/escalations remain. |
| 6. PR consolidation and governance | AMBER | Only PR #329 remains open; it is draft, mergeable and 0 commits behind current main by compare. No submitted review or unresolved inline thread was returned. Main branch protection remains false and repository rulesets remain empty. |
| 7. Workflow publisher/runtime implementation | AMBER | Continuous worker/outbox, lease/fencing, retry/dead-letter, metrics counters and graceful shutdown have implementation/test coverage. Approved production adapter, restricted credentials, host supervision, alerts and recovery rehearsal remain. |

### Release and continuity

Main branch metadata reports `protected=false`; the repository rulesets collection is empty. The detailed branch-protection endpoint remains unavailable to the connected integration. The Engineering Continuity & Independence Charter remains a proposed control baseline requiring owner review. A second engineer has not independently completed the full clone/build/test/change/PR/release/rollback path. Disposable restore smoke is not production disaster-recovery proof.

**Next action:** add a disposable-PostgreSQL browser journey using the durable identity/session and ticket stores; then integrate support-admin OIDC with a reviewed role/delegation model and test customer-to-admin replies/internal-note visibility in one browser flow. Define SLA targets with the owner. Keep campaign dispatch disabled until restricted worker identity, approved adapter, supervision, monitoring and recovery are proven. No merge or external/provider action is authorized by this record.


## Dated engineering record — 2026-11-02 (durable customer browser journey and ticket pagination)

**Main baseline:** `4767042af97aeceaec4b776d587556f1f2da1b7f`.  
**Code-bearing customer-workspace head validated:** `b5260c68a5f9508034584c73a5661f6e1eddd176`. Current-main comparison: 25 commits ahead, 0 behind. PR #329 remains draft and mergeable.

### Durable PostgreSQL browser journey

The browser workflow now starts a disposable PostgreSQL 16 service, runs `npm run dev:verify` (including all migration groups and live integration tests), then runs Chromium against the same database.

The browser test now uses:
- `PostgresCustomerIdentitySessionStore` for durable subject binding, one-time login transaction consumption, session creation, session resolution and logout revocation.
- `PostgresTenantApplicationAssignmentStore` and `PostgresActorApplicationAssignmentStore` for tenant/application and actor/application access.
- `PostgresTicketStore` for ticket creation, history and customer-visible reply.
- The canonical append-only audit writer in the same ticket transaction.

The browser asserts:
- Host-only session cookie is HttpOnly, Secure and SameSite=Lax.
- CSRF cookie is Secure and SameSite=Strict.
- The database stores the session hash rather than the raw browser token.
- The signed-in subject resolves to the bound tenant and actor.
- The assigned application is accessible and an unassigned application is denied.
- Ticket creation persists tenant, application and actor scope plus an audit event.
- Ticket history is read from PostgreSQL; customer reply persists with `author_role=customer` and `visibility=customer_visible`.
- Logout persists session revocation; subsequent protected access is denied.

**Identity boundary:** the browser test uses a synthetic OIDC provider adapter; it proves durable session, assignment and ticket behavior through the real browser routes, but it is not production identity-provider onboarding or real-provider token/JWKS validation evidence. The provider-neutral OIDC protocol implementation remains separately tested. Support-admin OIDC and role/delegation integration remain open.

### PostgreSQL ticket pagination defect found and corrected

The first PostgreSQL-backed browser attempt exposed a real query defect in `PostgresTicketStore.list`: the SQL embedded numeric LIMIT/OFFSET literals while still passing those values in the bind array. PostgreSQL rejected the extra bind values, so the customer UI could create a ticket but could not reload the ticket list to show its conversation action.

The query now builds bound `LIMIT $n OFFSET $n` placeholders from the complete filter parameter list. Unit tests assert placeholder numbering for tenant-only, application, search and cross-tenant cases. A live PostgreSQL integration subtest creates same-tenant and foreign-tenant tickets, then proves filtered pagination returns only the two owned records across separate pages.

### Exact-head evidence

On code-bearing head `b5260c68a5f9508034584c73a5661f6e1eddd176`:
- Fresh-clone `npm run dev:verify` [41383019441](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019441): 1,193 passed, 0 failed, 0 skipped. All seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity) applied and repeated. Disposable backup/restore PASS; 63 source/restored base tables and seven migration-ledger tables.
- Durable customer OIDC browser [41383019540](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019540): 1 passed, 0 failed. The same workflow first completed `npm run dev:verify` with 1,193 passed / 0 failed / 0 skipped, then completed the PostgreSQL-backed browser lifecycle.
- CI [41383019386](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019386): passed.
- PostgreSQL payment/scheduler integration [41383019488](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019488): passed.
- Controlled QA [41383019515](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019515): 1,151 passed, 0 failed, 18 skipped.
- 228/38 matrix [41383019480](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019480): 259 tests passed, 0 failed; separate `passedChecks=28`.
- Integrated same-commit gate [41383019705](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019705): passed.
- G9 [41383019424](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019424), six-family HTTP [41383019545](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019545), container [41383019609](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019609), release build [41383019374](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019374), payment contract [41383019523](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019523), workflow config [41383019594](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383019594) all passed on the same exact head.

### Checkpoint update

| Checkpoint | Updated assessment |
|---|---|
| 1. Product USP and positioning | AMBER — approved 228/38 baseline unchanged; v34 crosswalk and additive candidates still need owner disposition. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER operations — fresh clone, seven-group repeatability, live PostgreSQL tests and disposable restore are proven; production recovery controls/rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER — customer OIDC browser routes now exercise durable PostgreSQL sessions, CSRF and assignment checks with a synthetic provider; production IdP and support-admin role/delegation remain. |
| 4. Workflow execution design and schema | AMBER — durable worker/outbox controls pass; reviewed adapter, restricted identity, independent supervision, alerts and restart/recovery remain. |
| 5. Integrated validation | GREEN for inspected technical lanes; AMBER for full support operations — customer create/history/reply now has durable PostgreSQL browser evidence. Admin browser journey, internal-note visibility through the full browser workflow, SLA policy and timers remain. |
| 6. PR consolidation and governance | AMBER — PR #329 is draft and mergeable, 0 behind by current-main comparison; review still required. Main branch protection remains false and repository rulesets remain empty. |
| 7. Workflow publisher/runtime implementation | AMBER — continuous execution, leases/fencing, idempotency, retry/dead-letter and graceful shutdown have test evidence; production supervision, monitoring and recovery remain. |

**Next action:** extend the PostgreSQL browser test through support-admin authentication, triage, assignment, severity, internal-note/customer visibility and export; define SLA targets with the owner. Complete worker supervision/recovery and the second-engineer release path. No production provider, cloud resource, merge or external dispatch is authorized by this record.


## Dated engineering record — 2026-11-02 09:06 IST

**Integrated main resolved from `refs/heads/main`:** `4767042af97aeceaec4b776d587556f1f2da1b7f`.

### Mainline merge verification

The following merge commits were independently compared with current main and are confirmed ancestors:

- PR #306 — `6e8dd438e5091b1802d65e4f29951389fe077859` (fresh-clone developer setup / PostgreSQL verification).
- PR #310 — `88b9708d748c19dc80a1a2d7ad4960914451db7e` (durable customer identity/OIDC/session foundation).
- PR #323 — `1a31c860e96220f42eef8593221832db5cdbe9d8` (requirements crosswalk and scorecard).
- PR #326 — `6041d08b0de233bc7ffbe643d126b3f75b6b8b97` (isolated campaign worker, disabled by default).
- PR #328 — `599691c1d8c39eee74a04f1e9756aa3468ef67e2` (all-filtered-pages support export).
- PR #330 — `566bd7ffbccf088ab44338e01af5eb572c0bb6c9` (customer lifecycle/tariff controls and tariff catalogue).

Current main exact-SHA Actions passed: CI [41380392656](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380392656), integrated validation [41380392710](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380392710), controlled QA [41380392630](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380392630), 228/38 matrix [41380392631](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380392631), G9 [41380392681](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380392681), six-family HTTP [41380392658](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380392658) and container [41380392617](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41380392617). The current main matrix reports 38 chapter suites, 259 tests passed, zero failed; the separate `passedChecks` field is 28.

### Current open PRs and exact-head evidence

Only PR #329 and PR #331 are currently open. Both remain draft and mergeable; both compare against current main with zero commits behind. Neither has a submitted review or unresolved inline review thread. Both modify `eper/apps/api/server.ts`; integrate PR #329's customer workspace/session behavior first, then rebase and rerun PR #331 against the resulting main.

**PR #329 — customer workspace and durable PostgreSQL support journey**
- Exact head: `af3f983fb4816d5974fcac5bbb811cf99eb5e989`; current-main comparison: 26 ahead, 0 behind.
- Fresh clone [41383338226](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338226): `npm run dev:verify`, 1,194 passed / 0 failed / 0 skipped; all seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity) applied and repeated; disposable backup/restore PASS with 63 source/restored base tables and seven migration ledgers.
- Customer OIDC browser [41383338297](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338297): 1 passed / 0 failed. Uses a synthetic OIDC adapter with real PostgreSQL subject/session, tenant/application and actor/application assignment stores, plus `PostgresTicketStore`. It verifies secure host-only session and CSRF cookies, durable session/revocation, assigned/unassigned application behavior, customer ticket submission, PostgreSQL ticket history/conversation, customer-visible reply and audit event.
- PostgreSQL integration [41383338251](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338251), controlled QA [41383338280](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338280) (1,152 passed / 0 failed / 19 skipped), matrix [41383338258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338258), integrated [41383338467](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338467), CI [41383338213](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338213), payment contract [41383338243](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338243), G9 [41383338263](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338263), HTTP [41383338498](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338498), container [41383338352](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338352), release [41383338260](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338260) and workflow configuration [41383338404](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41383338404) all passed on this exact head.
- Remaining boundary: synthetic IdP is not production provider onboarding. Support-admin browser authentication/role delegation and admin triage/assignment/severity/internal-note browser E2E remain; admin UI still uses a bearer credential. Owner-defined SLA targets, calendars, pause rules and escalation thresholds remain undefined. Customer Plan & Billing view is present, but tariff acceptance is not yet covered by this browser E2E.

**PR #331 — Product Admin customer lifecycle and payment eligibility**
- Exact head: `9b03f89e01187224f1c0f87c9b96c6ae17d6b68f`; current-main comparison: 18 ahead, 0 behind.
- Exact-head failures on the preceding head were traced to test fixtures missing application provenance after the trusted invoice/transaction contract required an application ID. The owning branch's payment-gateway, HTTP invoice-authority and live PostgreSQL snapshot fixtures were corrected. Production validation was not weakened.
- Fresh clone [41384494469](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494469): `npm run dev:verify`, 1,194 passed / 0 failed / 0 skipped; seven migration groups including identity applied and repeated; disposable backup/restore PASS, 63 base tables and seven migration ledgers.
- PostgreSQL integration [41384494662](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494662), payment gateway [41384494438](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494438), browser [41384494459](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494459), controlled QA [41384494463](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494463) (1,152 passed / 0 failed / 19 skipped), matrix [41384494481](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494481), integrated [41384494569](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494569), CI [41384494484](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494484), G9 [41384494543](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494543), HTTP [41384494633](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494633), container [41384494460](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494460) and release [41384494554](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41384494554) all passed on this exact head.
- The Product Admin lifecycle API is role-restricted and versioned; the PostgreSQL store uses the shared tenant-commercial advisory lock, row locking and transactional audit. Live integration proves status change, read-back and stale-version conflict. Payment order reservation constructs `PostgresPaymentStore(paymentPool, true)` and checks active customer status, accepted tariff assignment and application allowance against active tenant application assignments before reserving an order.
- Remaining boundary: customer lifecycle UI and OIDC/delegation browser flow are not in this PR; an injected audit-write-failure rollback case remains useful additional proof. Rebase this PR after PR #329's `server.ts` integration and rerun exact-head checks.

### Seven official checkpoint assessment

| Checkpoint | Status | Evidence and remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | Approved 228 requirements / 38 chapters unchanged. v34 crosswalk and owner-directed additive candidates remain separate from the approved baseline; owner disposition is required. Tariff catalogue, explicit customer acceptance and application-limit enforcement now have code and PostgreSQL tests. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER operations | Fresh-clone `npm run dev:verify`, seven migration groups including identity, repeatability, live PostgreSQL tests and disposable restore pass on both current open heads. Production backup destination, encryption/key custody, retention, RPO/RTO and independent recovery rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER | Provider-neutral OIDC routes, durable PostgreSQL sessions, secure cookies, CSRF and per-request tenant/application plus actor/application intersection are browser-tested with a synthetic IdP. Production IdP onboarding/token/JWKS configuration and support-admin OIDC/delegation remain. |
| 4. Workflow execution design and schema | AMBER | Merged campaign worker and workflow outbox have continuous execution, lease/fencing, idempotency, bounded retry/dead-letter and graceful shutdown evidence. Keep dispatch disabled until reviewed adapter, restricted worker identity, independent process supervision, metrics/alerts and restart/recovery proof exist. |
| 5. Integrated validation | GREEN for inspected technical lanes; AMBER for full support operations | Durable customer-to-ticket PostgreSQL browser journey now passes. Backend support tests cover admin queue, assignment, severity, internal-note visibility and export; support-admin browser journey and SLA policy remain. |
| 6. PR consolidation and governance | AMBER | Only #329 and #331 remain open, both draft/mergeable and zero behind by live comparison. They overlap in `server.ts`; sequence integration and revalidate. Main branch remains unprotected and repository rulesets are empty. |
| 7. Workflow publisher/runtime implementation | AMBER | Continuous worker/outbox and core retry/fencing behavior are implemented. Independent supervision, operational metrics/alerts, restricted credentials and recovery rehearsal remain. |

### Release and continuity boundary

The Engineering Continuity & Independence Charter remains a proposed control baseline requiring owner review. Main reports `protected=false` and the repository rulesets collection is empty. A second engineer has not independently demonstrated the full clone/build/test/change/PR/release/rollback path. Disposable PostgreSQL restore smoke is not production disaster-recovery proof.

**Next action:** complete support-admin OIDC/delegation and the customer-to-admin PostgreSQL browser journey; define SLA policy with the owner; integrate the lifecycle API after the customer workspace PR; finish worker supervision/observability/recovery; obtain repository protection approval and a second-engineer release demonstration. No PR merge, production provider action, external dispatch or chargeable cloud provisioning is implied by this record.


## Exact-head correction record — 2026-11-02 09:08 IST

This follow-up supersedes the PR #329 exact-head value and evidence recorded immediately above.

- Current main remains `4767042af97aeceaec4b776d587556f1f2da1b7f`.
- PR #329 code head after the identity-test correction: `135a9e74fd4df81ef38a538f60b4cac03a9ef28b`; live current-main comparison: 28 commits ahead, 0 behind.
- The first documentation-only scorecard update at `37e680898b1c812cc06e8d23d8b7b6e45e1f529e` triggered a new exact-head browser workflow. Its PostgreSQL/full-suite phase failed at `provider-neutral-oidc-client.test.mjs:81`, test 738, with `Missing expected rejection` for `EPER_OIDC_SIGNATURE_INVALID`. The exact log showed the test changed the final two base64url signature characters to the constant `xx`; that can be a no-op when the random RSA signature already ends in `xx`.
- Focused safe correction on the owning branch: the test now decodes the signature bytes, flips one bit in the first byte and re-encodes the signature. Production OIDC verification code was not changed.
- The new exact code head `135a9e74fd4df81ef38a538f60b4cac03a9ef28b` passed:
  - Fresh clone [41385299019](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299019): `npm run dev:verify`, 1,193 passed / 0 failed / 0 skipped; all seven migration groups including identity applied and repeated; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; disposable backup/restore PASS, 63 source/restored base tables and seven migration ledgers.
  - Customer OIDC browser [41385298972](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385298972): the same full PostgreSQL suite passed 1,193/0/0, then the real-browser customer journey passed 1/1. The browser uses synthetic OIDC but real PostgreSQL session, assignment and ticket stores.
  - PostgreSQL payment-store integration [41385299000](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299000): all executed subgroups passed; the isolated campaign-scheduler dispatch-race test executed 2/2 with zero skips in that PostgreSQL job.
  - Controlled QA [41385299061](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299061): 1,151 passed / 0 failed / 18 skipped.
  - 228/38 matrix [41385299049](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299049): 259 tests passed / 0 failed; separate `passedChecks=28`.
  - EPER CI [41385299017](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299017), integrated same-commit validation [41385299070](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299070), G9 [41385298975](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385298975), six-family HTTP [41385299013](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299013), container [41385299030](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299030), release build [41385299007](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299007), payment gateway [41385298990](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385298990) and workflow configuration [41385299071](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41385299071) passed.
- Exact-head status for PR #331 remains independently green at `9b03f89e01187224f1c0f87c9b96c6ae17d6b68f`; its server changes overlap PR #329 and must be rebased/revalidated after integration.

The scorecard's checkpoint statuses above remain unchanged: persistence is GREEN for local/CI and AMBER operationally; identity, workflow operations, PR governance and release continuity remain AMBER. The customer browser journey is now backed by durable PostgreSQL. Production IdP onboarding, support-admin OIDC/delegation, SLA definition, worker supervision/metrics/recovery, protected branch rules and second-engineer handover remain open.


## Dated engineering record — 2026-11-02 09:49 IST

**Integrated main verified after PR #331:** merge commit `84e984718f1e4af76377ff4901c439f0032a617f` (PR #331, audited Product Admin customer lifecycle controls). The merge commit is the current main tip at the time of this record; it is a descendant of prior main `82a82d92222c613c02e55f01211ecbb32ce63bba`.

### PR consolidation correction

- PR #331 is closed and merged; GitHub reports merge commit `84e984718f1e4af76377ff4901c439f0032a617f`.
- The integrated change set includes 21 files: Product Admin lifecycle store/API, immutable commercial acceptance migration, payment-store eligibility enforcement, invoice/transaction snapshot contract updates and unit/integration tests.
- The merge delta from `82a82d92222c613c02e55f01211ecbb32ce63bba` is 35 commits ahead, 0 behind.
- The previous open-PR snapshot in this document is historical and superseded: a live open-PR search currently returns zero open PRs.
- PR #331's exact PR head `f5883aaf800386ab9d41d9ed5bfc404027142eea` had 14/14 returned PR-triggered workflows completed successfully before merge.

### Post-merge evidence boundary

The available commit-workflow lookup for merge SHA `84e984718f1e4af76377ff4901c439f0032a617f` returns no workflow runs because that lookup only surfaces pull-request-triggered runs. The combined commit status also returns no status contexts. Therefore post-merge mainline CI is **NOT ASSESSED** from the evidence available in this run; do not infer a green mainline from the pre-merge PR checks.

### Seven-checkpoint status adjustment

| Checkpoint | Current assessment | Change / remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | Customer lifecycle and payment entitlement enforcement are now merged. Approved 228 requirements / 38 chapters remain the baseline; v34 crosswalk and additive candidate owner disposition remain open. |
| 2. CI and persistence foundations | GREEN local/PR CI; AMBER post-merge and operations | Prior fresh-clone, migration and live PostgreSQL evidence remains valid for its exact heads. Re-run/verify on merged main SHA; production backup, retention, key custody, RPO/RTO and independent recovery rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER | Lifecycle API is integrated. Customer lifecycle browser/OIDC delegation flow, production IdP onboarding and support-admin role/delegation browser proof remain. |
| 4. Workflow execution design and schema | AMBER | No new evidence changes the prior assessment. Independent worker supervision, restricted identity, metrics/alerts and restart/recovery remain. |
| 5. Integrated validation | AMBER pending merged-main verification | PR #331 had 14/14 PR-triggered checks pass before merge. The merged-main validation is not yet evidenced. Support-admin browser journey and owner-defined SLA policy remain. |
| 6. PR consolidation and governance | AMBER | No open PRs found in live search after #331 merge. Main branch protection/ruleset configuration and independent release controls still require verification and owner action. |
| 7. Workflow publisher/runtime implementation | AMBER | No new operational evidence. Supervision, observability, restricted credentials and recovery rehearsal remain. |

**Next engineering action:** obtain post-merge main-branch workflow evidence for `84e984718f1e4af76377ff4901c439f0032a617f`, fix any regression on a focused branch, then proceed to the customer lifecycle browser/OIDC delegation and support-admin browser journey. No chargeable cloud resources, external dispatch or premature production/UAT authorization.


## Dated engineering record — 2026-11-02 10:46 IST

**PR #336 integrated-main verification completed:** merge commit `83b64c1dad2e324d953678e1e9337b4cfeba7c43`, descended from prior main `71ba622be5bf740d22a531810e41e32436b6e08b`. PR #336 adds read-only Product Admin customer tariff usage visibility (accepted tariff/version, billing basis, application allowance and active assignment count), explicit over-allowance status, tariff effectiveness visibility, and a customer downgrade-form correction that clears stale application-revocation selections when the selected tariff changes.

- Exact PR head: `e892b23b52f1bfe6fa8c422a8a2546ee209775df`.
- Exact-head pre-merge evidence: 16 successful checks, 1 skipped, 0 failures; fresh-clone PostgreSQL verification and Chromium OIDC browser verification passed.
- PR #336 merged using expected exact head; GitHub confirms merge SHA `83b64c1dad2e324d953678e1e9337b4cfeba7c43`.
- Integrated-main technical checks: 12/12 completed successfully, including payment/PostgreSQL/receipt contracts, build-and-test, release/G9 traceability, six capability-family/container checks, six-family local HTTP exercise, 228-requirement/38-chapter matrix, Chromium OIDC browser login/protected access/logout/revocation, and same-commit integrated gate. No technical check failures or pending checks were present in the returned commit check-run set.
- The assignment activation API remains the enforcement boundary for new activations beyond the accepted allowance. Product Admin usage reporting does not revoke existing assignments.

### Seven-checkpoint impact

| Checkpoint | Assessment | Evidence / remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | Product Admin can now inspect accepted tariff and active-application usage, including over-allowance state. Single/multi tariff switching remains subject to explicit customer acceptance and role authorization. Approved 228 requirements / 38 chapters remain unchanged. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER operations | PR #336 exact-head PostgreSQL and integrated-main technical checks passed. Production backup destination, encryption/key custody, retention, RPO/RTO and independent recovery rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER | Customer OIDC browser authentication and durable session revocation pass. The OIDC workspace deliberately resolves to least-privilege `customer-user`; a durable, auditable customer-admin role/delegation assignment path is still required before browser-based tariff acceptance can be exercised end to end. |
| 4. Workflow execution design and schema | AMBER | No new evidence changes the prior assessment; independent worker supervision, restricted identity, metrics/alerts and restart/recovery remain. |
| 5. Integrated validation | GREEN for the inspected technical lanes; AMBER for remaining product journeys | 12/12 returned integrated-main technical checks passed. Customer tariff switching still needs browser coverage backed by trusted persistent customer-admin authorization, including downgrade selection, audit and version-conflict assertions. |
| 6. PR consolidation and governance | AMBER | No open PRs were present before the next work branch was created. Mainline integration is clean; branch protection/ruleset and independent release-governance controls remain. |
| 7. Workflow publisher/runtime implementation | AMBER | No new operational evidence; supervision, observability, restricted credentials and recovery rehearsal remain. |

**Next engineering action:** add durable customer actor role/delegation authorization (without trusting OIDC claims or weakening the least-privilege default), then extend the PostgreSQL Chromium browser journey to exercise the tariff-switch lifecycle as a legitimately authorized customer administrator. No chargeable cloud resources or production external actions are part of this work.


## Current engineering snapshot — 2026-11-03 06:50 IST

This dated addendum supersedes earlier open-PR counts and checkpoint claims above for the current workstream. Historical entries are retained as historical records; do not treat their PR numbers or branch states as current.

### Exact main and active PR heads

- Main snapshot: `51b803193c7009c1e7f8115cbb1022233285e940`.
- PR #348 identity/platform application remediation: head `e726dca47dad27c278ad011abf59f98aff8eb8df`; open, draft, mergeable, 0 commits behind main. Eight returned PR-triggered workflows completed successfully, including PostgreSQL payment-store integration, customer OIDC browser E2E, fresh-clone setup, workflow configuration, payment gateway contracts, controlled QA/UAT simulations and the 228-requirement pilot matrix. The exact-head workflow set does not include the same-commit integrated validation, container runtime smoke or release-candidate build evidence present on #350/#355. The PostgreSQL integration job passed all listed steps, including customer lifecycle, tariff enforcement, role delegation, application remediation, tenant isolation and audit rollback.
- PR #350 Customer Admin workflow rule engine/designer: head `1dca64617ec715de7ec90cff1bbaf57f87c3e7b7`; open, draft, mergeable, 0 behind. Fourteen returned PR-triggered workflows completed successfully. Same-commit integrated validation passed its six-job workflow: container/six-family health, release/G9, payment/PostgreSQL/receipt contracts, UAT readiness audit, and same-commit gate succeeded; the 228-requirement/38-chapter pilot matrix job was skipped in that integrated workflow. Treat the matrix as not re-proven by that workflow.
- PR #355 provider configuration/validation foundation: head `85a16fdff22f2b6e48be2bd918134e81db6cb24f`; open, draft, mergeable, 0 behind. Fourteen returned PR-triggered workflows completed successfully. Same-commit integrated validation passed its six-job workflow: container/six-family health, release/G9, payment/PostgreSQL/receipt contracts, UAT readiness audit, and same-commit gate succeeded; the 228-requirement/38-chapter pilot matrix job was skipped in that integrated workflow. Treat the matrix as not re-proven by that workflow.
- No reviews or inline review threads were returned for these three PRs. All remain drafts. No merge was performed.

### Integration collision map

The three branches are not additive independent patches. Their changed-file sets overlap in API composition and shared entitlement/persistence surfaces:

- `eper/apps/api/main.ts` and `eper/apps/api/server.ts` are modified by all three PRs.
- `eper/packages/workflows/module-entitlement-policy.ts` and `eper/packages/workflows/postgres-module-entitlement-service.ts` are modified by all three PRs.
- #348 additionally changes identity, role delegation, customer provisioning and platform application remediation stores/routes/migrations.
- #350 adds durable workflow-definition drafts, workflow rule-engine behavior and capability composition.
- #355 adds provider connection authorization, durable provider configuration and validation history.

### Seven-checkpoint status — current assessment

| Checkpoint | Assessment | Evidence boundary / next closure condition |
|---|---|---|
| 1. Product USP and requirements | AMBER | Customer lifecycle, tariff enforcement, workflow designer/rules and provider foundations exist on separate draft heads. Preserve the approved 228 requirements / 38 chapters; rerun the pilot matrix after consolidation because #350/#355 integrated runs skipped that job. |
| 2. CI and PostgreSQL | GREEN on inspected PR heads; AMBER for consolidated main | #348 PostgreSQL integration passed; #350/#355 payment/PostgreSQL contract and integrated jobs passed. No combined three-branch exact-head proof exists. No chargeable cloud provisioning. |
| 3. Architecture and execution boundaries | AMBER | Tenant/application boundaries and provider/workflow authorization are covered in branch-level tests. Reconcile shared API composition and entitlement policy on one integration head; verify cross-feature authorization and audit semantics. |
| 4. Workflow execution design and schema | AMBER | #350 durable workflow drafts, publication and rule engine are individually validated. Provider capability composition from #355 and identity/delegation changes from #348 must be exercised together. Operational worker supervision, restricted identity, metrics/alerts and restart/recovery remain separate requirements. |
| 5. Integrated validation | AMBER | #350/#355 same-commit integrated gates passed, but their 228/38 matrix job was skipped. #348 has no same-commit integrated gate in its returned checks. Run one consolidated exact-head gate including pilot matrix, browser, PostgreSQL, container, release and G9 evidence. |
| 6. PR consolidation and governance | AMBER | Three open draft PRs (#348/#350/#355), all 0 behind main, with shared-file collisions. Build a controlled integration baseline and resolve conflicts before marking ready or merging. No merge performed. |
| 7. Workflow runtime and operational readiness | AMBER | Branch-level configuration and execution tests do not establish production operational readiness. Worker supervision, observability, restricted credentials, restart/recovery rehearsal and independent operational ownership remain. |

### Required integration sequence

1. Use #348 as the identity/customer lifecycle and tariff-enforcement foundation; retain its passing PostgreSQL transaction/tenant-isolation evidence.
2. Integrate #350 workflow drafts, rule evaluation and designer onto the same API/entitlement baseline.
3. Integrate #355 provider connections and validation history, resolving shared `main.ts`, `server.ts` and entitlement-service conflicts explicitly.
4. Run the full exact-head integrated suite on the resulting single candidate: build, complete unit suite, PostgreSQL migrations/integration, customer OIDC/browser, workflow configuration, provider authorization/validation, payment/receipt contracts, container/six-family smoke, release artifact, G9 and 228-requirement/38-chapter pilot matrix. No skipped pilot-matrix result may be reported as a pass.
5. Only after that evidence and review, reconsider draft status and merge sequencing. Keep production UAT authorization separate from engineering CI completion.

No PR was merged, no workflow dispatch was initiated, no external provider was activated, and no chargeable AWS resource was provisioned as part of this snapshot.


## Integrated-baseline diagnostic — 2026-11-03 07:00 IST

The documentation PR #356 head `3746a97deec99351a1692e801a2cabe7864c7005` triggered a full same-commit integrated workflow. This run is a check of the current main-based baseline plus the documentation-only change; it is **not** a combined #348/#350/#355 integration candidate.

- G9 reconciliation, release-candidate build, container runtime smoke, six-family HTTP smoke, CI and the separate 228-requirement/38-chapter pilot matrix all completed successfully.
- The integrated gate failed in the Payment API + PostgreSQL + receipt-contract lane. Its full suite reported 1,180 passing, 1 failing and 2 skipped tests.
- The single failure is `live PostgreSQL commercial access guard denies tariff overage...` at `eper/tests/postgres-module-entitlement-commercial-guard.integration.test.mjs:79`. Expected `{allowed:false, reason:"tariff_overage"}`; actual `{allowed:true, reason:"allowed"}`.
- Root cause confirmed by source comparison: main's `PostgresModuleEntitlementService` does not load/evaluate the customer's tariff assignment and active-application count before allowing module access. The #348 head adds the tariff lookup and `evaluateCustomerTariffAccess` enforcement in both module and add-on checks.
- #348's exact-head PostgreSQL integration run `41491401877` has a successful job, including the dedicated step **“Exercise PostgreSQL customer tariff enforcement at protected access checks”** and the module/add-on tariff lifecycle step. This is branch-level proof for the fix, not proof that the three PRs have been integrated together.

**Disposition:** do not merge #356 or declare the baseline integrated gate green on the basis of the other successful lanes. Treat this as a known main-baseline tariff-enforcement defect whose implementation is present on #348 and has a passing dedicated PostgreSQL validation step. The next closure is to validate that implementation together with #350 and #355 on one consolidated exact-head candidate, then rerun the full suite and pilot matrix. No code was changed by this diagnostic note.


## Controlled integration probe — 2026-11-03 07:10 IST

A separate integration branch `integration/eper-348-350-355-candidate` was created at the exact #348 head `e726dca47dad27c278ad011abf59f98aff8eb8df`. Draft integration PR #357 proposes #350 head `1dca64617ec715de7ec90cff1bbaf57f87c3e7b7` on top of that branch; GitHub reports the PR as **not mergeable**. No merge was attempted.

- Git comparison reports the branches diverged from merge base `51b803193c7009c1e7f8115cbb1022233285e940`: the #350 head is 65 commits ahead and 206 commits behind the #348-based integration branch.
- The four previously identified shared files are independently changed on both sides: `eper/apps/api/main.ts`, `eper/apps/api/server.ts`, `eper/packages/workflows/module-entitlement-policy.ts`, and `eper/packages/workflows/postgres-module-entitlement-service.ts`.
- #355 also diverges from the same #348-based integration branch (98 commits ahead, 206 behind) and changes the shared API and entitlement files. This confirms that the branches are not a clean sequential fast-forward chain.
- The not-mergeable result is recorded as an integration blocker; it is not yet attributed to specific textual conflict hunks because the connector's PR metadata does not expose GitHub's conflict paths.

**Disposition:** keep #348/#350/#355 and integration PR #357 unmerged. Do not use a blind PR merge or rewrite any source branch. A real Git merge/rebase workspace is required to resolve and test the shared files against a single candidate. Once conflict resolution is committed on the integration branch, run the full exact-head suite before considering any mainline merge. No source application files were changed in this probe.


## Integrated validation refresh — 2026-11-03 07:06 IST

**Documentation branch head:** `0417f63e4962d3b9e0c6fc92bf05759a1339ede1` (PR #356). The exact-head workflow set has now completed.

- Separate 228 requirements / 38 chapter pilot matrix: **passed**, run [41560649042](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41560649042).
- G9 reconciliation [41560649084](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41560649084), container runtime smoke [41560649060](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41560649060), six-family HTTP smoke [41560649128](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41560649128), release-candidate build [41560649200](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41560649200) and EPER CI [41560649126](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41560649126) passed.
- Same-commit integrated validation [41560649153](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41560649153) **failed**. The 228/38 pilot-matrix job inside this integrated workflow was skipped; the separate pilot-matrix run above is the passing evidence.
- Payment API + PostgreSQL + receipt-contract lane ran 1,183 tests: 1,180 passed, 1 failed, 2 skipped. Failure remains test 614, `live PostgreSQL commercial access guard denies tariff overage...`, at `eper/tests/postgres-module-entitlement-commercial-guard.integration.test.mjs:79`: expected `{allowed:false, reason:"tariff_overage"}`, actual `{allowed:true, reason:"allowed"}`.
- This reproduces the same tariff enforcement defect already diagnosed on main. The implementation and dedicated passing PostgreSQL test are on PR #348, but not yet integrated with #350/#355. It is not a new unrelated failure.

### Integration disposition

- PR #357 remains open/draft and GitHub reports `mergeable=false`; it is a controlled integration probe, not a candidate that has passed combined validation.
- #348/#350/#355 continue to modify the same API composition and entitlement files. No conflict resolution, merge, or source-code modification has been performed by this refresh.
- Keep all feature PRs and the integration probe unmerged. The next engineering action is to resolve the shared-file integration in a real Git workspace, preserve tariff enforcement + workflow rule/designer + provider configuration behavior, and rerun the complete same-commit suite plus the separate 228/38 matrix on one exact candidate.
- No chargeable cloud resources were provisioned and no external provider was activated.

**Seven-checkpoint consequence:** all seven checkpoints remain AMBER pending consolidation. Checkpoint 5 is specifically blocked by the reproduced PostgreSQL tariff-overage failure on the main-based integrated run; the separate pilot matrix pass does not override it. Checkpoint 6 remains blocked by the non-mergeable integration probe and shared-file reconciliation.


## Three-branch file-level integration inventory — 2026-11-03 07:08 IST

A fresh changed-file inventory was taken from PRs #348, #350 and #355 (50, 25 and 28 changed files respectively). Ten paths are changed by more than one PR:

| Shared path | Branch overlap | Integration concern |
|---|---|---|
| `.github/workflows/eper-payment-postgres-integration.yml` | #348, #355 | Reconcile triggers/job steps without dropping either test lane. |
| `eper/apps/api/main.ts` | #348, #350, #355 | Compose feature flags, PostgreSQL readiness and store construction once. |
| `eper/apps/api/server.ts` | #348, #350, #355 | Compose route registration and server options; preserve fail-closed identity, workflow and provider authorization. |
| `eper/packages/workflows/module-entitlement-policy.ts` | #348, #350, #355 | Merge the distinct tariff and add-on denial reasons/evaluators without losing policy semantics. |
| `eper/packages/workflows/postgres-module-entitlement-service.ts` | #348, #350, #355 | Combine tariff lookup/enforcement with workflow entitlement and add-on checks; avoid duplicate or bypassable checks. |
| `eper/packages/workflows/postgres-workflow-actor-role-assignment-store.ts` | #348, #355 | Integrate delegation/role assignment behavior with provider-role authorization. |
| `eper/packages/workflows/postgres-workflow-role-definition-store.ts` | #348, #355 | Preserve delegability metadata and provider role authorization compatibility. |
| `eper/tests/postgres-module-entitlement-service.test.mjs` | #348, #350, #355 | Consolidate overlapping mock/query expectations and regression cases. |
| `eper/tests/workflow-execution-api.test.mjs` | #348, #350 | Retain both delegation and workflow administration authorization assertions. |
| `eper/tests/module-entitlement-policy.test.mjs` | #350, #355 | Deduplicate and preserve the add-on policy cases. |

Additional migration-ordering issue to validate: #348 adds `eper/packages/workflows/migrations/009_workflow_role_delegation_provenance.sql`, while #350 adds `eper/packages/workflows/migrations/009_workflow_definition_drafts.sql`. These are distinct files in the same migration directory but share the `009_` ordinal. The combined migration loader and ordering rules must be inspected; do not assume that distinct filenames make duplicate ordinals safe. #348 also adds migrations 010–013 in that directory.

The patches show material changes, not just import overlap: #348 adds tariff guard evaluation to both module and add-on access; #350 changes entitlement query behavior while adding workflow draft/rule execution; #355 adds provider role authorization and provider connection APIs. The overlapping patches must be composed semantically, not resolved by choosing one branch's file wholesale.

**Disposition:** integration work is now scoped to ten shared paths plus migration ordering. This is a more precise reconciliation checklist, not a completed merge or a claim that all ten files have textual conflicts. Keep source PRs unchanged and unmerged until a full combined candidate passes. No chargeable resources or external provider activation.


## Latest exact-head validation and migration inventory — 2026-11-03 07:10 IST

Documentation head `4102d2f059ad7023c82d978ea422d150700e19db` now has these exact-head outcomes:

- EPER CI [41561074085](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41561074085): passed.
- 228 requirement pilot matrix [41561074043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41561074043): passed as a separate run.
- G9 reconciliation [41561074011](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41561074011): passed.
- Release candidate build [41561074004](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41561074004): passed.
- Container runtime smoke [41561074005](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41561074005): passed.
- Six-family HTTP smoke [41561074026](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41561074026): passed.
- Same-commit integrated validation [41561074033](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41561074033): **failed**. PostgreSQL job 125671547583 completed with 1,180 passing, 1 failing, 2 skipped. The exact failure is still test 614, `eper/tests/postgres-module-entitlement-commercial-guard.integration.test.mjs:11`: expected tariff-overage denial, actual allowed. The same-commit gate failed accordingly. The integrated run's 228/38 matrix job was skipped; only the separate matrix run is passing evidence.

### Migration sequence check

The workflow migration directory was enumerated on main and on the #348/#350/#355 branch heads. Main contains migrations 001–008. #348 adds 009–013; #350 adds a distinct `009_workflow_definition_drafts.sql`; #355 does not add a workflow migration. Therefore the combined #348+#350 candidate contains two distinct files with the same `009_` ordinal. This is a confirmed branch-composition collision. The migration runner's exact ordering and applied-migration tracking behavior still needs source inspection in a local checkout; the GitHub code search did not surface the runner. Do not renumber either migration blindly: first establish dependencies, transaction boundaries, and how the migration runner records applied files.

### Disposition

- The tariff defect is unchanged on this exact-head integrated run; PR #348's isolated branch validation does not fix main or the combined candidate.
- Keep #348/#350/#355 and #357 unmerged. Resolve the shared API/entitlement patches and the duplicate migration ordinal in a real Git workspace, then rerun the full PostgreSQL-enabled suite and a non-skipped 228/38 matrix on one exact candidate.
- All seven checkpoints remain AMBER. No application source code was changed by this validation/documentation cycle. No chargeable cloud resources or provider activations.


## Migration runner semantics correction — 2026-11-03

The duplicate `009_` ordinal is a naming/sequence hygiene issue, **not a demonstrated runtime collision**. Inspection of `eper/scripts/migrate-workflows.mjs` and its shared `runMigrations` implementation confirms that migration filenames are sorted lexicographically, each complete filename is the primary key in `eper_workflow_schema_migrations`, and the runner verifies a SHA-256 checksum before skipping an already-applied migration. Consequently, both distinct `009_` files are discoverable and are deterministically ordered by their full filenames. The workflow-drafts migration sorts before the role-delegation-provenance migration.

The two migration bodies inspected are independent against the existing schema:
- workflow drafts creates `eper_workflow_definition_drafts` and references the existing tenant/application assignment table;
- delegation provenance adds `grantor_actor_id` to the existing actor-role assignment table.

No dependency between these two `009_` files was identified in their SQL. Therefore, do not describe this as a migration-runner collision or assume it blocks execution. It remains advisable to assign unique sequential ordinals in the eventual combined branch for unambiguous human sequencing, but only after confirming the full migration set and preserving migration checksums for any already-applied environment. Never rename an applied migration in place.

### Current consolidation disposition

PR #348, #350 and #355 remain open drafts. Their individual exact-head workflows are green, but the same-commit baseline integration run still fails the commercial tariff-overage guard. PR #357 remains a non-mergeable integration probe. No feature merge is authorized by this evidence alone.


## Exact-head validation rerun — 2026-11-03 01:42 UTC

Commit under test: `fb32abd404cffc61edca635a1898368a3d9f84df`.

Eight independent workflows completed successfully: container runtime smoke, release candidate build, G9 reconciliation, 228 requirement / 38 chapter pilot matrix, controlled QA re-execution, six-family HTTP smoke, controlled technical simulation, and EPER CI.

The same-commit integrated workflow completed with failure:
- Payment API + PostgreSQL + receipt contracts: failed.
- Same-commit integrated gate: failed.
- UAT readiness audit + six-wave technical evidence: passed.
- Container health + six capability families: passed.
- Release artifact + G9 traceability: passed.
- 228/38 matrix was skipped in this integrated workflow (its separate workflow passed).

The failure is unchanged and precisely identified:
`live PostgreSQL commercial access guard denies tariff overage, then restores only the retained application after versioned revocation` returned `{ allowed: true, reason: "allowed" }` where `{ allowed: false, reason: "tariff_overage" }` was expected, at `eper/tests/postgres-module-entitlement-commercial-guard.integration.test.mjs:79`.

This is the same missing tariff-enforcement behavior in the main-based candidate. PR #348 contains a PostgreSQL tariff lookup and guard implementation with a green dedicated branch workflow, but that implementation has not yet been validated in a combined #348 + #350 + #355 candidate. Do not merge any of those feature PRs based solely on their independent branch checks.


## Tariff guard evidence clarification — 2026-11-03 01:44 UTC

The earlier main-based integrated failure must be interpreted precisely: it ran against a main-based documentation commit that did not contain PR #348's tariff guard. It demonstrates that the current main baseline still lacks the guard; it does **not** demonstrate that PR #348's implementation fails.

Verified PR #348 exact-head workflow run `41491401877`, job `postgres-payment-store` (`125435539918`), completed successfully. Its logs explicitly show:
- `postgres-module-entitlement-commercial-guard.integration.test.mjs`: 1 test, 1 pass, 0 fail.
- `postgres-module-entitlement-service.integration.test.mjs`: 1 test, 1 pass, 0 fail.

PR #348, #350 and #355 each have green exact-head workflow sets. However, this is still not a combined integration proof. PR #357 remains non-mergeable; it uses #350 as its head against the #348 integration base, and GitHub reports the branch histories as divergent. The next required proof is a true combined candidate containing #348 + #350 + #355, followed by the full same-commit suite. Do not describe the main-based tariff failure as a failure of #348.


## Three-branch integration conflict inventory — 2026-11-03 01:45 UTC

Changed-file intersections were enumerated from the exact current PR file lists:
- #348 ∩ #350: 6 shared files.
- #348 ∩ #355: 8 shared files.
- #350 ∩ #355: 6 shared files.
- All three touch the same 5 files: `eper/apps/api/main.ts`, `eper/apps/api/server.ts`, `eper/packages/workflows/module-entitlement-policy.ts`, `eper/packages/workflows/postgres-module-entitlement-service.ts`, and `eper/tests/postgres-module-entitlement-service.test.mjs`.

Additional shared files:
- #348/#350: `eper/tests/workflow-execution-api.test.mjs`.
- #348/#355: `.github/workflows/eper-payment-postgres-integration.yml`, `eper/packages/workflows/postgres-workflow-actor-role-assignment-store.ts`, and `eper/packages/workflows/postgres-workflow-role-definition-store.ts`.
- #350/#355: `eper/tests/module-entitlement-policy.test.mjs`.

### Canonical tariff guard decision for integration
The branches implement tariff enforcement differently:
- #348: one entitlement SQL statement joins tariff assignment and counts active tenant application assignments; readiness checks both required tables.
- #350: one entitlement SQL statement uses a LATERAL count for active assignments and joins the tariff assignment; this is the cleanest query shape, but its readiness check must also require the tenant-application assignment table as #348 does.
- #355: runs a separate tariff query before the entitlement query in each access method.

For the combined candidate, retain a **single-statement** access decision (prefer #350's LATERAL count query shape), add #348's explicit readiness check for both tariff and tenant-application tables, and preserve the shared policy evaluator. This avoids a two-statement read window in #355 where tariff/application state could change between the guard query and the entitlement query. Merge #355's provider-specific role permissions and stores separately into the role-definition/assignment code, preserving existing delegation behavior from #348.

No source files were changed in this analysis step. This is an integration resolution instruction, not a claim that the branches have been merged or tested together.


## Dated engineering record — 2026-11-03 15:20 IST

**Dynamically resolved main:** `51b803193c7009c1e7f8115cbb1022233285e940`. The main ref was re-read during this run and still points to this commit.

### Merged foundations and mainline evidence

- PR #306 is closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; compare confirms this merge commit is an ancestor of current main.
- PR #310 is closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; compare confirms this merge commit is an ancestor of current main.
- Main push workflows against the exact current SHA: EPER CI [41436998850](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998850), 228/38 matrix [41436998930](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998930), G9 reconciliation [41436998941](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998941), six-family HTTP [41436998952](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998952), QA [41436998942](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998942), and container smoke [41436998825](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998825) passed.
- Main integrated validation [41436998876](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998876) failed in the live PostgreSQL payment/entitlement job. Exact job log [125249170720](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41436998876/job/125249170720) shows `live PostgreSQL commercial access guard denies tariff overage, then restores only the retained application after versioned revocation`: expected `{ allowed: false, reason: "tariff_overage" }`, actual `{ allowed: true, reason: "allowed" }`. Main is not fully green.

### Current PR consolidation and exact-head evidence

The live open-PR set is #348, #356 and #365. PRs #350 and #357 were closed as superseded only after their workflow head `f6139e92303d3cb0804e69841d7aed0b85f8fd33` was included as the second parent of merge commit `1c6e7b9a7ccdedb6a0c6365d159eefa145f78ba9` in #365. Their Workflow Studio code and draft migration remain in the combined candidate; no source implementation was discarded.

- **PR #348** remains draft at `e726dca47dad27c278ad011abf59f98aff8eb8df`. Its eight exact-head workflows all pass: fresh clone [41491401582](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41491401582), PostgreSQL [41491401877](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41491401877), customer OIDC browser [41491401640](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41491401640), 228/38 matrix [41491401593](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41491401593), plus workflow YAML, QA, payment contracts and controlled technical simulation. The tariff correction is present on this branch; its own branch still lacks the combined release/integration gate.
- **PR #365** remains draft at `b6ccf82f76766346a44f99cad6ec8508c366350f`, based on integration branch `bd93fc6ccb17aa6a472ae4756bf6e1bbd7b8b7a5`, not main. GitHub currently reports it mergeable against that integration base. All nine returned workflows on this exact head pass: workflow YAML [41615317208](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317208), 228/38 matrix [41615317503](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317503), technical simulation [41615317105](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317105), payment contracts [41615317107](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317107), customer OIDC browser [41615317110](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317110), fresh clone [41615317245](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317245), same-commit integrated validation [41615317207](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317207), QA [41615317104](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317104), and live PostgreSQL integration [41615317188](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41615317188).
- The first combined build at `1c6e7b9...` found a duplicated `evaluateCustomerTariffAccess` definition created by the three-way file merge. The duplicate was removed on the owning #365 branch; the new exact head `b6ccf82...` then passed the complete returned workflow set. Checks from the superseded head are not used as current evidence.
- PR #356 is this documentation-only scorecard refresh. Its prior exact head `d29d898...` still reproduces the mainline tariff failure; this new record updates the open-PR and integration evidence.

### Pointer 1 — v34 to approved 228/38 baseline

The mainline crosswalk preserves the original 45 v34 source rows and original acceptance statements. It records 0 exact full-coverage mappings, 45 partial links to shared controls, and 45 additive v1.6.0 draft candidates. The ten owner-directed commercial additions CW-046–CW-055 are separate from the original 45. No exact chapter requirement locator is fabricated; no approved 228 requirement or one of the 38 chapters is changed. Owner disposition of the additive draft remains outstanding.

The #365 exact-head matrix reports 228 requirement rows and 38 chapter suites with no failed chapters; 9 chapters have HTTP pilot applications and 29 do not in this scope. This is automated technical evidence, not feature-by-feature owner acceptance.

### Pointer 2 — reproducible fresh-clone setup

On #365 head `b6ccf82...`, fresh-clone `npm run dev:verify` completed with 1,376 passed, 0 failed and 0 skipped. The script safety-checks loopback/local database identity, typechecks/builds, invokes all seven migration groups twice (payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity), then runs the full suite with live PostgreSQL tests enabled. The run reports `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.

### Pointer 3 — PostgreSQL persistence and recovery

The same fresh-clone run reports `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`, 74 source/restored base tables and 7 migration-ledger tables. The exact-head PostgreSQL lane exercises payment/receipt transactions, customer lifecycle/audit atomicity, tariff enforcement, role delegation/application scope, platform provisioning/remediation, scheduler dispatch race and idempotency. This is disposable local/CI restore proof; production backup destination, encryption/key custody, retention, RPO/RTO and an independent restore rehearsal remain open.

### Pointer 4 — customer identity and provider-neutral OIDC

PR #310 supplies the merged durable identity/OIDC protocol and PostgreSQL session foundation. PR #365 now passes a real Chromium customer OIDC browser journey: customer workspace/support access, protected route, logout and revocation (1/1). The browser job also passes the Product Admin application-remediation journey (1/1), but that path uses the current Product Admin credential flow; it is not Product Admin OIDC.

Customer login is not the remaining blocker. Product Admin catalogue/credential access still uses a bearer credential held in page memory. Durable Product Admin browser OIDC, secure cookies, CSRF, role/assignment integration and its own browser E2E remain outstanding. In addition, `main.ts` still wires the platform-admin credential store and Product Admin provider catalogue repository to the shared payment pool; the store contract requires a separate least-privilege platform-admin pool/role with explicit grants and live privilege tests.

### Pointer 5 — customer workspace and support

The combined candidate's customer browser journey passes. Mainline support tests cover ticket submission, customer list/history/replies, tenant/application scoping, admin queue/triage, assignment, severity/P1 evidence rules, internal-note/customer-reply visibility separation, duplicate disposition and paginated CSV export with formula neutralization. Live PostgreSQL ticketing idempotency/tenant/audit tests are included in the suite.

Service-level policy is not complete: owner-defined SLA targets, service calendars/pause rules, response/resolution timers, escalation thresholds and breach evidence are not yet demonstrated. Support-admin browser authentication/delegation and the full admin-side browser journey also remain.

### Pointer 6 — scheduler, workflow operations and remaining capabilities

The scheduler implementation has a continuous worker loop, durable claims/leases, renewal/fencing, idempotency, bounded retry, dead-letter handling, approved dispatch rechecks, stale-lease recovery and a dispatch-start fence. Tests cover lease loss, pause/cancel races, shutdown around the fence and PostgreSQL restart recovery. The combined candidate adds Customer Admin Workflow Studio, durable drafts, rule graph validation, publication and application-scoped execution integration.

The campaign worker remains disabled until a reviewed deployment-owned adapter is supplied. The API does not start the worker; it must run as a separately supervised process. Production supervision, restricted worker identity, delivery metrics/alerts, load evidence and an independently rehearsed recovery path remain open. No real provider dispatch was run.

### Pointer 7 — release and independent handover

The #365 exact-head same-commit gate passes release artifact packaging/checksum and G9 traceability; its local restore smoke passes. This does not establish production recovery. The repository rulesets API returns an empty collection; the branch-protection endpoint returns HTTP 403 to the connected integration, so required protection settings cannot be certified. A second engineer has not yet demonstrated the full clean-clone/build/test/PR/release/rollback path.

### Seven-checkpoint assessment

| Checkpoint | Assessment | Evidence and remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | Original v34 crosswalk preserved; additive v1.6.0 draft still needs owner disposition. |
| 2. CI and persistence foundations | AMBER overall; candidate GREEN | Main integrated PostgreSQL check fails; #365 exact-head fresh clone, seven migration groups/repeatability, live PostgreSQL and disposable restore pass. Production DR remains open. |
| 3. Architecture and execution boundaries | AMBER | Customer OIDC/session/tenant access browser proof passes; Product Admin OIDC and restricted platform-admin DB role/pool remain. |
| 4. Workflow execution design and schema | GREEN candidate; AMBER operations | Workflow Studio drafts/rules/publication integrate and pass; worker adapter/supervision/metrics/recovery remain. |
| 5. Integrated validation | RED main; GREEN candidate | Main tariff-overage assertion fails; #365 combined exact head passes same-commit validation. |
| 6. PR consolidation and governance | AMBER | #350/#357 duplicates closed with code preserved in #365; branch protection/ruleset access and independent review remain. |
| 7. Workflow publisher/runtime implementation | AMBER | Publisher and worker mechanics have tests; production adapter, supervised host, observability and recovery proof remain. |

**Next engineering actions:** (1) implement the dedicated least-privilege platform-admin pool/role and explicit grants, with live PostgreSQL credential/catalogue transaction and privilege tests; (2) complete Product Admin OIDC/session and support SLA/admin browser work; (3) supply and supervise the scheduler adapter with metrics/recovery; (4) obtain owner-accessible branch/ruleset evidence and complete second-engineer handover; (5) only then reconcile the combined candidate to main, verify the merge SHA and rerun exact-main integrated validation.

## Exact-head follow-up — 2026-11-03 15:26 IST

This follow-up supersedes the PR inventory and #365 candidate-head references in the 15:20 record above.

### Consolidated candidate refresh

PR #365 is now at exact head `f53b58afe7727965540a74e828ecaea4fe8da11c`, base `integration/eper-348-350-355-candidate` at `bd93fc6ccb17aa6a472ae4756bf6e1bbd7b8b7a5`. It remains draft and is mergeable against that integration base, not main.

PR #368's exact head `25f546591e2e4dfcd3a428018a6785886ff0be9c` was integrated as the second parent of `f53b58afe7727965540a74e828ecaea4fe8da11c`. Its migration 014 and checksum-ledger test are preserved. The duplicate `009_workflow_definition_drafts.sql` from the earlier Workflow Studio branch was removed; `014_workflow_definition_drafts.sql` is the single appended draft-table migration after the existing workflow migration sequence 001–013. PR #368 was closed as superseded after the combined candidate passed. PR #350 and #357 remain closed as superseded; their Workflow Studio implementation is retained in the #365 merge ancestry.

All nine returned workflows for exact head `f53b58a...` completed successfully:
- Fresh clone [41616442181](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616442181): `npm run dev:verify`, 1,378 passed / 0 failed / 0 skipped. It invokes all seven migration groups twice (payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity); workflow migration 014 is applied. `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- Disposable PostgreSQL backup/restore in the same fresh-clone job: `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`, 74 source/restored base tables and 7 migration-ledger tables.
- Live PostgreSQL lane [41616442009](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616442009): 1,362 tests, 1,360 passed / 0 failed / 2 skipped. Migration 014 applied; workflow and ticketing repeatability checks pass. Payment/receipt, tariff, customer lifecycle/audit, role/application scope, provisioning/remediation and scheduler dispatch/idempotency steps pass.
- Customer browser E2E [41616442274](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616442274): 1,378 passed / 0 failed / 0 skipped; customer OIDC workspace/support journey 1/1 and Product Admin application-remediation browser journey 1/1. The Product Admin journey uses the current bearer-credential flow, not Product Admin OIDC.
- 228/38 matrix [41616441975](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616441975): 228 requirements, 38 chapters, 0 failed chapters; 9 chapters have HTTP pilot applications and 29 do not in this scope.
- Same-commit integrated validation [41616442115](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616442115): PASS, including release artifact/G9 traceability and container health/six-family HTTP checks.
- Workflow YAML [41616442084](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616442084), payment contracts [41616442049](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616442049), controlled QA [41616441949](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616441949), and technical simulation [41616442056](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616442056) all pass.

### Current open PR inventory

The current open PRs are #348, #356 and #365. #350, #357 and #368 are closed as superseded with their code/tests retained in #365. #348 remains the focused main-based identity/tariff source PR; its eight exact-head workflows pass, but its own branch does not carry the combined same-commit release/integration gate. #356 is this documentation-only scorecard PR. #365 is the combined integration candidate and remains draft.

### Documentation PR exact-head boundary

PR #356 current head is `71d38343dd766b335bfd4afe6c51605dbde80fb1`. Its CI, G9, 228/38 matrix, six-family HTTP, release-candidate build, container smoke and controlled QA pass. Its same-commit integrated validation [41616217592](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616217592) fails in the payment/PostgreSQL job [125850214139](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41616217592/job/125850214139) with the same mainline tariff-overage mismatch: expected deny `tariff_overage`, actual `allowed`. Test summary: 1,183 total, 1,180 passed, 1 failed, 2 skipped. This documentation branch does not contain the tariff correction.

### Mainline remains unchanged

The main ref was re-resolved and remains `51b803193c7009c1e7f8115cbb1022233285e940`. The main integrated failure is still present; the corrected tariff policy has not been merged to main. Do not use green candidate runs as mainline evidence.

The repository rulesets API returned an empty collection, while the branch-protection read returned HTTP 403 to the connected integration. This does not prove that branch protection is disabled; it means required settings cannot be independently certified through the current permission boundary. A second-engineer release/rollback demonstration remains absent.

**Next actions:** retain #365 as the single combined candidate; implement a dedicated least-privilege platform-admin database pool/role and explicit grants with live PostgreSQL privilege/transaction/audit tests; complete Product Admin OIDC, support SLA/admin browser evidence and supervised scheduler metrics/recovery; obtain owner-accessible ruleset evidence and a second-engineer handover; then reconcile to main and require a new exact-main integrated pass.