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
| 2. CI and persistence foundations | AMBER | #348 exact-head fresh-clone, seven migration groups, repeatability, live PostgreSQL integration and disposable restore pass. Current main's integrated PostgreSQL gate still fails the commercial overage regression. Production backup destination, encryption/key custody, retention, RPO/RTO and independent recovery rehearsal remain. |
| 3. Architecture and execution boundaries | AMBER | Provider-neutral OIDC, browser callback/session, secure cookies, CSRF, tenant/application assignment and role delegation have exact-head browser/PostgreSQL evidence with a synthetic IdP. Production IdP onboarding/token/JWKS, operator MFA/credential lifecycle and empty-tenant first Customer Admin bootstrap remain. |
| 4. Workflow execution design and schema | AMBER | Continuous worker/outbox processing, lease renewal/fencing, idempotency, bounded retry, dead-letter handling, audited inspection/replay and graceful shutdown/recovery have test evidence. Independent host supervision, restricted production worker identity, approved dispatcher and operational alerts remain. |
| 5. Integrated validation | RED on current main; AMBER on consolidated candidate | Main same-commit integrated gate fails the commercial guard. #348's eight exact-head PR workflows pass, including live PostgreSQL and both browser journeys, but its exact-head integrated gate is not evidenced. |
| 6. PR consolidation and governance | AMBER | Open work is #338 → #340 → #341 → #347 → #348 plus documentation-only #349. The first four feature heads are one commit behind current main; #348 contains current main and validates the combined stack. No merge was performed. Branch-protection read returned HTTP 403 from the connected GitHub integration, so current protection/ruleset state is NOT ASSESSED in this update; do not assume it is enabled. |
| 7. Workflow publisher/runtime implementation | AMBER | Worker core and failure-path tests pass. Restricted worker identity, independent process supervision, dispatcher approval/configuration, delivery dashboards/alerts, load/recovery evidence and independent operator handover remain. |

### Next concrete actions

1. Consolidate the #338 → #340 → #341 → #347 → #348 stack into one reviewable main-targeted change; preserve every ancestor change and rerun exact-head CI after any base/head change.
2. Integrate the corrected commercial guard so the current-main PostgreSQL and same-commit integrated gate become green.
3. Keep #349's CW-056/057 candidates separate from the approved baseline and reconcile its inherited CI failure after main is corrected.
4. Complete empty-tenant Customer Admin bootstrap, authenticated support-admin journey and owner-defined SLA policy.
5. Finish restricted worker identity, independent supervision, alerts, backup/recovery runbooks and second-engineer release demonstration.

No approved requirement or chapter was edited. No branch was deleted, no merge was performed, no chargeable cloud resource was provisioned, and no real external/provider action was triggered.


---

## Mainline evidence refresh — 2026-11-07 08:00 IST

Evidence baseline: live `main` SHA `eb1704501480847a47e8fa138176ff400fbc4250`, resolved immediately before this reporting update. This section supersedes the older seven-checkpoint snapshot. Exact-head evidence is not inherited across a later commit; each subsequent run must resolve `main` again and match the Actions `head_sha`.

### 1. Requirements reconciliation — AMBER

- The approved baseline remains 228 requirements across Chapters 463–500 (38 chapters); the crosswalk records zero baseline changes.
- The v34 source export retains 45 original candidate rows. The current technical crosswalk records zero exact mappings and 45 partial links to shared controls. It proposes 45 additive v1.6.0 draft requirements; these are not owner-approved or implemented by virtue of the crosswalk.
- The separate owner-directed commercial additions CW-046–055 remain distinct from the original 45 v34 rows.
- The 228/38 automated pilot matrix last passed on predecessor main SHA `a6b24aea9ca85c4ffa5aecb73d8ab48cd73f1379` (run 42329379609): 259 passed checks, zero failed, 38 chapters, no failed chapters. That result is historical for that SHA and must be refreshed after a head change.
- Next: preserve all 228/38 identifiers, complete feature-level v34 traceability without fabricated exact REQ matches, and obtain explicit owner approval before promoting additive scope.

### 2. Fresh-clone setup and PostgreSQL — GREEN for local reproducibility; production recovery remains unproven

- PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`.
- Exact-main fresh-clone run 42330179708 on `eb1704501480847a47e8fa138176ff400fbc4250` passed `npm ci`, `npm run dev:verify`, local PostgreSQL 16 integration and the disposable backup/restore smoke.
- Test result: 1,459 tests, 1,454 passed, zero failed, five skipped. The final marker was `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- Backup/restore smoke passed with 79 source/restored base tables and seven migration-ledger tables.
- The seven migration groups include identity. The developer guide now distinguishes migration-runner ledger repeatability from direct SQL DDL replay.
- On predecessor main SHA `a6b24aea9ca85c4ffa5aecb73d8ab48cd73f1379`, EPER CI run 42329379580 directly executed asset migrations 021, 022 and 023 twice on PostgreSQL 16, preserved a sentinel asset, checked ENABLE/FORCE RLS, policies and least-privilege grants, and passed the live upload-reservation integration test (1 passed, zero failed). Issue #427 was closed with this exact evidence. This predecessor run is not presented as a current-head check.
- No production-scale capacity, off-host backup, key-custody, retention, RPO/RTO or independent disaster-recovery proof is asserted.

### 3. Customer identity and authorization — AMBER

- Merged foundations: PR #310 (`88b9708d748c19dc80a1a2d7ad4960914451db7e`), PR #324 (`a554990cb7f4969bb218aad7a2e9944aec62fa05`) and PR #329 (`82a82d92222c613c02e55f01211ecbb32ce63bba`).
- Current main contains provider-neutral OIDC browser routes, PKCE/state/nonce protections, durable sessions, secure session/CSRF cookies, logout/revocation and server-derived tenant/actor/application assignment checks.
- The exact-main fresh-clone suite includes live PostgreSQL tenant/actor assignment tests. The latest Chromium OIDC browser run before this snapshot was 42329222398 on predecessor SHA `5f797bd60701d8d3f00b8383c0fe5c2fc2751400`; it is not carried forward as an exact-`main` browser result.
- The browser workflow uses a deterministic test issuer. It does not prove production identity-provider interoperability or operator credential lifecycle.

### 4. Customer workspace and support — AMBER

- The customer workspace has OIDC sign-in, assigned-application views, help/growth sections, tenant-scoped asset listing, ticket submission/history and customer-visible replies.
- The support-admin console has queue filtering, triage/status, assignment, severity/P1 rationale, reply threads with internal/customer-visible separation and filtered export.
- The admin support UI still uses a configured bearer credential rather than an integrated browser-admin OIDC journey. No verified SLA timer, response/resolution target or escalation-policy evidence was found in the current support flow.
- The asset view has list/filter/export and a download action, but no customer file-upload control. `main.ts` constructs the durable asset repository but does not inject `assetUploadPort` or `assetStoragePort`; the server therefore has no concrete upload/download provider in its main composition. The provider-neutral adapter also collapses thrown/unsuccessful provider outcomes to `null`, rather than distinguishing definitive rejection from an unknown outcome.
- The complete binary journey (upload, durable recovery, transfer, verification/scanning and authorized download) is not delivered on main. Issue #421 remains open; related provider/workspace work remains draft-branch-only.

### 5. Scheduler and workflow operations — AMBER

- Current main worker entrypoints are `agent-worker-main.ts` and `campaign-scheduler-main.ts`. An independent workflow outbox worker is not yet on main.
- Draft PR #400 contains the independent worker; draft PR #411 adds stale-claim fencing. Exact-head branch evidence includes lease renewal, fencing, idempotency, retry/dead-letter behavior, shutdown recovery and approved-dispatch parking. PR #411 fresh-clone run 42222084089 passed 1,437 of 1,442 tests, zero failed, five skipped; its live restricted-worker-login test was skipped.
- These are branch-only results, not mainline delivery. Independent process supervision, restricted worker identity proof, operational alerting/metrics and a second-operator recovery rehearsal remain.

### 6. Consolidation and repository governance — RED/AMBER

- The live inventory contains 29 open PRs and every one is still draft. Exact-head Actions were checked for every current open PR; selected capability job logs were inspected. The exact-head runs are successful. Where an integrated gate path-skipped the 228/38 matrix, a separate standalone matrix run on that same head passed.
- The main-branch-only functional delivery policy is effective: main is the product source of truth; stacked PRs are review/integration artifacts and must not hold approved functionality hostage.
- Repository rulesets returned an empty collection. The branch-protection endpoint returned HTTP 403 through the connected GitHub integration, so protection is not verified and must not be assumed enabled.
- Do not bulk-merge or mass-close drafts. Reconcile each branch against the live main SHA; close only after its full scope is demonstrably present on main.

### 7. Release and independent continuity — AMBER

- The clean-clone guide, local PostgreSQL verification, migration repeatability and disposable local restore smoke are documented and reproducible.
- The continuity charter remains a proposed control baseline. The acceptance checklist still requires active repository protection, tested backup/restore runbooks, incident/recovery procedures, supervised worker operations and a demonstrated second-engineer build/test/release path.
- No chargeable cloud resources or real external/provider actions are part of this evidence.

### Immediate owner priorities

1. Complete provider outcome classification and a deterministic isolated storage-provider integration; then prove the browser upload/transfer/scan/download journey.
2. Complete migration 026 legacy upgrade, backfill, checksum-drift and restricted-role acceptance under issue #425; do not alter applied migrations 021/023.
3. Bring the independent workflow outbox worker and its supervision/metrics/recovery controls onto main as a coherent slice.
4. Complete support service-level targets/escalation and the authenticated support-admin journey.
5. Reconcile stacked drafts against current main and enable owner-approved branch/ruleset controls.
6. Demonstrate an independent second-engineer release and recovery path.

No approved requirement or chapter was changed by this reporting update.


### Exact-head CI correction — 2026-11-07 08:17 IST

On reporting commit `4c14305b97dadfb0977e80826b0ff9d1c8c50f38`, exact-head EPER CI run 42330877424 failed only in `postgres-customer-asset-upload-recovery.integration.test.mjs`. The assertion filtered both upload-completion and scan-completion audit events by the asset ID. The repository intentionally keys `customer.asset.upload.complete` by the durable upload-session ID (and carries the asset ID in its payload), while `customer.asset.scan.complete` is keyed by the asset ID. The test is corrected to assert those two distinct resource identities and their linkage. No production code, migration or data behavior was changed. The correction must pass on its new exact main SHA before EPER CI is considered green.


### Exact-head CI follow-up — 2026-11-07 08:20 IST

The first follow-up on `b610603755c65f91517191ecce12e2e2b9d273b2` (EPER CI run 42331126001) still failed in the corrected audit assertion: PostgreSQL result columns are exposed as `resource_id` and `resource_type`, not camelCase property names. The test now uses the returned snake_case fields. This remains a test-only correction; no production code or migration was changed. The new exact-main run must pass before EPER CI is considered green.


### Dated operating update — 2026-11-07 08:27 IST

**Evidence baseline:** current main immediately before this documentation update was `22f976db832c4b14cf31ea92b70b0610673491ea` (`test(assets): assert PostgreSQL audit resource columns correctly`). This appendix is an append-only assessment of that exact source SHA; it does not change the approved product baseline.

#### Exact-main technical evidence

- EPER CI: PASS — run [42331249265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249265).
- Same-commit integrated validation: PASS — run [42331249067](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249067); all component jobs and the final same-commit gate passed.
- Fresh-clone PostgreSQL verification: PASS — run [42331248955](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331248955). `npm run dev:verify`: 1,459 tests, 1,454 passed, 0 failed, 5 skipped. Disposable PostgreSQL 16 backup/restore passed with 79 source/restored base tables and seven migration ledgers.
- Controlled QA technical re-execution: PASS — run [42331248952](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331248952).
- Chromium customer OIDC lifecycle: PASS — run [42331249128](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249128); customer login/protected access/logout/revocation and Product Admin remediation browser flow each passed 1/1. The browser uses a deterministic test issuer; production identity-provider interoperability is not asserted.
- The integrated 228/38 matrix reports 228 requirements, 38/38 chapter suites, 259/259 chapter tests and 28/28 HTTP smoke checks across nine chapters with HTTP pilot apps. Artifact: [EPER-INTEGRATED-228-MATRIX-42331249067](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249067).
- The current mainline exact-SHA workflow set is recorded as 11/11 green in the 2026-11-07 governance update on [issue #417](https://github.com/sbannai/enterprise-product-engineering/issues/417). This is technical validation only; it does not authorize Business UAT or production operation.

#### Seven-checkpoint assessment

| Checkpoint | Status | Evidence-led position |
|---|---|---|
| 1. Product USP and positioning | AMBER | v34 crosswalk preserves all 45 source candidates and their acceptance text. It claims zero exact matches to the 228 baseline, 45 partial links to shared controls and 45 additive v1.6.0 draft candidates; four overlap the existing approval control. The approved 228 requirements and 38 chapters are unchanged. Owner approval of additive requirements remains pending; CW-060 still needs one canonical disposition while preserving CW-061. |
| 2. CI and persistence foundations | AMBER | Fresh-clone verification, seven migration groups, PostgreSQL integration and disposable local backup/restore pass on the evidence SHA above. Capacity/load targets remain unmeasured. Migration 026 is not yet accepted on main: issue #425 still requires legacy pre-026 upgrade/backfill, migration-specific replay/checksum, RLS and restricted-role acceptance. Branch-only migration-026 evidence must not be reported as mainline delivery. |
| 3. Architecture and execution boundaries | AMBER | Mainline OIDC routes, PKCE/state/nonce, durable sessions, secure cookies, CSRF, logout/revocation and tenant/application assignment checks have browser and live-PostgreSQL evidence. The test issuer does not prove production IdP interoperability or credential operations. The support-admin browser OIDC journey remains incomplete. |
| 4. Workflow execution design and schema | AMBER | Mainline campaign scheduler has a continuous worker loop, durable claims/lease renewal, dispatch fencing, idempotency, retry/dead-letter and current-policy authorization boundaries. The independent workflow outbox worker remains draft-branch work; two-connection PostgreSQL concurrency and approval-revocation serialization evidence are still required. |
| 5. Integrated validation | GREEN | Exact-main EPER CI, same-commit integrated validation, fresh-clone PostgreSQL, controlled QA, Chromium OIDC, 228/38 pilot matrix, six-family HTTP smoke, container smoke, workflow validation and G9 reconciliation are recorded green on the evidence SHA. The 228/38 matrix is an automated technical pilot, not business acceptance. |
| 6. PR consolidation and governance | RED | The live inventory contains 29 open PRs; all 29 are drafts. Every current head was checked for exact-head Actions; returned runs are successful, with standalone matrix evidence used where an integrated path was skipped. However, all 29 branches diverge from current main and are 73 commits behind it, sharing merge base `2c380d79c55c9183a42ed534ffd1a504f7d41316`. Exact-head green runs do not make these stale-base branches merge-ready. Reconcile one dependency-complete slice at a time against current main, then rerun all required checks. Repository rulesets are empty; branch protection is not verified. |
| 7. Workflow publisher/runtime implementation | AMBER | Campaign scheduler process entrypoint and runtime loop exist, but operational supervision, metrics/alerts, load/recovery and independent operator rehearsal remain incomplete. The independent workflow outbox worker and its restricted identity are not on main. |

#### Seven user-approved delivery pointers

1. **v34-to-228 reconciliation:** technical crosswalk delivered; approved baseline remains 228 requirements / 38 chapters. Additive v1.6.0 candidates remain unapproved.
2. **Fresh-clone developer setup:** delivered and verified on the evidence SHA using `npm run dev:verify`; PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859` and is an ancestor of main.
3. **PostgreSQL:** mainline migration groups, live integration and disposable backup/restore pass. Migration 026's branch-only upgrade/backfill/RLS/least-privilege acceptance remains open under issue #425. Production-scale capacity and off-host recovery are not measured.
4. **Identity:** PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e`, PR #324 merge `a554990cb7f4969bb218aad7a2e9944aec62fa05`, and PR #329 merge `82a82d92222c613c02e55f01211ecbb32ce63bba` are ancestors of main. Browser OIDC and assignment tests pass with a synthetic issuer; production IdP interoperability is not claimed.
5. **Customer workspace/support:** ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note separation and filtered export are implemented. SLA timers/escalation and support-admin browser OIDC remain open. The API composition root creates the asset repository but does not inject `assetUploadPort` or `assetStoragePort`; the full customer binary upload/recovery/verification/scan/download journey is not delivered on main. Issue #421 remains open.
6. **Scheduler/workflow:** campaign worker foundations are on main; independent workflow outbox worker remains branch-only under #400/#411 and requires PostgreSQL concurrency, fencing, approval-revocation and supervision/metrics/recovery proof.
7. **Release/continuity:** local fresh-clone and disposable restore evidence exists. Branch/ruleset enforcement, off-host backup, RPO/RTO, operational runbooks and a demonstrated second-engineer release/recovery path remain incomplete. The continuity charter remains a proposed standard, not evidence that these controls are active.

#### Live PR inventory and integration rule

- Open PRs: 29; drafts: 29; ready-for-review: 0.
- All 29 current heads are 73 commits behind main and diverged from the same merge base. Exact head SHAs and workflow/run evidence are recorded in the dated owner brief and PR ledger; no head was treated as current-main evidence.
- PR #384 is especially unsuitable for wholesale merge: 140 commits ahead / 73 behind, 23 changed files, and GitHub reports it non-mergeable/dirty. Preserve its unique scope only through smaller main-based slices.
- Do not bulk-merge, mass-close or delete branches. Main remains the only functional source of truth. Reconcile each retained PR against current main and its linked issue; close only when its complete scope is present on main or explicitly withdrawn with no lost acceptance criteria.

#### Continuity and release guardrails

- No chargeable cloud resources were provisioned.
- No real external/provider dispatch or credentialed provider action was triggered.
- No production-scale capacity, off-host backup, key-custody, retention, RPO/RTO or second-engineer disaster-recovery proof is asserted.
- No approved requirement or chapter was changed by this update.
- This scorecard does not authorize Business UAT or production use.

**Next concrete actions:** (1) deliver the customer-asset provider composition and safe reservation-recovery slice directly from current main; (2) complete migration-026 legacy-upgrade/RLS/least-privilege acceptance; (3) implement and test the workflow outbox worker's two-connection concurrency and approval-revocation boundary on a current-main-based slice; (4) reconcile the 29 stale draft branches without wholesale merges; (5) obtain owner-approved branch/ruleset controls and independent release/recovery evidence.


---

## Append-only checkpoint — 2026-11-07 08:50 IST

### Mainline identity and evidence boundary
- Latest commit returned by the repository's commit search: `2f42e87b0b88a74ef856a9b709d68d1d39eba1de` (`test(assets): keep upload reservation fixture unexpired`). This is the source baseline for this checkpoint; do not substitute the earlier audit SHA `22f976db832c4b14cf31ea92b70b0610673491ea`.
- Commit-scoped workflow-run lookup and combined-status lookup returned no records for `2f42e87b0b88a74ef856a9b709d68d1d39eba1de`. Current-head CI is **NOT ASSESSED** from these lookups; previously green workflow evidence remains attached only to its exact historical SHA.
- Current open-PR search returned 30 results. PR-only code and green PR-head workflows are not mainline delivery evidence.

### Customer asset vertical slice — corrected status
- **Delivered on main:** PostgreSQL asset repository/reservation foundation and migration 021–023 integration coverage. Issue #427 records PostgreSQL 16 double-execution, RLS/FORCE RLS, grants and sentinel-data retention evidence on its cited historical exact SHA. Do not reopen migration 021 as an unimplemented defect without new contrary evidence.
- **Not delivered as an integrated mainline journey:** the API composition root constructs/passes `customerAssetRepository`, but does not supply `assetUploadPort`, `assetStoragePort`, or `assetDownloadResolver`. The server builds its upload grant issuer only when an upload port and configured allowlisted storage hosts are supplied; otherwise the upload route returns `503 customer_asset_upload_provider_unavailable`.
- **Next implementation authority:** issue #397 — versioned allowlisted provider runtime, tenant/application binding and policy revalidation, server-side secret resolution, narrow storage/verification/download/scanner contracts, fail-closed configuration and network-free test drivers. Keep the provider worker independently supervised; do not place a timer or long-lived dispatch loop in the API request process.
- **Acceptance authority:** issue #405 — browser real-byte journey through reservation, transfer, verification, scan-pending/clean gating, authorized download, retry/reload recovery, audit visibility and tenant/application denial.
- Migration 026 / branch PR #423/#426 remains a separate reconciliation and acceptance item under #425. It must be reconciled with main's migration 023 index names and executed through the actual PostgreSQL 16 migration runner before its evidence is accepted.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER** — durable asset reservation exists; complete customer binary journey is not proven on main.
2. CI/persistence: **GREEN only for the historically named PostgreSQL lanes; AMBER for latest main** — latest exact-SHA checks not assessed by current lookup.
3. Architecture/execution: **AMBER** — injectable asset ports exist, but composition-root provider runtime wiring is absent.
4. Workflow/runtime: **AMBER** — workflow outbox worker evidence is separate from the provider-operation worker and does not close asset storage/scanner execution.
5. Integrated validation: **AMBER** — no exact-current-main end-to-end asset browser journey evidence.
6. PR governance: **RED/AMBER** — 30 open PR search results; retain main as functional source of truth; no wholesale merge/close/delete.
7. Operations/continuity: **AMBER** — no production provider dispatch, chargeable cloud resources, off-host recovery or Business UAT evidence is asserted.

### Immediate sequence and guardrails
1. Implement the provider runtime composition as a small main-based slice under #397, with explicit disabled-by-default configuration and production fail-closed checks.
2. Add local fake storage, object-verification and scanner drivers; prove no network access and production prohibition.
3. Wire tenant/application provider binding, capability/version and credential-reference resolution before dispatch; redact secrets and raw provider references.
4. Run exact-SHA PostgreSQL/provider lifecycle/API tests, then #405 browser real-byte E2E on the same reconciled commit.
5. Reconcile migration 026 independently; do not import divergent migration stacks wholesale.

No merge, PR closure, branch deletion, real provider dispatch, cloud provisioning, requirement-baseline change, production release or Business UAT authorization is made by this checkpoint.


---

## Append-only checkpoint — 2026-11-07 live exact-main delivery watch

### Mainline identity and evidence boundary
- Dynamically resolved `main` SHA: `55cf32d36592ddb9cc3b85e9caf2890e4bbbb5c1` (`docs: append 2026-11-07 mainline asset checkpoint`). A direct compare confirms this is exactly one documentation-only commit ahead of `2f42e87b0b88a74ef856a9b709d68d1d39eba1de`; the only changed path is this scorecard. The tested application source baseline therefore remains `2f42e87b0b88a74ef856a9b709d68d1d39eba1de`.
- Exact-current-main check-run lookup returned successful conclusions for every listed check. Relevant run evidence: EPER CI `42333471332`; integrated validation `42333471335`; six-family HTTP smoke `42333471348`; container smoke `42333471313`; 228/38 matrix `42333471314`; G9 reconciliation `42333471316`; controlled QA re-execution `42333472489`.
- Current-main PostgreSQL/integration job `128284999957` in run `42333471335` completed with 1,436 tests passed and zero failures. It applied payment, audit/admin, identity, capability/worker, workflow, scheduler and ticketing schemas; workflow and ticketing repeatability checks passed.
- Exact-main 228/38 matrix job `128284999538` in run `42333471335` reports 228 requirements, 38 chapter passes, 259 passed tests, zero failed tests and 28 passed checks. G9 job `128284999327` in run `42333471316` reports five passed and zero failed checks, including 228 unique requirements.
- Fresh-clone evidence run `42332629331`, job `128282370395`, is attached to parent source SHA `2f42e87b0b88a74ef856a9b709d68d1d39eba1de`: `npm run dev:verify` passed; 1,459 tests, 1,454 passed, zero failed, five skipped; disposable PostgreSQL backup/restore passed with 79 source/restored base tables and seven migration-ledger tables. Because `55cf32d` changes only this document, the tested application source is unchanged. Do not relabel the historical run as having executed on SHA `55cf32d`.

### Seven user-approved delivery pointers
1. **v34-to-228 reconciliation — AMBER.** Preserve the approved 228 requirements and 38 chapters. The current exact-main matrix passes for all 228 requirements and all 38 chapter groups. The v34 crosswalk is a technical reconciliation, not authorization of additive v1.6.0 candidates; those remain unapproved.
2. **Fresh-clone setup — GREEN for the local developer baseline.** PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`, an ancestor of current main. The exact source-parent fresh-clone run above proves the one-command verification and disposable local restore. This is not off-host disaster-recovery evidence.
3. **PostgreSQL — AMBER.** Mainline identity and all seven developer-verification migration groups are exercised; checksum/repeatability and live PostgreSQL coverage pass. Disposable restore is proven locally only. Production-scale capacity, off-host backup/key custody and recovery objectives remain unproven. Branch-only migration-026 work must be reconciled with main's existing migration 023 before acceptance.
4. **Identity/OIDC — AMBER.** Merged foundations are ancestors of main: #310 `88b9708d748c19dc80a1a2d7ad4960914451db7e`, #324 `a554990cb7f4969bb218aad7a2e9944aec62fa05`, and #329 `82a82d92222c613c02e55f01211ecbb32ce63bba`. Main contains provider-neutral OIDC, durable sessions, browser security/CSRF and tenant/application assignment checks. The current-main workflow set does not provide a fresh browser E2E run against a real production identity provider; prior browser evidence uses a synthetic issuer. Do not claim production IdP interoperability.
5. **Customer workspace/support — AMBER.** Ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note separation and filtered export are present. SLA timers/escalation remain open. The asset repository and durable reservation are present, but current API composition supplies no upload port, storage port or download resolver; the upload route remains fail-closed with `503 customer_asset_upload_provider_unavailable`. Issues #397 (provider runtime) and #405 (real-byte browser acceptance) remain the delivery authorities.
6. **Scheduler/workflow — AMBER.** The campaign scheduler has a separate worker entrypoint and runtime loop. Workflow outbox domain/worker logic and tests exist on main, but the independent executable worker host, restricted worker migrations 015–017 and deployment-owned supervision path remain in the stacked #400/#411 work. Prove two-connection claim fencing, idempotency, retry/dead-letter, approval revocation, worker supervision, metrics and recovery in a current-main-based slice.
7. **Release/continuity — RED.** The repository rulesets API returns an empty list; the branch-protection endpoint is not accessible to this integration, so active protection cannot be asserted. Local disposable backup/restore is not off-host recovery. RPO/RTO, key custody/retention, tested incident and rollback runbooks, and an independently executed second-engineer release/recovery path remain unproven. The continuity charter is still a proposed standard, not evidence of active controls.

### Live open-PR and exact-head Actions reconciliation
- The live open-PR inventory was re-resolved; all returned entries are drafts. Each current head was looked up independently for Actions and a relevant job list/log was inspected. The returned exact-head runs were successful; there was no failed workflow requiring a correction. These branch checks validate only their own heads, not integration into main.
- Comparing every open head with current main shows PR #432 at seven commits ahead / two behind. The other open heads are diverged, share merge base `2c380d79c55c9183a42ed534ffd1a504f7d41316`, and are 76 commits behind current main. Do not merge stacked branches wholesale or treat green stale-base checks as mainline evidence.
- PR #432 is a documentation-only audit branch and still needs its audit references refreshed/rebased to current main before review. PR #384 and the provider/asset stacks must be decomposed into small main-based slices; do not use the branch's green status as merge approval.
- Current open PR purposes and exact head commits, base SHAs, compare distances, exact-head workflow/run IDs and selected job-log evidence are recorded in the accompanying live watch workbook.

### Customer-asset reservation and migration reconciliation
- Main's audit migration chain ends with `023_customer_asset_upload_recovery.sql`. The current PostgreSQL repository returns the existing durable upload-session ID for a same-key/same-fingerprint reservation, and the main integration test proves concurrent replay resolves to one session while fingerprint/actor/application conflicts are denied with audit evidence.
- The open #421 description's claim that the current service rejects the returned session because it differs from a newly generated UUID is not present in the current-main service code; the service uses the reservation's returned session ID. Revalidate #421 before duplicating or closing it. Provider uncertain-outcome/replay semantics remain a separate gap under #422; the provider adapter currently fails closed on an unavailable grant and must not be assumed to prove remote object creation/recovery.
- The stacked provider/asset branches contain colliding numbered audit migrations (separate files using 021, 022 and 023 for asset and provider-payload schemas). Their migration history cannot be imported wholesale. Reconcile a unique ordered sequence after main's existing 023; execute clean install, pre-change upgrade/backfill, repeat-run, checksum-drift, RLS/FORCE RLS and least-privilege tests on PostgreSQL 16 before accepting migration changes.

### Continuity guardrails and next actions
1. Implement the #397 provider runtime composition as a small current-main slice: versioned allowlisted adapter registry, tenant/application binding and policy revalidation, server-side opaque secret resolution, disabled-by-default configuration, and network-free synthetic storage/verification/scanner drivers. Keep provider workers outside the API request process.
2. Reconcile #422/#423/#426 upload outcome and migration changes against main's current reservation schema; resolve duplicate migration numbering and prove unknown-outcome recovery without duplicate provider objects.
3. Complete #405 real-byte browser E2E for reservation, transfer, verification, scan gating, authorized download, reload/retry, audit and cross-application denial.
4. Bring #400/#411 workflow outbox worker executable and restricted migrations onto a current-main-based slice; prove fencing, approval revocation and supervised recovery.
5. Complete #406 release controls with owner-approved rulesets, off-host recovery design/evidence, RPO/RTO, runbooks and independent second-engineer rehearsal.

No PR was merged or closed, no branch was deleted, no chargeable cloud resource was provisioned, no real external/provider action was triggered, and no approved requirement/chapter was changed by this checkpoint.


---

## Append-only checkpoint — 2026-11-07 19:15 IST

### Exact mainline identity and CI
- Dynamically resolved main SHA: `10009d8741687b8249bfe50d3999b6c7cc52ee3b` (`test(assets): include scope in provider lookup failure fixture`).
- Exact-SHA push workflows completed successfully: EPER CI run `42377814893`; integrated validation `42377814818`; fresh-clone PostgreSQL verification `42377814804`; 228-requirement pilot matrix `42377814777`; six-family HTTP smoke `42377814758`; controlled QA re-execution `42377814756`; container smoke `42377814735`; controlled UAT technical simulation `42377814840`; G9 reconciliation `42377814877`. All nine runs report completed/success. The integrated-validation run has six successful jobs, including PostgreSQL/payment contracts, G9/release artifact, UAT readiness audit, container/six-family smoke, 228/38 matrix and same-commit integrated gate. Fresh-clone PostgreSQL job passed. No separate commit status contexts were returned; workflow-run evidence is the verification source.

### #397 provider runtime — implementation boundary
- Main contains the six-operation provider runtime contracts and components: exact-version adapter registry, provider runtime resolution, credential resolution, PostgreSQL dispatch configuration service, driver dispatch service, runtime composition validator and opt-in configuration parser.
- Main `eper/apps/api/main.ts` still does not compose the policy/dispatch service, concrete provider runtime, or secret resolver into the API. If `EPER_PROVIDER_STORAGE_RUNTIME_ENABLED=true`, startup intentionally throws `PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED`. This is fail-closed and must remain so until the missing dependencies are explicitly supplied and tested.
- Missing integration work: instantiate the PostgreSQL tenant/application dispatch policy service on the dedicated provider-catalogue pool; supply an approved server-side secret-resolver implementation; supply provider driver registrations (network-free synthetic drivers for tests only; approved real drivers separately); adapt all six operations into the existing asset upload/lookup/renew/verify/download/scan ports; connect the runtime host allowlist to the asset grant validator; and test disabled-by-default plus incomplete/production startup rejection.
- No production secret resolver, real provider SDK, provider dispatch, customer binary, cloud resource, deployment or Business UAT is authorized or claimed. No approved requirement or chapter changed.

### Next slice
1. Implement and test a network-free synthetic storage/verification/download/scanner driver set with explicit `synthetic: true` metadata and production prohibition.
2. Wire the provider-catalogue PostgreSQL dispatch configuration and runtime composition into API startup only for a complete explicit opt-in; preserve disabled-by-default behavior.
3. Adapt the six runtime operations to the existing asset ports and prove host/HTTPS/TTL, tenant/application, credential redaction, upload recovery, verification, clean-scan and download authorization boundaries.
4. Run exact-head CI and PostgreSQL integration, then #405 real-byte browser journey on the same reconciled SHA.

No PR merge/closure, branch deletion, chargeable cloud provisioning, production provider call, release or Business UAT authorization is made by this checkpoint.


---

## Append-only checkpoint — 2026-11-07 19:21 IST

### Exact mainline identity and merged delivery
- Main SHA at checkpoint: `3e52ede4a16ba5cf5b2cf5bf2d4d9e807334ec9a` (`test(assets): cover all six synthetic provider dispatch operations`). This is the squash merge commit for PR [#438](https://github.com/sbannai/enterprise-product-engineering/pull/438).
- PR #438 adds 72 lines to `eper/tests/provider-storage-driver-dispatch-service.test.mjs`, covering all six dispatch operation kinds: upload grant, upload lookup, upload renewal, object verification, download grant and malware scan. It asserts exact capability routing, one matching driver invocation, conservative synthetic outcomes and credential redaction.
- PR-head CI completed successfully for all applicable checks. The 228 requirements / 38 chapter pilot matrix was skipped by the path filter; it is not counted as a pass from this PR. The PR was marked ready only after checks completed and then squash-merged. No runtime composition or production capability was delivered by this test-only change.
- Post-merge check runs on exact main SHA `3e52ede4a16ba5cf5b2cf5bf2d4d9e807334ec9a` were queued at the time of inspection. They must be rechecked on this SHA before reporting mainline CI as green.

### Seven-checkpoint impact
1. **Product/customer journey — AMBER:** no new customer-visible behavior; the six provider dispatch paths now have explicit synthetic unit coverage.
2. **CI/persistence — AMBER pending post-merge checks:** applicable PR-head checks passed; exact-main post-merge workflows were queued, not yet passed.
3. **Architecture/execution — AMBER:** dispatch contract routing is tested; API composition, provider secret resolution and real adapter registrations remain absent. The production runtime startup guard remains intentionally fail-closed.
4. **Workflow/runtime — AMBER:** no change to worker execution or supervision.
5. **Integrated validation — AMBER pending exact-main evidence:** post-merge integrated and PostgreSQL checks are not yet complete.
6. **PR governance — AMBER:** PR #438 is merged and no longer an open branch dependency; continue reconciling other PRs individually against main, not by bulk merge.
7. **Release/continuity — RED/AMBER:** no new release, off-host recovery or operational-readiness evidence. Business UAT remains unauthorized.

### Next concrete action and guardrails
- Recheck all workflows against exact main SHA `3e52ede4a16ba5cf5b2cf5bf2d4d9e807334ec9a`; resolve any failures before treating the mainline as green.
- Continue #397 from this mainline: explicitly compose the dedicated provider-catalogue dispatch resolver, approved server-side secret resolver and driver registrations, and adapt the six operations through existing asset ports. Keep runtime disabled by default and reject incomplete/production synthetic configuration. Do not fabricate a real secret-manager or provider implementation; if no approved implementation exists, retain the startup guard and document the dependency.
- Preserve 228 approved requirements / 38 chapters; no chargeable cloud resources, real provider calls, customer binaries, production deployment or Business UAT authorization.


---

## Append-only checkpoint — 2026-11-07 19:35 IST

### Exact mainline and post-merge validation
- Dynamically resolved `main`: `25004337d609123b6db0b8554862f9368a812609` (`docs(eper): record provider dispatch test merge checkpoint`).
- The current main check-run set now contains 13 entries: 12 completed successfully and the `Same-commit integrated gate` remains in progress. This includes successful exact-main checks for build/test, controlled QA re-execution, controlled UAT technical simulation, container health, all six capability-family HTTP smoke, G9 reconciliation, release artifact, UAT readiness audit, payment API/PostgreSQL/receipt contracts, and the 228 requirements / 38 chapter pilot matrix. Do not call the full integrated gate complete until its final check concludes.
- PR #438 remains merged at application commit `3e52ede4a16ba5cf5b2cf5bf2d4d9e807334ec9a`; its six-operation provider-dispatch test coverage is present on main. The current main tip is one documentation checkpoint commit after that application merge.

### #397 provider runtime — current composition boundary
- Re-inspected `eper/apps/api/main.ts`, `eper/apps/api/server.ts`, the runtime composition/configuration modules, and the existing runtime/dispatch/API tests on current main.
- The entrypoint parses the runtime flag before constructing PostgreSQL pools and deliberately throws `PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED` on opt-in. The dedicated provider-catalogue pool and repository currently activate only for catalogue administration or provider connections; the runtime flag is not yet wired into that database boundary.
- `createAppServer` already exposes injection points for upload grant, upload lookup, storage download, and customer-asset persistence, but current `main.ts` supplies no provider upload/storage/download ports. The customer upload route therefore continues to return `503 customer_asset_upload_provider_unavailable` when no approved provider is configured.
- Existing unit tests cover disabled-by-default config, complete six-operation declarations, production rejection of synthetic adapters, composition dependency requirements, six dispatch operation routes, tenant/application scope checks, and credential non-disclosure. The API test suite also proves the upload endpoint fails closed without a provider.
- No approved production secret resolver or real provider driver implementation is present in the inspected mainline. A synthetic resolver/driver must not be promoted as a production dependency. Therefore no runtime wiring change is safe in this slice; the startup guard remains correct.

### Seven-checkpoint impact and next action
1. Product/customer journey: **AMBER** — provider-backed asset upload/download is still unavailable without an approved provider.
2. CI/persistence: **AMBER pending integrated gate** — 12 checks passed; the same-commit integrated gate remains in progress.
3. Architecture/identity: **AMBER** — provider dispatch contracts and six-operation tests exist; production secret resolution and real driver registration are not supplied.
4. Workflow/runtime: **AMBER** — no worker/runtime behavior changed.
5. Integrated validation: **AMBER pending final gate** — do not infer completion from the successful component jobs alone.
6. PR governance: **AMBER** — PR #438 merged; remaining open branches are not to be bulk-merged, and stacked asset/provider branches require individual mainline reconciliation.
7. Release/continuity: **RED/AMBER** — no new off-host recovery, production provider, or release evidence; Business UAT remains unauthorized.

Next safe engineering action: keep #397 open and obtain an approved server-side secret-manager integration and provider driver ownership/implementation before changing the API composition root. Then implement a small current-main-based adapter slice and run exact-head API, PostgreSQL, security and integrated checks. Preserve the 228 approved requirements / 38 chapters. No cloud resource, real provider call, customer binary, deployment, merge, or Business UAT authorization is made by this checkpoint.


---

## Append-only checkpoint — 2026-11-07 19:42 IST

### Mainline CI confirmation
- Dynamically resolved `main`: `4f88bc33c830eb26da256c1dc53be3c907228d81`.
- All 13 exact-SHA check runs completed successfully, including the same-commit integrated gate, PostgreSQL/payment/receipt contracts, UAT technical/readiness audit, release/G9 checks, six-family HTTP/container smoke, and the 228 requirements / 38 chapter pilot matrix.
- This is technical verification only; it does not authorize Business UAT.

### Workflow worker consolidation — #436
- Re-inspected current-main workflow outbox implementation. Main already contains the PostgreSQL outbox store, context discovery, bounded worker, continuous process loop, runtime composition and SIGINT/SIGTERM host adapter. It does not yet contain the independent executable worker entrypoint, restricted database login privilege gate/migrations, approved-dispatcher module boundary, or package launch script.
- PR #400 contains a candidate implementation for those missing deployment-boundary pieces, but it is based on `2c380d79c55c9183a42ed534ffd1a504f7d41316`; comparison with current main shows 31 commits ahead and 136 behind, with divergent history. Its exact-head checks passed on its old base, but do not validate current main. Do not merge it wholesale.
- PR #387 is also 22 commits ahead and 136 behind current main. Its historical green checks are not current-main evidence. Leave it draft pending a small, reconciled extraction.
- Issue #408 is closed with claim-generation fencing implemented in a draft PR #411; that branch is also not a substitute for a current-main PostgreSQL concurrency test. Keep the fencing acceptance in #436 until re-proven on current main.
- Current main has not been shown to execute the complete worker lifecycle through an independent process against a dedicated restricted PostgreSQL login. The worker remains a code-level foundation, not an operationally activated service.

### Next controlled slice
1. Reconcile the worker-access migration numbers and actual current-main outbox/assignment schema before adding migrations 015/016.
2. Port the restricted-role assertion and least-privilege grants as a main-based slice, proving the live dedicated login, FORCE RLS, no owner/elevated membership, column-only assignment discovery, and column-scoped delivery updates.
3. Add the separately launchable entrypoint and bounded config; require explicit opt-in and an owner-approved dispatcher module, with no default/no-op implementation.
4. Prove claim, renewal, immediate approval recheck, dispatch idempotency, retries/dead-letter, claim-generation fencing, SIGTERM shutdown and pool closure in fresh-clone plus PostgreSQL 16 integration on the exact resulting SHA.
5. Keep deployment, dispatcher activation, cloud provisioning, external actions and Business UAT out of scope until separately approved.

No PR was merged or closed; no branch was deleted; no requirements changed; no cloud resources or external actions were triggered.


---

## Append-only checkpoint — 2026-11-07 20:08 IST

### Exact mainline CI
- Dynamically re-resolved `main`: `4c45f951ee974cf71de862852fcba1a911600d69`.
- All 13 exact-SHA check runs completed successfully, including the same-commit integrated gate, PostgreSQL/payment/receipt contracts, UAT readiness/technical audit, six-family HTTP/container checks, G9/release checks, and 228 requirements / 38 chapter pilot matrix.
- Technical verification only; Business UAT remains unauthorized.

### #436 worker migration reconciliation
- Current workflow migration chain ends at `014_workflow_definition_drafts.sql`; candidate #400 migrations 015/016 have no numeric collision with the current workflow chain.
- Current audit migration 008 defines `eper_tenant_application_assignment` with `tenant_id`, `application_id`, and `assignment_status`; these are the only columns required by the worker context-discovery query.
- Current workflow migration 006 defines the outbox events and delivery tables with ENABLE + FORCE ROW LEVEL SECURITY. Candidate worker role/table privileges are compatible in principle with the current schema.
- Candidate #400 migration 015 grants table-wide SELECT on assignment metadata, while migration 016 narrows that to three columns in a later transaction. This is not accepted as-is: a failed/interrupted migration sequence after 015 leaves the wider grant in place. Port one atomic least-privilege migration granting only SELECT on `tenant_id`, `application_id`, and `assignment_status` from the outset.
- Existing audit migration 016 establishes a precedent for NOLOGIN restricted group roles with operator-provisioned LOGIN memberships. Role creation still requires a migration identity with CREATEROLE or an operator-run bootstrap. No login/password is to be stored in the repository.
- Issue #436 updated with the exact findings and acceptance conditions (comment 6707976445).

### Next acceptance slice
1. Port one atomic restricted-role migration from current main, with column-only assignment discovery and column-scoped delivery updates.
2. Add privilege tests for no table-wide/metadata reads, no assignment/event writes, no delivery insert/delete/truncate, FORCE RLS, and no owner/elevated membership.
3. Port the independently launchable worker boundary as a small current-main slice, disabled by default and restricted to a deployment-bundled approved dispatcher.
4. Prove the real dedicated LOGIN on PostgreSQL 16, then current-main concurrency/fencing, approval revocation, retries/dead-letter, shutdown and pool closure.
5. Do not activate the worker, dispatcher, production integrations, external actions, cloud resources or Business UAT as part of this slice.

No PR was merged or closed; no branch was deleted; no approved requirement or chapter changed; no cloud resource or external action was triggered.


---

## Append-only checkpoint — 2026-11-07 20:17 IST

### Workflow outbox restricted-role slice — PR #439 merged
- PR #439 merged to main by squash at `5f8c74e57ea8488e8c3533aa9ea94eb5e7aa643c`. Main now resolves to this exact SHA.
- Exact PR head was `4765c67dfbac58682325bf4169e26e618ed760cd`; PR was made ready only after validation completed.
- 16 applicable check runs succeeded. The `228 requirements / 38 chapter pilot matrix` was skipped by path filtering and is explicitly not counted as a pass.
- The PostgreSQL 16 CI job provisioned a temporary restricted LOGIN, granted membership in `eper_workflow_outbox_worker_access`, and executed `workflow-outbox-worker-access.integration.test.mjs`: 1 test passed, 0 failed, 0 skipped. The test output explicitly reports that the dedicated login has only the approved database privileges.
- The same job passed workflow migration replay, live workflow execution integration, tenant/application assignment integration, commercial tariff access guard, and capability persistence checks. Workflow YAML validation and the same-commit integrated gate passed.
- Migration 015 is atomic and creates a NOLOGIN, non-superuser, non-bypass group role. Assignment discovery is restricted to `tenant_id`, `application_id`, `assignment_status`; event rows are read-only; delivery updates are column-scoped. No assignment/event writes, delivery insert/delete/truncate, or stored credentials were introduced.
- CI login/password are ephemeral to the PostgreSQL service. No chargeable cloud resources were provisioned.

### #436 — what this closes and what remains
- Closed by this merge: current-main restricted database group role, atomic least-privilege migration, migration contract coverage, and a real PostgreSQL 16 dedicated-login privilege proof.
- Still open: independently launchable worker process entrypoint, package launch script, bounded opt-in configuration, approved dispatcher boundary, current-main PostgreSQL claim-generation fencing/concurrency proof, and lifecycle proof for approval revocation, idempotency, retries/dead-letter, supervision, SIGTERM shutdown and pool closure.
- Worker remains disabled/not launched. No production dispatcher, external action or Business UAT is authorized.
- PR #400 and #387 remain stale/divergent candidates; do not merge them wholesale. PR #411 fencing evidence still requires current-main PostgreSQL revalidation.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER** — workflow outbox delivery is not yet operationally exposed as a supervised worker.
2. CI/persistence: **AMBER improved** — atomic migration and real dedicated-login PostgreSQL 16 proof are green; production operational proof remains outstanding.
3. Architecture/identity: **AMBER improved** — least-privilege database boundary is now present on main; approved dispatcher boundary remains.
4. Workflow/runtime: **AMBER** — outbox worker process lifecycle is not yet independently launchable or activated.
5. Integrated validation: **AMBER improved** — exact PR-head integrated gate passed; chapter matrix was path-filter skipped on this PR and is not inferred from this run.
6. PR governance: **AMBER improved** — #439 reconciled and merged; stale stacked branches still require individual extraction/reconciliation.
7. Release/continuity: **RED/AMBER** — no production worker deployment or continuity proof; Business UAT remains unauthorized.

Next safe action: port the independent worker entrypoint/configuration from the stale candidate only after re-reading it against this new main SHA. Keep explicit opt-in, fail-closed dispatcher loading, dedicated restricted database credentials, human approval recheck, claim fencing and graceful shutdown as required tests. Preserve all 228 approved requirements and 38 chapters. No cloud resource, production worker, provider action, customer external action or Business UAT authorization is made by this checkpoint.



---

## Append-only checkpoint — 2026-11-07 20:33 IST

### Workflow outbox startup and approval boundary — PR #440 merged
- PR #440 merged to main by squash at `c255d6ee735379930496e0cebae49990f9957e74`; main was re-resolved and confirmed at this exact SHA.
- Exact validated PR head: `6c90ed5524f08bf97086c723dbef6029af13b554`.
- 16 check runs succeeded; one separate `228 requirements / 38 chapter pilot matrix` check was skipped by path filtering and is not counted as a pass. The `chapter-pilot-matrix` workflow completed successfully, as did the same-commit integrated gate.
- PostgreSQL 16 dedicated-login baseline: 1 passed, 0 failed, 0 skipped.
- Startup privilege gate adversarial regression: 2 passed, 0 failed, 0 skipped. The test deliberately granted unauthorized column-level UPDATE privileges on delivery and assignment tables and verified startup rejected both.
- Worker config and approved-dispatcher contract suite: 18 passed, 0 failed, 0 skipped. Build/typecheck, migration replay, fresh-clone PostgreSQL verification, UAT technical simulation, release artifact, G9 reconciliation, six-family HTTP smoke and container smoke passed.
- Startup checks now reject excess column-level privileges, not merely table-level grants; assignment discovery remains limited to three approved columns; event rows remain read-only; delivery-state updates remain column-scoped.
- Human approval is checked for the exact event immediately before dispatch. Denied approval is parked in dead-letter without transient retry.
- No worker executable, launch script, production dispatcher, secret resolver, provider action, cloud resource or Business UAT authorization was added.

### #436 lifecycle status
- Completed on main: restricted NOLOGIN database role/migration and live dedicated PostgreSQL login proof (#439); bounded worker config; startup privilege gate with adversarial column-grant proof; approval-gated dispatcher interface and denial parking (#440).
- Still required: independently launchable worker process and package script; deployment-bundled module realpath/symlink containment at load time; current-main claim-generation fencing and two-worker concurrency proof; lease renewal/takeover; approval revocation race handling; idempotent delivery; retry/backoff/recovery; SIGTERM supervision and pool closure.
- The dispatcher remains an interface only. No external action or production activation is possible from this slice alone. Worker remains disabled and unlaunched.
- Stale PRs #400/#387/#411 remain extraction references only; no wholesale merge.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER** — workflow delivery still lacks an independently supervised worker process.
2. CI/persistence: **AMBER improved** — PostgreSQL 16 least-privilege startup proof, including adversarial column grants, is green on exact head.
3. Architecture/identity: **AMBER improved** — restricted role, RLS checks, and approval boundary are on main; actual production dispatcher is not.
4. Workflow/runtime: **AMBER improved** — configuration and approval gates exist; independent process lifecycle and fencing remain.
5. Integrated validation: **AMBER improved** — exact-head same-commit gate, chapter-pilot matrix workflow and fresh-clone verification succeeded; path-filter-skipped duplicate matrix check is not represented as passed.
6. PR governance: **AMBER improved** — #440 reconciled and merged individually; no orphan functionality was bulk-merged.
7. Release/continuity: **RED/AMBER** — no supervised production worker, production provider connection or Business UAT evidence/authorization.

Next safe slice: implement the independently launchable worker process on current main, with explicit opt-in and startup realpath containment, then prove claim-generation fencing and full lifecycle behavior on PostgreSQL 16 with two concurrent restricted worker logins. Preserve all 228 approved requirements and 38 chapters. No chargeable AWS resources, external provider actions or Business UAT authorization.



---

## Append-only checkpoint — 2026-11-07 20:43 IST

### Workflow outbox claim-generation fencing — PR #441 merged
- PR #441 merged to main by squash at `ac6e00dde35339983eae9867d4646b93171da049`; main was re-resolved and confirmed at this exact SHA.
- Exact validated PR head: `e94e98876d9f051cecbc2e22675e099c037b57c5`.
- 16 check runs succeeded; one duplicate `228 requirements / 38 chapter pilot matrix` check was skipped by path filtering and is not counted. The separate `chapter-pilot-matrix` workflow and same-commit integrated gate completed successfully.
- Migration 016 applied and replayed successfully on PostgreSQL 16. It adds a monotonic `claim_generation` token and grants the restricted worker role UPDATE on that column only.
- Live PostgreSQL 16 fencing test: **1 passed, 0 failed, 0 skipped**. First claim generation 1 was expired and reclaimed as generation 2 using the same worker ID; generation 1 could not renew, acknowledge or mark failure; generation 2 successfully marked the event delivered.
- Restricted-login privilege contract, startup gate, worker configuration/dispatcher contracts, migration/store unit tests, existing workflow execution integration, fresh-clone PostgreSQL verification, same-commit integrated gate and other applicable technical checks passed.
- Existing direct store callers in the workflow execution integration now pass the exact claim token returned by claim; no un-fenced acknowledgement path remains in that integration.
- No worker process was launched. No production dispatcher/provider action, cloud resource or Business UAT authorization.

### #436 lifecycle status
- Completed on main: restricted NOLOGIN worker role and atomic least-privilege migration (#439); explicit worker opt-in/configuration, startup privilege/RLS/ownership gate, approval-gated dispatcher interface and denial parking (#440); monotonic claim-generation fencing across claim, lease renewal, delivery acknowledgement and failure handling (#441).
- Still required: independently launchable worker process/package script; dispatcher realpath/symlink containment at module load; two independent restricted logins proving concurrent claim exclusion and takeover; lease renewal/expiry race coverage; approval revocation immediately before provider action; idempotent dispatch; retry/backoff/dead-letter recovery; SIGTERM supervision and pool closure.
- Worker remains disabled and unlaunched. The approved dispatcher is still an interface; no external action is activated.
- Stale PRs #400/#387/#411 remain extraction references only; no wholesale merge.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER** — delivery is not yet exposed through an independently supervised worker process.
2. CI/persistence: **AMBER improved** — PostgreSQL 16 proves the stale-claim fence with the restricted login.
3. Architecture/identity: **AMBER improved** — restricted role, RLS startup checks and claim ownership token are on main.
4. Workflow/runtime: **AMBER improved** — lease takeover is now fenced; process supervision and real dispatcher remain.
5. Integrated validation: **AMBER improved** — exact-head same-commit gate, chapter-pilot matrix workflow and fresh-clone PostgreSQL checks passed; the path-filter-skipped duplicate matrix check is not counted.
6. PR governance: **AMBER improved** — #441 reconciled and merged individually; no stale branch was bulk-merged.
7. Release/continuity: **RED/AMBER** — no independent production worker, production provider connection or Business UAT evidence/authorization.

Next safe slice: port the independent worker process entrypoint and package launch script from the stale candidate only after validating its imports and host lifecycle against current main. Keep explicit opt-in, realpath/symlink containment, dedicated restricted login, approval recheck and claim token propagation mandatory. Prove startup/shutdown with a fake dispatcher before any real provider integration. Preserve all 228 approved requirements and 38 chapters. No chargeable AWS resource, production worker, external action or Business UAT authorization.



---

## Append-only checkpoint — 2026-11-07 20:47 IST

### Standalone workflow outbox worker host — PR #442 merged
- PR #442 merged to main by squash at `07b3b728c4518a52ea99be162e6ee7f34dd376fc`; main was re-resolved and confirmed at this exact SHA.
- Exact validated PR head: `9586af1fb9a80a3faab0f93f5d782eb631089748`.
- 18 check runs succeeded; one duplicate `228 requirements / 38 chapter pilot matrix` check was skipped by path filtering and is not counted. The separate `chapter-pilot-matrix` workflow and same-commit integrated gate completed successfully.
- Added independently launchable `workflow-outbox-main.ts` and package script `npm run start:workflow-outbox-worker`; worker remains disabled unless explicit environment opt-in and all required settings are present.
- Startup checks the dedicated PostgreSQL login/role before importing a dispatcher. Dispatcher path is validated using filesystem realpath; symlink escapes, missing files and non-JavaScript targets are rejected.
- No default/no-op dispatcher exists. A configured module must explicitly export `createWorkflowOutboxDispatcher({ pool, env })` and provide both approval and dispatch operations.
- SIGINT/SIGTERM are mapped to AbortSignal; listeners are removed and PostgreSQL pool is closed on exit. Structured pass/error events are emitted.
- Build/typecheck passed. Dispatcher realpath tests: 3 passed, 0 failed, 0 skipped. Process-level fail-closed startup tests: 2 passed, 0 failed, 0 skipped. Worker/claim/store/config/approval contracts passed. Same-commit integrated gate, chapter-pilot matrix workflow, fresh-clone PostgreSQL, release and other applicable technical checks passed.
- Operations runbook added with restricted-login setup, required configuration, bounded runtime controls and deployment limitations.
- No production worker was launched; no dispatcher module, provider credentials, external action, cloud resource or Business UAT authorization was added.

### #436 lifecycle status
- Completed on main: restricted NOLOGIN worker role and live login proof (#439); startup privilege/RLS/ownership gate and approval-denial parking (#440); monotonic claim-generation fencing with live PostgreSQL takeover proof (#441); standalone fail-closed worker host, launch command, realpath containment and shutdown adapter (#442).
- Remaining: real dispatcher implementation backed by approved secret resolution; two independent restricted logins proving concurrent claim exclusion and takeover under simultaneous claims; lease expiry/renewal/shutdown race tests; durable approval revocation at the last possible point before external action; provider-side idempotency; full retry/dead-letter/replay operations; deployment supervisor/restart policy and production metrics.
- Worker remains disabled and unlaunched. No provider module is present. The runbook is operational guidance, not activation authorization.
- Stale PRs #400/#387/#411 remain extraction references only; no wholesale merge.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER improved** — an independent process boundary now exists, but no approved dispatcher or live provider delivery.
2. CI/persistence: **AMBER improved** — restricted role, startup checks and claim-generation fencing have exact PostgreSQL 16 evidence.
3. Architecture/identity: **AMBER improved** — dedicated credentials and realpath-contained dispatcher loading are enforced at startup.
4. Workflow/runtime: **AMBER improved** — process loop, launch script and graceful signal/pool cleanup are implemented; production supervision and provider lifecycle remain.
5. Integrated validation: **AMBER improved** — exact-head same-commit gate, chapter-pilot matrix workflow and fresh-clone PostgreSQL checks passed; path-filter-skipped duplicate matrix check is not counted.
6. PR governance: **AMBER improved** — #442 was individually reviewed, validated and merged; stale branches were not bulk-merged.
7. Release/continuity: **RED/AMBER** — no production dispatcher, provider credential path, supervised deployment or Business UAT evidence/authorization.

Next safe slice: prove two independently connected restricted worker logins competing for the same tenant/application queue, lease takeover after expiry, and signal-driven shutdown under a fake dispatcher. Then exercise durable approval revocation and idempotent dispatch using a synthetic/local adapter only. No real provider calls, chargeable AWS resources or Business UAT authorization. Preserve all 228 approved requirements and 38 chapters.



---

## Append-only checkpoint — 2026-11-07 20:57 IST

### Two-login workflow outbox concurrency and takeover — PR #443 merged
- PR #443 merged to main by squash at `cdc8ee4cdae4537d9c7ca046e50320cc237da3e3`; main was re-resolved and confirmed at this exact SHA.
- Exact validated PR head: `0a9e1600e2022bb4f822e1963a54db840c71a299`.
- 14 check runs succeeded; one duplicate `228 requirements / 38 chapter pilot matrix` check was skipped by path filtering and is not counted. The separate 228-requirement pilot matrix workflow, chapter-pilot-matrix check and same-commit integrated gate completed successfully.
- CI now provisions two independent, random-credential PostgreSQL LOGIN roles, both members only of the restricted workflow outbox access group.
- Live PostgreSQL 16 concurrency test: **1 passed, 0 failed, 0 skipped**. Both roles passed the startup privilege gate. Concurrent claims against one event produced exactly one owner. After lease expiry, the other login took over at claim generation 2. The stale owner could not renew, acknowledge or fail the event; the new owner successfully delivered it.
- Existing sequential claim-generation proof, workflow execution integration, worker/store/config/approval contract suites, build/typecheck, G9, fresh-clone PostgreSQL, release, UAT technical simulation, payment and capability checks passed.
- No provider calls, worker activation, cloud resource or Business UAT authorization.

### #436 lifecycle status
- Completed on main: restricted worker role and live login proof (#439); startup privilege/RLS/ownership gate and approval-denial parking (#440); claim-generation fencing (#441); standalone fail-closed worker host and dispatcher realpath containment (#442); two-login concurrent claim exclusion and takeover proof (#443).
- Remaining: actual owner-approved dispatcher/secret resolver; approval revocation race immediately before provider action; provider-side idempotency and duplicate-delivery tests; full retry/backoff/dead-letter/replay operational lifecycle; external process supervisor/restart policy and production metrics; shutdown behavior under an actual supervised process.
- Worker remains disabled and unlaunched. No real dispatcher/provider integration is present. Stale PRs #400/#387/#411 remain extraction references only; no wholesale merge.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER improved** — independent worker foundation and DB concurrency safety are proven; no live delivery connector.
2. CI/persistence: **AMBER improved** — two restricted PostgreSQL 16 logins prove single-owner claims and stale-owner fencing.
3. Architecture/identity: **AMBER improved** — two distinct login roles inherit only the narrow worker group; startup checks both.
4. Workflow/runtime: **AMBER improved** — claim, lease takeover and acknowledgement are fenced across independent logins; provider delivery and operational supervision remain.
5. Integrated validation: **AMBER improved** — exact-head same-commit gate, 228-requirement pilot workflow and fresh-clone PostgreSQL checks passed; duplicate path-filter-skipped check is not counted.
6. PR governance: **AMBER improved** — #443 was individually validated and merged; no stale branch bulk merge.
7. Release/continuity: **RED/AMBER** — no production dispatcher, credentials, supervisor or Business UAT evidence/authorization.

Next safe slice: use a synthetic/local dispatcher only to test approval revocation immediately before dispatch, event-ID idempotency, transient retry/backoff, dead-letter/replay and real process SIGTERM shutdown. Keep provider integrations and external side effects disabled. No chargeable AWS resources or Business UAT authorization. Preserve all 228 approved requirements and 38 chapters.



---

## Append-only checkpoint — 2026-11-07 20:54 IST

### Approval revocation boundary and synthetic idempotency — PR #444 merged
- PR #444 merged to main by squash at `1b770a2d71cfd1422290b304670f1361cbd4446b`; main was re-resolved and confirmed at this exact SHA.
- Exact validated PR head: `214fb9093cd01e2fea7d8ad3b5e5d2dd3b40cdc7`.
- 14 check runs succeeded; one duplicate `228 requirements / 38 chapter pilot matrix` check was skipped by path filtering and is not counted. The separate pilot matrix workflow, chapter-pilot-matrix and same-commit integrated gate passed.
- Host now performs initial and final durable approval checks before invoking the dispatcher adapter. The adapter contract explicitly requires another durable revalidation immediately before its external side effect, because revocation can race the host's last check.
- Synthetic tests prove revocation between host checks prevents dispatch; revocation after the final host check is still caught by adapter-side final revalidation before any fake side effect; repeated at-least-once event delivery is deduplicated by immutable event ID.
- Dispatcher approval/idempotency suite: **7 passed, 0 failed, 0 skipped**. Build/typecheck, workflow execution, claim fencing, two-login PostgreSQL concurrency, startup privilege, same-commit integrated gate, 228 pilot matrix workflow, fresh-clone PostgreSQL, release and technical UAT checks passed.
- No real provider dispatcher, secret resolver, network call, worker activation, cloud resource or Business UAT authorization.

### #436 lifecycle status
- Completed on main: restricted worker login and role (#439); startup privilege/RLS gate and approval-denial parking (#440); claim-generation fencing (#441); standalone worker host and realpath containment (#442); two-login PostgreSQL concurrency/takeover proof (#443); approval revocation boundary and synthetic event-ID idempotency contract (#444).
- Remaining: real owner-approved dispatcher and secret resolver; durable provider-side approval revalidation and provider idempotency implementation; full live retry/backoff/dead-letter/replay lifecycle with two independent workers; actual process-supervisor restart/backoff and metrics; production deployment configuration and acceptance.
- Worker remains disabled and unlaunched. No real dispatcher/provider integration exists. Stale PRs #400/#387/#411 remain extraction references only; no wholesale merge.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER improved** — approval and idempotency boundaries are defined/tested synthetically; no real provider delivery.
2. CI/persistence: **AMBER improved** — PostgreSQL 16 two-login concurrency and claim-generation fencing are green.
3. Architecture/identity: **AMBER improved** — least-privilege startup and explicit approval rechecks are on main.
4. Workflow/runtime: **AMBER improved** — process host, lease takeover and final approval boundary exist; provider implementation and supervision remain.
5. Integrated validation: **AMBER improved** — exact-head same-commit gate, pilot matrix workflow and fresh-clone PostgreSQL checks passed; duplicate path-filter-skipped check is not counted.
6. PR governance: **AMBER improved** — #444 individually validated and merged; stale branches not bulk-merged.
7. Release/continuity: **RED/AMBER** — no real provider, production secret resolver, supervisor or Business UAT evidence/authorization.

Next safe slice: test the complete retry/dead-letter/replay lifecycle with two restricted logins against PostgreSQL 16 and a synthetic dispatcher, then test process supervision/restart and shutdown. Do not connect real provider credentials or trigger external side effects. No chargeable AWS resources or Business UAT authorization. Preserve all 228 approved requirements and 38 chapters.



---

## Append-only checkpoint — 2026-11-07 21:00 IST

### Two-worker retry/dead-letter/audited replay lifecycle — PR #445 merged
- PR #445 merged to main by squash at `9a96e7d658deff925b4bc67d9aa3bae5df9b4c10`; main was re-resolved and confirmed at this exact SHA.
- Exact validated PR head: `2a6133d85af8043c5a89c501a58b6904ddfe0b06`.
- 15 check runs succeeded; one duplicate `228 requirements / 38 chapter pilot matrix` check was skipped by path filtering and is not counted. The separate 228-requirement matrix workflow, chapter-pilot-matrix and same-commit integrated gate succeeded.
- Live PostgreSQL 16 integration: **1 passed, 0 failed, 0 skipped**. Two distinct restricted worker logins participated in one synthetic event's lifecycle.
- Worker A transient attempt 1 was rescheduled. Worker B transient attempt 2 reached dead-letter under the bounded two-attempt policy.
- The real `replayWorkflowOutboxDeadLetter` service authorized the synthetic workflow-admin actor, inserted one immutable replay audit row and appended one audit event. A repeated idempotency key returned the original replay receipt; no duplicate replay was created.
- A synthetic local dispatcher redelivered the same immutable event ID exactly once after replay. Final delivery state: `delivered`, attempts 3, claim generation 3.
- Both login identities and startup privilege checks, concurrent claim exclusion, stale-owner fencing, workflow execution integration, worker/store/config/approval suites, typecheck/build, fresh-clone PostgreSQL and integrated gate passed.
- No provider/network calls, worker activation, cloud resources or Business UAT authorization.

### #436 lifecycle status
- Completed on main: restricted worker login (#439); startup privilege and approval-denial gate (#440); claim-generation fencing (#441); standalone worker host (#442); two-login concurrent claim/takeover (#443); final approval recheck and synthetic idempotency contract (#444); two-login retry/dead-letter/audited replay/redelivery lifecycle (#445).
- Remaining: actual owner-approved provider dispatcher and secret resolver; production provider-side durable approval revalidation and idempotency; two-process shutdown/lease race under a real supervisor; deployment restart/backoff, monitoring and alerting; formal production acceptance evidence.
- Worker remains disabled and unlaunched. No real dispatcher/provider integration exists. Stale PRs #400/#387/#411 remain extraction references only; no wholesale merge.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER improved** — retry, dead-letter, audited replay and synthetic redelivery now have a live PostgreSQL proof; no real provider delivery.
2. CI/persistence: **AMBER improved** — PostgreSQL 16 proves two-login claim exclusion, takeover, retry and replay.
3. Architecture/identity: **AMBER improved** — replay is authorized through active tenant/application/actor workflow-admin assignments and audit evidence.
4. Workflow/runtime: **AMBER improved** — full synthetic delivery lifecycle is proven; production provider and supervisor remain.
5. Integrated validation: **AMBER improved** — exact-head same-commit gate, pilot matrix workflow and fresh-clone PostgreSQL passed; duplicate path-filter-skipped check is not counted.
6. PR governance: **AMBER improved** — #445 individually validated and merged.
7. Release/continuity: **RED/AMBER** — no production dispatcher, secret resolver, supervised deployment or Business UAT evidence/authorization.

Next safe slice: exercise a real worker host under a fake process supervisor with SIGTERM during a long-running synthetic dispatch, proving heartbeats stop, the in-flight event is left for lease recovery, the DB pool closes and restart can reclaim safely. Keep all provider calls disabled. No chargeable AWS resources or Business UAT authorization. Preserve all 228 approved requirements and 38 chapters.



---

## Append-only checkpoint — 2026-11-07 21:10 IST

### Abortable worker shutdown — PR #446 merged
- PR #446 merged to main by squash at `d9591cde579efacfee2e5ceac859a7a30951b941`; main was re-resolved and confirmed at this exact SHA.
- Exact validated PR head: `408641f1d53361c0a5f65c2e358fc31074bd1bf7`.
- 15 check runs succeeded; one duplicate `228 requirements / 38 chapter pilot matrix` check was skipped by path filtering and is not counted. The separate 228 matrix workflow, chapter-pilot-matrix and same-commit integrated gate succeeded.
- Worker lifecycle suite: **37 passed, 0 failed, 0 skipped**. The test now awaits shutdown while a deliberately non-cooperative synthetic dispatcher never settles; the worker pass returns as interrupted, lease heartbeats stop and no acknowledgement/failure mutation is issued.
- Dispatcher approval suite: **9 passed, 0 failed, 0 skipped**. An already-aborted signal or shutdown during the final approval lookup prevents adapter invocation.
- Dispatch promise is raced against the worker AbortSignal; eventual promise rejection remains observed to avoid unhandled rejection. The host can proceed to pool closure after the worker pass releases.
- Typecheck/build, PostgreSQL 16 privilege/startup, claim-generation, two-login concurrency, retry/dead-letter/audited replay, same-commit integrated gate, fresh-clone PostgreSQL, release, UAT technical simulation, payment and capability checks passed.
- Concrete dispatchers are required to honor AbortSignal and cancel provider I/O before/while performing side effects. A non-cooperative real dispatcher can still leave an external outcome ambiguous; idempotency and lease recovery remain mandatory.
- No real dispatcher/provider, network call, worker activation, cloud resource or Business UAT authorization.

### #436 lifecycle status
- Completed on main: restricted worker role (#439); startup privilege/RLS and approval-denial gate (#440); claim-generation fencing (#441); standalone worker host (#442); two-login claim/takeover proof (#443); final approval/idempotency contract (#444); retry/dead-letter/audited replay/redelivery integration (#445); abortable worker shutdown (#446).
- Remaining: owner-approved provider dispatcher and secret resolver; provider-side durable approval revalidation and idempotency; actual external process supervisor/restart/backoff/metrics; deployment readiness and production acceptance evidence.
- Worker remains disabled and unlaunched. No provider module or credentials are present. Stale PRs #400/#387/#411 remain extraction references only; no wholesale merge.

### Seven-checkpoint impact
1. Product/customer journey: **AMBER improved** — synthetic end-to-end delivery lifecycle is proven; no real provider.
2. CI/persistence: **AMBER improved** — PostgreSQL 16 least-privilege, claim fencing, concurrency and replay proofs are green.
3. Architecture/identity: **AMBER improved** — explicit approval, identity and abort boundaries are enforced.
4. Workflow/runtime: **AMBER improved** — standalone process, retries, replay and bounded worker-pass shutdown are on main; external dispatcher cancellation/supervision remains.
5. Integrated validation: **AMBER improved** — exact-head same-commit gate, matrix workflow and fresh-clone PostgreSQL passed; duplicate path-filter-skipped check is not counted.
6. PR governance: **AMBER improved** — #446 individually validated and merged.
7. Release/continuity: **RED/AMBER** — no approved provider integration, secret resolver, production supervisor or Business UAT evidence/authorization.

Next safe slice: implement an explicit production activation gate and deployment preflight that requires a signed-off dispatcher, secret-resolver contract, provider idempotency key, approval-revocation proof, process supervisor and telemetry before the worker can be enabled outside CI. Keep the worker disabled and use no provider credentials, chargeable cloud resources or Business UAT authorization. Preserve all 228 approved requirements and 38 chapters.



---

## Append-only checkpoint — 2026-11-07 21:25 IST

### PR backlog reconciliation — superseded workflow branches closed
- Closed PR #411 (`fix(workflows): fence outbox delivery against stale claims`) as superseded by merged PR #441 and the subsequent current-main validation series #443–#446. The claim-generation fencing and associated proof remain on main; no functionality was discarded.
- Closed PR #400 (`feat(workflows): add independent workflow outbox worker`) as superseded by the individually extracted, validated mainline work #439–#446, including standalone worker host, restricted role, startup/approval gates, claim fencing, two-login concurrency, retry/replay and bounded shutdown. The stale bundled branch was not merged or deleted.
- Both closures were individually documented in their PR conversations. No code changes were made to main in this cleanup step.

### Live repository inventory after reconciliation
- Open PRs: **28** (down from 30).
- Merged PRs: **266**.
- Closed without merge: **99** (includes these two documented superseded closures).
- Total PRs: **393**.
- Open issues: **34**.
- Closed issues: **19**.
- Open PR count verified from GitHub's live pulls endpoint; issue counts and historical merged/closed totals from GitHub search index. Search index may lag very recent state changes.
- Remaining open PRs are not assumed redundant; continue individual purpose/base/diff/mainline/evidence reconciliation before closing, extracting or merging.

### Seven-checkpoint impact
- PR governance: **AMBER improved** — active workflow backlog reduced from 30 to 28 by evidence-based closure of two branches whose functionality is already on main.
- Product/functionality: unchanged — no customer functionality removed; all referenced worker capabilities remain in main.
- No changes to approved 228 requirements / 38 chapters, production worker activation, provider credentials, cloud resources or Business UAT authorization.

Next reconciliation targets: inspect remaining open PRs by dependency graph and current-main overlap. Prioritize customer asset upload/recovery stack (#384, #386, #402, #422, #423, #426) as one dependency chain; do not merge isolated child PRs ahead of required migration and PostgreSQL 16 integration proof.


---

## Append-only checkpoint — 2026-11-07 21:55 IST

### Customer-asset PR reconciliation — two superseded branches closed
- Closed PR #422: provider upload outcome/idempotency/lookup contract is superseded by current-main typed outcome, capability, lookup adapter, service and API-composition work tracked in issue #437. The remaining configured vendor implementation remains explicitly unclaimed.
- Closed PR #423: its migration 026 is based on a divergent 021–025 migration chain and reuses the recovery-index name already created by current-main migration 023 with a different definition. Current main has durable recovery metadata in migration 023 and provider outcome/backfill in migration 024. The old migration cannot be merged safely.
- Both PR conversations contain the reason and current-main replacement references. Neither branch was merged or deleted.

### Current-main capability audit
- Present on main: tenant-isolated customer asset repository, upload reservation/idempotency, request fingerprint, provider grant expiry/recovery timestamp, explicit provider outcome classification, typed provider capabilities and lookup semantics, API composition seam, upload recovery service and PostgreSQL integration test.
- Still absent as a complete current-main vertical slice: independent customer-asset scan worker/adapters/runtime (tracked by #435 and source material in #384); isolated upload-expiry worker and least-privilege runtime (tracked by #404, source material in #414/#402).
- PostgreSQL 16 migration acceptance remains open in #425. The earlier PR #426 CI was branch-only; it does not prove the current-main migration 023/024 upgrade, legacy backfill, exact index definitions, RLS/grants and checksum behavior.
- PR #384/#402/#426 remain source/reference branches only; their stale stacked histories must not be merged wholesale.

### Live inventory after closures
- Open PRs: 26 (down from 28).
- Merged PRs: 266.
- Closed without merge: 101.
- Total PRs: 393.
- Open issues: 34.
- Closed issues: 19.
- No code was merged in this reconciliation checkpoint. The two closures remove superseded branches only.

### Delivery decision
- Continue with three current-main work packages: (1) PostgreSQL 16 migration/legacy upgrade proof for 023–024 (#425), (2) scan worker vertical slice (#435), and (3) upload-expiry worker vertical slice (#404).
- Provider vendor activation remains disabled until owner-approved credentials, adapter capabilities, secret resolution and real-provider evidence exist.
- Approved 228 requirements / 38 chapters unchanged. No cloud resources provisioned; Business UAT remains unauthorized.


---

## Append-only checkpoint — 2026-11-07 22:05 IST

### Customer-asset PostgreSQL 16 execution enabled and passed
- Main commit: `4a77ae585db8553f254a83c3050152268f8879da` — extended the existing PostgreSQL 16 Provider Operation Lifecycle workflow to trigger on customer-asset package/test changes, set `EPER_CUSTOMER_ASSET_LIVE_TESTS=1`, and execute `tests/postgres-customer-asset-upload-recovery.integration.test.mjs` after the audit migration runner.
- GitHub Actions run: [42389288035](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42389288035) — completed successfully.
- Verified job log: customer-asset PostgreSQL integration **1 passed / 0 failed / 0 skipped**; provider-operation PostgreSQL lifecycle **1 passed / 0 failed / 0 skipped**; build and payment/audit migrations passed.
- Issue #425 title/body corrected to current-main migrations 023–024; migration 026 from divergent PR #423 is no longer treated as the target.

### What this evidence proves — and does not prove
- Proven on ephemeral PostgreSQL 16: upload reservation/replay concurrency, actor/fingerprint conflict behavior, provider grant recovery, definitive rejection outcome and audit, cross-application isolation, upload completion to scan outbox, worker lease ownership, trusted scan result and audit linkage.
- Still open in #425: populated legacy upgrade fixture and provider-outcome backfill assertions; rerun and checksum-drift rejection tests for the actual runner; exact index/constraint catalog assertions; direct database-role RLS ENABLE/FORCE, tenant/application isolation and least-privilege grant verification.
- CI used only an ephemeral GitHub Actions PostgreSQL service. No AWS/cloud or production database resources were provisioned.
- Business UAT remains unauthorized; this is technical integration evidence, not business acceptance.

### Next safe engineering slice
Build the missing migration assurance tests for current-main 023–024 (legacy upgrade/backfill, checksum drift, catalog definitions and DB-role security) without editing applied migrations. Keep scan/expiry worker gaps #435/#404 separately scoped.


---

## Append-only checkpoint — 2026-11-07 22:15 IST

### PostgreSQL 16 migration assurance — completed on current main
- Tested code SHA: `3b2fd38b71c4cbcb7a048f080734983825deadce`; subsequent scorecard-only commit: `440e4a8fe7cfe1ba511523860fb7653e14ea4624`.
- Exact-main workflow: [42390215757](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42390215757) — **success**.
- All four PostgreSQL lifecycle tests passed with **1 passed / 0 failed / 0 skipped each**: provider-operation lifecycle; customer-asset upload recovery and scan lifecycle; customer-asset migration catalog/RLS/checksum assurance; customer-asset legacy upgrade/backfill.
- Migration assurance verifies 023/024 recovery and provider-outcome constraints; exact recovery and outcome index definitions; ENABLE + FORCE RLS on all four asset tables; asset runtime role NOLOGIN/NOSUPERUSER/NOBYPASSRLS and SELECT/INSERT/UPDATE without DELETE; real `SET ROLE` queries prove owning-application visibility and deny cross-application/cross-tenant reads; actual migration runner rerun; checksum-drift rejection.
- Legacy-upgrade test creates an isolated PostgreSQL database, applies audit migrations 001–022, seeds legacy upload sessions, then applies 023–024. Rows with persisted provider references backfill to `succeeded`; rows without references remain `unknown`. Legacy request fingerprints remain NULL; no retry identity is fabricated. Exact 023–024 rerun is idempotent.
- No applied migration SQL was edited. All database work ran on ephemeral GitHub Actions PostgreSQL 16; no AWS/cloud or production DB resources.
- Issue #425 is closed on evidence. Business UAT remains unauthorized; scan worker (#435), expiry worker (#404), and real provider activation (#437) remain separate delivery gaps.


---

## Append-only checkpoint — 2026-11-07 22:30 IST

### Customer-asset scan worker and recovery — completed on current main
- Tested main SHA: `722598ddac19260cdbac48e7942a6d1320977026`.
- PostgreSQL 16 lifecycle/process/concurrency: [42391193676](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193676) — success.
- Fresh-clone developer verification: [42391193668](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193668) — success; 1,571 tests / 1,560 passed / 0 failed / 11 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; PostgreSQL 16 backup/restore smoke passed with 79 source/restored base tables.
- EPER CI [42391193661](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193661), same-commit integrated gate [42391193651](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193651), container runtime [42391193665](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193665), controlled QA [42391193657](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193657), 228/38 matrix [42391193656](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193656), G9 [42391193647](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193647), six-family smoke [42391193629](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193629), and controlled technical simulation [42391193612](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193612) all passed.
- Extracted scan worker, malware-scan and upload-verification adapters, opt-in worker process, independent exhausted-lease recovery method/process and package scripts. Both processes require explicit enablement and `EPER_CUSTOMER_ASSET_SCAN_DATABASE_URL`.
- Process integration used ephemeral PostgreSQL login roles inheriting `eper_customer_asset_access`; verified no superuser/BYPASSRLS and no asset DELETE privilege. A generated CI-only scanner fixture proved enqueue -> claim -> scanner invocation -> persisted clean result -> SIGTERM. Recovery process proved expired exhausted lease -> quarantine/dead-letter/audit -> SIGTERM.
- Canonical lock order enforced for upload completion, scan-result finalization and recovery: upload session -> asset -> scan job. Recovery candidate discovery is unlocked, then each row is locked/revalidated with SKIP LOCKED. Concurrent two-sweep/stale-callback PostgreSQL test passed exactly-once finalization and rejected the stale callback.
- Worker/adapter suite: 12 passed / 0 failed / 0 skipped. Process/concurrency suite: 3 passed / 0 failed / 0 skipped.
- Issue #435 closed as completed. PR #396 and PR #412 closed unmerged as superseded; branches retained for historical evidence. PR #384 remains open as a broader asset-foundation reference pending separate reconciliation.
- Live counts after closures: **24 open PRs; 32 open issues**.
- No migrations added/replayed, no real scanner/provider configured or invoked, no chargeable cloud resources or production worker activated. Business UAT remains unauthorized; real scanner integration and production worker supervision/metrics/alerts/runbooks remain separate work.


---

## Append-only reconciliation — 2026-11-07 (live mainline and open-PR review)

### Exact baseline and current-main evidence
- Dynamically resolved main at review: `ab49379d10e52fada04b9534dec80222c1120b6a`. Its only change over code-bearing parent `722598ddac19260cdbac48e7942a6d1320977026` is this scorecard file; no application source changed.
- Exact current-main EPER CI [42391438487](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391438487) succeeded: 1,555 tests, 1,542 passed, 0 failed, 13 skipped. Same-commit integrated validation [42391438458](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391438458) succeeded. The 228/38 matrix [42391438457](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391438457) reports 259 tests passed, 0 failed, 28 checks passed and no failed chapters. G9 [42391438580](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391438580), six-family HTTP smoke [42391438443](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391438443) and container smoke [42391438437](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391438437) succeeded.
- Fresh-clone `npm run dev:verify` and disposable PostgreSQL 16 backup/restore were proven on the immediate code parent `722598ddac19260cdbac48e7942a6d1320977026`, run [42391193668](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193668): 1,571 tests, 1,560 passed, 0 failed, 11 skipped; all seven migration groups were applied and rerun, including identity; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; backup/restore passed with 79 source/restored base tables and seven migration ledgers. This is parent-code evidence, not a fresh-clone run on the later scorecard-only SHA.
- PostgreSQL 16 provider/asset lifecycle run [42391193676](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42391193676) on code SHA `722598dd` passed migration catalog/RLS/least-privilege/checksum and legacy-upgrade/backfill tests. Scan worker/adapter tests passed 12/12; process/recovery/lock-order tests passed 3/3. Worker and recovery require explicit enablement and a dedicated PostgreSQL URL; the process test used an ephemeral restricted login and CI-only scanner fixture.

### Seven approved pointers — reconciled status
1. **v34 → 228:** preserve the 45 original v34 source rows; 0 exact full-coverage matches, 45 partial shared-control links and 45 additive v1.6.0 draft candidates. The ten owner-directed commercial additions remain separate. The approved 228 requirement IDs and 38 chapters remain unchanged; no feature acceptance is inferred from shared controls.
2. **Fresh clone:** reproducible setup is validated on code parent `722598dd` with the exact run above. Current main is one scorecard-only commit later; do not relabel the parent run as exact-current-SHA evidence.
3. **PostgreSQL:** seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity) are applied and repeated by `dev:verify`. Current-main CI/integrated runs exercise PostgreSQL migrations, RLS, workflow role privileges, claim fencing, two-login retry/dead-letter/replay and ticketing/capability persistence. Asset migrations 023–024 have separate PostgreSQL 16 catalog, RLS, checksum and legacy-backfill assurance. The disposable restore smoke is not an off-host disaster-recovery rehearsal or capacity benchmark.
4. **Identity:** provider-neutral OIDC, browser start/callback/logout routes, durable login transactions and sessions, host-only secure cookies, CSRF, session revocation and tenant/application/actor assignment checks are present with unit/HTTP/session tests. The browser E2E file exists, but no browser E2E run is attached to the current main SHA in this review; historical PR-head browser runs are not current-main proof. No production IdP interoperability is claimed.
5. **Customer workspace/support:** ticket APIs and stores cover submission, history, replies, tenant/application scoping, admin triage, assignment, severity, internal-note filtering and CSV export (including all filtered pages). Ticketing migrations 001–005 are present. No SLA policy/deadline/breach/escalation schema or service-level evidence was found. The real-byte upload-to-verification-to-scan-to-download browser journey remains open in #405 and depends on provider runtime work #397.
6. **Scheduler/workflow:** workflow outbox has an independently launchable, opt-in worker host; restricted PostgreSQL role; claim-generation lease fencing; retry/dead-letter/audited replay; event-ID idempotency; approval recheck at the dispatch boundary; and graceful shutdown tests. Exact current-main CI includes the two-restricted-login retry/dead-letter/replay test. A concrete approved dispatcher/secret resolver, external process supervisor, production metrics/alerts and operational restart/recovery rehearsal remain absent. Customer-asset scan/recovery process code is delivered, but no real scanner is configured. Upload-expiry worker work remains open in #404.
7. **Release/continuity:** artifact packaging, G9 and container checks pass. Main metadata reports `protected=false`; the repository rulesets endpoint returns no rulesets. No off-host backup policy/restore rehearsal, approved RPO/RTO, second-engineer release/rollback rehearsal or complete operational handover was evidenced. Keep this checkpoint RED until those controls are actually demonstrated.

### PR and issue reconciliation
- Live open inventory after reconciliation: 23 PRs, all drafts. Their exact-head relevant Actions runs and job logs were inspected; returned relevant checks succeeded, but all 23 branches are diverged from current main (188 commits behind, except the audit-document PR at 114 behind). Exact-head green is branch-local evidence, not integration evidence against current main. Rebase/extract one capability at a time; do not merge stacked histories wholesale.
- PR #396 and PR #412 were closed unmerged as superseded by the mainline scan/recovery and canonical lock-order implementation; issue #435 was closed with exact-main process/concurrency evidence. PR #426 was closed unmerged because its migration-026 test stack is obsolete against main's 023–024 chain and completed assurance.
- Issue #437 was closed for its typed provider-outcome/operation-ID contract, now present on main and covered by exact-main unit/API/PostgreSQL evidence. The separate concrete provider-runtime composition and secret-resolution gap is issue #397; do not conflate the two.
- PR #384 remains open as a broader asset-foundation reference. Upload expiry (#404), real-byte customer asset browser journey (#405), workflow worker activation/supervision (#436), and release controls/independent handover (#406) remain separate open work.
- PR #306 remains merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 remains merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Both merge commits are ancestors of current main.
- No real provider action or chargeable cloud resource was used in this review.
