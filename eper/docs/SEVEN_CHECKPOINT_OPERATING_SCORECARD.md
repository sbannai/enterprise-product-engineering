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


## 2026-11-08 — Upload retry/expiry mainline port review

**Review base:** `8feeaee982f7f4bd46df6467c447392e5e4ad1ba` (main). This entry is an append-only governance record; it does not claim a code change or test execution.

- Current main asset migration chain is 021 `customer_asset_repository`, 022 `customer_asset_scan_dispatch`, 023 `customer_asset_upload_recovery`, and 024 `customer_asset_upload_provider_outcomes`. Migrations 026–029 from the historical upload-expiry PR stack are absent.
- Main 023 persists the request fingerprint, provider grant expiry and recovery timestamp. Main 024 classifies provider outcomes as `unknown | succeeded | rejected`; unknown provider outcomes must not be treated as definitive rejection.
- Main repository currently uses tenant-scoped idempotency lookup and uniqueness (`tenant_id + idempotency_key`), checks application/actor/asset/size/fingerprint for conflicts, and begins the reservation in `initiated` state.
- PR #402 migration 026 proposes application-scoped idempotency (`tenant_id + application_id + idempotency_key`), one-active-session-per-asset uniqueness and changes to the reservation state machine, including `reserved`. Its repository patch changes advisory locking, retry reconciliation and lock ordering. This is not a drop-in migration: schema, repository, API contract and provider-outcome semantics must be adapted together.
- PR #413 adds tenant-bound cross-application expiry (migration 027); PR #414 adds worker-only DB permissions, queue-age metrics and operational supervision (migrations 028–029). Both are stacked on the historical branch chain and cannot be promoted wholesale.
- **Disposition:** no cherry-pick or merge of #402/#413/#414 as-is. Build a current-main implementation slice after deciding and testing idempotency scope, preserving request fingerprint/provider outcome recovery, reconciling `initiated` versus `reserved`, enforcing one active attempt per asset, and retaining session→asset lock order. Require clean replay from 021–024 through new migrations plus PostgreSQL upgrade, concurrency, cross-application and retry tests on the resulting exact main SHA.
- Evidence/comments: issue #417 comments 6715742299 (diverged ancestry), 6715749365 (migration chain), 6715756775 (migration 026 compatibility review). PR #402 has eight changed files; #413 four; #414 sixteen. Their branch-level CI evidence is not current-main integration evidence.
- **Status:** blocked promotion / mainline port not yet implemented. No code or migration was changed and no new tests were run in this review. No cloud provisioning, real provider dispatch, production release or Business UAT authorization.


---

## Append-only checkpoint — 2026-11-08 (current main, upload boundary and governance)

### Exact baseline
- Current `main`: `f2983d7a48437c693053fa9d4d996789b53f993a`; branch compare confirms the reviewed SHA is identical to main at this checkpoint.
- Eight GitHub Actions check suites completed successfully on this exact main SHA. This is CI evidence only; it does not imply Business UAT acceptance or production readiness.
- Repository metadata still reports `main.protected=false`. No branch-protection or ruleset settings were changed; issue #434 remains open to reconcile protection with the owner's direct-to-main delivery model.

### Upload delivery slices — branch-local until reviewed and integrated
- PR #447: `bc66cf724388bc95a6e1aa18c1c293fd3d4faac3`, five commits ahead / zero behind main; all 13 exact-head GitHub Actions check suites succeeded. It adds a server-generated opaque HMAC session binding for durable PostgreSQL customer sessions. It is ready for independent review, open and unmerged; no review submissions are recorded. Browser consumption remains separate.
- PR #448: `9409ffcf5267d19919e185a6806efe8060db54fb`, six commits ahead / zero behind main; all 13 exact-head GitHub Actions check suites succeeded. One subordinate check-run was skipped; the separate 228-requirement pilot-matrix workflow passed. It adds the CSRF/session/tenant/application/role-authorized upload completion route, trusted verifier boundary and transactional scan handoff. It is ready for independent review, open and unmerged; no review submissions are recorded.
- Neither PR has been merged. Their green CI is branch-local evidence and does not alter current main functionality. Do not count either as a completed mainline feature.

### Provider-runtime and browser acceptance boundary
- Current main still deliberately rejects `EPER_PROVIDER_STORAGE_RUNTIME_ENABLED=true` with `PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED`; the six-operation runtime is not wired into the API composition root.
- Issue #397 remains blocked on an owner-approved server-side secret-manager integration and concrete storage/object-verification/download/malware-scanning provider adapter ownership. Do not substitute synthetic credentials/drivers for production configuration.
- Issue #405 remains the end-to-end acceptance gate for real-byte browser transfer, verification, clean-scan gating, authorized download, lost-response/reload retry, and tenant/application/audit assertions.
- PR #447/#448 and issue updates are recorded as intermediate delivery evidence only. No real provider dispatch, cloud provisioning, production enablement or Business UAT authorization occurred.

### Live PR governance snapshot
- Live open PR search returned 25 open PRs at this checkpoint. The two current main-based upload slices (#447/#448) are ready for independent review; the remaining open inventory includes historical draft/stacked candidates and must be reconciled individually against current main before promotion or closure.
- No mass merge, mass closure, branch deletion or functionality promotion was performed.

### Next controlled actions
1. Obtain independent reviews for #447 and #448; merge only after review and a fresh exact-head check.
2. Obtain the provider + secret-manager ownership decision for #397; until then preserve the fail-closed runtime.
3. Complete #405 only after the approved runtime and retry/expiry dependencies are integrated on main.
4. Reconcile #434's mainline protection design without silently imposing PR-only delivery.


---

## Append-only checkpoint — 2026-11-08 (PR review pass)

### Live baseline and inventory
- Dynamically resolved main: 7657d7480e62012ba384e65930911f2b9581047e; this is a scorecard-only commit whose parent is f2983d7a48437c693053fa9d4d996789b53f993a. No application source changed in that mainline step.
- Live inventory at review: 25 open PRs and 31 open issues. Counts are point-in-time, not closure targets.
- main remains unprotected (protected=false; required status checks disabled). Issue #434 remains open; no repository settings changed.

### Exact-head technical review comments
- PR #447 head bc66cf724388bc95a6e1aa18c1c293fd3d4faac3: 18 check-runs; 17 success, 1 skipped (228/38 pilot-matrix job). All returned check-run head SHAs matched the reviewed head. Technical review comment recorded as review ID 5816128798. No blocking defect identified in the narrow server-side HMAC session-binding slice.
- PR #448 head 9409ffcf5267d19919e185a6806efe8060db54fb: 18 check-runs; 17 success, 1 skipped (228/38 pilot-matrix job). All returned check-run head SHAs matched the reviewed head. Technical review comment recorded as review ID 5816129019. No blocking defect identified in the narrow upload-completion API boundary.
- Formal APPROVE reviews were rejected by GitHub because the connected repository identity is the PR author. The comments are technical review feedback, not approvals. An independent human reviewer is still required before either PR can merge.
- Neither PR was merged. No branch was deleted and no functionality was counted as mainline-delivered.

### Scope boundaries retained
- #447 still needs browser consumption of the server session binding before session-bound retry recovery is complete.
- #448 still needs concrete provider runtime composition and full browser transfer -> provider verification -> malware scan -> authorized download evidence. Synthetic/injected test boundaries are not production provider readiness.
- The 228/38 job was skipped on both PR runs; do not label all check-runs as passed. Separate pilot-matrix evidence remains separate.
- No cloud resources, production credentials, real provider calls, production enablement or Business UAT authorization.

### Next actions
1. Obtain an independent human review for #447 and #448.
2. Continue #397 provider/secret-resolver implementation and #405 browser lifecycle evidence on current main.
3. Keep the fail-closed runtime and preserve the 228 requirements / 38 chapters unchanged.


---

## Append-only checkpoint — 2026-11-08 (mainline session-binding delivery)

### Live baseline and exact-main validation
- Main source commit: `da962a5163e96fb150b2a2cee2acf2a6726d17b8`.
- All 10 GitHub Actions workflows returned for this exact SHA completed successfully:
  - EPER CI: `42438522380`
  - Customer OIDC browser E2E: `42438522358`
  - Fresh-clone developer/PostgreSQL verification: `42438522427`
  - Same-commit integrated validation: `42438522335`
  - 228 requirement / 38 chapter pilot matrix: `42438522289`
  - G9 reconciliation: `42438522405`
  - Six-family capability HTTP smoke: `42438522354`
  - Container runtime smoke: `42438522448`
  - Controlled QA re-execution: `42438522362`
  - Controlled UAT technical simulation: `42438522364`
- EPER CI typecheck, build, customer asset upload recovery/provider-binding regression, PostgreSQL 16 migration/RLS, live asset recovery, workflow/outbox and capability persistence checks passed.
- Fresh-clone verification and PostgreSQL 16 backup/restore passed. Chromium OIDC login, protected access, logout/revocation and Product Admin browser checks passed.
- Integrated validation passed payment/PostgreSQL/receipt contracts, all six capability families, the 228/38 pilot matrix, release artifact and G9 evidence, and the UAT readiness audit.

### Mainline session-binding slice
- Ported the narrow server-side session-binding implementation from PR #447 directly to main. The PostgreSQL-backed `GET /customer/session` now returns a domain-separated HMAC-SHA256 opaque binding derived from the verified session cookie using the configured server-side CSRF secret.
- The response does not expose the raw cookie, OIDC issuer or subject. Legacy bearer-map compatibility mode does not emit a binding.
- Added an HTTP regression asserting stable binding for the same session and a different binding for a new login by the same actor.
- PR #447 is closed as superseded by this mainline implementation; it was not merged and its branch was not deleted.
- Issue #419 remains open: browser-side persistence/recovery must consume this binding only after successful session verification. On mismatch, account/session switch, expiry/revocation or logout/re-login, stale retry state must be discarded. The current main customer portal still lacks the asset-upload form from the divergent #399/#416 stack; do not merge that stack wholesale.

### Live inventory and controls
- Open PRs: 24. Open issues: 31. Point-in-time counts only.
- Main remains unprotected (`protected=false`; required status checks disabled); issue #434 remains open. No repository settings changed.
- Issue #397 remains blocked on owner-approved secret-manager integration and concrete storage/object-verification/download/malware-scanner provider ownership. Keep provider runtime disabled and fail-closed.
- Issue #405 remains open for the complete real-byte browser upload, verification, clean-scan, authorized-download and retry/reload lifecycle.
- No real provider dispatch, production credentials, cloud provisioning, production enablement or Business UAT authorization. Preserve the approved 228 requirements / 38 chapters.

### Next controlled actions
1. Port the customer asset upload UI and session-bound retry recovery as a minimal current-main slice, only with the verified session binding and fail-closed server boundaries.
2. Resolve the #397 provider and secret-manager ownership decision before executable provider composition.
3. Complete #405 browser E2E only after the required upload/verification/scanner runtime boundaries exist on main.
4. Reconcile #434 mainline protections without blocking the owner's direct-to-main delivery model.


---

## Append-only checkpoint — 2026-11-08 08:18 IST (metadata idempotency and exact-main CI)

### Live baseline and exact-head evidence
- Dynamically resolved current `main`: `2cadca5aa127de5e53aa63937939c833b17d4397` (`ci(assets): run metadata idempotency PostgreSQL integration tests`).
- This current-tip commit changes only `.github/workflows/ci.yml`; it explicitly adds live PostgreSQL metadata-idempotency and migration/RLS assurance tests to EPER CI.
- Exact-current-main EPER CI [run 42440743797](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42440743797) and Workflow Configuration Validation [run 42440743756](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42440743756) completed successfully.
- EPER CI job `128609251216` on the exact current SHA confirms: metadata idempotency integration 1/1; customer-asset migration/RLS/checksum assurance 1/1; claim-generation fencing 1/1; two-restricted-worker retry/dead-letter/audited-replay 1/1; worker lifecycle 37/37; dispatcher approval/shutdown 3/3; tenant/actor assignment integration 11/11; capability conformance 7/7. All these selected suites report zero failures and zero skips.
- Application-source parent `4e4959995d5c6c693072828ceec7c02663fadf19` has exact fresh-clone run [42440627136](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42440627136): `npm run dev:verify` passed; 1,578 tests, 1,566 passed, 0 failed, 12 skipped; all seven migration groups were applied and repeated, including identity; disposable PostgreSQL backup/restore passed with 80 source/restored base tables and seven migration ledgers. This is parent-SHA evidence, not a fresh-clone run on current tip `2cadca5`; the current-tip change is CI-workflow-only and did not trigger the fresh-clone workflow.
- The same application-source parent 228/38 matrix [run 42440627174](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42440627174) passed all 38 chapter suites, 259/259 pilot tests and 28 checks, with no failed chapters. G9 [run 42440627178](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42440627178) passed. These are parent-SHA results, not exact-current-tip runs.

### Customer asset metadata and identity boundaries
- Migration 025 adds `eper_customer_asset_metadata_operations`; repository `assertReady` now requires this table.
- The PostgreSQL integration test proves concurrent identical client-operation retries return one durable asset, one operation row and one metadata-create audit event; a changed request fingerprint fails closed. The migration assurance test verifies table presence, primary/unique constraints, tenant/application RLS and restricted-role SELECT/INSERT-only privileges.
- This remains a repository-level idempotency primitive: the customer API does not yet pass `clientOperationId` into metadata creation, and the customer portal still has no upload form or session-bound retry consumer.
- The verified upload-completion route remains an injectable, fail-closed boundary. No concrete provider/secret resolver, real-byte browser transfer, clean-scan-to-download journey or production provider activation is established.
- The server-side opaque HMAC session binding is present on main. Its HTTP/session regression passed on application-source parent `4e495999`; no Chromium OIDC/browser E2E run is attached to exact current tip `2cadca5`. No production IdP interoperability or production-login claim is made.

### Live PR inventory and merge disposition
- Live open-PR search returned 23 drafts. Current exact heads were re-resolved; relevant exact-head Actions runs and job logs were inspected. The branch-local selected checks succeeded, but the feature branches remain divergent from current main and several are stacked on historical feature bases. Exact-head green is not current-main integration evidence; do not merge historical stacks wholesale.
- PR #306 remains merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 remains merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Both merge commits are ancestors of current main.
- PRs #447 and #448 are closed unmerged/superseded; their server-side session-binding and verified-completion boundary changes were ported directly to main. Their old branches are not integration dependencies.

### Seven approved pointer disposition
1. **v34 → 228:** preserve the approved 228 requirement IDs and 38 chapters. The 45 original v34 rows remain; 0 exact full-coverage mappings and 45 partial shared-control links are recorded. Feature-level acceptance traceability remains incomplete.
2. **Fresh clone:** `npm run dev:verify` is reproducible on application-source parent `4e495999`; do not relabel the parent run as exact-current-tip evidence.
3. **PostgreSQL:** seven migration groups including identity, repeatability, live PostgreSQL tests, metadata idempotency/RLS, and local disposable backup/restore are demonstrated. Off-host backup, retention/key custody, approved RPO/RTO and independent restore remain open.
4. **Identity:** OIDC protocol, browser routes, durable sessions, secure cookies, CSRF, HMAC session binding and tenant/application assignments are implemented/tested at HTTP/CI level. Exact-current-tip Chromium E2E and production IdP interoperability are not evidenced.
5. **Customer workspace/support:** ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note separation and export are present. SLA policy/deadlines/escalation and the complete customer upload/retry/scan/download journey remain incomplete.
6. **Scheduler/workflow:** independent worker host, restricted logins, lease/fencing, idempotency, retry/dead-letter/audited replay and shutdown are proven in PostgreSQL CI. Approved production dispatcher, secret resolver, supervisor, metrics/alerts and recovery rehearsal remain open.
7. **Release/continuity:** live branch metadata reports `protected=false`; repository rulesets are empty. Off-host recovery, approved RPO/RTO and independent second-engineer release/rollback are not evidenced. Keep this checkpoint RED.

### Next controlled actions
1. Add the current-main customer metadata-create API contract and connect the customer upload form/retry state to the verified opaque session binding.
2. Complete the six-operation provider runtime composition only after approved secret-manager and provider-driver ownership is supplied; keep execution disabled and fail-closed until then.
3. Finish SLA lifecycle and worker supervision/metrics/recovery.
4. Owner-approve main protection/rulesets, then establish off-host PostgreSQL recovery and a second-engineer release/rollback rehearsal.
5. Preserve the approved 228 requirements / 38 chapters; keep v34 additions versioned and separately governed.


---

## Append-only checkpoint — 2026-11-08 (metadata API composition, idempotency correction and exact-main verification)

### Live application baseline and exact-main evidence

- Dynamically resolved application main before this documentation update: `066be8b2fd3756aa0712cb81c88e639b70f8638b`.
- Mainline code corrections:
  - `8e75052c43807489521ce2853af19441d6623084` — include optional SHA-256 checksum in the customer-asset metadata idempotency fingerprint; reject an invalid supplied checksum; add a PostgreSQL checksum-only mismatch regression.
  - `066be8b2fd3756aa0712cb81c88e639b70f8638b` — compose the metadata API's PostgreSQL pool, authorization stores and repository independently from the binary-upload feature flag. Metadata mode still requires PostgreSQL identity, tenant/actor assignments, OIDC and durable audit; it does not enable provider transfer.
- Exact-head workflows for `066be8b2...`:
  - EPER CI [run 42442551769](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551769) — PASS.
  - Fresh-clone developer/PostgreSQL verification [run 42442551725](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551725) — PASS.
  - Customer OIDC Chromium browser E2E [run 42442551743](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551743) — PASS.
  - Same-commit integrated validation [run 42442551770](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551770) — PASS.
  - 228 requirement / 38 chapter matrix [run 42442551756](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551756) — PASS.
  - G9 reconciliation [run 42442551718](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551718) — PASS.
  - Six-family HTTP smoke [run 42442551728](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551728) — PASS.
  - Container runtime smoke [run 42442551794](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551794) — PASS.
  - Controlled QA re-execution [run 42442551732](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551732) — PASS.
- The 228/38 matrix on this exact application SHA reports 228 requirements, 38 chapters, 28 passed checks and no failed chapters. G9 reports 5/5 passing tests.

### Fresh-clone and PostgreSQL evidence

- Exact-main fresh-clone job `128614660819`, run [42442551725](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551725):
  - `npm run dev:verify` completed with `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
  - 1,581 tests; 1,569 passed; 0 failed; 12 environment-dependent skips.
  - All seven migration groups were applied and repeated: payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity.
  - Audit migration 025 `customer_asset_metadata_idempotency` was applied.
  - `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; source/restored base-table counts 80; migration ledger tables 7.
- The generic fresh-clone suite skips the two-login workflow tests when dedicated worker login URLs are absent. Exact-main EPER CI separately provisions restricted PostgreSQL logins and executes those tests; they are not counted as passed from the generic skipped test.
- Exact-main EPER CI job `128614660846`, run [42442551769](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551769):
  - Metadata idempotency integration: 1/1.
  - Customer-asset migration/RLS/checksum assurance: 1/1.
  - Two independent restricted PostgreSQL logins / claim takeover: 1/1.
  - Two-worker retry, dead-letter, audited replay and idempotent redelivery: 1/1.
  - Workflow worker lifecycle: 37/37.
  - Dispatcher approval and shutdown contracts: 3/3.
  - Tenant/actor assignment integration: 11/11.
  - Capability conformance: 7/7.
  - All selected suites: 0 failures, 0 skips.
- The metadata idempotency regression now changes only `checksumSha256` and expects `EPER_CUSTOMER_ASSET_METADATA_IDEMPOTENCY_CONFLICT`; this closes the checksum omission found during review of the historical #399 branch. The historical branch itself was not merged.

### Identity, customer workspace and support

- Server-side session binding remains on main via `da962a5163e96fb150b2a2cee2acf2a6726d17b8`. Exact-main fresh-clone test 432 verifies the HMAC binding for the verified durable session, stability for the same session and rotation for a new login by the same actor.
- Exact-main Chromium browser test in [run 42442551743](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42442551743) passed 1/1: local test-issuer OIDC login, customer workspace/support access, logout and revocation. This is test-issuer evidence, not production identity-provider interoperability.
- HTTP tests cover OIDC state/callback, bounded durable sessions, host-only secure cookies, same-origin CSRF, logout revocation, tenant/application assignment and role checks.
- Current-main support tests cover customer ticket creation/list/history/replies, tenant/application isolation, internal-note SQL filtering, admin queue/triage, severity protection, assignment and CSV export. Examples in the exact-main fresh-clone log: ticket reply/audit 846, cross-tenant/application denial 847, internal-note SQL filtering 855, admin severity 1379, support triage console 1394 and CSV formula-safe export 45.
- No SLA policy, response/resolution deadline, breach/escalation or service-level reporting implementation/test was found in the current repository search. Keep that support scope open.
- The customer portal currently has asset listing/filtering/export/download, but no upload form. The metadata-create route is implemented and feature-gated. The verified upload-completion route remains fail-closed without a trusted verifier. `main.ts` does not inject upload-grant, upload-lookup, object-verification, storage/download or malware-scan provider ports. Provider runtime remains disabled; enabling its configuration still fails startup with `PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED`.
- Therefore metadata creation is not a complete customer asset journey. Real-byte browser upload, stable upload-session retry, trusted provider verification, clean scan and authorized download remain open. Do not enable provider execution or invoke external storage.

### Seven approved pointer disposition

1. **v34 → 228 requirements:** preserve the approved 228 IDs and 38 chapters. The 45 original v34 rows remain; 0 exact full-coverage mappings and 45 partial shared-control links are recorded. Feature-level acceptance traceability remains incomplete.
2. **Fresh-clone setup:** GREEN for reproducible `npm run dev:verify`; exact evidence above. Independent second-engineer handover/release rehearsal remains open.
3. **PostgreSQL:** GREEN for seven migration groups including identity, repeatability, live PostgreSQL CI, metadata idempotency/RLS and disposable local backup/restore. Off-host backup, retention/key custody, approved RPO/RTO and independent restore remain open.
4. **Identity/OIDC:** AMBER. Protocol client, browser routes, durable sessions, secure cookies, CSRF, HMAC session binding and tenant/application assignments are integrated/tested. Local test-issuer browser E2E passes; production IdP interoperability is not established.
5. **Customer workspace/support:** AMBER. Ticket journey, tenant/application scope, replies, internal-note separation, admin triage/severity and export are present. SLA lifecycle and complete binary asset journey remain incomplete.
6. **Scheduler/workflow:** AMBER. Restricted worker roles, continuous process host, lease/fencing, idempotency, retry/dead-letter/audited replay and shutdown are proven in PostgreSQL CI. Approved production dispatcher, secret resolver, supervisor, metrics/alerts and recovery rehearsal remain open.
7. **Release/continuity:** RED. Live branch metadata reports `protected=false`; repository rulesets are empty. Off-host recovery, approved RPO/RTO and independent second-engineer release/rollback are not evidenced. The continuity charter remains a proposed standard requiring owner approval.

### Live open-PR inventory — exact-head evidence

- Live GitHub open-PR query returned 23 drafts. For every entry below, the current head was resolved, the selected Actions run was confirmed to have that exact `head_sha`, and the relevant job log was inspected. All selected relevant jobs succeeded. These are branch-local results, not proof of integration into main.
- GitHub compare against main `474f30c18279fb0f69a66e7160b0b7838de9aa92` reports every branch as diverged and behind main. #432 is 144 commits behind; the other listed branches are 218 commits behind. Do not merge historical stacks wholesale.

| PR | Exact current head SHA | Ahead / behind main | Selected exact-head run |
|---|---|---:|---|
| #399 customer asset upload workspace | `ef9f85c775b41fc7ec8316eb51578e036cec8a64` | 223 / 221 | [42176207998](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42176207998) — provider/PostgreSQL lifecycle PASS |
| #387 actor-scoped work queue | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | 22 / 221 | [41784823307](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823307) — fresh-clone PASS |
| #432 mainline product audit | `cb49644e3d67cc98b2472e5eba32450cd9baac20` | 7 / 147 | [42333045836](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42333045836) — CI PASS; separate matrix PASS |
| #384 asset repository foundation | `291129b77ab50623e41dd28c4a746ef70da28183` | 140 / 221 | [41786048922](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048922) — PostgreSQL lifecycle PASS |
| #420 verified-session retry binding | `b256e86e4a93eff48a129309b112f62245dc661e` | 238 / 221 | [42241914147](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42241914147) — Chromium OIDC 1/1 |
| #416 upload retry identity persistence | `5ffdecd5148040858837e540322919cfbd455595` | 229 / 221 | [42236540578](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42236540578) — Chromium OIDC 1/1 |
| #414 isolated upload-expiry worker | `9eba0595bce55d51bf8447bd54516cb2168a6478` | 240 / 221 | [42230756607](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42230756607) — PostgreSQL lifecycle 1/1 |
| #413 cross-application upload expiry | `e86ae5ca65d0eadba18abea62615d2526d2a5006` | 210 / 221 | [42225487935](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42225487935) — PostgreSQL lifecycle 1/1 |
| #402 expired reservation recovery | `576796fb5bf81388f922ce04e7dad411a9b2a7c2` | 194 / 221 | [42219623095](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42219623095) — PostgreSQL lifecycle 1/1 |
| #377 scorecard/crosswalk addendum | `492465759af4e7786e1a8ef51118cf1b354529de` | 80 / 221 | [42208779180](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42208779180) — matrix 259/259, 28 checks |
| #386 upload reservation idempotency | `a1b7341d71a4086c983dd3362a4704c124a52b74` | 164 / 221 | [41837639531](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639531) — PostgreSQL lifecycle 1/1 |
| #395 provider-neutral storage catalogue | `baa6151a5ef4b9b4f460b72bd8a26aa9326ceeb8` | 183 / 221 | [42156557499](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42156557499) — PostgreSQL provider suites PASS |
| #394 PostgreSQL download authorization | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | 178 / 221 | [41868477503](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477503) — Chromium OIDC 1/1 |
| #398 fail-closed provider runtime registry | `3c1a2b14af7d7335ed0fc91c2cb7a414b10a5c56` | 236 / 221 | [42159145776](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42159145776) — PostgreSQL provider suites PASS |
| #401 PostgreSQL capacity plan | `c123b9bebad2f2991e16e3ea1bdcdcd3851e7e6f` | 185 / 221 | [41993032789](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41993032789) — PostgreSQL payment-store PASS |
| #392 provider worker/payload integrity | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | 39 / 221 | [41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478) — PostgreSQL provider suites PASS |
| #393 combined asset/provider stack | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | 166 / 221 | [41844357288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357288) — PostgreSQL provider suites PASS |
| #378 encrypted payload boundary | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | 7 / 221 | [41738299039](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299039) — PostgreSQL lifecycle 1/1 |
| #379 encrypted PostgreSQL payload store | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | 8 / 221 | [41738351657](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351657) — PostgreSQL lifecycle 1/1 |
| #385 customer asset requirements | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | 4 / 221 | [41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125) — matrix 259/259, 28 checks |
| #380 client asset/workflow UX requirements | `55006ab19bcbb685fc3e84c4230fd865087887f3` | 5 / 221 | [41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774) — matrix 259/259, 28 checks |
| #390 payload-operation referential integrity | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | 20 / 221 | [41805934711](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934711) — PostgreSQL lifecycle 1/1 |
| #391 restricted-role payload RLS | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | 21 / 221 | [41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247) — PostgreSQL lifecycle 1/1 |

### Merge and branch disposition

- PR #306 remains merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 remains merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; both merge commits are ancestors of main.
- PR #438 merge `3e52ede4a16ba5cf5b2cf5bf2d4d9e807334ec9a` is an ancestor of main.
- PRs #447 and #448 are closed unmerged/superseded. Their server-side session-binding and verified-completion boundary slices were ported directly to main; do not report the closed PRs as merged.
- The #399 review identified a checksum omission and a client retry-key/session-retention gap. The checksum fingerprint defect is corrected on main by `8e75052`; the stable browser upload-operation key and session recovery remain outstanding.
- Preserve main's current asset migration sequence and add only additive migrations. Do not merge the historical #378–#414 provider/asset stacks wholesale because their migration histories overlap and their branches diverge.

### Release and continuity controls

- Live main branch metadata: `protected=false`; repository rulesets endpoint: empty array.
- Off-host PostgreSQL backup, retention/key custody, approved RPO/RTO, independent restore, second-engineer release path and rollback rehearsal remain unevidenced.
- The Engineering Continuity and Independence Charter remains a proposed operating standard requiring owner approval.
- No chargeable cloud resources, production credentials, real provider calls or external storage actions were used. Preserve the approved 228 requirements / 38 chapters.


Inventory comparison note: the ahead/behind values above are anchored to main `474f30c18279fb0f69a66e7160b0b7838de9aa92` immediately before this scorecard-only correction. This correction changes documentation only; application code remains `066be8b2fd3756aa0712cb81c88e639b70f8638b`.


---

## 2026-11-08 09:56 IST checkpoint — provider authorization and exact-head inventory refresh

**Inspected application main SHA:** `6de654d4122c2053b0d122aea4998279c0d97207`.  
This checkpoint supersedes the earlier open-PR inventory in this document. The scorecard-only commit created by this update does not change application code.

### New mainline provider-security delivery

The following code is now on main:

- `dbe43dc62e27ec40e8032d59cc57ba0a23a495c4`: PostgreSQL JSONB capability membership uses the `?` operator for `allowed_capabilities`.
- `b04e51f63905e777875989ff39cda21898f9c85b`: PostgreSQL provider connection repository adds `assertDispatchAuthorization`, rechecking tenant, application, connection, version, provider, capability and active binding.
- `3faccf9a92f0474326b3fd8a7162466e7bad1721` and `54efce856ccc3d9837da89b4be96792e19579732`: runtime composition requires the post-secret authorization check.
- `2ad7e75a776c68b5d33a874330cee43e9a06df78`: tests post-secret authorization revalidation.
- `b0f49719ffe3570ef7ee010b2e5a9d2b7d19eadb`: provider secret-reference and secret-resolution failures are normalized to stable error codes; raw secret-manager error text is not exposed.
- `c662fdafbb67837021d8078fe86067e220c75f72`: tests credential-error redaction and the post-secret authorization boundary.
- `6de654d4122c2053b0d122aea4998279c0d97207`: provider-connection authorization integration is included in the provider PostgreSQL lifecycle workflow path filter.

The provider runtime credential-resolution test reports **4 passed, 0 failed, 0 skipped**. It verifies reference revalidation, normalized/redacted secret-manager errors, post-secret authorization recheck, and that secrets are not resolved when reference/version authorization fails. The live PostgreSQL provider-connection authorization integration reports **1 passed, 0 failed, 0 skipped**.

**Important limit:** `eper/apps/api/main.ts` still fails closed when provider storage runtime is enabled with `PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED`. The entrypoint explicitly states that approved real provider drivers and a secret-manager adapter are not wired there. The new credential-resolution service is a security foundation, not production provider activation or customer binary transfer.

### Current-main workflow evidence

The inspected application baseline is `c662fdafbb67837021d8078fe86067e220c75f72`, with a later workflow-path-only tip `6de654d4122c2053b0d122aea4998279c0d97207`.

| Evidence | Exact run | Result |
|---|---:|---|
| Fresh-clone developer setup on code-bearing main | [42446534773](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446534773) | PASS |
| EPER CI on code-bearing main | [42446534757](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446534757) | PASS |
| Same-commit integrated validation | [42446534830](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446534830) | PASS |
| 228 requirements / 38 chapter matrix | [42446534789](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446534789) | PASS |
| G9 reconciliation | [42446534717](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446534717) | PASS |
| Provider credential redaction and dispatch authorization, latest main | [42446676771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446676771) | PASS |
| Workflow YAML validation, latest main | [42446676743](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446676743) | PASS |

Fresh-clone evidence on `c662fdaf`:

- `npm run dev:verify`: `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- Tests: 1,583 total; 1,571 passed; 0 failed; 12 skipped.
- All seven migration groups were applied and repeated, including `migrate:identity` / `001_customer_oidc_sessions.sql`.
- Disposable PostgreSQL 16 backup/restore: `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`.
- Source/restored base tables: 80 / 80.
- Migration ledgers: 7.

The integrated mainline test job reports 1,413 tests, 1,407 passed, 0 failed and 6 skipped. The chapter matrix reports 38 chapters, 228 requirements, 259 passed pilot tests, 0 failed chapters and 28 passed checks. These are automated technical checks only; they do not close business acceptance.

Latest provider PostgreSQL lifecycle run `42446676771` includes the provider credential redaction and post-secret authorization tests (4/4), provider-connection authorization integration (1/1), asset migration assurance, legacy upgrade/backfill, scanner/verification adapters (12/12) and process-level scan/recovery worker tests (3/3). All selected suites passed.

### Verified foundational merges

- PR #306 merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; current-main comparison confirms the merge commit is an ancestor.
- PR #310 merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; current-main comparison confirms the merge commit is an ancestor.

### Current open-PR inventory — 2026-11-08 09:56 IST

The live GitHub API returned **21 open draft PRs**. Each head below was resolved from the live PR record. A relevant Actions run was retrieved for that exact head and its relevant job log inspected. All selected relevant jobs completed successfully. The branch-local results do not prove integration with current main.

Comparison is against application main `6de654d4122c2053b0d122aea4998279c0d97207`; all branches are diverged.

| PR | Exact head SHA | Ahead / behind main | Exact-head workflow evidence |
|---|---|---:|---|
| #432 mainline audit | `cb49644e3d67cc98b2472e5eba32450cd9baac20` | 7 / 174 | [42333045813](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42333045813) matrix PASS: 38 chapters, 228 requirements, 259 tests, 28 checks |
| #414 upload-expiry worker | `9eba0595bce55d51bf8447bd54516cb2168a6478` | 240 / 248 | [42230756607](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42230756607) PostgreSQL lifecycle 1/1 |
| #413 cross-application expiry | `e86ae5ca65d0eadba18abea62615d2526d2a5006` | 210 / 248 | [42225487935](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42225487935) PostgreSQL lifecycle 1/1 |
| #402 expired reservation recovery | `576796fb5bf81388f922ce04e7dad411a9b2a7c2` | 194 / 248 | [42219623095](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42219623095) PostgreSQL lifecycle 1/1 |
| #401 PostgreSQL capacity plan | `c123b9bebad2f2991e16e3ea1bdcdcd3851e7e6f` | 185 / 248 | [41993032789](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41993032789) PostgreSQL payment-store integration PASS |
| #399 customer asset workspace | `ef9f85c775b41fc7ec8316eb51578e036cec8a64` | 223 / 248 | [42176208018](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42176208018) fresh clone PASS; [42176208027](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42176208027) Chromium OIDC 1/1 |
| #398 provider runtime registry | `3c1a2b14af7d7335ed0fc91c2cb7a414b10a5c56` | 236 / 248 | [42159145776](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42159145776) PostgreSQL payload integrity 2/2 |
| #395 provider catalogue | `baa6151a5ef4b9b4f460b72bd8a26aa9326ceeb8` | 183 / 248 | [42156557499](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42156557499) PostgreSQL payload integrity 2/2 |
| #394 download authorization | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | 178 / 248 | [41868477503](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477503) Chromium OIDC 1/1 |
| #393 combined asset/provider stack | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | 166 / 248 | [41844357288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357288) PostgreSQL payload integrity 2/2 |
| #392 provider worker/payload integrity | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | 39 / 248 | [41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478) PostgreSQL payload integrity 2/2 |
| #391 restricted-role payload RLS | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | 21 / 248 | [41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247) provider lifecycle 1/1 |
| #390 payload-operation integrity | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | 20 / 248 | [41805934711](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934711) provider lifecycle 1/1 |
| #387 actor-scoped work queue | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | 22 / 248 | [41784823307](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823307) fresh clone PASS; same-commit integrated gate PASS |
| #386 upload reservation idempotency | `a1b7341d71a4086c983dd3362a4704c124a52b74` | 164 / 248 | [41837639531](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639531) provider lifecycle 1/1 |
| #385 customer asset requirements | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | 4 / 248 | [41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125) matrix PASS |
| #384 asset repository foundation | `291129b77ab50623e41dd28c4a746ef70da28183` | 140 / 248 | [41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886) fresh clone PASS |
| #380 client asset/workflow UX requirements | `55006ab19bcbb685fc3e84c4230fd865087887f3` | 5 / 248 | [41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774) matrix PASS |
| #379 encrypted PostgreSQL payload store | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | 8 / 248 | [41738351657](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351657) provider lifecycle 1/1 |
| #378 encrypted payload boundary | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | 7 / 248 | [41738299039](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299039) provider lifecycle 1/1 |
| #377 scorecard/crosswalk addendum | `492465759af4e7786e1a8ef51118cf1b354529de` | 80 / 248 | [42208779180](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42208779180) matrix PASS |

### Closed unmerged browser/session branches

- PR #416 closed unmerged at 2026-11-08T04:02:21Z; do not describe as merged.
- PR #420 closed unmerged at 2026-11-08T04:12:00Z; do not describe as merged.
- PR #447 closed unmerged at 2026-11-08T02:27:51Z; its server-side opaque session-binding capability is present on main, but the browser retry client still does not consume `sessionBinding`.
- PR #448 closed unmerged at 2026-11-08T02:30:32Z; its verified-completion boundary is present on main, but the API entrypoint still lacks the complete provider-backed byte-transfer composition.

### Seven-pointer disposition

1. **v34-to-228:** AMBER. Preserve 228 IDs and 38 chapters. The automated matrix proves structural/technical pilot coverage, not exact source acceptance traceability. The matrix reports 228 requirements, 38 chapters, 259 passed pilot tests, 0 failed chapters and 28 checks. Business acceptance remains 0 in the readiness audit.
2. **Fresh clone:** GREEN for local/CI reproducibility. `npm run dev:verify` passes; 7 migration groups including identity are applied and repeated; local PostgreSQL 16 restore smoke passes (80/80 base tables, 7 ledgers). Independent second-engineer handover rehearsal remains open.
3. **PostgreSQL:** AMBER. Fresh-clone, live integration, migration repeatability, checksum/RLS, identity migration and disposable restore are evidenced. Off-host backup, retention/key custody, approved RPO/RTO and independent restore remain open.
4. **Identity/OIDC:** AMBER. Provider-neutral protocol client, browser routes, durable sessions, secure cookies, CSRF, tenant/application assignment checks and local test-issuer browser E2E are present. Production IdP interoperability is not established. Server-side session binding is present; browser retry consumption remains open.
5. **Customer workspace/support:** AMBER. Ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note separation and export have test evidence. SLA policy/deadlines/breach/escalation/reporting and complete binary asset journey remain incomplete.
6. **Scheduler/workflow:** AMBER. Worker lease/fencing, idempotency, retry/dead-letter/replay, approval revalidation, restricted roles, shutdown and PostgreSQL concurrency are tested. Production dispatcher, secret resolver, supervisor, metrics/alerts and recovery rehearsal remain open.
7. **Release/continuity:** RED. Live main branch metadata remains `protected=false`; repository rulesets endpoint is empty. Off-host recovery and independent second-engineer release/rollback are not evidenced. Charter remains proposed pending owner review.

### Continuity and safety

- Main branch protection is disabled; repository rulesets are empty.
- Off-host backup/retention/key custody, RPO/RTO, independent restore and second-engineer release/rollback remain unproven.
- The Engineering Continuity and Independence Charter remains a proposed operating standard requiring owner review.
- No chargeable cloud resources, production credentials, real provider calls or external storage actions were used.
- Preserve the approved 228 requirements and 38 chapters. Do not report business acceptance from automated pilot results.


## 2026-11-08 10:00 IST correction — latest code-bearing main and customer asset retry

This correction supersedes the earlier 09:56 subsection's use of `c662fdaf` as the latest code-bearing main snapshot. The latest inspected code-bearing main commit is `ccf2f2c81abd7c41360629b9268fdeacc9736df5`; the current main tip at the time of this correction is `5a037e21fe51ad22737edafa0f450472640ecf5f`, whose only change after `ccf2f2c` is this scorecard file. No application source changed after the `ccf2f2c` code-bearing snapshot.

### Fresh-clone and browser evidence on latest code-bearing main

| Evidence | Exact run | Result |
|---|---|---|
| Fresh-clone developer setup | [42446851573](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446851573) | PASS |
| Chromium customer OIDC browser E2E | [42446851532](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446851532) | PASS, 1/1 |
| EPER CI | [42446851537](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446851537) | PASS |
| Same-commit integrated validation | [42446851531](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446851531) | PASS |
| 228/38 matrix | [42446851555](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446851555) | PASS |
| G9 reconciliation | [42446851620](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42446851620) | PASS |

Fresh-clone log for `ccf2f2c`:

- `npm run dev:verify`: PASS.
- 1,583 tests; 1,571 passed; 0 failed; 12 skipped.
- Applied all seven migration groups: payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity.
- Repeated all seven groups, including identity.
- Identity migration applied `001_customer_oidc_sessions.sql`.
- Disposable PostgreSQL 16 backup/restore: PASS; source/restored base tables 80/80; migration ledgers 7.

The browser E2E on `ccf2f2c` passes 1/1. It verifies the local test-issuer OIDC/session lifecycle, customer workspace/support access, CSRF cookie, opaque session binding, upload retry identity, changed-metadata rejection before another network call, session-binding change cleanup, expired/revoked session cleanup, malformed persisted retry cleanup and logout revocation/cleanup. This is local test-issuer evidence, not production identity-provider interoperability.

### Customer asset workspace correction

The current customer portal **does contain an upload form and a session-bound retry client**. The earlier 09:56 note that the browser retry client did not consume `sessionBinding` is superseded.

Current `eper/apps/api/customer-portal-preview.ts`:
- obtains the verified browser session and requires a 64-character opaque `sessionBinding`;
- incorporates tenant, actor, role and `sessionBinding` into the retry identity fingerprint;
- persists only operation/idempotency keys and metadata/identity fingerprints in session storage;
- reuses the same upload idempotency key after a same-session retry/reload;
- rejects changed metadata before another request;
- clears retry state when the verified session changes or expires;
- calls the customer metadata-create API, upload-grant API, browser transfer, and upload-completion API.

The Chromium test uses a deterministic local issuer and intercepts the storage-unavailable path. It proves retry/session isolation and fail-closed behavior, **not real-byte transfer**.

The API entrypoint still throws `PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED` when provider storage runtime is enabled. The entrypoint does not yet wire approved real provider drivers and a secret-manager adapter into all six customer asset ports. Therefore:
- customer asset upload UI and session-bound retry safety: implemented and browser-tested;
- metadata creation and verified-completion API boundaries: present;
- real provider-backed upload → checksum/object verification → malware scan → authorized download: not yet evidenced.

### Current main tip — exact-head validation

Current main tip at this checkpoint: `5a037e21fe51ad22737edafa0f450472640ecf5f` (scorecard-only commit after `ccf2f2c)).

Exact current-tip workflows all completed successfully:

- [EPER CI 42447113650](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42447113650): 1,567 tests; 1,553 passed; 0 failed; 14 skipped.
- [Integrated validation 42447113504](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42447113504): same-commit gate PASS.
- [228/38 matrix 42447113597](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42447113597): 38 chapters, 228 requirements, 259 pilot tests passed, 0 failed chapters, 28 checks.
- [G9 42447113702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42447113702): 5/5 checks passed.
- [Six-family HTTP smoke 42447113593](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42447113593): PASS.
- [Container runtime smoke 42447113534](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42447113534): PASS.

The fresh-clone and browser runs above are on the immediate code-bearing parent `ccf2f2c`, not on the documentation-only `5a037e21` tip. They are recorded with that exact SHA; they are not described as exact-tip runs. The `092a552e` run set was cancelled during rapid superseding commits and is not counted.

### Corrected seven-pointer assessment

- Pointer 4 (identity/OIDC): AMBER. Browser login/session lifecycle and session-bound retry behavior are browser-tested on `ccf2f2c`; production IdP interoperability remains unproven.
- Pointer 5 (customer workspace/support): AMBER. Customer asset upload UI, session-bound retry, ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note filtering and export have evidence. Actual provider-backed bytes and SLA policy/deadlines/breach/escalation/reporting remain open.
- Pointer 6 (provider/workflow operations): AMBER. Credential resolution now revalidates connection authorization after secret resolution and normalizes/redacts secret-manager failures. API provider runtime remains fail-closed; approved secret-manager adapter, real provider drivers, dispatcher and operational supervision/metrics/recovery remain open.

Do not count automated browser/technical tests as production IdP interoperability, real provider transfer, business acceptance or release evidence.


---

## 2026-11-08 10:44 IST — exact-main and open-PR correction

### Dynamically resolved baseline

- Current `main`: `63dfc0cef7d100932aecce4ebe6fd4da22fb413b`.
- This is not merely a scorecard commit. The three commits after the earlier `90a06c97978c5f8138bede207887d416ae0520e3` baseline changed `.github/workflows/ci.yml` and `eper/tests/postgres-customer-asset-scan-process.integration.test.mjs`; the latest commit message is `test(assets): align synthetic scan object with declared upload size`.
- Exact-current-main push runs all completed successfully:
  - EPER CI: [42449290754](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290754)
  - Fresh-clone developer setup: [42449290746](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290746)
  - Integrated validation: [42449290768](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290768)
  - 228/38 matrix: [42449290727](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290727)
  - G9 reconciliation: [42449290724](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290724)
  - Provider-operation PostgreSQL lifecycle: [42449290784](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290784)
  - Six-family HTTP smoke: [42449290785](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290785)
  - Container runtime smoke: [42449290730](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290730)

### PostgreSQL and fresh-clone evidence on exact current main

Fresh-clone run [42449290746](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290746):
- `npm run dev:verify`: PASS.
- 1,583 tests; 1,571 passed; 0 failed; 12 skipped.
- All seven migration groups applied and repeated: payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity.
- Identity migration `001_customer_oidc_sessions.sql` applied and repeated.
- Disposable PostgreSQL 16 backup/restore: PASS; source/restored base-table counts 80/80; migration ledgers 7.

The 12 fresh-clone skips include restricted workflow-worker live-login tests because the generic developer verification does not provision the two dedicated worker login URLs. Do not treat those skips as passed. The exact-main EPER CI run separately provisions the restricted worker test logins and passes:
- workflow outbox worker tests: 37/37;
- dispatcher/shutdown tests: 3/3;
- live tenant/actor assignment integration: 11/11;
- restricted worker login privilege gate: 1/1;
- restricted-role startup gate and unauthorized-column checks: 2/2;
- two restricted workers retry/dead-letter/audit-replay/idempotent redelivery: 1/1.

The exact-main provider lifecycle run passes the live asset scan/recovery path, including upload recovery and session/asset/job lock ordering. The local restore drill proves disposable local recoverability only; it does not establish off-host backup or production disaster recovery.

### Requirements and continuity evidence

The exact-main 228/38 matrix reports 228 requirements, 38 chapters, 259 pilot tests passed, 0 failed, 28 checks passed and no failed chapters. G9 reports 5/5 checks passed. These are technical routing/traceability checks, not complete business acceptance or exact v34-to-228 semantic coverage. Preserve the existing 228 requirement IDs and 38 chapters; the v34 crosswalk still has 45 partial shared-control links and 0 exact full-coverage mappings.

The current branch object reports `protected=false`; the repository rulesets endpoint returns an empty list. The detailed branch-protection endpoint is not accessible to this integration (403), so no additional branch-protection settings are claimed. The PostgreSQL recovery runbook explicitly limits its proof to disposable local/CI databases and states that production destination, encryption-key custody, retention, RPO/RTO and restore certification are not established.

### Workflow operations — verified code path and remaining host duties

The current main worker is a continuously running process, not a cron/timer or request-traffic-triggered task. `workflow-outbox-process.ts` repeatedly discovers authorized tenant/application scopes, drains bounded batches and waits only when no work is claimed. The worker renews leases, fences acknowledgements/failures by claim generation, uses event ID idempotency, applies bounded retry, parks approval-denied events, and records pass counters for claimed/delivered/retried/dead-lettered/lease-lost/interrupted/context counts. SIGINT/SIGTERM abort the runtime and the host closes the PostgreSQL pool.

The operations runbooks explicitly leave external process supervision, restart policy/termination grace, telemetry export and alert routing to the deployment host. The approved dispatcher and provider-side idempotency/cancellation adapter are still not configured. Do not treat the implemented process loop or CI evidence as proof that a production supervisor, dashboards or alerts exist.

### Customer workspace, identity and support correction

The customer portal has an upload form and consumes the opaque server-issued `sessionBinding` in its retry identity fingerprint. It persists only operation/idempotency keys and metadata/identity fingerprints, reuses the same key for same-session retries, and clears/rejects state on changed identity, expired/revoked session or changed metadata. Browser E2E is local test-issuer evidence, not production IdP interoperability.

The API entrypoint still throws `PROVIDER_STORAGE_RUNTIME_EXECUTION_NOT_COMPOSED` when provider storage runtime is enabled. The upload UI, metadata boundary, session-bound retry and verified-completion boundary therefore do not prove real provider-backed bytes, object verification, malware scanning or authorized download end to end. Support ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note filtering and export have test evidence; SLA policies, response/resolution deadlines, breach detection, escalation and service-level reporting remain unimplemented/unproven.

### New main-based download lookup candidate

PR [#449](https://github.com/sbannai/enterprise-product-engineering/pull/449) is the only current open PR based directly on current main:
- head branch: `fix/mainline-postgres-asset-download-lookup`;
- exact head: `219677a7906c70a05edbac38f912c0088b1baf98`;
- base SHA: current main `63dfc0cef7d100932aecce4ebe6fd4da22fb413b`;
- comparison: 5 commits ahead, 0 behind;
- 3 changed files: API server route, PostgreSQL customer-asset repository, route tests;
- state: open, ready for review, not merged.

All 14 Actions runs returned for this exact head completed successfully. Relevant exact-head runs:
- Fresh-clone: [42449729874](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729874) — 1,584 tests; 1,572 passed; 0 failed; 12 skipped; seven migration groups applied/repeated; disposable restore 80/80 base tables and 7 ledgers.
- Chromium OIDC browser: [42449729878](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729878) — 1/1 passed.
- EPER CI: [42449729923](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729923) — worker/assignment/restricted-login integration lanes passed.
- Provider lifecycle: [42449729998](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729998) — PostgreSQL upload/scan/recovery lanes passed.
- PostgreSQL payment-store integration: [42449729953](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729953) — passed.
- 228/38 matrix: [42449729938](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729938) — 259 passed, 0 failed, 28 checks.
- G9: [42449729858](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729858) — passed.
- Release-candidate build: [42449729933](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729933) — passed.
- Same-commit integrated gate: [42449729915](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729915) — passed; its matrix subjob was path-filtered/skipped, while the separate exact-head matrix run passed.

PR #449 adds a PostgreSQL download lookup requiring a completed upload session, non-empty `provider_upload_reference`, active/available asset, clean/not-required scan, and owner-application or explicit shared-link visibility. In PostgreSQL mode, missing rows do not fall back to the legacy JSON manifest. The added route test stubs `getDownloadAsset`; the exact-head provider lifecycle log does not directly exercise the new SQL query. A live PostgreSQL repository test is still required for owner/shared visibility, incomplete/non-clean/inactive rows, tenant/application RLS denial and lookup-error fail-closed behavior.

No review submissions or inline review threads are recorded on #449. The Codex review attempt did not complete because the review usage limit was reached. A focused PR comment records the missing direct PostgreSQL coverage and independent-review requirement: [review note](https://github.com/sbannai/enterprise-product-engineering/pull/449#issuecomment-6717645463). Keep #449 unmerged until that test and an independent review are recorded.

### Current open-PR inventory — heads resolved dynamically

For every row, Actions were retrieved by the exact head SHA shown and the selected relevant job log was inspected. The selected job completed successfully; these historical branch-local results do not establish compatibility with current main.

| PR | Exact head SHA | Behind current main | Selected exact-head run |
|---|---|---:|---|
| [#449](https://github.com/sbannai/enterprise-product-engineering/pull/449) | `219677a7906c70a05edbac38f912c0088b1baf98` | 0 | [42449729874](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449729874) fresh-clone |
| [#394](https://github.com/sbannai/enterprise-product-engineering/pull/394) | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | 255 | [41868477584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477584) fresh-clone |
| [#399](https://github.com/sbannai/enterprise-product-engineering/pull/399) | `ef9f85c775b41fc7ec8316eb51578e036cec8a64` | 255 | [42176208018](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42176208018) fresh-clone |
| [#398](https://github.com/sbannai/enterprise-product-engineering/pull/398) | `3c1a2b14af7d7335ed0fc91c2cb7a414b10a5c56` | 255 | [42159145998](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42159145998) fresh-clone |
| [#387](https://github.com/sbannai/enterprise-product-engineering/pull/387) | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | 255 | [41784823307](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823307) fresh-clone |
| [#432](https://github.com/sbannai/enterprise-product-engineering/pull/432) | `cb49644e3d67cc98b2472e5eba32450cd9baac20` | 181 | [42333045813](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42333045813) matrix |
| [#384](https://github.com/sbannai/enterprise-product-engineering/pull/384) | `291129b77ab50623e41dd28c4a746ef70da28183` | 255 | [41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886) fresh-clone |
| [#414](https://github.com/sbannai/enterprise-product-engineering/pull/414) | `9eba0595bce55d51bf8447bd54516cb2168a6478` | 255 | [42230756558](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42230756558) fresh-clone |
| [#413](https://github.com/sbannai/enterprise-product-engineering/pull/413) | `e86ae5ca65d0eadba18abea62615d2526d2a5006` | 255 | [42225487813](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42225487813) fresh-clone |
| [#402](https://github.com/sbannai/enterprise-product-engineering/pull/402) | `576796fb5bf81388f922ce04e7dad411a9b2a7c2` | 255 | [42219622948](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42219622948) fresh-clone |
| [#377](https://github.com/sbannai/enterprise-product-engineering/pull/377) | `492465759af4e7786e1a8ef51118cf1b354529de` | 255 | [42208779180](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42208779180) matrix |
| [#386](https://github.com/sbannai/enterprise-product-engineering/pull/386) | `a1b7341d71a4086c983dd3362a4704c124a52b74` | 255 | [41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258) fresh-clone |
| [#395](https://github.com/sbannai/enterprise-product-engineering/pull/395) | `baa6151a5ef4b9b4f460b72bd8a26aa9326ceeb8` | 255 | [42156557469](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42156557469) fresh-clone |
| [#401](https://github.com/sbannai/enterprise-product-engineering/pull/401) | `c123b9bebad2f2991e16e3ea1bdcdcd3851e7e6f` | 255 | [41993032684](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41993032684) fresh-clone |
| [#392](https://github.com/sbannai/enterprise-product-engineering/pull/392) | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | 255 | [41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500) fresh-clone |
| [#393](https://github.com/sbannai/enterprise-product-engineering/pull/393) | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | 255 | [41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369) fresh-clone |
| [#385](https://github.com/sbannai/enterprise-product-engineering/pull/385) | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | 255 | [41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125) matrix |
| [#380](https://github.com/sbannai/enterprise-product-engineering/pull/380) | `55006ab19bcbb685fc3e84c4230fd865087887f3` | 255 | [41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774) matrix |
| [#391](https://github.com/sbannai/enterprise-product-engineering/pull/391) | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | 255 | [41820073308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073308) fresh-clone |
| [#390](https://github.com/sbannai/enterprise-product-engineering/pull/390) | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | 255 | [41805934645](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934645) fresh-clone |
| [#379](https://github.com/sbannai/enterprise-product-engineering/pull/379) | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | 255 | [41738351740](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351740) fresh-clone |
| [#378](https://github.com/sbannai/enterprise-product-engineering/pull/378) | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | 255 | [41738299068](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299068) fresh-clone |

All selected exact-head jobs in this inventory completed successfully. The other 21 branches are nevertheless diverged from current main (255 commits behind, except #432 at 181 behind). Their green results are historical branch-local evidence only. Do not merge the historical asset/provider/expiry stacks wholesale; reconcile migrations and port only unique behavior to current main.

### Foundational merge verification

- PR #306 is closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; current main contains it (compare: 908 commits ahead, 0 behind).
- PR #310 is closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; current main contains it (compare: 907 commits ahead, 0 behind).
- Neither belongs in the current open-PR inventory.

### Seven-pointer disposition

1. v34-to-228 reconciliation — AMBER: preserve 228/38; exact semantic/source acceptance mapping remains incomplete (45 partial links, 0 exact full-coverage mappings).
2. Fresh-clone developer setup — GREEN: exact-main `npm run dev:verify`, seven migration groups/repeatability and disposable restore pass.
3. PostgreSQL — AMBER: live PostgreSQL integration and local backup/restore pass; off-host backup, retention, encryption/key custody, approved RPO/RTO and independent restore remain unproven.
4. Identity/OIDC — AMBER: durable sessions, browser routes, secure cookies, CSRF, tenant/application assignments and local test-issuer browser E2E are present; production IdP interoperability remains unproven.
5. Customer workspace/support — AMBER: ticket journey and upload UI/session-bound retry are present; provider-backed binary transfer and SLA lifecycle remain incomplete.
6. Scheduler/workflow — AMBER: continuous loop, lease renewal/fencing, event idempotency, retry/dead-letter, approval gate, restricted PostgreSQL logins and two-worker live test pass; external supervisor, production telemetry/alerts and approved dispatcher remain deployment duties.
7. Release/continuity — RED: main is unprotected, rulesets empty, off-host recovery and independent second-engineer release/rollback path not evidenced.

No PR was merged or deleted in this checkpoint. No production provider/external action or chargeable cloud resource was triggered.


## 2026-11-08 11:00 IST — PR #449 exact-head correction and shared-download RLS fix

### Mainline position

At the start of this correction, current main was `22625684565a90a6412dca32113a70094788a1d2`, the scorecard update commit recorded above. Exact-tip push workflows completed successfully:
- EPER CI [42450268602](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450268602)
- Integrated validation [42450268608](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450268608)
- 228/38 matrix [42450268613](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450268613)
- G9 [42450268552](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450268552)
- Six-family HTTP smoke [42450268553](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450268553)
- Container runtime [42450268646](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450268646)

The exact-tip integrated gate reports all applicable technical lanes completed on the same commit. Its matrix subjob was path-filtered/skipped; the separate exact-tip matrix passed 259 pilot tests, 0 failed, 28 checks and no failed chapters. G9 passed 5/5. The exact-tip EPER CI passed 37/37 workflow worker tests, 3/3 dispatcher/shutdown tests, 11/11 live tenant/actor assignment tests, 1/1 restricted worker login privilege test, 2/2 restricted-role/column-grant tests and 1/1 two-restricted-worker retry/dead-letter/audit-replay/idempotent redelivery test.

The latest fresh-clone and provider lifecycle code-bearing main evidence remains on `63dfc0cef7d100932aecce4ebe6fd4da22fb413b` (the subsequent main commits are scorecard-only). Fresh-clone [42449290746](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42449290746) passed 1,583 tests (1,571 passed, 0 failed, 12 skipped), applied and repeated all seven migration groups including identity, and completed disposable PostgreSQL 16 restore with 80/80 base tables and 7 ledgers.

### PR #449 correction — supersedes the earlier head row above

Current exact PR head is now `28a24f11f8c877fed327be5f33e41095d2b49dc9` (branch `fix/mainline-postgres-asset-download-lookup`). It is open, not merged, 8 commits ahead and 1 behind current main. The one-behind commit is the scorecard-only main update `22625684565a90a6412dca32113a70094788a1d2`; the PR must be updated/retested against the latest main tip before merge. The earlier head `219677a7906c70a05edbac38f912c0088b1baf98` is superseded; do not use its green runs as the current PR evidence.

A direct PostgreSQL review found a real bug in the first download lookup: an upload session was RLS-visible only to the application that created it, and the query required `s.application_id = $3`. Therefore an explicitly linked customer-shared asset could not resolve its upload reference from the linked application.

The branch now:
- adds `026_customer_asset_shared_download_session_visibility.sql`;
- adds a SELECT-only upload-session RLS policy that allows a linked application to read the session for a `customer_shared` asset only when an explicit application link exists;
- leaves the original ALL policy in place for INSERT/UPDATE, so session writes remain scoped to the originating application;
- allows the repository query to use the explicit shared-link predicate while retaining owner-application visibility.

The live PostgreSQL test runs under a separate login inheriting the restricted `eper_customer_asset_access` role and verifies owner-app clean download returns the provider upload reference (not the metadata placeholder), another app is denied before linking, explicit link enables the linked app, cross-application restricted and cross-tenant reads return no row, and incomplete/infected-quarantined assets return no download reference. All references are synthetic; no provider is called.

All 14 Actions runs returned for exact head `28a24f11f8c877fed327be5f33e41095d2b49dc9` completed successfully:
- Provider lifecycle [42450575098](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575098): new restricted-role shared-download test 1/1; asset upload/scan/recovery and migration/RLS lanes all passed.
- Fresh clone [42450575115](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575115): 1,585 tests; 1,572 passed; 0 failed; 13 skipped; seven migration groups applied/repeated including identity; disposable restore 80/80 base tables and 7 ledgers. The generic dev-verify skips restricted worker live-login tests; separate EPER CI provisions those roles and passes the live cases.
- Chromium OIDC browser [42450575106](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575106): 1/1 passed.
- EPER CI [42450575105](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575105): 37 worker, 3 dispatcher/shutdown, 11 assignment, restricted-role and two-worker live integration lanes passed.
- PostgreSQL payment-store integration [42450575052](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575052): passed.
- 228/38 matrix [42450575130](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575130): 259 passed, 0 failed, 28 checks.
- G9 [42450575065](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575065): 5/5 passed.
- Same-commit integrated gate [42450575135](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575135): PASS; matrix subjob path-filtered/skipped, separate matrix above passed.
- Release candidate [42450575369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575369): PASS.
- Six-family HTTP smoke [42450575048](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575048): PASS.
- Container runtime [42450575198](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42450575198): PASS.

Review comments:
- [Initial direct-PostgreSQL test requirement](https://github.com/sbannai/enterprise-product-engineering/pull/449#issuecomment-6717645463)
- [Shared-download RLS defect and fix evidence](https://github.com/sbannai/enterprise-product-engineering/pull/449#issuecomment-6717701271)
- [Final exact-head run evidence](https://github.com/sbannai/enterprise-product-engineering/pull/449#issuecomment-6717715326)

No review submissions or inline review threads exist. The Codex review attempt did not complete due its usage limit. Keep #449 unmerged until an independent review is recorded and the branch is updated/retested against current main. The new mainline migration 026 occupies a number used differently by historical expiry branches #402/#413/#414; those stale branches must not be merged wholesale and any future expiry port must be renumbered/reconciled additively.

### Remaining seven-pointer state

1. v34-to-228: AMBER — 228 IDs/38 chapters preserved; exact source acceptance mapping remains incomplete (45 partial shared-control links, 0 exact full-coverage mappings).
2. Fresh-clone: GREEN — seven migration groups and repeatability, identity included; local restore passes.
3. PostgreSQL: AMBER — live PostgreSQL, RLS, identity migrations and disposable restore pass; off-host backup, retention, encryption/key custody, RPO/RTO and independent restore remain unproven.
4. Identity/OIDC: AMBER — durable sessions, secure cookies, CSRF, tenant/application assignments and local test-issuer browser lifecycle pass; production IdP interoperability remains unproven.
5. Workspace/support: AMBER — ticket journey, upload form/session-bound retry and a PostgreSQL download-lookup candidate are tested; provider-backed bytes/object verification/scan/authorized download are not yet integrated on main; SLA lifecycle remains unimplemented/unproven.
6. Scheduler/workflow: AMBER — continuous process, lease/fencing, idempotency, retry/dead-letter, approved-dispatch gate and two-restricted-worker live PostgreSQL proof pass; production dispatcher, host supervision and telemetry/alerts remain deployment duties.
7. Release/continuity: RED — main remains unprotected, rulesets empty, and off-host recovery/independent second-engineer release and rollback are not evidenced.

Do not merge #449 or any historical branch in this correction. No real provider/external action or chargeable cloud resource was used.
