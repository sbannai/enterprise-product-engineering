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


## Dated operating update — 2026-11-02 19:23 IST

**Dynamically resolved main SHA:** `51b803193c7009c1e7f8115cbb1022233285e940`  
**Validated consolidated candidate:** `bc08504580d3c8906693597e97c34f40ea00ef3c` (PR #348).  
**Approved baseline:** 228 requirements across 38 chapters; no approved baseline requirement or chapter was changed in this update.

### Mainline evidence and regression

The exact-main push workflow set for `51b803193c7009c1e7f8115cbb1022233285e940` contains successful EPER CI [41436998850], G9 [41436998941], 228/38 matrix [41436998930], six-family HTTP [41436998952] and container runtime [41436998825]. The same-commit integrated gate [41436998876] failed because the PostgreSQL commercial guard test at `eper/tests/postgres-module-entitlement-commercial-guard.integration.test.mjs:79` expected `allowed:false, reason:tariff_overage`, but the current-main implementation returned `allowed:true, reason:allowed`. The exact failed job is `Payment API + PostgreSQL + receipt contracts`; its full suite reported 1,183 tests, 1,180 passed, 1 failed and 2 skipped. The same failure recurred on documentation-only PR #349 because that branch is based on this main SHA. This is a mainline implementation regression, not a runtime change in #349.

PR #348 contains current main as an ancestor and the corrected shared tariff policy / PostgreSQL access implementation. Its exact-head live PostgreSQL commercial guard test passes. Main remains RED for this regression until the consolidated implementation is integrated.

### Current open PR inventory and exact-head evidence

- **#338 — `9e40cedef2bcb8a1fdeafac2d3a28aa3ff32da9e`:** scoped Customer Admin role delegation and durable grant/revoke provenance. Fresh clone [41400039825], PostgreSQL [41400039879] and Chromium customer OIDC [41400039678] all passed. Fresh-clone suite: 1,217 passed, 0 failed, 0 skipped; seven migration ledgers and disposable backup/restore passed. Branch is one commit behind current main.
- **#340 — `60cf23a75bcd9084988f5e460237064db4d7cff6`:** explicit application-scoped role metadata. Its exact-head matrix [41401119864] and QA [41401119813] passed; QA reported 1,175 passed, 0 failed, 22 skipped, and the matrix reported 28 passed checks. No fresh-clone or live PostgreSQL run was returned for this exact head; successor #341 has combined-stack fresh-clone and PostgreSQL evidence. Branch is one commit behind current main.
- **#341 — `411afad009c1f6d5bda6dc9367c6ff74159b5ba4`:** trusted platform Customer Admin provisioning/recovery boundary. Fresh clone [41423006074] passed with 1,237/0/0, seven migration ledgers and disposable restore; PostgreSQL [41423006246] passed role-delegation (2/2), first-admin provisioning (1/1) and scheduler dispatch-race (2/2) integration cases. Empty-tenant canonical role bootstrap and production platform identity lifecycle remain. Branch is one commit behind current main.
- **#347 — `e001912df9c65f2625b8ca46e3f5912c33d26f52`:** independently assignable `application:remediate` authority. Fresh clone [41423219255] passed with 1,238/0/0 and disposable restore; PostgreSQL [41423219202] passed. It is permission-only; the mutation is in #348. Branch is one commit behind current main.
- **#348 — `bc08504580d3c8906693597e97c34f40ea00ef3c`:** transactional platform application remediation, commercial tariff enforcement, Product Admin tariff/customer lifecycle integration and the customer browser support journey. All eight returned exact-head PR workflows passed: fresh clone [41455018098], PostgreSQL [41455018146], customer OIDC browser [41455018018], 228/38 matrix [41455018024], controlled QA [41455018151], payment contracts [41455018093], workflow configuration [41455018155], and the additional technical simulation [41455018084]. Fresh clone ran `npm run dev:verify`: 1,256 passed, 0 failed, 0 skipped; all seven migration groups including identity were applied and repeated; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; disposable PostgreSQL backup/restore `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; seven migration-ledger tables. Live PostgreSQL tests passed customer lifecycle/audit atomicity, tariff overage enforcement, module/add-on tariff lifecycle, role delegation, platform provisioning, application remediation with tenant isolation/audit rollback, and scheduler dispatch/idempotency. Chromium passed customer OIDC/workspace/support (1/1) and Product Admin application remediation (1/1). No same-commit integrated-gate run was returned for this exact head. It contains current main (zero commits behind) but remains stacked on #347 and draft.
- **#349 — `ae1aed1f401ff7dd3ffb5c619f594cd83f4d5a84`:** documentation-only Customer Admin Rule Engine / Visual Workflow Designer candidates CW-056 and CW-057. The approved 228/38 baseline is unchanged and no runtime behavior is changed. Its exact-head CI [41455570979] failed only in the inherited mainline PostgreSQL commercial guard described above; the 228 matrix, EPER CI, G9, six-family HTTP, container, release build and controlled QA workflows passed. Keep the failure attributed to main until #348 is integrated; do not alter the approved baseline.

### Merged foundation verification

- PR #306 is closed/merged as `6e8dd438e5091b1802d65e4f29951389fe077859`. Current main is a descendant (compare: 200 commits ahead, 0 behind). It is not an open PR.
- PR #310 is closed/merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Current main is a descendant (compare: 199 commits ahead, 0 behind). Its merged scope is the durable identity/OIDC protocol foundation; subsequent browser routes, secure cookies, CSRF, role/assignment integration and browser coverage are later changes.

### Seven-checkpoint assessment

| Checkpoint | Status | Current evidence and remaining blocker |
|---|---|---|
| 1. Product USP and positioning | AMBER | Commercial access guard, application remediation and Product Admin usage/lifecycle UI are implemented and PostgreSQL/browser-tested on #348. The v34 crosswalk and additive candidate requirements remain separate from the approved 228/38 baseline; owner disposition is pending. CW-056/057 are draft candidates, not delivered runtime capabilities. |
| 2. CI and persistence foundations | AMBER | #348 exact-head fresh-clone, seven migration groups, repeatability, live PostgreSQL integration and disposable restore pass. Historical result at that earlier snapshot; superseded by the exact-main integrated validation on SHA `2c380d79c55c9183a42ed534ffd1a504f7d41316` (run [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913)), which passed 1,410 tests: 1,404 passed, 0 failed, 6 skipped. Production backup destination, encryption/key custody, retention, RPO/RTO and independent recovery rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER | Provider-neutral OIDC, browser callback/session, secure cookies, CSRF, tenant/application assignment and role delegation have exact-head browser/PostgreSQL evidence with a synthetic IdP. Production IdP onboarding/token/JWKS, operator MFA/credential lifecycle and empty-tenant first Customer Admin bootstrap remain. |
| 4. Workflow execution design and schema | AMBER | Continuous worker/outbox processing, lease renewal/fencing, idempotency, bounded retry, dead-letter handling, audited inspection/replay and graceful shutdown/recovery have test evidence. Independent host supervision, restricted production worker identity, approved dispatcher and operational alerts remain. |
| 5. Integrated validation | RED on current main; AMBER on consolidated candidate | Historical status from that snapshot; superseded by the exact-main integrated validation on SHA `2c380d79c55c9183a42ed534ffd1a504f7d41316` (run [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913)), which passed the commercial guard and PostgreSQL suite. |
| 6. PR consolidation and governance | AMBER | Open work is #338 → #340 → #341 → #347 → #348 plus documentation-only #349. The first four feature heads are one commit behind current main; #348 contains current main and validates the combined stack. No merge was performed. Branch-protection read returned HTTP 403 from the connected GitHub integration, so current protection/ruleset state is NOT ASSESSED in this update; do not assume it is enabled. |
| 7. Workflow publisher/runtime implementation | AMBER | Worker core and failure-path tests pass. Restricted worker identity, independent process supervision, dispatcher approval/configuration, delivery dashboards/alerts, load/recovery evidence and independent operator handover remain. |

### Next concrete actions

1. Consolidate the #338 → #340 → #341 → #347 → #348 stack into one reviewable main-targeted change; preserve every ancestor change and rerun exact-head CI after any base/head change.
2. Integrate the corrected commercial guard so the current-main PostgreSQL and same-commit integrated gate become green.
3. Keep #349's CW-056/057 candidates separate from the approved baseline and reconcile its inherited CI failure after main is corrected.
4. Complete empty-tenant Customer Admin bootstrap, authenticated support-admin journey and owner-defined SLA policy.
5. Finish restricted worker identity, independent supervision, alerts, backup/recovery runbooks and second-engineer release demonstration.

No approved requirement or chapter was edited. No branch was deleted, no merge was performed, no chargeable cloud resource was provisioned, and no real external/provider action was triggered.


## Dated operating update — 2026-11-03 (mainline validation and PR/branch consolidation)

**Assessment baseline:** main `a3635ffbb522488163904c1236fed294b0a2af17`.  
**Repository inventory snapshot:** 345 pull-request records returned across the four queried pages (256 merged; 89 closed without merge); 363 branch refs (362 non-main); zero open PRs observed. This is an inventory snapshot, not a completed content audit of every closed PR or branch.

### Exact-main technical evidence

- Main integrated gate [run 41657986233](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986233) passed, including payment API/PostgreSQL/receipt contracts, G9 traceability, the 228-requirement / 38-chapter matrix, six capability-family HTTP/container checks, UAT readiness technical evidence and the same-commit integrated gate.
- Main CI [run 41657986202](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986202) passed, including ephemeral PostgreSQL migrations, live PostgreSQL workflow tests and scheduler/capability/ticketing migration coverage.
- Provider worker lifecycle [run 41657986283](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986283) passed.
- Fresh-clone verification [run 41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) passed on candidate commit `2c426de8b63e437ffb186ed4887da76b4b704719`: 1,422 passed, 0 failed, 4 skipped. Its Git tree SHA `0c01985a303e9348e728acd04b0a55a80020f9a9` matches the current main tree exactly. This is exact-tree evidence, not a run whose commit SHA is the main merge commit.

### PR and branch governance findings

- PR #376 merged on 2026-11-03 and consolidated Customer Admin, workflow and provider-connection foundations. PR #362 merged the provider permission vocabulary into durable application roles.
- A sampled compare of closed-unmerged PR heads against current main found nine distinct branch heads with zero unique commits relative to main; these are cleanup candidates only after branch-owner and reference checks. No branch was deleted.
- Seven sampled branch heads remained divergent at commit ancestry level (#361, #360, #356, #355, #349, #327 and #325). File-level inspection refines that result:
  - #361: both actor-role implementation/test and role-definition implementation are now on main; its role-definition test has subsequently evolved on main. The provider permission vocabulary is covered by merged #362. Candidate for closure/archive after final reference check.
  - #360: the atomic tariff/entitlement access query is present on main; current main's entitlement tests are more extensive. Candidate for closure/archive after final reference check.
  - #355: provider validation store, authorization boundary, validation service, provider API contract and customer provider-connection wireframe match main in inspected files. Main's provider repository additionally contains `createAndBindApplication`. No missing implementation was identified in the inspected subset; complete changed-file audit remains before archive.
  - #325: worker entrypoint and adapter match main; current main's worker entrypoint test and package manifest have evolved beyond the branch. Operations documentation still needs final comparison before archive.
  - #356 and #327: scorecard-only historical branches; reconcile their documentation against this current scorecard before archive.
  - #349: documentation-only requirements/USP changes; preserve the approved 228/38 baseline and reconcile the draft additions before archive.
- The sampled findings do not justify deleting branches automatically. Unique ancestry alone is not proof of missing code, and matching selected files is not a substitute for checking every changed path.

### Seven-checkpoint assessment

| Checkpoint | Status | Evidence and remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | Customer Admin, workflow and provider foundations are integrated. Commercial billing/invoice reconciliation, requirement-candidate owner disposition and full customer journeys remain. Approved 228 requirements / 38 chapters remain unchanged. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER operations | Current-main CI and PostgreSQL migration/workflow lanes pass; fresh-clone verification passes against the exact current main tree. Production backup destination, encryption/key custody, retention, RPO/RTO and independent recovery rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER | Tenant-scoped persistence and provider permission vocabulary are integrated. Full delegation/threshold/separation-of-duties coverage, production identity lifecycle and operational controls remain. |
| 4. Workflow execution design and schema | AMBER | Workflow design/persistence and worker foundations are present. Complete event delivery/replay, approved production adapter, restricted worker identity and independent supervision remain. |
| 5. Integrated validation | GREEN for inspected technical lanes; AMBER for end-to-end product journey | Current-main integrated gate, CI, provider worker lifecycle and exact-tree fresh-clone evidence pass. This does not establish complete business acceptance or production readiness. |
| 6. PR consolidation and governance | RED | No open PRs were observed, but 89 closed-unmerged PR records and 362 non-main branches require systematic disposition. Main branch reports `protected=false`; repository rulesets collection is empty. Branch protection must be enabled by a repository administrator; no settings change was made. |
| 7. Workflow publisher/runtime implementation | AMBER | Worker lifecycle technical checks pass. Restricted credentials, independent host supervision, operational metrics/alerts, load/recovery rehearsal and operator handover remain. |

### Next controlled actions

1. Complete changed-file reconciliation for the sampled provider, scheduler and documentation branches; then extend the same classification to the remaining closed-unmerged inventory.
2. Produce one branch disposition register with evidence, owner/reference checks and explicit keep/archive recommendations. Do not delete unique or unreviewed branches.
3. Ask a repository administrator to enable main-branch protection and required status checks; verify the resulting ruleset and required contexts.
4. Keep Business UAT unauthorized until all existing entry gates are evidenced and the owner explicitly authorizes it.

No code merge, branch deletion, branch-protection change, chargeable cloud provisioning or real external/provider action was performed in this update.


## Dated operating update — 2026-11-03 15:12 UTC (PR lineage reconciliation)

**Current main SHA:** `a3635ffbb522488163904c1236fed294b0a2af17`. The main branch API confirms `protected=false`; required status checks are not enforced. Repository administrator action is still required.

### Consolidation since the previous snapshot

- PR #376 merged the Customer Admin, workflow and provider-connection integration (70 changed files; merge SHA `9749701bfed527b906183192ca06cc1998e70166`).
- PR #365 merged the Product Admin provider-catalogue persistence foundation.
- PR #369 merged the isolated privileged PostgreSQL pool changes.
- PR #370 merged the provider defaults, durable provider-operation lifecycle and privileged-role CI proof as the current main commit `a3635ffbb522488163904c1236fed294b0a2af17`.
- PR #355 is superseded by the integrated provider implementation in #376/#365/#369/#370. Its old branch is historical; do not reopen or merge it.
- PR #325 is superseded by clean-mainline worker PR #326, which is merged. Its old branch is historical; do not reopen or merge it.
- PR #349's CW-056 and CW-057 draft additions are present in both the mainline v1.6.0 draft change-control register and USP/completeness register. They remain draft candidates; their presence does not amend the approved 228-requirement / 38-chapter baseline.
- PR #356 is closed unmerged and is an obsolete scorecard snapshot. PR #327 is closed unmerged and explicitly superseded by #323. Their historical branches are not active work.
- PR #377 is the sole open PR returned by the current open-PR query. It is documentation-only, draft, and based on the exact current main SHA above. Its nine applicable PR workflows all completed successfully, including same-commit integrated validation. The 228/38 matrix workflow was skipped within that integrated matrix by design, but the separate 228/38 workflow passed.

### Governance disposition

The current PR queue is no longer a multi-PR dependency stack: only #377 is open. This is a meaningful improvement, but it does not mean the closed-unmerged branch inventory is clean. Branch deletion remains blocked on a complete owner/reference audit and an available authorized deletion path. Main branch protection remains disabled; no settings mutation was performed.

### Seven-checkpoint delta

| Checkpoint | Status | Delta / remaining boundary |
|---|---|---|
| 1. Product USP and positioning | AMBER | Provider defaults and durable operation lifecycle are integrated. CW-056/057 remain draft; full customer-facing workflow and provider journeys still need end-to-end proof. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER operations | #370 exact-head evidence passed fresh-clone, live PostgreSQL and integrated checks as recorded in its PR. Production role provisioning, secret custody, backup retention and independent restore remain. |
| 3. Architecture and execution boundaries | AMBER | Separate privileged pools and disposable CI role-contract tests exist. Production role ownership, memberships, grants and independent least-privilege review remain. |
| 4. Workflow execution design and schema | AMBER | Provider defaults, operation queue, leases and fencing are durable. Encrypted payload storage and authorized reference resolution remain. |
| 5. Integrated validation | GREEN for exact technical lanes; AMBER for product/operations | #377's nine applicable workflows passed. This is not business acceptance, production-readiness evidence or UAT authorization. |
| 6. PR consolidation and governance | AMBER for open-PR queue; RED for branch controls | One open PR (#377); closed branch inventory still needs full disposition. Main protection is explicitly disabled. |
| 7. Workflow publisher/runtime | AMBER | Provider-operation lease/recovery lifecycle is tested in PostgreSQL. A supervised provider-operation worker, recovery scheduler, approved adapter, payload store, metrics and alerting remain. |

### Next controlled actions

1. Review #377 and merge only after human review; do not auto-merge merely because checks pass.
2. Complete the full closed-unmerged PR/branch owner and reference audit before branch deletion.
3. Have a repository administrator enable branch protection and required checks, then verify the actual resulting configuration.
4. Keep real provider dispatch disabled until payload storage, reviewed adapters, secret resolution, production roles, recovery scheduling and independent supervision are proven.
5. Preserve the existing Business UAT prohibition until every entry gate is evidenced and the owner explicitly authorizes it.

No branch was deleted, no protection setting was changed, no chargeable cloud resource was provisioned, and no Business UAT or external provider action was authorized.


## Correction — historical evidence disposition for PR #356 (2026-11-03 15:16 UTC)

A deeper content comparison supersedes the earlier shorthand that described PR #356 as an obsolete scorecard snapshot.

PR #356 is closed unmerged, but its branch contains 13 dated engineering/evidence sections absent from the current main scorecard. The branch is therefore a **historical evidence-recovery candidate**, not an archive/delete candidate. Its contents include exact-head validation records, migration-runner semantics corrections, tariff-guard evidence clarification, branch integration inventories, and provider payload migration 017. Several entries also contain stale main SHAs, superseded PR states and historical failures. Do not merge the branch wholesale and do not delete it.

**Required handling:**
1. Preserve the branch and patch as an evidence source.
2. Reconcile each dated section against current GitHub commit/run/PR evidence and current main before carrying forward any statement.
3. Copy only still-relevant historical facts into a new dated addendum, explicitly labeling superseded snapshots and resolved failures.
4. Keep current-main status authoritative; do not allow stale historical claims to overwrite current checkpoint status.

PR #327 remains a different case: its patch is limited to scorecard baseline/header corrections and its work is represented by the merged #323 successor. It is a candidate for historical branch archival only after owner/reference checks.

The all-PR inventory returned 346 PRs: 256 merged, 89 closed unmerged, and one open (#377). This is the PR inventory, not a branch inventory; it does not establish that all 89 historical branch refs have been reviewed.

### Exact-head validation status for this scorecard revision

For commit `4852fd6d0063fe13c5c77baa74c24136aa7be46c`, the latest poll returned 10 successful checks, 2 still in progress, 1 skipped, and 0 failures. The skipped 228/38 integrated subjob is complemented by a separate chapter-pilot-matrix workflow that passed. The remaining in-progress checks are the full PostgreSQL-enabled test suite and the overall CI build-and-test job. Do not report this revision as fully green until both finish successfully.


## Correction — exact-head validation for PR #377 (2026-11-03)

This section supersedes the preceding “Exact-head validation status for this scorecard revision” snapshot for commit `4852fd6d0063fe13c5c77baa74c24136aa7be46c`. That earlier poll was incomplete and is not the status of the current PR head.

- Current PR head at the time of this validation: `4f7d5eba641d74b4fa78073feaeb6c44936991a7`.
- Base: `main` at `a3635ffbb522488163904c1236fed294b0a2af17`.
- GitHub reports the PR open, draft, and mergeable; it changes only this scorecard file.
- All nine PR-triggered workflow runs for the exact head completed successfully: EPER CI [41662136763](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136763), same-commit integrated validation [41662136751](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136751), controlled QA [41662136701](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136701), controlled technical simulation [41662136693](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136693), G9 [41662136791](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136791), separate 228/38 chapter matrix [41662136660](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136660), six-family HTTP [41662136616](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136616), container runtime [41662136601](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136601), and release candidate [41662136617](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41662136617).
- The integrated workflow’s separate 228/38 subjob was skipped because this documentation-only PR does not change requirement or chapter inputs; the standalone chapter matrix workflow passed on the exact same head.
- The integrated gate log confirms payment/PostgreSQL, runtime, release/traceability and readiness technical lanes completed on the same source commit. The full PostgreSQL job and EPER CI both completed successfully; no failed exact-head checks remain.

### Current main evidence (same assessment window)

- Main SHA: `a3635ffbb522488163904c1236fed294b0a2af17`.
- Main integrated validation [41657986233](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986233), EPER CI [41657986202](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986202), provider-operation live PostgreSQL lifecycle [41657986283](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986283), G9 [41657987071](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657987071), six-family HTTP [41657986237](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986237), container [41657986238](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986238), controlled technical simulation [41657986197](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986197), controlled QA [41657986265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986265), and 228/38 matrix [41657986248](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657986248) all completed successfully on the exact main SHA.
- The provider-operation PostgreSQL lifecycle test passed claim, renewal, fencing, retry exhaustion and expired-lease recovery against PostgreSQL (1 passed, 0 failed).
- Fresh-clone verification [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) ran `npm run dev:verify` on candidate `2c426de8b63e437ffb186ed4887da76b4b704719`, with 1,422 passed, 0 failed and 4 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS` and `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`. Its Git tree SHA `0c01985a303e9348e728acd04b0a55a80020f9a9` matches main's tree. This is exact-tree evidence, not a run whose commit SHA is the main merge commit.

These are technical validation results only. They do not establish production readiness, business acceptance, or authorize UAT. Branch protection remains disabled and requires repository-administrator action. No chargeable cloud resources or real external/provider actions were used.


## Branch-ref reconciliation correction — 2026-11-03 15:19 UTC

The first 22-branch comparison has been completed against main SHA `a3635ffbb522488163904c1236fed294b0a2af17`. The earlier narrative count needs correction: it identified **17 zero-ahead branches** and **5 unique-commit branches**, not 18 and 4. The five unique branches contain six commits in total:

- `fix/b01-lld-evidence-intermediate-state` — 1 unique commit; one test file differs from main. The mainline test has since broadened allowed baseline states, so do not transplant blindly.
- `fix/eper-ci-node-types` — 1 unique commit; package metadata is older than main and omits current scripts and PostgreSQL dependency.
- `release/eper-0.1.0-rc2` — 1 unique commit; release workflow predates current mainline concurrency, permissions, timeout, container build and smoke-test safeguards.
- `release/eper-0.1.0-rc4` — 2 unique commits; release workflow predates the same current safeguards. Review the packaging/versioning delta before disposition.
- `work/ch463-contract-draft-domain-reconciliation-2026-10-19` — 1 unique commit; Chapter 463 contract draft is materially superseded by the current mainline draft, including the approved source-precedence correction, but retain its historical decision rationale for audit.

The other 17 branches are zero-ahead against main by Git ancestry. This is a strong candidate classification only, not permission to delete: refs may still be used by tags, workflow triggers, deployment/release records, or external collaborators. Preserve them pending reference and owner checks.

This correction supersedes the previous sentence stating 18 zero-ahead and four exceptions. The inventory covers 22 unreferenced branch refs found in the four-page branch listing, not every branch in the repository.


## Unique-branch patch review — 2026-11-03 15:22 UTC

The five divergent refs were reviewed at patch level against main SHA `a3635ffbb522488163904c1236fed294b0a2af17`. Their unique changes are narrow and do not justify merging the stale branches wholesale:

- `fix/b01-lld-evidence-intermediate-state` (commit `0fa98f3807e7630f08d3b18208e64c2e02dc53c8`): changes one assertion in `eper/tests/b01-case-readiness-integrity.test.mjs`, allowing both `NOT_VERIFIED` and `LLD_EVIDENCE_RECEIVED_APPROVAL_PENDING`. Mainline has evolved the test's accepted baseline states; retain as a historical test-intent delta, not a transplant candidate without reviewing the current gate contract.
- `fix/eper-ci-node-types` (commit `b48c814c50714bd307f989f5b06096710390519f`): adds `@types/node@20.14.15` to `eper/package.json`. The branch package manifest is stale relative to main; verify current type-check/build need before selectively adopting the dependency.
- `release/eper-0.1.0-rc2` (commit `31f8f8056176562005369dbaf3cacfb391deee52`): changes packaged archive, checksum and artifact label from RC1 to RC2. Historical release metadata only; do not merge its old workflow.
- `release/eper-0.1.0-rc4` (commit `13dc7fa94a4c0998d94e22a361d6e5790eee1183`): stages a temporary package directory, rewrites package and lockfile versions to `0.1.0-rc4`, validates the embedded versions, then packages and removes the temporary directory. This is a potentially reusable release-packaging technique, but the branch workflow is stale; compare against current release safeguards before any selective port.
- `work/ch463-contract-draft-domain-reconciliation-2026-10-19` (commit `96788ab75224fd0eac540d779024ad11f556377c`): replaces the earlier unresolved domain-identity conflict narrative with the approved Option A source-correction decision, candidate source locators for REQ-46301–46306, explicit contract/event-name guardrails, and gate counts. Its source-precedence correction is reflected in current mainline; retain the branch as historical decision rationale, not as a merge candidate. It explicitly records 0/6 approved HLD→LLD pairs, 0/18 verified DATA/API/EVENT bindings, 0/6 approved acceptance oracles, SRC-003/G3 OPEN/NO-GO, Business UAT HOLD/NOT AUTHORIZED/NOT EXECUTED, and G9 NOT FROZEN.

**Disposition:** no unique branch is approved for wholesale merge. Preserve all five refs until owner/reference checks and a documented keep/archive decision are complete. The RC4 packaging approach may merit a separate isolated improvement proposal after validating the current release workflow; no release artifact was produced by this review.


## Provider delivery boundary review — 2026-11-03 15:29 UTC

Reviewed the current `main` tree and implementation contracts after the exact-head PostgreSQL gate completed. The durable provider-operation queue is real and its PostgreSQL lifecycle test covers enqueue/idempotency, concurrent claim, lease renewal, fencing, retry exhaustion and explicit expired-lease recovery. The queue is **not yet an executable provider-delivery system**:

- `eper/docs/PROVIDER_OPERATION_PAYLOAD_HANDOFF_CONTRACT.md` explicitly requires an approved encrypted payload store, tenant/application/capability/operation authorization on payload reads, digest verification, and retention/deletion policy. Current tree contains the handoff contract and migration `018_provider_operation_payload_reference.sql`, but no payload-store implementation or payload-store adapter/test files.
- The provider operation repository persists an opaque reference and digest; that does not prove the referenced payload exists, is encrypted, is scoped, or can be safely reconstructed by a worker.
- Current tree contains provider configuration resolution and connection/operation repositories, but no dedicated provider-operation worker entrypoint or adapter registry/secret-resolver implementation. The existing agent worker is a separate approval-oriented job path, not a provider delivery worker.
- `eper/docs/WORKFLOW_OUTBOX_OPERATIONS.md` documents the continuous-process pattern and explicitly leaves host supervision, metrics/alerts, dead-letter operations and an approved dispatcher as deployment responsibilities. Those documented responsibilities are not evidence of configured production operations.

### Seven-checkpoint impact

| Checkpoint | Updated evidence / boundary |
|---|---|
| 2. CI and persistence foundations | GREEN for local/CI PostgreSQL queue lifecycle; AMBER for encrypted payload persistence, retention and production backup/recovery controls. |
| 4. Workflow execution design | AMBER: queue leases, fencing and bounded recovery are tested; provider payload handoff and provider-specific worker execution are not implemented. |
| 5. Integrated validation | GREEN for the exact PR #377 technical checks; this does not validate a real provider dispatch path. |
| 7. Worker/publisher runtime | AMBER: agent worker and workflow outbox runtimes exist as separate paths; no production-ready provider-operation worker, approved adapter registry, secret resolver, independent supervision or alert integration is evidenced. |

**Next implementation slice:** build the encrypted payload-store interface and local/test implementation first; bind payload reference creation to enqueue idempotency; enforce tenant/application/capability/operation authorization and digest verification on retrieval; add retention/deletion semantics and adversarial PostgreSQL tests. Only after that should the provider-operation worker, adapter registry and server-only secret resolver be connected. Keep real provider dispatch disabled, use synthetic adapters only, and provision no cloud resources.

This is a code-tree and contract review, not a claim that a production payload vault, worker host, monitoring system or external provider integration exists.


## Current repository delivery snapshot — 2026-11-03 16:10 UTC

**Snapshot main:** `0866c09f6a83026b466de26af4a13465f7db1511` (tree `0c01985a303e9348e728acd04b0a55a80020f9a9`). This dated section supplements earlier historical snapshots; the live main ref and PR heads must be re-resolved on every subsequent review.

### Seven-checkpoint disposition

| Checkpoint | Status | Evidence and remaining boundary |
|---|---|---|
| 1. v34-to-228 requirements reconciliation | AMBER | The approved 228 requirements / 38 chapters remain unchanged. The 45-row v34 crosswalk records 0 exact full-coverage mappings and 45 partial shared-control mappings; additive candidates remain draft and require Product Owner disposition. The 228/38 pilot matrix is not requirement-by-requirement acceptance. |
| 2. Reproducible fresh-clone developer setup | GREEN | Main-tree-equivalent fresh-clone run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) passed `npm run dev:verify`: 1,422 passed, 0 failed, 4 skipped. Its tested commit tree equals this main tree. Disposable PostgreSQL backup/restore passed with 75 source/restored base tables. |
| 3. PostgreSQL persistence, migrations and recovery | AMBER | Main applies and repeats payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity migrations. Candidate #379 adds audit migration 021 and passes live encrypted-payload and provider-operation tests plus restore smoke. Payload-table RLS under the restricted provider role is not yet independently tested; production encryption/retention, RPO/RTO and independent restore rehearsal remain. |
| 4. Provider-neutral identity, OIDC and durable sessions | AMBER | #310 identity/OIDC foundation and #376 customer browser integration are merged. The synthetic-provider customer browser journey covers login, durable session, tenant/application assignment, CSRF/cookie controls, workspace/support access and logout/revocation. Product Admin OIDC and production IdP onboarding/JWKS/key-rotation evidence remain. |
| 5. Customer workspace and support | AMBER | Customer ticket submission/history/replies, tenant/application authorization, PostgreSQL idempotency/audit, admin triage/assignment/severity, internal-note visibility and filtered CSV export have tests. Owner-defined SLA targets, timers, escalation and breach evidence remain absent. |
| 6. Scheduler, workflow operations and remaining capabilities | AMBER | Continuous outbox processing, campaign worker execution, leases/fencing, idempotency, bounded retries, dead-letter replay, graceful shutdown and PostgreSQL restart recovery have tests. Provider payload/operation persistence is being added in #378/#379, but there is no supervised provider worker, approved adapter/secret-resolution runtime, or deployed metrics/alerting evidence. |
| 7. Release controls, recovery and independent handover | RED | Main integrated/release artifact checks pass, but main branch protection is disabled and repository rulesets are empty. The continuity charter remains proposed; production backup policy and a second-engineer fresh-clone/release/rollback/restore demonstration are not evidenced. |

### Current open-PR inventory at this snapshot

- **#377** — this scorecard branch; documentation refresh. Its previous head was behind main and its open-PR inventory was stale. This commit merges the current main ancestry into the branch and refreshes this scorecard; exact new head is the commit containing this section.
- **#378** — `6922c73b010e5085168b92318fb77e1b9d16c16b`, base main. Encrypted payload interface and in-memory test adapter; all exact-head PR workflows passed, including integrated validation [41665338975](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665338975), fresh-clone [41665339449](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339449), PostgreSQL integration [41665339275](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339275), and provider lifecycle [41665339074](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339074). It is two commits behind current main by ancestry and remains draft.
- **#379** — `9784541766cb5a8b99219f278311fca7e82219e3`, stacked on #378. Durable encrypted PostgreSQL payload store plus atomic payload/operation/audit enqueue. Exact-head fresh-clone [41670790965](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790965) passed: 1,438 tests, 1,434 passed, 0 failed, 4 skipped; audit migration 021 applied and repeated; restore smoke passed with 76 source/restored base tables. Provider lifecycle [41670790980](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790980) passed 1/1. The candidate remains stacked and has no same-commit integrated-validation run; retarget to main and rerun after #378 is integrated. Restricted-role/RLS proof for the payload table, key rotation, retention and provider worker remain open.
- **#380** — `e426cc1cafe8ec0bfa2a29a99edda1225ddb8e3b`, base main. Documentation-only additions CW-060 (tenant-isolated client asset repository) and CW-061 (workflow-driven client application UX) to the v1.6.0 draft register. All exact-head workflows passed, including integrated validation [41670518639](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518639), matrix [41670518389](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518389), and G9 [41670518196](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518196). These are draft requirements, not implemented capabilities.

### Current-main evidence

- Integrated validation [41665053465](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053465) and EPER CI [41665053692](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053692) passed on main SHA `0866c09...`.
- The main 228/38 matrix [41665053485](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053485) reports 38 chapters, 28 passed checks and no failed chapters. G9 [41665053395](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053395) confirms 228 unique requirements, six per chapter, and does not promote pending requirements to closure.
- The fresh-clone evidence above is from commit `2c426de...`; its tree `0c01985...` is identical to this main tree. The current main integrated PostgreSQL suite reports 1,410 tests, 1,404 passed, 0 failed and 6 skipped.

**Continuity disposition:** the engineering continuity charter remains proposed pending owner review. No chargeable cloud resource or real external/provider action is part of this snapshot.

## Current repository delivery snapshot — 2026-11-03 17:05 UTC

**Dynamically resolved main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`.  
**Main tree:** `0c01985a303e9348e728acd04b0a55a80020f9a9`. Compare from main `0866c09f6a83026b466de26af4a13465f7db1511` to the current head is two commits ahead with no file changes, so the tree remains identical. The two intervening commits add and then remove the same unintended test file; no lasting source-tree delta remains.

### Current-main validation boundary

The latest main-tree-equivalent validation remains:
- Integrated PostgreSQL validation [41665053465](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053465).
- EPER CI [41665053692](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053692).
- 228/38 matrix [41665053485](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053485).
- G9 reconciliation [41665053395](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665053395).

These runs are on SHA `0866c09...`, whose tree is identical to current main. The combined-status and commit-workflow lookup returned no check contexts or PR-triggered runs for SHA `2c380d...`; do not describe those older run IDs as checks attached to the new commit.

Fresh-clone `npm run dev:verify` evidence [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) ran on candidate `2c426de8b63e437ffb186ed4887da76b4b704719`, whose tree is the same `0c01985...`. It reported 1,422 passed, 0 failed, 4 skipped; all seven migration groups including identity applied and repeated; disposable PostgreSQL backup/restore passed with 75 source/restored base tables. The main integrated PostgreSQL suite reported 1,410 tests, 1,404 passed, 0 failed, 6 skipped.

### Merged foundation verification

- PR #306 is closed/merged as `6e8dd438e5091b1802d65e4f29951389fe077859`; current main is a descendant. Its scope is reproducible fresh-clone setup and PostgreSQL verification.
- PR #310 is closed/merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`; current main is a descendant. Its scope is durable customer identity/OIDC protocol and session foundation, not production browser login by itself.
- PR #376 is closed/merged as `9749701bfed527b906183192ca06cc1998e70166`; current main is a descendant. It integrates customer/admin, workflow and provider-connection foundations. The customer browser journey has separate synthetic-IdP E2E evidence [41652347404](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41652347404); this does not prove production IdP onboarding or Product Admin OIDC.

### Live open-PR inventory and exact-head validation

The current open set is #377, #378, #379, #380, #381 and #382. All are drafts. No merge is recorded in this snapshot.

- **#377 — scorecard:** head `e9975af98eda50dcf167f2444e1d85b3ee7d6ec5`, base main. Compare: 8 ahead / 2 behind (merge base `0866c09...`). All nine exact-head workflows passed: EPER CI [41671717692](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717692), integrated validation [41671717612](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717612), chapter matrix [41671717649](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717649), G9 [41671717623](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717623), six-family HTTP [41671717673](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717673), container [41671717667](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717667), release candidate [41671717681](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717681), controlled QA [41671717614](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717614), and technical simulation [41671717622](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41671717622). Integrated PostgreSQL: 1,410 tests, 1,404 passed, 0 failed, 6 skipped. The chapter matrix reports 38 chapters, 28 passed checks and no failed chapters. Those results belong to the stated head; this new scorecard addendum will create a new head and requires fresh exact-head validation.
- **#378 — encrypted payload interface:** head `6922c73b010e5085168b92318fb77e1b9d16c16b`, base main. Compare: 4 ahead / 4 behind (merge base `a3635ff...`). All 12 exact-head workflows passed, including EPER CI [41665338962](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665338962), integrated validation [41665338975](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665338975), fresh clone [41665339449](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339449), PostgreSQL integration [41665339275](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339275), provider lifecycle [41665339074](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339074), and chapter matrix [41665339043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339043). Fresh clone: 1,433 tests, 1,429 passed, 0 failed, 4 skipped; all seven migration groups repeat; restore smoke passed with 75 source/restored tables. This is the encrypted interface/in-memory adapter, not durable production storage. Refresh against current main and rerun before merge.
- **#379 — durable encrypted PostgreSQL payload store:** head `9784541766cb5a8b99219f278311fca7e82219e3`, stacked on #378 head `6922c73...`. Compare to its base: 23 ahead / 0 behind. All six exact-head workflows passed: fresh clone [41670790965](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790965), provider lifecycle [41670790980](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790980), PostgreSQL payment integration [41670791077](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670791077), controlled QA [41670790943](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790943), matrix [41670790956](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790956), and technical simulation [41670791009](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670791009). Fresh clone: 1,438 tests, 1,434 passed, 0 failed, 4 skipped; migration 021 applied; seven migration groups repeat; restore smoke passed with 76 source/restored tables. Provider queue PostgreSQL lifecycle passed 1/1. No same-head EPER CI or integrated-gate run is present. The restricted-role payload RLS test is in successor #381; keyring, lifecycle metadata, audited deletion and bounded worker code are in successor #382. A review comment remains: public standalone `put()` can still create a payload without an operation; production enqueue must use the atomic `enqueueWithPayload()` path and orphan prevention must be enforced.
- **#380 — additive client asset/workflow UX requirements:** head `e426cc1cafe8ec0bfa2a29a99edda1225ddb8e3b`, base main. Compare: 1 ahead / 2 behind (merge base `0866c09...`). All nine exact-head workflows passed, including integrated validation [41670518639](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518639), EPER CI [41670518562](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518562), matrix [41670518389](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518389), and G9 [41670518196](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518196). Integrated PostgreSQL: 1,410 tests, 1,404 passed, 0 failed, 6 skipped. CW-060 and CW-061 remain additive v1.6.0 draft candidates; this PR changes requirements documentation only. Refresh against current main before review.
- **#381 — restricted-role payload RLS proof:** head `2d96731355004ac9b9d0541e4cc6ba245c5cf7dd`, stacked on #379 head `978454...`. Compare: 2 ahead / 0 behind. All six exact-head workflows passed: fresh clone [41672261625](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261625), provider lifecycle [41672261654](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261654), matrix [41672261247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261247), workflow configuration [41672261163](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261163), controlled QA [41672261285](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261285), and technical simulation [41672261225](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261225). Fresh clone: 1,438 tests, 1,434 passed, 0 failed, 4 skipped; backup/restore passed with 76 source/restored tables. The live PostgreSQL payload integration test uses `SET LOCAL ROLE eper_provider_catalogue_access`, proves an in-scope read, zero rows for cross-tenant and cross-application reads, and rejects an out-of-scope insert with SQLSTATE 42501. The full fresh-clone suite passed; the dedicated provider lifecycle job on this head still runs the queue lifecycle test only. #382 adds the encrypted-payload integration test to that dedicated job.
- **#382 — provider-operation worker and payload lifecycle follow-up:** head `6e54fbfa7177de8cef6482ea1e8bc5987d23dddb`, stacked on #381 head `2d967...`. Compare: 21 ahead / 0 behind. All seven exact-head workflows passed: fresh clone [41676007863](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676007863), provider lifecycle [41676008231](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008231), PostgreSQL payment integration [41676008003](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008003), matrix [41676008243](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008243), workflow configuration [41676008279](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008279), controlled QA [41676007873](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676007873), and technical simulation [41676007818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676007818). Fresh clone: 1,450 tests, 1,446 passed, 0 failed, 4 skipped; all seven migration groups apply and repeat, including audit migrations 022/023; backup/restore passed with 76 source/restored tables and seven migration-ledger tables. The dedicated provider lifecycle job passed queue lifecycle 1/1, bounded worker tests 5/5, keyring tests 6/6 and PostgreSQL encrypted-payload tests 2/2. The payload integration test includes the restricted-role RLS assertions. Keyring tests cover v1 compatibility, v2 active-key writes, retained read keys after rotation, unknown-key fail-closed behavior, AAD scope/key-ID tampering and digest verification. The worker is a bounded injected-dispatch pass: there is no process entrypoint, production host identity, production secret resolver or real network adapter. Retention metadata and actor-attributed transactional deletion are implemented, but no bounded purge worker or approved retention-policy resolver exists; no default retention period is assumed. Standalone `put()` remains a potential orphan path unless production callers are restricted to atomic enqueue.
  
### Seven-checkpoint disposition

| Checkpoint | Status | Current assessment |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | Preserve 228 requirements and 38 chapters. The v34 crosswalk has 45 source rows, 0 exact full-coverage mappings and 45 partial shared-control mappings. Additions remain draft pending owner disposition; pilot matrix is not individual requirement acceptance. |
| 2. Fresh-clone developer setup | GREEN | Current main tree is identical to the previously validated tree. `npm run dev:verify`, seven migration-group repeatability and disposable PostgreSQL restore have exact-tree evidence. |
| 3. PostgreSQL persistence and recovery | AMBER | Main identity/ticket/workflow/payment migration groups and live PostgreSQL coverage pass. Provider payload migrations 021–023 and keyring/RLS tests pass on the stacked candidate. Production backup policy, key custody, retention purge, RPO/RTO and independent restore rehearsal remain. |
| 4. Customer identity/OIDC | AMBER | #310 protocol/session foundation and #376 customer browser integration are merged. Synthetic-IdP customer browser E2E covers secure cookies, CSRF, durable session, tenant/application access and logout. Product Admin OIDC and production IdP onboarding/JWKS/key rotation remain. |
| 5. Customer workspace/support | AMBER | Customer ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note separation and export have tests. Owner-defined SLA targets, timers, escalation and breach evidence remain. |
| 6. Scheduler/workflow operations | AMBER | Campaign/outbox workers, leases/fencing, idempotency, retries, dead-letter handling, graceful shutdown and recovery are tested. Provider worker is only a bounded pass with injected dispatch; no independent process host/supervision, production secret resolution, approved network adapter, metrics or alerting. |
| 7. Release/continuity | RED | The charter remains proposed. Independent second-engineer release/rollback/restore has not been demonstrated. Main branch protection/ruleset state was not re-read in this cycle; prior repository evidence recorded protection disabled and no rulesets. |

No approved 228/38 baseline change is made by these candidate PRs. No merge, branch deletion, chargeable cloud provisioning or real external/provider dispatch is included in this snapshot.


## 2026-11-04 00:06 IST — exact-main and open-PR refresh

### Current main

- Dynamically resolved `main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- Previous main `0866c09f6a83026b466de26af4a13465f7db1511` has the same tree. The two later commits add then revert an accidentally unscoped provider-payload test file; the latest commit removes that file. No provider payload implementation from the current PR stack is integrated into main.
- Exact-main push workflows all passed: EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771), integrated [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913), matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818), G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648), six-family HTTP [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652), container [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533), and QA [41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702). The exact-main check-runs endpoint returned 13 completed successful checks.
- Exact-main integrated PostgreSQL job [126056796091](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913/job/126056796091): 1,410 tests, 1,404 passed, 0 failed, 6 skipped; seven migration groups including identity applied/repeated.
- Exact-main chapter matrix [126056205749](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818/job/126056205749): 38 chapters, 259/259 tests passed, 0 failed, 28 passed checks, no failed chapters. This is pilot-test evidence, not individual requirement acceptance.
- No fresh-clone workflow was triggered on this exact main SHA. The closest clean-runner run is on #378 head `6922c73b010e5085168b92318fb77e1b9d16c16b`; its diff from main is only two added interface/test files and no modifications to existing main files. Fresh clone [41665339449](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339449): 1,433 tests, 1,429 passed, 0 failed, 4 skipped; all seven migration groups repeated; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; disposable backup/restore `PASS`. This is additive-superset evidence, not an exact-main-SHA run.

### Current open PRs — all exact-head Actions completed successfully

- **#377 scorecard** — head `f8e97e8193111c1bef9fef39eda04c71d65d13ed`, base main. EPER CI [41682159719](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41682159719), integrated [41682159626](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41682159626), matrix [41682159490](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41682159490), G9 [41682159477](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41682159477), QA [41682160165](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41682160165), release [41682159872](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41682159872) pass. Integrated PostgreSQL: 1,410 / 1,404 passed / 0 failed / 6 skipped. Documentation-only; no fresh-clone run on this head.
- **#378 encrypted payload boundary** — head `6922c73b010e5085168b92318fb77e1b9d16c16b`, base main. All 12 exact-head workflows passed, including CI [41665338962](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665338962), integrated [41665338975](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665338975), fresh clone [41665339449](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339449), PostgreSQL [41665339275](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339275), provider lifecycle [41665339074](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339074), matrix [41665339043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41665339043). Interface/codec plus in-memory test adapter only; not durable storage.
- **#379 durable encrypted PostgreSQL store** — head `9784541766cb5a8b99219f278311fca7e82219e3`, base #378. All six exact-head workflows passed: fresh clone [41670790965](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790965), PostgreSQL [41670791077](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670791077), provider lifecycle [41670790980](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790980), matrix [41670790956](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790956), QA [41670790943](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670790943). Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; migration 021 applied; seven groups repeated; restore 76/76 base tables. No exact-head EPER CI or integrated gate.
- **#380 customer assets/workflow UX requirements** — head `e426cc1cafe8ec0bfa2a29a99edda1225ddb8e3b`, base main. All nine exact-head workflows passed, including CI [41670518562](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518562), integrated [41670518639](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518639), matrix [41670518389](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518389), G9 [41670518196](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41670518196). Integrated PostgreSQL: 1,410 / 1,404 passed / 0 failed / 6 skipped. CW-060/061 are draft requirements only; no runtime delivered.
- **#381 restricted-role payload RLS proof** — head `2d96731355004ac9b9d0541e4cc6ba245c5cf7dd`, base #379. All six exact-head workflows passed: fresh clone [41672261625](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261625), provider lifecycle [41672261654](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261654), matrix [41672261247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261247), workflow config [41672261163](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261163), QA [41672261285](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41672261285). Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; seven groups repeated; restore 76/76 tables. Restricted-role test proves in-scope read, cross-tenant/application invisibility and rejected out-of-scope insert. No exact-head integrated gate or EPER CI.
- **#382 provider worker/key lifecycle** — head `6e54fbfa7177de8cef6482ea1e8bc5987d23dddb`, base #381. All seven exact-head workflows passed: fresh clone [41676007863](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676007863), PostgreSQL [41676008003](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008003), provider lifecycle [41676008231](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008231), matrix [41676008243](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008243), workflow config [41676008279](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676008279), QA [41676007873](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41676007873). Fresh clone: 1,450 / 1,446 passed / 0 failed / 4 skipped; migrations 021–023 applied; seven groups repeated; restore 76/76 tables. Provider lifecycle: queue 1/1, bounded worker 5/5, keyring 6/6, encrypted-payload PostgreSQL 2/2. No exact-head EPER CI or integrated gate.

Provider PR dependency chain is #378 → #379 → #381 → #382; successor evidence must not be attributed to earlier heads. The #379 review comment is only partially addressed: #382 adds v1/v2 keyring, actor-attributed deletion, expiry/legal-hold checks and transactional audit, but public standalone `put()` still permits an envelope without an operation row. A bounded purge worker and explicit retention-policy resolver remain absent.

### Merged foundations and customer journey

- PR #306 merged as `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`; PR #376 merged as `9749701bfed527b906183192ca06cc1998e70166`. All merge commits are ancestors of current main.
- PR #310 supplies provider-neutral OIDC/PKCE and durable identity/session foundations. PR #376 adds customer browser routes and assignment-aware integration. Chromium run [41652347404](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41652347404) passed the customer browser OIDC journey (1/1) and Product Admin application-remediation browser journey (1/1); associated suite passed 1,312/1,312 tests. Customer browser coverage uses a synthetic identity provider. Production IdP onboarding/JWKS rotation and Product Admin OIDC login remain unproven.
- Support tests cover ticket submission/history/replies, tenant/application ownership, admin triage/assignment/severity, internal-note separation and export. Owner-defined SLA targets, response/resolution timers, escalation and breach evidence remain absent.
- Campaign/outbox workers have independent entrypoints, leases/fencing, idempotency, retry/dead-letter behavior, graceful shutdown and recovery tests. #382 adds only a bounded injected-dispatch provider worker pass: `eper/package.json` has no provider-worker start script/host entrypoint. Production worker identity, supervision, secret resolver, approved network adapter, metrics/alerts and real dispatch remain absent.

### Seven-checkpoint disposition

1. **v34-to-228 — AMBER:** preserve 228 requirements and 38 chapters. Crosswalk records 45 v34 source rows, 0 exact full-coverage mappings and 45 partial shared-control mappings; shared controls are not full requirement acceptance. CW-060/061 remain additive draft candidates.
2. **Fresh-clone setup — GREEN for reproducible local/CI procedure:** #306 is merged; main integrated tests repeat all seven migration groups. Clean-runner verification and disposable restore pass on #378's additive superset head, not the exact main SHA.
3. **PostgreSQL — AMBER:** exact-main integrated PostgreSQL passes; migrations 021–023, restricted-role RLS, keyring rotation and deletion tests pass on the stacked candidate. Bounded purge/policy resolver, production backup destination, RPO/RTO and independent restore rehearsal remain.
4. **Identity/OIDC — AMBER:** protocol, durable sessions, customer browser cookies/CSRF and tenant/application assignment have synthetic-IdP browser evidence. Production IdP onboarding/key rotation and Product Admin OIDC remain.
5. **Customer workspace/support — AMBER:** core ticket lifecycle and admin/customer scoping are tested. SLA management and complete asset/workflow UX are not delivered.
6. **Scheduler/workflow/provider — AMBER:** campaign/outbox workers have execution/recovery tests; provider worker lacks process host, supervision, production identity, approved adapter, metrics and alerting.
7. **Release/continuity — RED:** release build and disposable restore pass, but second-engineer release/rollback and recovery rehearsal are not demonstrated. Charter remains proposed; owner review is outstanding.

Repository controls: rulesets endpoint returned an empty list. Branch-protection endpoint returned HTTP 403 `Resource not accessible by integration`; main protection could not be independently assessed. Do not assume required checks or force-push protection are active.

**Next actions:** consolidate #378 → #379 → #381 → #382 in dependency order; prevent production use of standalone payload `put()`; implement bounded policy-resolved purge and supervised provider-worker hosting; complete support SLA and customer asset/workflow runtime; obtain owner disposition for additive requirements and the continuity charter; then establish release controls and demonstrate second-engineer recovery.

This is engineering evidence only. It does not change the approved 228/38 baseline or authorize production release or external provider dispatch. No chargeable cloud resource or real external/provider action was used.


## Dated operating update — 2026-11-04 — current-main verification and PR-stack reconciliation

### Current main baseline

- **Main SHA:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`
- **Tree SHA:** `0c01985a303e9348e728acd04b0a55a80020f9a9`
- Exact-main push workflows passed: EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771), integrated validation [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913), 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818), G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648), container [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533), six-family HTTP [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652), and controlled QA [41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702).
- The exact-main integrated PostgreSQL job passed **1,410 tests: 1,404 passed, 0 failed, 6 skipped**. Its log includes the passing test `dev:verify applies and repeats all seven PostgreSQL migration groups`; identity is one of those groups.
- The exact-main chapter matrix reports 38 chapters, 259 tests, 28 passed checks and no failed chapters. This is automated pilot evidence, not individual requirement acceptance.
- Fresh-clone `npm run dev:verify` was run on candidate `2c426de8b63e437ffb186ed4887da76b4b704719`, whose tree SHA is exactly the current main tree above: run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742). It reported 1,426 tests, 1,422 passed, 0 failed, 4 skipped; all seven migration groups applied and repeated; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; disposable backup/restore `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; 75 source/restored base tables and seven migration-ledger tables. This is exact-tree evidence, not a run on the main commit SHA itself.
- This update supersedes older dated entries that describe the current-main commercial PostgreSQL guard as failing.

### Open PR heads and branch reconciliation

The existing six PR branches were reconciled onto current main without changing their PR file trees. Every branch now has zero commits behind current main; the provider stack also has zero commits behind each immediate base branch. The new merge commits preserve the previous branch heads as parents. All PRs remain drafts; no merge was performed.

- **#377 scorecard** — head `b6d8831e123c466d6c80f4140baf6d2a40841fa3`, main-relative diff remains scorecard-only. Exact-head EPER CI [41711593876](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711593876), integrated [41711593646](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711593646), matrix [41711593834](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711593834), G9 [41711593914](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711593914), QA [41711593775](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711593775) and release build [41711594013](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711594013) passed. Integrated PostgreSQL: 1,410 / 1,404 passed / 0 failed / 6 skipped.
- **#378 encrypted payload boundary** — head `32bd57301846e20cd9b492374061dd0b19f08884`. Exact-head integrated [41711723459](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723459), EPER CI [41711723639](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723639), fresh clone [41711723463](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723463), PostgreSQL [41711723482](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723482), provider lifecycle [41711723440](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723440) and matrix [41711723413](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723413) passed. Fresh clone: 1,433 / 1,429 passed / 0 failed / 4 skipped; seven migration groups repeated; restore 75/75 base tables. Scope remains encryption interface/codec and in-memory test adapter, not durable storage.
- **#379 durable encrypted PostgreSQL payload store** — head `6f9cb0deb0c4bf9bd34bad88a2c7c4fc59c71c02`. Exact-head fresh clone [41711764471](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711764471), PostgreSQL [41711764430](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711764430), provider lifecycle [41711764871](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711764871) and matrix [41711764431](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711764431) passed. Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; migration 021 applied, all seven groups repeated, restore 76/76 base tables and seven ledgers. No same-head EPER CI or integrated gate was returned.
- **#380 customer assets/workflow UX requirements** — head `55b13f9f07d7a594e21f07b68962149272572135`; main-relative diff remains the v1.6.0 draft change-control register. Exact-head integrated [41711736892](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711736892), EPER CI [41711737227](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711737227), matrix [41711736902](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711736902) and G9 [41711736772](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711736772) passed. CW-060/061 remain draft requirements, not runtime delivery.
- **#381 restricted-role payload RLS proof** — head `963c45324b44489ba42ae3bf28b8295b13254af9`. Exact-head fresh clone [41711790741](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790741), provider lifecycle [41711790735](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790735), matrix [41711790734](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790734) and workflow configuration [41711790731](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790731) passed. Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; seven groups repeated; restore 76/76 tables and seven ledgers. Restricted PostgreSQL role proves in-scope read, cross-tenant/application invisibility and rejected out-of-scope insert. No same-head EPER CI or integrated gate was returned.
- **#382 provider worker/key lifecycle** — head `d799884f5b3459641f008d992a2875450eccd43b`. Exact-head fresh clone [41711798935](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798935), PostgreSQL [41711798767](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798767), provider lifecycle [41711798766](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798766), matrix [41711798907](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798907) and workflow configuration [41711798774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798774) passed. Fresh clone: 1,450 / 1,446 passed / 0 failed / 4 skipped; migrations 021–023 applied; all seven groups repeated; restore 76/76 base tables and seven ledgers. Provider lifecycle subtests passed queue 1/1, bounded worker 5/5, keyring 6/6 and encrypted-payload PostgreSQL 2/2. No same-head EPER CI or integrated gate was returned.

The exact-head runs above were created after the branch updates; prior green runs on the previous heads are historical only. The stacked dependency order remains #378 → #379 → #381 → #382.

### Capability and control corrections

- **Payload atomicity remains an open review issue.** `PostgresEncryptedProviderPayloadStore.put()` starts and commits its own transaction and can persist a payload without an operation row. The `enqueueWithPayload()` path uses one caller-owned transaction for payload, operation and audit, but the public standalone `put()` still exists. Do not claim orphan prevention is enforced.
- **Retention:** migrations 022/023, expiry/legal-hold checks, v1/v2 keyring compatibility, actor-attributed deletion and transactional deletion audit are tested on #382. An explicit retention-policy resolver and bounded purge worker are not implemented.
- **Provider worker:** #382 supplies a bounded `runOnce()` worker with injected configuration/authorization/dispatcher, lease/fencing and safe retry outcomes. It has no independent process entrypoint. No production worker identity, supervision, secret resolver, approved network adapter, telemetry/alert export or real dispatch is configured.
- **Workflow outbox:** the continuous process/runtime/host abstractions and lease/retry/dead-letter/recovery tests exist. There is no dedicated outbox process entrypoint in `eper/apps/worker` or package start script. The host must supply a restricted pool and approved dispatcher and must own supervision and metrics/alerts. The campaign scheduler and agent worker have separate start scripts.
- **Identity:** PR #310 merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e`; PR #376 merged as `9749701bfed527b906183192ca06cc1998e70166`. Customer browser run [41652347404](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41652347404) passed the customer OIDC/workspace/support browser journey (1/1) and Product Admin application-remediation browser journey (1/1); associated suite passed 1,312/1,312. Customer browser login uses a synthetic identity provider. Production IdP onboarding/JWKS rotation and Product Admin OIDC login remain unproven.
- **Support:** tests cover customer ticket submission/history/replies, tenant/application ownership, admin triage/assignment/severity, internal-note separation and export. Owner-defined SLA targets, response/resolution timers, escalation and breach evidence remain absent.
- **Continuity:** repository rulesets endpoint returned an empty list. Main branch-protection endpoint returned HTTP 403 `Resource not accessible by integration`, so branch protection is NOT ASSESSED. Do not assume required checks or force-push protection are active. The continuity charter remains proposed pending owner review; production backup destination, RPO/RTO, independent restore rehearsal and second-engineer release/rollback are not demonstrated.

### Seven-checkpoint disposition and next actions

1. **v34-to-228 — AMBER:** preserve the approved 228 requirements and 38 chapters. The crosswalk records 45 v34 source rows, 0 exact full-coverage mappings and 45 partial shared-control mappings; shared controls are not full requirement acceptance. CW-060/061 remain additive draft candidates.
2. **Fresh-clone setup — GREEN for reproducible local/CI procedure:** #306 is merged; exact-main-tree fresh clone and disposable restore pass; all seven migration groups repeat. Exact-main-commit fresh-clone run remains distinct from exact-tree evidence.
3. **PostgreSQL — AMBER:** exact-main integration, seven-group repeatability, identity migrations, live PostgreSQL and candidate backup/restore pass. Production backup/key custody, retention resolver/purge, RPO/RTO and independent restore rehearsal remain.
4. **Identity/OIDC — AMBER:** protocol, durable sessions, customer browser cookies/CSRF and tenant/application assignment have synthetic-IdP browser evidence. Production IdP onboarding/key rotation and Product Admin OIDC remain.
5. **Customer workspace/support — AMBER:** core ticket lifecycle and tenant/application/admin visibility are tested. SLA management and complete asset/workflow runtime remain.
6. **Scheduler/workflow/provider — AMBER:** campaign worker entrypoint and workflow outbox runtime primitives exist; the outbox and provider workers still need independently startable, supervised hosts, restricted identities and telemetry/alerts. Provider dispatch remains injected and unconfigured.
7. **Release/continuity — RED:** release builds and disposable restore pass, but owner-approved branch controls, production recovery rehearsal and second-engineer release/rollback are not demonstrated. Charter owner review remains outstanding.

**Next actions:** enforce operation-row linkage so standalone payload creation cannot orphan data; implement versioned retention-policy resolution and bounded purge; add a provider-worker process entrypoint with restricted identity, supervision and metrics; add a dedicated workflow-outbox process entrypoint; run the integrated gate/EPER CI on the complete #379/#381/#382 stack; implement CW-060/061 runtime, support SLA and independent release/recovery controls.

No PR was merged, no approved 228/38 requirement or chapter was changed, and no chargeable cloud resource or real external/provider action was used.


## 2026-11-04 verification delta

### Mainline and reproducibility

- Dynamically resolved main: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree: `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- Main is two commits ahead of `0866c09f6a83026b466de26af4a13465f7db1511` with no changed files; the current tree is unchanged.
- Exact-main integrated run [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913): PostgreSQL suite 1,410 tests, 1,404 passed, 0 failed, 6 skipped. The log includes a skipped live tenant/actor assignment integration case; do not describe that specific case as passed.
- Exact-main chapter matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818): 38 chapters, 259/259 tests passed, 28 checks passed, 0 failed chapters. Nine chapters have HTTP pilot apps; 29 do not. This is automated technical evidence, not feature acceptance.
- Exact-main G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648): 5/5 tests passed, including 228 unique requirement IDs, six per chapter, preserved routing/contract joins and no promotion of pending requirements.
- PR #306 remains merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; its merge commit is an ancestor of current main.
- Exact-tree fresh-clone run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) ran on candidate commit `2c426de8b63e437ffb186ed4887da76b4b704719`, whose tree exactly matches current main. `npm run dev:verify`: 1,426 tests, 1,422 passed, 0 failed, 4 skipped; all seven migration groups including identity applied and repeated; disposable PostgreSQL backup/restore passed with 75/75 base tables and seven migration ledgers. This is exact-tree evidence, not a workflow run on the main commit SHA itself.

### Current open PRs and exact-head Actions

All six open PR heads were unchanged during this inspection. Their selected run objects were checked against the exact head SHA; the runs below are not stale green runs from an earlier head. The dependency chain compares cleanly with no behind commits: #378 → #379 → #381 → #382.

| PR | Exact head | Exact-head evidence | Disposition |
|---|---|---|---|
| #377 | `f85f283a550daa2b33043070b61064eb594a0899` | Integrated [41712641769](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41712641769), EPER CI [41712641758](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41712641758), matrix [41712641520](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41712641520), G9 [41712641521](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41712641521) passed | Documentation-only scorecard update; remains draft |
| #378 | `32bd57301846e20cd9b492374061dd0b19f08884` | Integrated [41711723459](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723459), fresh clone [41711723463](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723463), PostgreSQL [41711723482](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723482), provider lifecycle [41711723440](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723440), EPER CI [41711723639](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711723639) passed | Encryption boundary; not the durable production store |
| #379 | `6f9cb0deb0c4bf9bd34bad88a2c7c4fc59c71c02` | Fresh clone [41711764471](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711764471), PostgreSQL [41711764430](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711764430), provider lifecycle [41711764871](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711764871) passed | Durable encrypted store; no same-head integrated gate or EPER CI returned |
| #380 | `55b13f9f07d7a594e21f07b68962149272572135` | Integrated [41711736892](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711736892), EPER CI [41711737227](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711737227), matrix [41711736902](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711736902) passed | CW-060/061 are draft scope, not completed runtime delivery |
| #381 | `963c45324b44489ba42ae3bf28b8295b13254af9` | Fresh clone [41711790741](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790741), provider lifecycle [41711790735](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790735), matrix [41711790734](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790734), workflow config [41711790731](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711790731) passed | Restricted-role RLS proof; no same-head integrated gate or EPER CI returned |
| #382 | `d799884f5b3459641f008d992a2875450eccd43b` | Fresh clone [41711798935](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798935), PostgreSQL [41711798767](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798767), provider lifecycle [41711798766](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798766), matrix [41711798907](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798907), workflow config [41711798774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41711798774) passed | Bounded provider worker/key lifecycle; no same-head integrated gate or EPER CI returned |

PR #379 fresh clone: 1,438 tests, 1,434 passed, 0 failed, 4 skipped; `dev:verify` and backup/restore passed (76/76 base tables). PR #382 fresh clone: 1,450 tests, 1,446 passed, 0 failed, 4 skipped; `dev:verify` passed, seven migration groups including identity repeated, provider migrations 021–023 applied, backup/restore passed (76/76 base tables, seven ledgers). PR #382 provider lifecycle: PostgreSQL queue/fencing/recovery 1/1, bounded worker 5/5, keyring 6/6 and encrypted payload PostgreSQL 2/2 passed.

### Requirements and customer workspace corrections

- The main-branch v34 crosswalk preserves 45 source rows. It records 0 exact full-coverage matches, 45 partial links to shared controls, 45 additive v1.6.0 draft candidates and 0 changes to the approved 228 IDs or 38 chapters. The crosswalk is technical classification, not owner approval or feature acceptance.
- The v1.6.0 draft separately carries owner-directed commercial candidates CW-046–055 and workflow design candidates CW-056–057. They remain additive draft scope; do not merge them into the approved 228/38 baseline.
- Customer workspace is further along than a “no asset runtime” description would imply: current main has tenant/application-scoped asset metadata listing, audited short-lived HTTPS download URL issuance, durable assignment checks and customer inventory CSV export. The tested listing route is GET; no upload endpoint/test or durable blob-upload lifecycle is evidenced. CW-060 remains incomplete.
- Customer Admin workflow studio, typed rule evaluation, deterministic routing, application-scoped draft API and immutable publication are present and tested. The UI exposes a rule engine and visual workflow map. CW-061 still requires the complete customer-facing workflow journey and end-to-end runtime evidence; it is not wholly delivered by the draft requirement PR.
- Support tests cover customer ticket create/list/history/replies, tenant/application/actor scope, admin triage/status/assignment/severity, internal-note visibility separation and current-page/all-filtered-page CSV export with formula neutralization. Customer and admin browser UI tests exercise the conversation flow. Owner-defined SLA targets, timers, escalation and breach evidence remain absent.
- Identity successor PRs #312–#318, #320, #324, #329, #337 and #376 are merged; their merge commits are ancestors of current main. PR #310 merge SHA remains `88b9708d748c19dc80a1a2d7ad4960914451db7e`; PR #376 merge SHA is `9749701bfed527b906183192ca06cc1998e70166`.
- Browser run [41652790879](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41652790879) on the #376 merge commit passed 1,312/1,312 suite tests, customer OIDC/workspace/support browser journey 1/1 and Product Admin application-remediation browser journey 1/1. The identity-provider adapter is synthetic, version-pinned and explicitly makes no provider network calls. This is not production IdP onboarding/JWKS rotation evidence or a complete Product Admin OIDC login.

### Worker, retention and continuity corrections

- Campaign scheduler and agent workers have independent entrypoints. The workflow outbox has tested continuous process, host, signal shutdown, lease renewal/fencing, idempotency, retry and dead-letter abstractions, but no dedicated `apps/worker` entrypoint or package start script. The provider worker remains a bounded `runOnce()` component with injected dispatcher/configuration; no independent process host, production worker identity, supervision or metrics/alert export is configured.
- PR #382 adds migrations 022/023, v1/v2 keyring compatibility, rotation and actor-attributed single-payload deletion with expiry/legal-hold checks and transactional audit. It does not implement a versioned retention-policy resolver or bounded purge worker. No implicit retention period is authorized.
- `PostgresEncryptedProviderPayloadStore.put()` still opens and commits a standalone transaction; callers can persist a payload without an operation row. `enqueueWithPayload()` uses `putInTransaction()` for atomic payload/operation/audit, but the public standalone path is not technically disabled. Do not claim orphan prevention is enforced.
- Repository rulesets endpoint returns an empty list. Main branch-protection endpoint returns HTTP 403 to this integration and remains NOT ASSESSED. Production backup destination, RPO/RTO, independent restore rehearsal and second-engineer release/rollback are not demonstrated.

No PR was merged, no approved requirement/chapter was changed, and no chargeable cloud resource or real external/provider action was used.


### Validation trigger coverage correction — 2026-11-04

- `.github/workflows/ci.yml` currently limits pull-request base branches to `main` and `reconcile/payment-153-168-integration`.
- `.github/workflows/eper-integrated-validation.yml` currently limits pull-request base branches to `main` and `integration/eper-348-350-355-candidate`.
- The stacked provider PRs target `feat/provider-payload-encryption-boundary` (#379), `feat/durable-encrypted-provider-payload-store` (#381) and `test/provider-payload-rls-role-proof` (#382). Those base branches are excluded by both filters. This explains why their exact-head runs include provider lifecycle/fresh-clone/matrix evidence but no same-head EPER CI or integrated gate; it is a trigger-coverage gap, not a failed run.
- The provider lifecycle workflow has no restrictive base-branch filter and did run successfully on each provider PR head.
- Next action: deliberately extend the CI/integrated pull-request base-branch filters for the approved stack, or consolidate the complete provider stack onto one main-targeted validation candidate. Do not interpret a missing integrated run as a green result.
