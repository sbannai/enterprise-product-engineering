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
