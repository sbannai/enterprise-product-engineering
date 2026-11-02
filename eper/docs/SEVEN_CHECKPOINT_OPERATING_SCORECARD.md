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
