# EPER Seven-Checkpoint Operating Scorecard

**Purpose:** Durable, evidence-led operating model for the seven-checkpoint engineering brief.  
**Baseline at creation:** `a1b93decff2f292a0a81453c27801607ca5f7946`  
**Last reviewed:** 2026-11-05 (latest exact-head correction appended below)  
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



### Operating update — 2026-11-04 03:32 IST

**Dynamically resolved current main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Latest main commit:** `revert: remove unintended provider payload test commit from main`. Its diff deletes `eper/tests/postgres-encrypted-provider-payload-store.integration.test.mjs`; the provider-candidate branches retain the test and its exact-head evidence. Do not attribute that test coverage to current main.

#### Mainline evidence boundary

- The combined commit-status lookup for current main returned no status contexts.
- The available commit-workflow lookup is PR-triggered only; it did not establish push-triggered checks for this latest main SHA.
- Therefore post-merge mainline CI/integrated status is **NOT ASSESSED** for `2c380d79...`. Do not infer green main from prior main or PR runs.
- Merged PR #306 (`6e8dd438e5091b1802d65e4f29951389fe077859`) and PR #310 (`88b9708d748c19dc80a1a2d7ad4960914451db7e`) were both verified as ancestors of current main. #306 remains merged, not open.

#### Live open-PR inventory and current-head comparison

The live open list is #377–#382. Each current head contains current main as an ancestor (compare result: zero commits behind). These are the current exact heads, not historical PR-body snapshots:

| PR | Current exact head | Current base | Exact-head Actions evidence |
|---|---|---|---|
| #377 | `c958a228d0b33a8ef99962fe356f571711933c7f` | `main` | EPER CI [41724362477], integrated [41724362386], separate chapter matrix [41724362463], G9 [41724362287]; all returned runs succeeded. Integrated matrix subjob was skipped for this documentation-only change; separate matrix passed 38 chapters / 259 tests / 28 checks / zero failed chapters. Integrated PostgreSQL suite: 1,404 passed, 0 failed, 6 skipped. |
| #378 | `32bd57301846e20cd9b492374061dd0b19f08884` | `main` | Fresh clone [41711723463], PostgreSQL [41711723482], provider lifecycle [41711723440], integrated [41711723459], EPER CI [41711723639], matrix [41711723413]; all returned workflows succeeded. Fresh clone: 1,429 passed, 0 failed, 4 skipped; `dev:verify`, seven migration groups including identity, repeatability and disposable restore passed (75/75 base tables). PostgreSQL payload tests 2/2; queue lifecycle 1/1. |
| #379 | `6f9cb0deb0c4bf9bd34bad88a2c7c4fc59c71c02` | #378 branch | Fresh clone [41711764471], PostgreSQL [41711764430], provider lifecycle [41711764871], matrix [41711764431] and QA [41711764653] succeeded. Fresh clone: 1,434 passed, 0 failed, 4 skipped; `dev:verify`, seven migration groups including identity, repeatability and restore passed (76/76 base tables). PostgreSQL payload tests 2/2; queue lifecycle 1/1. No same-head EPER CI or integrated run was returned. |
| #380 | `55b13f9f07d7a594e21f07b68962149272572135` | `main` | EPER CI [41711737227], integrated [41711736892], separate matrix [41711736902], G9 [41711736772], release [41711736765] and remaining returned lanes succeeded. Matrix: 38 chapters, 259 tests passed, 28 checks, no failed chapters. Integrated PostgreSQL suite: 1,404 passed, 0 failed, 6 skipped. CW-060/061 remain additive draft requirements, not upload/workspace runtime delivery. |
| #381 | `963c45324b44489ba42ae3bf28b8295b13254af9` | #379 branch | Fresh clone [41711790741], provider lifecycle [41711790735], matrix [41711790734], workflow config [41711790731] and QA [41711790875] succeeded. Fresh clone: 1,434 passed, 0 failed, 4 skipped; `dev:verify` and restore passed (76/76 base tables). The PostgreSQL encrypted-payload test passed and explicitly exercised `SET LOCAL ROLE eper_provider_catalogue_access`, tenant/application RLS reads, cross-scope denial and RLS write rejection. No same-head EPER CI or integrated run was returned. |
| #382 | `d799884f5b3459641f008d992a2875450eccd43b` | #381 branch | Fresh clone [41711798935], PostgreSQL [41711798767], provider lifecycle [41711798766], matrix [41711798907], workflow config [41711798774] and QA [41711798919] succeeded. Fresh clone: 1,446 passed, 0 failed, 4 skipped; seven migration groups including identity repeated, provider migrations 021–023 applied, restore passed (76/76 base tables). Provider queue lifecycle 1/1, worker 5/5, keyring 6/6, encrypted-payload PostgreSQL tests 2/2. No same-head EPER CI or integrated run was returned. |

#### Trigger-coverage blocker

The current `.github/workflows/ci.yml` PR filter allows only `main` and `reconcile/payment-153-168-integration`. The integrated workflow allows only `main` and `integration/eper-348-350-355-candidate`.

Consequently, #379 (base #378 branch), #381 (base #379 branch) and #382 (base #381 branch) receive component/fresh-clone/provider lifecycle/matrix evidence but no same-head EPER CI or integrated gate. This is a workflow-trigger coverage gap, not a failed run and not a pass. Resolve it by deliberately extending the base-branch filters through the dependent stack or consolidating onto a main-targeted candidate; then rerun against each new exact head.

#### Capability and continuity boundaries unchanged

- The v34 crosswalk preserves 45 source rows, records no exact full-coverage matches and 45 partial shared-control links / additive draft candidates; approved 228 IDs and 38 chapters remain unchanged. This is classification, not owner approval or feature acceptance.
- Fresh-clone PostgreSQL verification is proven on the provider candidate heads, including all seven migration groups, identity migration, repeatability, live PostgreSQL tests and disposable backup/restore. Current main post-merge validation remains not assessed as stated above.
- #310 and successor identity/browser work remain merged ancestors. The browser journey uses a synthetic IdP; production IdP onboarding/JWKS rotation and a complete Product Admin OIDC login remain unproven.
- Support ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note separation and export are tested. Owner-defined SLA targets, timers, escalation and breach evidence remain absent.
- Customer asset metadata listing, audited short-lived download grants and inventory export exist. No upload endpoint or durable blob-upload lifecycle is evidenced. CW-060 remains incomplete. Customer Admin workflow studio/rule evaluation/publication exist; CW-061's complete customer-facing journey remains incomplete.
- Campaign/agent workers have independent entrypoints. Workflow outbox lacks a dedicated independently startable worker app. Provider worker is bounded `runOnce()`, not a continuously supervised process; production worker identity, approved dispatcher wiring, supervision and metrics/alerts remain.
- #379's public PostgreSQL payload-store `put()` commits its own transaction and can persist a payload independently of an operation row; `enqueueWithPayload()` uses `putInTransaction()` for atomic enqueue. The standalone API does not technically enforce the operation-row invariant.
- #382 adds key rotation and actor-attributed deletion with expiry/legal-hold checks, but no versioned retention-policy resolver or bounded purge worker.
- Repository rulesets remain empty; branch-protection state remains not assessed through the connected integration. Production backup destination, RPO/RTO, independent restore rehearsal and second-engineer release/rollback are not demonstrated.

No PR was merged, no approved requirement/chapter was changed, no branch was deleted, and no chargeable cloud resource or real external/provider action was used.


### Operating update — 2026-11-04 04:47 IST

This addendum supersedes the 03:32 statement that post-merge mainline validation was not assessed. The latest main SHA was dynamically re-resolved and its push-triggered Actions runs were inspected directly.

**Current main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Main tree:** `0c01985a303e9348e728acd04b0a55a80020f9a9`

#### Exact-main Actions evidence

All eight push-triggered workflows returned `completed/success` on the exact current main SHA:

| Workflow | Run |
|---|---|
| EPER CI | [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771) |
| Same-commit integrated validation | [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913) |
| 228 requirement / 38 chapter matrix | [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818) |
| G9 reconciliation | [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648) |
| Six-family capability HTTP smoke | [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652) |
| Container runtime smoke | [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533) |
| Controlled QA technical re-execution | [41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702) |
| Controlled technical simulation | [41675875724](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875724) |

The main integrated PostgreSQL job [126056796091](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913) completed with 1,410 tests, 1,404 passed, 0 failed and 6 skipped. The skipped set includes the separately gated live tenant/actor assignment and live capability-conformance tests; the exact-main EPER CI run [126056501446](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771) ran the corresponding live PostgreSQL assignment, commercial guard and RLS/audit/rollback lanes successfully. The integrated run's seven-migration repeatability test passed. The separate exact-main chapter matrix reported 38 chapters, 259 tests passed, 0 failed tests, 28 passed checks and no failed chapters.

The current main commit deletes `eper/tests/postgres-encrypted-provider-payload-store.integration.test.mjs` (commit message: `revert: remove unintended provider payload test commit from main`). Therefore the provider payload integration evidence below belongs to the open provider candidate heads, not current main.

#### PR #306 and exact-tree fresh-clone proof

PR #306 remains merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; comparison confirms that merge commit is an ancestor of current main.

Fresh-clone run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) ran on candidate commit `2c426de8b63e437ffb186ed4887da76b4b704719`. Its tree SHA is exactly the current main tree `0c01985a303e9348e728acd04b0a55a80020f9a9`. The clean-runner job completed with 1,426 tests, 1,422 passed, 0 failed and 4 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; source/restored base-table counts 75/75; migration ledger count 7. The log shows `migrate:identity` applying `001_customer_oidc_sessions.sql`, and repeatability checks across the seven migration groups. This is exact-tree fresh-clone evidence for current main, although the workflow ran against the tree-equivalent candidate SHA rather than the main commit SHA itself.

#### Identity and browser integration ancestry

- PR #310 merge SHA `88b9708d748c19dc80a1a2d7ad4960914451db7e` is an ancestor of current main.
- Successor integration PR #376 merge SHA `9749701bfed527b906183192ca06cc1998e70166` is also an ancestor of current main.
- Browser run [41652347404](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41652347404), on exact PR head `ce3f191c4d60d5dbe986ea923c40a22a866ec28b` before merge, passed the 1,312-test suite and both browser journeys: customer OIDC/workspace/support/logout-revocation 1/1 and Product Admin application-remediation 1/1.
- The browser run uses a synthetic, version-pinned IdP adapter. It exercises the browser flow, durable session, secure-cookie/CSRF protections, logout/revocation and tenant/application assignment integration. It is not production IdP onboarding, production JWKS rotation or a complete Product Admin OIDC login proof.

#### Live open-PR inventory — exact current heads

The live open list remains #377–#382. Each current head contains current main; the stacked provider PRs are one commit ahead of their immediate base after the validation-trigger correction.

| PR | Exact head | Base | Exact-head evidence |
|---|---|---|---|
| #377 | `c8d82bf95bbd2504423af3eae0d19e968963714f` | main | EPER CI [41727718214], integrated [41727718144], matrix [41727718125], G9 [41727718115], release [41727718325] and other returned lanes succeeded. Integrated suite 1,404 passed / 0 failed / 6 skipped; separate matrix 38 chapters / 259 tests / 28 checks / no failed chapters. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | main | EPER CI [41738299249], integrated [41738299062], fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039], matrix [41738298906] and G9 [41738298972] succeeded. Fresh clone 1,429 passed / 0 failed / 4 skipped; dev:verify and restore passed (75/75 base tables, 7 ledgers). Integrated suite 1,411 passed / 0 failed / 6 skipped; queue lifecycle 1/1. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | #378 | EPER CI [41738351610], integrated [41738351629], fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657] and matrix [41738351607] succeeded. Fresh clone 1,434 passed / 0 failed / 4 skipped; dev:verify and restore passed (76/76 base tables, 7 ledgers). Integrated suite 1,416 passed / 0 failed / 6 skipped; encrypted payload enqueue/rollback tests passed. |
| #380 | `55b13f9f07d7a594e21f07b68962149272572135` | main | EPER CI [41711737227], integrated [41711736892], matrix [41711736902], G9 [41711736772] and release [41711736765] succeeded on this exact head. Matrix: 38 chapters / 259 tests / 28 checks / no failed chapters. CW-060/061 remain additive draft scope, not upload/workspace runtime delivery. |
| #381 | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | #379 | EPER CI [41738364070], integrated [41738364009], fresh clone [41738364008], provider lifecycle [41738363993], matrix [41738363997] and workflow config [41738364105] succeeded. Fresh clone 1,434 passed / 0 failed / 4 skipped; restore 76/76, 7 ledgers. The exact-head integrated suite passed the encrypted payload scope test; the test executes `SET LOCAL ROLE eper_provider_catalogue_access`, verifies permitted scope, cross-tenant/application read isolation and write rejection. Integrated suite 1,416 passed / 0 failed / 6 skipped. |
| #382 | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | #381 | EPER CI [41738377743], integrated [41738377787], fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748] and matrix [41738378040] succeeded. Fresh clone 1,446 passed / 0 failed / 4 skipped; restore 76/76, 7 ledgers. Integrated suite 1,428 passed / 0 failed / 6 skipped; queue lifecycle 1/1, bounded provider worker 5/5, keyring 6/6 and encrypted payload PostgreSQL tests 2/2. Same-commit integrated gate passed; the integrated matrix subjob was skipped for this ordinary feature base, while the separate exact-head matrix passed 38 chapters / 259 tests / 28 checks / no failed chapters. |

#### Validation-trigger correction delivered on the existing provider stack

The root cause was confirmed in both workflow definitions: their pull-request base-branch filters excluded the stacked provider targets, so #379/#381/#382 had component evidence but no same-head EPER CI or integrated gate.

The existing #378 branch was updated to include all three provider stack base branches in both `.github/workflows/ci.yml` and `.github/workflows/eper-integrated-validation.yml`. The workflow change was propagated through the existing stack without creating a new PR or leaving a dependent branch behind:

- #378 workflow commits: `d7352ff0ef49b9c8fe0ceb2474e2f7f62676fcb8` and `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05`.
- #379 stack rebase: `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44`.
- #381 stack rebase: `e63f747db7e1f11e4fc7b74fae1591a575870a1d`.
- #382 stack rebase: `8aa4344a02f6f77d5566c7b24d571a5681b68ac2`.

The downstream diffs remain clean one-commit deltas against their immediate bases; all four updated heads now have same-head EPER CI and integrated-gate runs. All returned required lanes completed successfully. Previous green runs on the superseded heads are historical only and are not used as current-head evidence.

#### Remaining capability and continuity boundaries

- The v34 crosswalk preserves 45 source rows: 0 exact full-coverage matches, 45 partial shared-control links and 45 additive v1.6.0 draft candidates; approved 228 IDs and 38 chapters remain unchanged. This is technical classification, not owner approval or feature acceptance.
- Support tests cover customer ticket create/list/history/replies, tenant/application/actor scope, admin queue/triage/status/assignment/severity, internal-note separation and CSV export paths. Owner-defined SLA targets, timers, escalation and breach evidence remain absent.
- Customer asset metadata listing, audited short-lived download grants and inventory export exist. No upload endpoint or durable blob-upload lifecycle is evidenced. Customer Admin workflow studio/rule evaluation/publication exist; the complete customer-facing application journey remains incomplete.
- Campaign/agent workers have independent entrypoints. Workflow outbox lacks a dedicated independently startable worker app. Provider worker is a bounded `runOnce()` component; there is no independent process host, production worker identity, supervision or metrics/alert export. Real provider dispatch remains an injected boundary and was not invoked.
- `PostgresEncryptedProviderPayloadStore.put()` still owns a standalone transaction; callers can persist a payload independently of an operation row. `enqueueWithPayload()` uses `putInTransaction()` for atomic payload/operation/audit, but the public standalone path does not enforce the operation-row invariant.
- #382 provides key rotation and actor-attributed deletion with expiry/legal-hold checks, but no versioned retention-policy resolver or bounded purge worker.
- Repository rulesets endpoint returned an empty list. Main branch-protection endpoint returned HTTP 403 to this integration and remains **NOT ASSESSED**. Disposable CI backup/restore is proven; production backup destination, RPO/RTO, independent restore rehearsal and second-engineer release/rollback are not demonstrated.

No PR was merged, no approved requirement/chapter was changed, no chargeable cloud resource was provisioned and no real external/provider action was triggered.


### Operating update — 2026-11-04 07:51 IST (dynamic repository reconciliation)

This addendum supersedes the earlier 04:47 IST open-PR snapshot. Repository state, main SHA, open PRs and workflow runs were re-resolved from GitHub for this update.

**Current main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Main tree:** `0c01985a303e9348e728acd04b0a55a80020f9a9`  
**Latest main commit:** `revert: remove unintended provider payload test commit from main` (2026-11-03T16:36:07Z). The commit deletes `eper/tests/postgres-encrypted-provider-payload-store.integration.test.mjs`; the provider candidate branches retain that test and their exact-head evidence.

#### Exact-main validation

All eight push-triggered workflows returned `completed/success` on the exact current main SHA:

| Workflow | Run |
|---|---|
| EPER CI | [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771) |
| Same-commit integrated validation | [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913) |
| 228 requirements / 38 chapter pilot matrix | [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818) |
| G9 reconciliation | [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648) |
| Six-family capability HTTP smoke | [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652) |
| Container runtime smoke | [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533) |
| Controlled QA technical re-execution | [41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702) |
| Controlled technical simulation | [41675875724](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875724) |

The exact-main integrated PostgreSQL job completed with 1,410 tests, 1,404 passed, 0 failed and 6 skipped. Its seven-migration repeatability test passed. The separate exact-main chapter matrix reports 38 chapters, 259 passed tests, 0 failed tests, 28 passed checks and no failed chapters. This is technical evidence only.

PR #306 remains merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; comparison confirms it is an ancestor of current main. PR #310 remains merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`, also an ancestor. Successor PR #376 is merged at `9749701bfed527b906183192ca06cc1998e70166`, also an ancestor.

Fresh-clone run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) ran on candidate `2c426de8b63e437ffb186ed4887da76b4b704719`, whose tree SHA exactly matches current main. It completed with 1,426 tests, 1,422 passed, 0 failed and 4 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; seven migration groups (including identity) applied and repeated; disposable PostgreSQL backup/restore passed with 75/75 base tables restored. This is exact-tree fresh-clone evidence, although the workflow ran on the tree-equivalent candidate SHA rather than the main commit SHA itself.

#### Live open-PR inventory and exact-head evidence

The current open list is #377, #378, #379, #380, #381, #382 and #384. All listed PR heads below were fetched dynamically; the earlier PR-body snapshots are not used as current metadata.

| PR | Exact head / base | Exact-head evidence and delivery boundary |
|---|---|---|
| #377 | This scorecard branch; main-targeted | The pre-update head `80e4b566fa77e86c49693f4b3ef38a9705a25ac0` had nine successful exact-head workflows (EPER CI [41738891293], integrated [41738891209], matrix [41738891237], G9 [41738891297], release [41738891248] and other returned lanes). **This addendum changes the head; those prior green runs are historical and do not validate this new commit.** Inspect the new exact-head Actions before review. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` / main | All 13 returned workflows succeeded, including EPER CI [41738299249], integrated [41738299062], fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039], matrix [41738298906] and G9 [41738298972]. Fresh clone: 1,433 tests, 1,429 passed, 0 failed, 4 skipped; restore 75/75. PostgreSQL encrypted-payload tests 2/2; queue lifecycle 1/1. This is the encrypted payload boundary/store prerequisite, not a continuous delivery runtime. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` / #378 | All eight returned workflows succeeded, including EPER CI [41738351610], integrated [41738351629], fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657] and matrix [41738351607]. Fresh clone: 1,438 tests, 1,434 passed, 0 failed, 4 skipped; restore 76/76. PostgreSQL payload and queue lifecycle tests passed. The public standalone payload `put()` still commits independently and can leave a payload without an operation row; `enqueueWithPayload()` uses the transaction-scoped insert. Database-enforced orphan prevention remains open. |
| #380 | `03afcbe2bafa59143ac189b8a7a11d5b912c0477` / main | All nine returned workflows succeeded, including EPER CI [41754913312], integrated [41754913335], separate matrix [41754913298], G9 [41754913348] and release [41754913294]. The separate matrix reports 38 chapters, 259 passed tests, 0 failed tests, 28 checks and no failed chapters. CW-060/061 and the client application experience document remain additive draft/design scope, not complete upload or workspace runtime delivery. |
| #381 | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` / #379 | All eight returned workflows succeeded, including EPER CI [41738364070], integrated [41738364009], fresh clone [41738364008], provider lifecycle [41738363993] and matrix [41738363997]. Fresh clone: 1,438 tests, 1,434 passed, 0 failed, 4 skipped; restore 76/76. The exact-head fresh-clone suite ran the encrypted-payload PostgreSQL test, which executes `SET LOCAL ROLE eper_provider_catalogue_access`, verifies allowed in-scope reads, cross-tenant/application read isolation and RLS write rejection. |
| #382 | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` / #381 | All nine returned workflows succeeded, including EPER CI [41738377743], integrated [41738377787], fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748] and matrix [41738378040]. Fresh clone: 1,450 tests, 1,446 passed, 0 failed, 4 skipped; restore 76/76. Provider lifecycle: queue 1/1, bounded worker 5/5, keyring 6/6, encrypted-payload PostgreSQL 2/2. Worker is bounded `runOnce()`; no independent process host, real adapter dispatch, production worker identity or supervision is included. Migrations 022/023 add lifecycle metadata/envelope compatibility; no versioned retention-policy resolver or bounded purge worker is delivered. |
| #384 | `537c26402c679a61569af4cf7602f56b2d38a268` / main | All 12 returned workflows succeeded, including EPER CI [41756909976], integrated [41756910021], fresh clone [41756910300], PostgreSQL [41756910013], provider lifecycle [41756910018] and matrix [41756910091]. Fresh clone: 1,431 tests, 1,427 passed, 0 failed, 4 skipped; all seven migration groups applied and repeated; disposable restore 78/78. The customer-asset live PostgreSQL integration test passed 1/1 and verifies shared/restricted visibility, explicit links, cross-application/tenant isolation, idempotent upload reservation and audit. Migration `021_customer_asset_repository.sql` was applied. `PostgresCustomerAssetRepository` implements readiness, metadata create/list, upload-session reservation and explicit application linking. The PR description was corrected to reflect this implementation. API routes, provider upload capability, binary transfer, completion verification, malware scanning, customer UI and download/purge lifecycle remain absent. |

The provider stack remains dependency-ordered (#378 → #379 → #381 → #382); these are not duplicate standalone implementations. The migration runner records full migration filenames in its checksum ledger, so distinct `021_*.sql` filenames are distinct migration entries; do not renumber or rewrite applied migrations without a deliberate migration plan.

#### Seven approved pointers — current evidence-based position

| Pointer | Status | Evidence / remaining blocker |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | Crosswalk preserves 45 source rows, records 0 exact full-coverage matches and 45 partial shared-control links/additive candidates. Approved 228 requirements and 38 chapters are unchanged. Owner disposition of additive v1.6.0 candidates remains separate. |
| 2. Fresh-clone setup | GREEN for local/CI handover | PR #306 is merged and current-main ancestry is verified. Exact-tree fresh-clone run proves `npm run dev:verify`, seven migration groups including identity, repeatability and disposable restore. |
| 3. PostgreSQL and recovery | AMBER | Current-main integrated PostgreSQL suite and fresh-clone tree evidence pass. Provider candidate branches add encrypted payload persistence, RLS and worker tests. Production backup destination, key custody, retention execution, RPO/RTO and independent restore rehearsal remain. Current main does not contain the encrypted-provider-payload integration test removed by its latest revert commit; candidate #381/#382 do. |
| 4. Identity/OIDC/sessions | AMBER | #310 and #376 merge commits are ancestors of main. The #376 browser run [41652347404] passed 1,312 suite tests and both customer OIDC/workspace/support and Product Admin application-remediation journeys (1/1 each) using a synthetic IdP. Secure cookies, CSRF, durable sessions/revocation and assignment integration have test evidence. Production IdP onboarding/JWKS rotation and a complete Product Admin OIDC login remain unproven. |
| 5. Customer workspace/support | AMBER | Support submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note separation and export have test evidence. Owner-defined SLA targets/timers/escalation/breach evidence remain absent. #384 adds a durable PostgreSQL asset metadata repository and live integration test, but not upload routes, binary storage, scanning or customer UI. #380 remains design/change-control documentation. |
| 6. Scheduler/workflow operations | AMBER | Campaign and agent worker entrypoints exist; workflow outbox continuous processing, lease renewal/fencing, idempotency, retry/dead-letter and recovery abstractions have tests. There is no dedicated independently startable workflow-outbox worker app. Provider worker remains bounded `runOnce()`; approved dispatcher, restricted production identity, supervision and operational metrics/alerts remain. |
| 7. Release/continuity | RED | Main branch endpoint reports `protected=false` and `protection.enabled=false`; repository rulesets collection is empty. CI restore is disposable evidence only. Production backup target, RPO/RTO, independent restore rehearsal, second-engineer release/rollback path and owner approval of the proposed continuity charter remain. |

#### Governance and next actions

- Preserve the approved 228 requirements / 38 chapters; additive v1.6.0 candidates remain draft until owner disposition.
- Correct and validate the current #377 scorecard head; do not use its superseded green runs as evidence.
- Continue #384 only as an asset repository foundation until API authorization, provider upload, verification/scanning and UI are implemented and tested together.
- Resolve the provider payload-to-operation integrity invariant at the database boundary before treating payload persistence as complete.
- Add the versioned retention-policy resolver and bounded legal-hold-aware purge worker; then add an independently hosted provider worker with restricted identity, supervision and alerts.
- Enable owner-approved main protection/required checks, then demonstrate a second-engineer release and restore/rollback path.
- Do not infer production login from synthetic-IdP browser tests. Do not report or authorize Business UAT.

No approved requirement/chapter was changed. No PR was merged or branch deleted. No chargeable cloud resource or real external/provider action was used.


### Operating update — 2026-11-04 09:15 IST (exact-head reconciliation and customer asset API correction)

This addendum supersedes the 07:51 IST PR #384 snapshot. Main, all open PR heads and exact-head Actions were dynamically re-resolved. The continuity charter remains a proposed owner-reviewed standard, not an approved control declaration.

**Current main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Current main tree:** `0c01985a303e9348e728acd04b0a55a80020f9a9`  
**Latest main commit:** `revert: remove unintended provider payload test commit from main` (2026-11-03T16:36:07Z).

#### Mainline evidence

All 13 GitHub check runs fetched for the exact current main commit returned `completed/success`. Core runs:

- EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771)
- Integrated PostgreSQL/API [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913)
- Requirements/chapter matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818)
- G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648)
- Six-family HTTP [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652)
- Container smoke [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533)
- Controlled QA [41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702)
- Controlled technical simulation [41675875724](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875724)

The exact-main integrated PostgreSQL job reports 1,410 tests, 1,404 passed, 0 failed and 6 skipped. Its seven-migration repeatability test passed. The exact-main matrix reports 38 chapters, 259 passed tests, 0 failed tests, 28 passed checks and no failed chapters.

PR #306 remains merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; and successor PR #376 at `9749701bfed527b906183192ca06cc1998e70166`. GitHub comparisons confirm all three merge commits are ancestors of current main.

Fresh-clone run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) ran on candidate `2c426de8b63e437ffb186ed4887da76b4b704719`, whose Git tree exactly equals current main tree `0c01985a303e9348e728acd04b0a55a80020f9a9`. It reports 1,426 tests, 1,422 passed, 0 failed and 4 skipped; `npm run dev:verify` passed; all seven migration groups including identity were applied and repeated; disposable PostgreSQL backup/restore passed with 75/75 base tables restored and seven migration ledgers. This is exact-tree evidence, though the workflow ran on the tree-equivalent candidate commit rather than directly on the main commit SHA.

#### Current open PR inventory — exact heads and Actions

All open heads below were re-resolved. GitHub compare results show each head contains current main (zero commits behind). The listed successful runs are associated with the exact current head, not a superseded PR-body snapshot.

| PR | Exact head | Base | Exact-head evidence and current boundary |
|---|---|---|---|
| #377 | `845d5a3fd5acc2ec202e3d519f070d1de954c04f` | main | EPER CI [41760738373], integrated [41760738374], matrix [41760738338], G9 [41760738451] and release [41760738361] succeeded. This scorecard addendum changes the head; those prior runs do not validate the new scorecard commit. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | main | EPER CI [41738299249], integrated [41738299062], fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039], matrix [41738298906] and G9 [41738298972] succeeded. Fresh clone: 1,433 tests / 1,429 passed / 0 failed / 4 skipped; disposable restore 75/75. Encrypted payload boundary and queue lifecycle 1/1. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | #378 | EPER CI [41738351610], integrated [41738351629], fresh clone [41738351740], PostgreSQL [41738351604] and provider lifecycle [41738351657] succeeded. Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76/76. PostgreSQL payload and queue lifecycle tests passed. The public store `put()` still commits independently; `enqueueWithPayload()` uses the transaction-scoped insert. No database constraint yet prevents a payload row without its operation row. |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | main | EPER CI [41763251702], integrated [41763251674], matrix [41763251774] and G9 [41763251777] succeeded. The PR changes customer application experience and requirements draft documents only; it is not executable workspace or upload delivery. |
| #381 | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | #379 | EPER CI [41738364070], integrated [41738364009], fresh clone [41738364008], provider lifecycle [41738363993] and matrix [41738363997] succeeded. Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76/76. The exact-head PostgreSQL test executes `SET LOCAL ROLE eper_provider_catalogue_access` and proves permitted in-scope read, cross-tenant/application read isolation and RLS write rejection. |
| #382 | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | #381 | EPER CI [41738377743], integrated [41738377787], fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748] and matrix [41738378040] succeeded. Fresh clone: 1,450 / 1,446 passed / 0 failed / 4 skipped; restore 76/76. Provider lifecycle: queue 1/1, bounded worker 5/5, keyring 6/6, encrypted-payload PostgreSQL 2/2. Worker is still bounded `runOnce()`, not a continuously hosted/supervised process. |
| #384 | `bc252402c875190d8e580a2afcb27c4f2f749244` | main | All 14 returned exact-head workflows succeeded: EPER CI [41769532722], integrated [41769532549], fresh clone [41769532611], PostgreSQL payment-store [41769532815], provider lifecycle [41769532661], matrix [41769532770], G9 [41769532518], six-family HTTP [41769532617], container [41769532723], release [41769532944], QA [41769532669] and browser E2E [41769532776] among them. Fresh clone: 1,458 / 1,454 passed / 0 failed / 4 skipped; seven migration groups including identity applied and repeated; `npm run dev:verify` passed; disposable restore 79/79. Integrated PostgreSQL: 1,442 / 1,436 passed / 0 failed / 6 skipped. Browser customer OIDC/workspace/support/logout 1/1 and Product Admin remediation 1/1. |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | main | EPER CI [41764331361], integrated [41764308133], matrix [41764308125] and G9 [41764308165] succeeded. This is a requirements/design change-control document update, not runtime upload delivery. |

#### PR #384 exact-head correction and scope

The initial #384 head failed TypeScript because request-body numeric values were not narrowed before numeric comparisons. A focused owning-branch fix added runtime number/safe-integer checks and regression cases. The next head exposed a stale response assertion after the scan endpoint began returning its durable scan-job state; the assertion was corrected. The next live PostgreSQL run exposed test cleanup deleting upload sessions before dependent scan jobs; cleanup now deletes scan jobs first. Those failed runs belong to superseded heads and are not treated as current evidence.

Current #384 head `bc252402c875190d8e580a2afcb27c4f2f749244` passes all returned exact-head workflows. Its scope now includes:

- Durable customer asset metadata and explicit application links, with customer-shared/application-restricted scope, forced RLS and transactional audit.
- Idempotent upload-session reservation and API contracts for metadata, upload grant, trusted completion verification, application asset listing and internal scan claim/result.
- Provider-neutral ports/adapters for short-lived upload grants, server-side size/MIME/SHA-256 verification and trusted malware-scan outcomes.
- Durable tenant/application-scoped scan-dispatch jobs with lease owner/expiry, completion and dead-letter state.

The runtime boundary remains explicit: `main.ts` wires the PostgreSQL repository but does not supply a real blob-storage upload adapter, upload-verification provider or malware-scanner runtime. No binary was uploaded and no external provider/scanner was called. Customer upload UI, a separately hosted scan worker, download lifecycle, retention/legal-hold purge, supervision and alerts remain outstanding. PR #384 remains draft and unmerged; its PR description was updated to reflect this actual scope and its exact-head evidence.

#### Seven approved pointers — evidence-based status

| Pointer | Status | Current evidence / blocker |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | The crosswalk preserves 45 source rows: 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Approved 228 requirements and 38 chapters remain unchanged. Owner disposition of additive candidates remains required. |
| 2. Fresh-clone developer setup | GREEN for local/CI handover | PR #306 is merged and its merge SHA is an ancestor of main. Exact-tree clean-clone evidence proves `npm run dev:verify`, seven migration groups including identity, repeatability and disposable restore. |
| 3. PostgreSQL and recovery | AMBER | Main integrated suite and exact-tree fresh-clone proof pass. Provider candidates add encrypted payload storage, restricted-role RLS and worker tests. The payload-to-operation relationship still lacks a database-enforced FK; production backup destination, RPO/RTO and independent restore rehearsal remain. |
| 4. Identity/OIDC/sessions | AMBER | #310 and #376 are merged ancestors. Browser run [41652347404] and current #384 run [41769532776] pass customer OIDC/workspace/support/logout and Product Admin remediation journeys with a synthetic IdP. Secure cookies, CSRF, durable sessions/revocation and assignment integration have evidence. Production IdP onboarding/JWKS rotation and a complete Product Admin OIDC login remain unproven. |
| 5. Customer workspace/support | AMBER | Ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note separation and export are tested. Owner-defined SLA timers/escalation/breach evidence remain absent. #384 now has upload API contracts and provider-neutral adapter ports, but no real adapter wiring, binary transfer or customer upload UI. |
| 6. Scheduler/workflow operations | AMBER | Campaign/agent worker entrypoints exist. Outbox lease/fencing, idempotency, retry/dead-letter and recovery abstractions have test evidence. A dedicated independently startable workflow-outbox worker app is absent; provider worker remains bounded `runOnce()`, with no production host, restricted identity, supervision or metrics/alerts. |
| 7. Release/continuity | RED | Main branch API reports `protected=false` and `protection.enabled=false`; repository rulesets collection is empty. CI restore is disposable evidence only. Production backup target, RPO/RTO, independent restore rehearsal, second-engineer release/rollback path and owner approval of the proposed continuity charter remain. |

#### Continuity and governance

The continuity charter remains **PROPOSED / OWNER REVIEW REQUIRED**. The GitHub branch endpoint currently reports `main.protected=false` and `protection.enabled=false`; the rulesets endpoint returns an empty list. This is a confirmed release-control gap, not a blocker hidden by green CI.

No PR was merged. No approved requirement or chapter was changed. No branch was deleted. No chargeable cloud resource was provisioned and no real external/provider action was triggered.


### Combined migration-stack boundary — 2026-11-04

The current-main tree, provider stack (#378–#382) and customer-asset candidate (#384) have each passed their own applicable PostgreSQL/fresh-clone validation. They are separate candidate heads. No single validation head yet contains both the provider migrations (021–023) and customer-asset migrations (021–022) together. Although the migration ledger keys by full filename and both independent stacks pass, combined filename ordering, checksum-ledger replay, live PostgreSQL integration and disposable restore must be rerun on one combined candidate before integrating both stacks. Do not infer combined-stack proof from the separate green runs.


### Operating update — 2026-11-04 09:52 IST (asset scan worker, PostgreSQL proof and exact-head recovery)

This update dynamically re-resolves main and every open PR. It supersedes the 09:15 IST snapshot above. The continuity charter remains proposed for owner review; this addendum does not declare production controls approved.

**Current main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Current main tree:** `0c01985a303e9348e728acd04b0a55a80020f9a9`.

#### Current-main and merged-baseline evidence

The eight current-main push workflows fetched for this exact SHA completed successfully:

- EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771)
- Integrated PostgreSQL/API [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913)
- 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818)
- G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648)
- Six-family HTTP [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652)
- Container runtime [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533)
- Controlled QA [41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702)
- Controlled technical simulation [41675875724](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875724)

The exact-main integrated PostgreSQL job reports 1,410 tests, 1,404 passed, 0 failed and 6 skipped. The chapter matrix reports 38 chapters, 259 passed tests, 0 failed tests and 28 passed checks.

PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; #310 at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; and successor #376 at `9749701bfed527b906183192ca06cc1998e70166`. GitHub commit comparisons confirm all three merge commits are ancestors of current main.

Fresh-clone run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) ran on candidate `2c426de8b63e437ffb186ed4887da76b4b704719`, whose Git tree exactly equals current main tree `0c01985a303e9348e728acd04b0a55a80020f9a9`. It reports 1,426 tests, 1,422 passed, 0 failed and 4 skipped; `npm run dev:verify` passed; all seven migration groups including identity were applied and repeated; disposable PostgreSQL backup/restore passed with 75/75 base tables restored. This is exact-tree evidence; the workflow ran on the tree-equivalent candidate SHA, not directly on the main commit SHA.

#### Current open PR inventory and exact-head Actions

The open list was re-fetched. Each head below was compared dynamically with current main; every listed head contains current main (`behind_by=0`). Stacked bases are shown explicitly.

| PR | Current exact head | Base | Exact-head evidence / delivered capability |
|---|---|---|---|
| #377 | `422987f9ba88a48adb05c703ce26ab3977770912` | main | EPER CI [41770302009], integrated [41770302103], matrix [41770302110], G9 [41770302047] and release [41770302141] succeeded. This scorecard addendum changes the head; those runs validate the preceding scorecard snapshot only, not this new addendum. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | main | EPER CI [41738299249], integrated [41738299062], fresh clone [41738299068], PostgreSQL [41738298973] and provider lifecycle [41738299039] succeeded. Fresh clone: 1,433 tests / 1,429 passed / 0 failed / 4 skipped; restore 75/75. Encrypted payload boundary and provider queue lifecycle test passed. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | #378 | EPER CI [41738351610], integrated [41738351629], fresh clone [41738351740], PostgreSQL [41738351604] and provider lifecycle [41738351657] succeeded. Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76/76. Payload persistence and queue lifecycle tests passed. The public payload-store `put()` still commits separately from operation enqueue; `putInTransaction()` is the atomic primitive, but no database constraint yet prevents a payload row without its matching operation row. |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | main | EPER CI [41763251702], integrated [41763251674], matrix [41763251774] and G9 [41763251777] succeeded. Requirements/design only: CW-060 customer asset library and CW-061 workflow-driven application journey; no executable workspace/upload delivery in this PR. |
| #381 | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | #379 | EPER CI [41738364070], integrated [41738364009], fresh clone [41738364008] and provider lifecycle [41738363993] succeeded. Fresh clone: 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76/76. Its live PostgreSQL test executes `SET LOCAL ROLE eper_provider_catalogue_access`, verifies an in-scope read, cross-tenant/application read isolation and RLS write rejection. |
| #382 | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | #381 | EPER CI [41738377743], integrated [41738377787], fresh clone [41738377819], PostgreSQL [41738377859] and provider lifecycle [41738377748] succeeded. Fresh clone: 1,450 / 1,446 passed / 0 failed / 4 skipped; restore 76/76. Provider queue lifecycle, bounded worker (5/5), keyring (6/6) and encrypted payload PostgreSQL (2/2) passed. This provider worker remains a bounded `runOnce()` component, not an independently hosted continuous process. |
| #384 | `0364098c922d4d5fce346504f5b8ce07cd3eff13` | main | All 14 returned exact-head workflows succeeded: CI [41773055386], integrated [41773055365], fresh clone [41773055312], PostgreSQL [41773055310], provider lifecycle [41773055412], browser E2E [41773055302], matrix [41773055370], G9 [41773055306], HTTP [41773055409], container [41773055455], release [41773055332], QA [41773055301], technical simulation [41773055353] and payment contracts [41773055399]. Fresh clone: 1,462 / 1,458 passed / 0 failed / 4 skipped; all seven migration groups including identity repeated; `npm run dev:verify` passed; restore 79/79. Integrated PostgreSQL: 1,446 / 1,440 passed / 0 failed / 6 skipped. Browser customer OIDC/workspace/support/logout 1/1 and Product Admin remediation 1/1. |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | main | EPER CI [41764331361], integrated [41764308133], matrix [41764308125] and G9 [41764308165] succeeded. Documentation-only, detailed CW-060 asset requirements, role templates, sharing, security and retention. |

#### PR #384 correction, new worker and capability boundary

The #384 integrated run on superseded head `4b79dfe632ab90ec16549acbdecc44983a4402ac` failed one PostgreSQL asset repository test with `EPER_CUSTOMER_ASSET_INVALID_WORKERID`. The test used the same namespaced `scannerServiceId:workerId` format required by the standalone worker entrypoint, but repository validation rejected the colon. The owning branch corrected the identifier contract and restored a regression fixture using the namespaced form. All 14 returned workflows on current head `0364098c922d4d5fce346504f5b8ce07cd3eff13` then passed. Superseded-head runs are historical only.

Current #384 scope now includes:

- Migrations `021_customer_asset_repository.sql` and `022_customer_asset_scan_dispatch.sql`; tenant/application metadata, customer-shared and application-restricted visibility, explicit links, forced RLS and transactional audit.
- Upload-session reservation and API contracts for metadata/listing, short-lived upload grant, trusted completion/verification and scan result.
- Provider-neutral upload-grant, object-verification (existence, size, detected MIME, SHA-256) and malware-scan adapter ports. No concrete provider is wired by API main.
- Durable scan dispatch with tenant/application scope, lease owner/expiry, retry/dead-letter state and audit.
- New `start:customer-asset-scan-worker` entrypoint. The worker continuously polls the durable scan queue, renews leases, bounds concurrency and scan timeout, records retries/dead letters, and handles SIGINT/SIGTERM. Scanner implementation is injected from an allowlisted module path; no scanner module or real provider is supplied.

The current PR head has fresh-clone evidence for customer asset RLS, upload-session bounds/idempotency, repository scope/link/audit, scan worker clean completion, bounded retry and timeout. The actual binary upload, concrete blob adapter, object verification provider, scanner integration, customer upload UI, download lifecycle, role-template/inheritance resolver, retention/legal-hold purge, production supervision and operational metrics remain unproven. No real binary transfer or external provider/scanner call was made.

The #384, #380 and #385 PR descriptions were refreshed to reference the current #384 head and state these boundaries. #380 and #385 both describe additive candidate CW-060; reconcile their overlapping asset requirements/versioning into one owner-disposition path before treating the candidate as approved. #380 additionally contains CW-061 application UX.

#### Seven approved pointers — current evidence and blockers

| Pointer | Status | Evidence / next blocker |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | Approved 228 requirements and 38 chapters remain unchanged. Crosswalk preserves 45 source rows: 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition remains required; #380/#385 overlap on CW-060. |
| 2. Fresh-clone setup | GREEN for local/CI handover | #306 is merged and its merge SHA is an ancestor of main. Exact-tree clean-clone evidence proves `npm run dev:verify`, seven migration groups including identity, repeatability and disposable restore. |
| 3. PostgreSQL and recovery | AMBER | Main and candidate fresh-clone/live PostgreSQL tests pass separately. Provider payload-to-operation relationship still lacks a database-enforced constraint. Provider migrations 021–023 and asset migrations 021–022 have not yet been exercised together on one combined candidate. Production backup target, key custody, RPO/RTO and independent restore rehearsal remain. |
| 4. Identity/OIDC/sessions | AMBER | #310 and #376 are merged ancestors. Exact-head browser tests on #384 pass customer OIDC/workspace/support/logout and Product Admin remediation using a synthetic IdP. Durable sessions, secure cookies, CSRF, revocation and tenant/application assignment tests exist. Production IdP onboarding/JWKS rotation and complete production Product Admin login remain unproven. |
| 5. Customer workspace/support | AMBER | Ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note separation and CSV export (current-page and all-filtered-pages) have implementation and regression tests. Owner-defined SLA targets/timers/escalation/breach evidence are absent. #384 adds upload/API/worker foundations, but no concrete storage/scanner provider or customer upload UI. |
| 6. Scheduler/workflow operations | AMBER | Campaign and agent worker entrypoints exist. Workflow outbox lease/fencing, idempotency, retry/dead-letter and recovery abstractions have tests, but no dedicated independently startable outbox worker app. Provider operation worker remains bounded `runOnce()`; the new #384 continuous worker is only for customer asset scanning and does not close the provider/outbox hosting gap. Approved dispatch, restricted production identity, supervision and metrics/alerts remain. |
| 7. Release/continuity | RED | Main branch API reports `protected=false` and `protection.enabled=false`; repository rulesets collection is empty. Disposable CI restore is not production recovery. Production backup target, RPO/RTO, independent restore rehearsal, second-engineer release/rollback path and owner approval of the continuity charter remain. |

#### Continuity and next actions

The continuity charter remains **PROPOSED / OWNER REVIEW REQUIRED**. Current main protection is disabled and the rulesets endpoint is empty; no settings were changed without owner authorization.

Next delivery sequence:
1. Add a database-enforced tenant/application/operation relationship for encrypted provider payload rows and verify orphan insertion rejection.
2. Build one combined clean-clone candidate containing provider migrations 021–023 and customer-asset migrations 021–022; prove ordering, checksum-ledger replay, live PostgreSQL integration and disposable restore.
3. Wire a concrete approved storage adapter and server-side object-verification provider behind the existing ports; then complete customer upload UI and the full scan/download lifecycle.
4. Give the workflow outbox and provider operation worker independent host processes with restricted identity, supervision, metrics, alerts and restart/recovery proof.
5. Complete support SLA timers/escalation/breach evidence and the second-engineer release/restore/rollback path.

No approved requirement or chapter was changed. No PR was merged or branch deleted. No chargeable cloud resource was provisioned and no real external/provider action was triggered.


## 2026-11-04 10:40 IST — exact-head refresh

### Mainline and merged foundations
- Dynamically resolved main: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree: `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- PR #306 merge `6e8dd438e5091b1802d65e4f29951389fe077859` is an ancestor of main. Its fresh-clone candidate `2c426de8b63e437ffb186ed4887da76b4b704719` has the exact same tree as current main. Run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742): 1,426 tests, 1,422 passed, 0 failed, 4 skipped; seven migration-ledger groups, identity included, repeatability, `npm run dev:verify`, disposable backup/restore and 75/75 base tables.
- PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e` and PR #376 merge `9749701bfed527b906183192ca06cc1998e70166` are ancestors of main.

### Dynamically refreshed open PRs and exact heads
All returned Actions runs for the other open PRs below are tied to their exact listed heads and completed successfully. The scorecard PR's own head is tracked in its live PR metadata and will be refreshed after this documentation commit. Stacked provider branches remain one commit ahead of their respective base branch.

| PR | Base | Exact head | Selected exact-head evidence |
|---|---|---|---|
| #377 | main | This scorecard's owning branch; exact live head and its own Actions evidence are maintained in the PR description to avoid a self-referential SHA snapshot. |
| #378 | main | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | Fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039] |
| #379 | #378 branch | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | Fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657] |
| #380 | main | `55006ab19bcbb685fc3e84c4230fd865087887f3` | Integrated [41763251674], matrix [41763251774], G9 [41763251777] |
| #381 | #379 branch | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | Fresh clone [41738364008], provider lifecycle [41738363993], matrix [41738363997] |
| #382 | #381 branch | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | Fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748] |
| #384 | main | `36bce45869212e12cd911e415b378712e9710842` | Fresh clone [41776817648], integrated [41776817928], browser [41776817575], PostgreSQL [41776817512], matrix [41776817583] |
| #385 | main | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | Integrated [41764308133], matrix [41764308125], G9 [41764308165] |

### PR #384 current implementation evidence
The PR head advanced from the previous scorecard snapshot to `36bce45869212e12cd911e415b378712e9710842`. Its current-head fresh-clone log reports 1,463 tests, 1,459 passed, 0 failed, 4 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; source/restored base tables 79/79; migration-ledger tables 7. Integrated PostgreSQL reports the same test totals. Browser E2E passes customer OIDC/workspace/support/logout (1/1) and Product Admin remediation (1/1).

The seven-ledger fresh clone includes identity. In the asset branch, audit migrations 021/022 are customer-asset repository and scan-dispatch migrations. Provider payload migrations 021–023 live in the separate #379/#382 stack. These feature branches have not been combined into one candidate; duplicate 021/022 numbering is an explicit migration-composition blocker, not evidence of a combined-stack pass.

The scan worker is now independently startable and continuously polls the durable scan queue with lease renewal, bounded concurrency/timeouts, retry/dead-letter handling and graceful shutdown. Concrete blob storage, server-side object-verification provider, scanner module, actual binary upload, customer upload UI and download lifecycle remain unimplemented/unverified.

### Seven-pointer status
1. v34-to-228 — AMBER. Approved 228 requirements and 38 chapters remain unchanged. The crosswalk retains 45 v34 source rows with 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates; owner disposition remains required.
2. Fresh clone — GREEN for local/CI handover. PR #306 is merged and exact-tree verified against main.
3. PostgreSQL — AMBER. Separate provider and asset candidates each pass fresh-clone, repeatability, live PostgreSQL and disposable restore checks. Provider payload rows still lack a database-enforced tenant/application/operation foreign key. Combined migration stack is not yet proven.
4. Identity — AMBER. #310/#376 are merged. Synthetic-IdP browser E2E, durable sessions, secure cookies, CSRF, revocation and tenant/application assignment checks are evidenced. Production IdP/JWKS onboarding is not evidenced.
5. Customer workspace/support — AMBER. Ticket creation/list/history/replies, actor/application scoping, admin queue/lifecycle, tenant isolation and export utilities are tested. SLA targets/timers/escalation/breach evidence are absent. Customer asset upload UI/provider integration remains incomplete.
6. Scheduler/workflow operations — AMBER. Campaign/agent worker entrypoints and workflow outbox lease/fencing/idempotency/retry/dead-letter/recovery tests exist. Workflow outbox and provider operation worker still lack independent application hosting/supervision; approved production dispatch, restricted service identity, metrics and alerts remain.
7. Release/continuity — RED. Main branch reports `protected=false`; rulesets collection is empty. Disposable restore is not production recovery certification. Production backup destination/key custody, RPO/RTO, independent restore rehearsal and second-engineer release/rollback path remain unproven.

Continuity charter remains PROPOSED / OWNER REVIEW REQUIRED. No branch-protection or ruleset settings were changed. No approved requirement/chapter was changed, no PR merged, no branch deleted, no chargeable cloud resource provisioned and no real external/provider action triggered.


## 2026-11-04 12:00 IST — refreshed exact-head delivery and regression closure

### Dynamically resolved main and merged foundations
- Current `main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree recorded at the preceding refresh as `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- PR #306 is closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; compare confirms the merge is an ancestor of current main (653 commits ahead, 0 behind).
- PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e` and PR #376 merge `9749701bfed527b906183192ca06cc1998e70166` are also ancestors of current main.
- PR #306 fresh-clone candidate `2c426de8b63e437ffb186ed4887da76b4b704719` is an ancestor of current main (5 commits behind; compare reports no changed files). Its exact-tree fresh-clone run [41657363742](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41657363742) passed 1,426 tests (1,422 passed, 0 failed, 4 skipped), seven migration groups including identity, `npm run dev:verify`, repeatability and disposable backup/restore (75/75 base tables).

### Current open PRs and exact heads
Every listed PR head was re-resolved from live PR metadata. Current-head Actions were fetched by exact commit SHA; no stale run was reused.

| PR | Exact head | Base | Current exact-head evidence |
|---|---|---|---|
| #377 | self-reference — resolve live head from PR metadata; do not pin the scorecard's own changing SHA | main | Current exact-head CI, integrated, matrix, G9, QA, HTTP, container and release evidence is maintained in PR #377 metadata; the file update itself creates a new head. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | main | Fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039] succeeded; 1,433 tests / 1,429 passed / 0 failed / 4 skipped; restore 75/75. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | #378 | Fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657] succeeded; 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76/76. Payload-to-operation database constraint remains absent. |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | main | Integrated [41763251674], matrix [41763251774], G9 [41763251777] succeeded; documentation/design only. |
| #381 | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | #379 | Fresh clone [41738364008], provider lifecycle [41738363993], matrix [41738363997] succeeded; restricted-role RLS read/write proof is live PostgreSQL. |
| #382 | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | #381 | Fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748] succeeded; 1,450 / 1,446 passed / 0 failed / 4 skipped; restore 76/76. Worker remains bounded `runOnce()`. |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | main | CI [41786048984], integrated [41786048948], fresh clone [41786048886], PostgreSQL [41786048950], provider lifecycle [41786048922], browser [41786049023], matrix [41786048963], G9 [41786048971], HTTP [41786048842], container [41786049008] and release [41786048936] succeeded. |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | main | CI [41764331361], integrated [41764308133], matrix [41764308125] and G9 [41764308165] succeeded; documentation-only additive candidate. |
| #386 | `116fcbbab3632e8923a1b969a8f8f3854f8be216` | #384 feature branch | Fresh clone [41786474384], PostgreSQL [41786474240], provider lifecycle [41786474505], matrix [41786474265] and controlled QA [41786474276] succeeded. Fresh clone: 1,467 / 1,463 passed / 0 failed / 4 skipped; all seven migration groups including identity; `npm run dev:verify`; repeatability; restore 79/79. |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | main | Fresh clone [41784823307], PostgreSQL [41784823446], integrated [41784823525], browser [41784823265], CI [41784823287], matrix [41784823273] and G9 [41784823256] succeeded; fresh clone 1,429 / 1,425 passed / 0 failed / 4 skipped; restore 75/75. |

### PR #384 — current customer-asset worker contract
Current head `291129b77ab50623e41dd28c4a746ef70da28183` is 140 commits ahead of current main and 0 behind. Fresh-clone log proves all seven migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity), repeatability, `npm run dev:verify`, 1,464 tests / 1,460 passed / 0 failed / 4 skipped and disposable restore 79/79. Integrated PostgreSQL reports 1,448 / 1,442 passed / 0 failed / 6 skipped. Browser E2E passes the synthetic-IdP customer OIDC/workspace/support/logout path (1/1) and Product Admin application remediation (1/1).

The latest commit requires scanner adapters to accept and honor an `AbortSignal`. The worker fences persistence after shutdown but cannot forcibly terminate an adapter that ignores cancellation. No concrete storage adapter, object-verification provider or scanner module is wired; no actual binary upload/download or real scanner call is evidenced. Customer upload UI, download lifecycle, sharing resolver, retention/legal-hold purge, restricted service identity, worker supervision and operational metrics remain.

### PR #386 — database-first upload reservation correction
The first exact head `030864216d5c44b9d5cb6a249421b52e75ad09be` failed fresh-clone PostgreSQL test 714: a second upload session reused the same asset, violating the schema's unique `(tenant_id, asset_id)` constraint. The next head added a distinct failed-reservation asset but its audit-count assertion expected 16 when the live database returned 15. Current head `116fcbbab3632e8923a1b969a8f8f3854f8be216` corrects the audit count and restricted-asset RLS fixture; its exact-head fresh clone now passes (1,467 / 1,463 / 0 / 4, restore 79/79). The migration adds a provider-free `reserved` state; the service claims idempotency in PostgreSQL before requesting a provider capability, finalizes the opaque reference/expiry after grant issuance, and records failure without disclosing the grant.

The PR remains stacked on the #384 feature branch. That base branch has advanced to `291129b77ab50623e41dd28c4a746ef70da28183`; compare shows #386 is 4 commits behind that current base. Sync the stacked branch and rerun exact-head checks before integration. The schema still permits only one upload session per tenant/asset; re-upload after a failed/expired session is not proven and requires explicit lifecycle semantics.

### PR #387 — customer workflow work-queue read model
The current implementation adds a bounded/paginated read-only queue endpoint. It derives tenant/actor from trusted identity, requires active tenant/application and actor/application assignment, resolves visibility from the immutable published workflow definition version/digest and current activity role/permission, and returns summary metadata only (no workflow payload). PostgreSQL integration covers creator visibility, empty-page total count, cross-application/tenant isolation and revocation. This is an API/read-model foundation, not a completed customer queue UI or workflow detail/activity journey.

### Seven approved pointers — refreshed disposition
1. **v34-to-228 reconciliation — AMBER.** Preserve 228 approved requirements across 38 chapters. The v34 crosswalk remains 45 source rows: 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates; owner disposition is still required. CW-060/CW-061 remain additive draft scope.
2. **Fresh-clone developer setup — GREEN for local/CI handover.** PR #306 is merged and its candidate is an ancestor of current main; exact-tree clean-clone evidence covers `npm run dev:verify`, all seven groups including identity, repeatability and disposable restore.
3. **PostgreSQL/recovery — AMBER.** #384 and #386 pass their separate fresh-clone/live PostgreSQL/restore checks. Provider payload rows still lack a database-enforced tenant/application/operation foreign key. Provider and customer-asset migration stacks have not been validated together in one clean clone; migration 023 in each feature stack must be reconciled before combined proof. Production backup target, key custody, RPO/RTO and independent restore rehearsal remain.
4. **Identity/OIDC/sessions — AMBER.** #310/#376 are merged ancestors. Synthetic-IdP browser evidence covers protocol callback, secure cookies, CSRF, durable sessions, revocation and tenant/application assignment. Production IdP onboarding/JWKS rotation and full production role/delegation coverage remain unproven.
5. **Customer workspace/support — AMBER.** Ticket create/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note separation and export have tests. SLA targets/timers/escalation/breach evidence remain absent. Asset metadata/API/scan-worker foundation is present, but concrete storage/scanner providers, binary transfer, upload UI and download lifecycle are not.
6. **Scheduler/workflow operations — AMBER.** Campaign/agent worker foundations, workflow outbox lease/fencing/idempotency/retry/dead-letter/recovery and the customer work-queue read model are tested. Provider worker remains bounded `runOnce()`; workflow outbox has no independently startable app entrypoint. Approved dispatch, restricted service identity, supervision, metrics/alerts and recovery proof remain.
7. **Release/continuity — RED.** Last verified repository configuration reported main unprotected and no rulesets; this configuration was not re-read in this cycle and no settings were changed. Disposable CI restore is not production recovery. Independent second-engineer release/rollback and production restore rehearsal remain unproven.

The continuity charter remains **PROPOSED / OWNER REVIEW REQUIRED**. No approved requirement or chapter changed. No PR was merged, no branch deleted, no chargeable cloud resource provisioned and no real external/provider action triggered.

## 2026-11-04 13:52 IST — dynamic-main refresh and provider payload integrity candidate

### Mainline and repository controls
- Dynamically resolved main at 2c380d79c55c9183a42ed534ffd1a504f7d41316; tree 0c01985a303e9348e728acd04b0a55a80020f9a9.
- Current-main CI [41675875771], integrated validation [41675875913], 228/38 matrix [41675875818], G9 [41675875648], six-family HTTP smoke [41675875652] and container runtime [41675875533] all succeeded on the current main commit.
- The matrix log explicitly reports 38 chapters, 228 requirements, 259 pilot tests, 0 failed tests, 28 HTTP checks and no failed chapters. G9 is 5/5 and confirms six requirements per chapter, registry/routing joins, pending-versus-closed separation and automated-pilot-versus-acceptance separation.
- Main branch metadata was re-read: protected=false; repository rulesets returned an empty list. No repository control was changed.
- PR #306 merge 6e8dd438e5091b1802d65e4f29951389fe077859, PR #310 merge 88b9708d748c19dc80a1a2d7ad4960914451db7e and PR #376 merge 9749701bfed527b906183192ca06cc1998e70166 are confirmed ancestors of current main. PR #306's fresh-clone candidate has the same Git tree as current main; its original clean-clone evidence remains applicable.

### Current open PR inventory — exact heads resolved on this run
The live open-PR list was refreshed after the provider-branch correction. Every run below is tied to the listed head; prior-head green badges are not substituted.

| PR | Exact head | Base | Exact-head evidence / disposition |
|---|---|---|---|
| #377 | 7c34a8a2e7f52bafdd862e1e7096005b0ab29cd9 (scorecard branch before this addendum; resolve live PR head after this file commit) | main | Prior exact-head integrated [41787156808], matrix [41787156840], G9 and CI passed. This scorecard update creates a new head and requires its own exact-head checks. |
| #378 | 813de84caa4c9cf4eb7c5a2c89a92b30d662ff05 | main | Fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039] succeeded; 1,433 tests / 1,429 passed / 0 failed / 4 skipped; restore 75/75. |
| #379 | 82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44 | #378 | Fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657] succeeded; 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76/76. The payload-operation FK is supplied by follow-up #390, not by this head alone. |
| #380 | 55006ab19bcbb685fc3e84c4230fd865087887f3 | main | Integrated [41763251674], matrix [41763251774], G9 [41763251777] succeeded; additive requirements/design only. |
| #381 | e63f747db7e1f11e4fc7b74fae1591a575870a1d | #379 | Fresh clone [41738364008] and provider lifecycle [41738363993] succeeded; restricted-role RLS and tenant/application denial are exercised on live PostgreSQL. |
| #382 | 8aa4344a02f6f77d5566c7b24d571a5681b68ac2 | #381 | Fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748] succeeded; 1,450 / 1,446 passed / 0 failed / 4 skipped; restore 76/76. Provider worker remains a bounded runOnce() component. |
| #384 | 291129b77ab50623e41dd28c4a746ef70da28183 | main | CI [41786048984], integrated [41786048948], fresh clone [41786048886], PostgreSQL [41786048950], browser [41786049023], matrix [41786048963], G9 [41786048971], provider lifecycle [41786048922], HTTP, container and release jobs succeeded. Fresh clone 1,464 / 1,460 passed / 0 failed / 4 skipped; restore 79/79. |
| #385 | 2a2b059b37d06621f8e4efb2e2b6f467520114b5 | main | Integrated [41764308133], matrix [41764308125], G9 [41764308165] and CI [41764331361] succeeded; documentation-only additive candidate. |
| #386 | 116fcbbab3632e8923a1b969a8f8f3854f8be216 | #384 feature branch | Fresh clone [41786474384], PostgreSQL [41786474240], provider lifecycle [41786474505] succeeded; 1,467 / 1,463 passed / 0 failed / 4 skipped; restore 79/79. Base drift remains: PR base snapshot 36bce45869212e12cd911e415b378712e9710842 is four commits behind current #384 head 291129b77ab50623e41dd28c4a746ef70da28183. Synchronize and rerun before integration. |
| #387 | 53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d | main | Fresh clone [41784823307], PostgreSQL [41784823446], integrated [41784823525], browser [41784823265], CI, matrix and G9 succeeded; fresh clone 1,429 / 1,425 passed / 0 failed / 4 skipped; restore 75/75. |
| #389 | aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2 | main | PostgreSQL/MySQL/MongoDB evaluation plan is documentation-only; integrated [41795128802], matrix [41795128670] and G9 [41795128672] succeeded. PostgreSQL remains the owner-approved target; this PR does not authorize an engine change. |
| #390 | 8b2a46da6d03df296525fab8b797ecc71ec08c8c | #379 | Current exact-head pass: provider lifecycle [41798735618], fresh clone [41798735439], PostgreSQL integration [41798735450], CI [41798735408], integrated [41798735582], matrix [41798735722], controlled QA [41798735542] and technical simulation [41798735404] all succeeded. Details below. |

### PR #390 — payload/operation database integrity correction
The first candidate failed because eper_provider_payloads.operation_id is TEXT while the queue operation identifier is UUID. An intermediate type-conversion attempt then failed on malformed SQL. Both heads were superseded; no stale green result is used.

The final implementation preserves the payload table's TEXT storage contract and adds a generated TEXT representation of the UUID operation identifier on eper_provider_operations. Migration 022_provider_payload_operation_integrity.sql adds a tenant/application/operation unique key and both directions of deferred composite FK:
- payload envelope → matching provider operation (rejects orphan payloads);
- non-null operation payload reference → matching envelope (rejects dangling and cross-tenant/application references).

The PostgreSQL integration now checks both rejection paths, confirms the failed operation transaction leaves no queue row, validates UUID operation identities in the PostgreSQL payload store, and deletes both sides in one transaction so deferred constraints are satisfied during fixture cleanup.

Current exact-head results:
- Provider lifecycle [41798735618]: 1 test / 1 passed / 0 failed / 0 skipped. The log shows migration 022 applied; both expected FK rejection probes were exercised.
- Fresh clone [41798735439]: 1,439 tests / 1,435 passed / 0 failed / 4 skipped; npm run dev:verify passed; seven migration groups including identity and migration 022; repeatability passed; disposable backup/restore passed with 76/76 base tables.
- PostgreSQL integration [41798735450]: the integrated PostgreSQL job reports 1,423 tests / 1,417 passed / 0 failed / 6 skipped.
- CI [41798735408] and same-commit integrated gate [41798735582] passed.
- Matrix [41798735722]: 38 chapters, 228 requirements, 259 pilot tests, 0 failed tests, 28 HTTP checks.
- All current-head jobs completed successfully on 8b2a46da6d03df296525fab8b797ecc71ec08c8c.

This closes the database-enforced payload/operation relationship on the #379+#390 candidate stack. It is not merged into main. The #381/#382 downstream provider stack does not yet include #390, and the combined provider-plus-customer-asset migration stack has not yet been exercised as one clean-clone candidate. The provider migration directory is filename-sorted and its ledger is keyed by full migration filename; the distinct 022_* files therefore have deterministic lexical order, but combined-stack evidence is still required.

### Customer support and browser evidence
The exact #384 integrated PostgreSQL log passes tests for:
- customer ticket creation, history/list and replies;
- tenant/application and actor assignment checks, including cross-tenant denial;
- admin queue, status lifecycle, assignment and severity classification;
- internal-note visibility, with customer reads filtered at the SQL boundary and customers prohibited from creating internal notes;
- current-page CSV and all-filtered-results export, with formula-cell neutralization covered by UI tests.

The #384 browser E2E [41786049023] passes the synthetic-IdP customer OIDC/workspace/support/logout journey (1/1). #387 adds a backend customer work-queue read model; it is not yet the complete customer queue/task-detail UI.

Support SLA remains incomplete: no evidenced first-response/resolution timers, escalation schedule, breach detection or auditable SLA report.

### Seven approved pointers — current disposition
1. v34-to-228 reconciliation — AMBER. Preserve 228 approved requirements and 38 chapters. The v34 crosswalk remains 45 source rows: 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition is required; no approved baseline changes were made.
2. Fresh-clone developer setup — GREEN for local/CI handover. PR #306 is merged and its candidate has the same Git tree as current main. Current #390 fresh clone independently verifies npm run dev:verify, all seven groups including identity, repeatability and disposable restore.
3. PostgreSQL/recovery — AMBER. #390 proves the provider payload-operation FK on its own stack. The #381/#382 provider descendants must be synchronized and retested, then provider and customer-asset migration families must be validated together in one clean clone. Production backup target, key custody, RPO/RTO and independent restore rehearsal remain unproven.
4. Identity/OIDC/sessions — AMBER. #310 and successor browser/session PRs are merged ancestors of main. Synthetic-IdP browser evidence covers protocol callback, secure cookies, CSRF, durable sessions, revocation and tenant/application assignment. Production IdP onboarding, JWKS rotation and full production role/delegation governance remain unproven.
5. Customer workspace/support — AMBER. Ticket journey, tenant/application scope, admin triage/assignment/severity, internal-note separation and CSV export are tested. SLA controls remain absent. Customer asset metadata/API/scan-worker foundations exist; concrete storage/scanner providers, binary upload/download and complete asset UI remain.
6. Scheduler/workflow operations — AMBER. Workflow outbox lease/fencing/idempotency/retry/dead-letter/recovery and the customer queue API are tested. Provider worker remains bounded runOnce(); workflow outbox has no independently hosted production worker entrypoint. Approved dispatch, restricted service identity, supervision, metrics/alerts and production recovery remain.
7. Release/continuity — RED. Main protection is currently disabled and repository rulesets are empty. The continuity charter remains PROPOSED / OWNER REVIEW REQUIRED. CI restore is not production recovery; independent second-engineer release/rollback remains unproven.

No approved requirement or chapter changed. No PR was merged, no branch deleted, no chargeable cloud resource provisioned and no real external/provider action triggered.

## 2026-11-04 14:02 IST — #386 parent synchronization and exact-head retest

PR #386 was synchronized without creating a replacement branch or PR:
- Merge commit 887cbe570fba3d416ba7c05c07162ff787ed246c has parents current #384 head 291129b77ab50623e41dd28c4a746ef70da28183 and prior #386 head 116fcbbab3632e8923a1b969a8f8f3854f8be216.
- The #384 changes since the prior base touched only the scan-worker entrypoint, scan-worker implementation and scan-worker test; none overlapped the seven #386 upload-reservation files.
- The synchronized #386 head is 7e6727cf9508c498ffcc14ba5b43ed1bee891ee0. Compare against the live #384 branch reports 17 commits ahead / 0 behind; GitHub PR mergeability is clean.
- A new regression proves that a failed durable reservation prevents any provider capability call. The previous test name was corrected to identify grant-finalization failure accurately.

Exact-head evidence for 7e6727cf9508c498ffcc14ba5b43ed1bee891ee0:
- Fresh clone [41800272683]: PASS; 1,468 tests / 1,464 passed / 0 failed / 4 skipped; all seven migration groups including identity; npm run dev:verify; migration repeatability; disposable backup/restore 79/79.
- PostgreSQL integration [41800272797]: PASS.
- Provider lifecycle [41800272858]: PASS.
- 228/38 matrix [41800272982]: PASS.
- Controlled QA [41800272798] and technical simulation [41800272760]: PASS.
- The fresh-clone log explicitly confirms the new reservation-failure-before-provider test passed.

The previous #386 head's green runs are not reused. The branch is now synchronized with the current #384 parent. The PR API's base.sha field still shows the old snapshot, but live branch comparison reports 0 behind and the PR is mergeable/clean.

The asset migration stack remains separate from the provider payload stack. This #386 clean clone applies customer asset migrations 021/022/023 and the seven migration groups, but it does not include provider payload migrations 021/022 from #379/#390. A combined provider-plus-asset migration candidate is still required. The schema still permits one upload session per tenant/asset; retry after a failed/expired session is not proven and needs an explicit lifecycle decision.

No approved requirement or chapter changed. No PR was merged, no branch deleted, no chargeable cloud resource provisioned and no real external/provider action triggered.


## 2026-11-04 14:37 IST — #390 exact-head payload-store regression coverage

Main remains `2c380d79c55c9183a42ed534ffd1a504f7d41316`; approved requirements remain 228 across 38 chapters. This update records a focused test-coverage correction on the owning #390 branch.

A review of #390 found that the prior change had replaced the earlier PostgreSQL payload-store integration test while adapting operation IDs to UUID. The replacement proved orphan rejection but no longer directly proved ciphertext-only database persistence and the database store's exact-scope authorization behavior. Those assertions were restored in the existing PostgreSQL provider-operation lifecycle integration test, using the real `enqueueWithPayload()` transaction so both deferred foreign keys are satisfied.

Current #390 head: `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f`.

Exact-head Actions:
- Fresh clone [41805934645]: PASS; 1,439 tests / 1,435 passed / 0 failed / 4 skipped; `npm run dev:verify`; all seven migration groups including identity; migration repeatability; disposable backup/restore 76/76.
- PostgreSQL integration [41805934647]: PASS.
- EPER CI [41805934653]: PASS.
- Same-commit integrated validation [41805934725]: PASS; integrated PostgreSQL 1,423 tests / 1,417 passed / 0 failed / 6 skipped; G9 traceability 5/5. The separate 228/38 pilot-matrix job was skipped on this workflow, so no new matrix result is claimed for this head.
- The fresh-clone log confirms the provider operation lifecycle integration test passed, including ciphertext-only persistence, read/decrypt round-trip, cross-application denial and fail-closed read/create/delete authorization.

The new commit is on #390's owning branch; no mainline code changed. #390 remains stacked on #379. #381/#382 still require synchronization with #390 before the provider stack is integrated. The combined provider-plus-customer-asset migration stack remains unproven in one clean clone.

No approved requirement or chapter changed. No PR was merged, no branch deleted, no chargeable cloud resource provisioned and no real external/provider action triggered.


## 2026-11-04 — exact provider descendant divergence

Live GitHub comparisons use the current branch refs, not PR snapshot base SHAs:

- #390 integrity branch `fix/provider-payload-operation-integrity` is at `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f`.
- #381 restricted-role RLS branch `test/provider-payload-rls-role-proof` is divergent from #390: #381 is 1 commit ahead and 12 behind; merge base is #379 head `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44`. Its branch-specific changes are the provider lifecycle workflow and PostgreSQL payload-store integration test.
- #382 provider-worker branch `feat/provider-operation-worker-runtime` is divergent from #390: #382 is 2 commits ahead and 12 behind; merge base is the same #379 head. Its branch-specific changes include payload retention/key lifecycle, envelope-v2 migration, keyring, provider worker, integration/unit tests and workflow wiring.

This is not a green, integrated provider stack. Synchronization must preserve #390's two deferred composite foreign keys and UUID/text identity contract, #381's restricted-role RLS proof, and #382's retention/key-rotation/envelope-v2 behavior. The overlapping PostgreSQL integration test, payload-store implementation and workflow wiring require conflict-aware reconciliation; do not force-update either branch or replace tests wholesale. After synchronization, rerun clean-clone migration/restore, restricted-role RLS, provider lifecycle and worker tests on the new exact heads.

No branch was synchronized in this step because a safe merge needs to reconcile those overlapping persistence/security changes. The open PRs remain #381 and #382; no duplicate or orphan branch was created.


## 2026-11-04 15:19 IST — current-main refresh and exact-head PR audit

### Current integrated baseline

- Dynamically resolved `main`: `0866c09f6a83026b466de26af4a13465f7db1511`.
- The latest main commit removes the accidentally unscoped in-memory provider-payload test file; no approved requirement or chapter is changed by that commit.
- The GitHub PR base metadata for the scorecard and current main-targeted PRs resolves to this SHA. The compare endpoint confirms every current open PR head listed below contains this main commit (zero commits behind).
- The commit-status endpoint returned no combined status entries for this SHA, and the available commit-run listing is limited to PR-triggered runs. Therefore current-main CI is **NOT ASSESSED** in this update; PR-head passes below are not substituted for mainline evidence.
- PR #306 is closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 is closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Both merge commits are confirmed ancestors of current main. #306 is not open work.

### Live open-PR inventory and exact-head validation

The live open-PR query returned the following current set. Workflow runs were retrieved by each listed head SHA; job summaries and relevant job logs were inspected. Only runs associated with the current listed head are cited.

| PR | Exact current head | Current-main relationship | Exact-head evidence |
|---|---|---|---|
| #377 scorecard | `d617f447b934bc2dccd53875460324deaaccf472` | 31 ahead / 0 behind | CI [41806644848], integrated [41806644919], matrix [41806644839], G9 [41806645109], release [41806644876], HTTP [41806644776], container [41806645218] — success. Integrated PostgreSQL 1,410 tests / 1,404 passed / 0 failed / 6 skipped; separate matrix 228 requirements / 38 chapters / 259 passed / 0 failed / 28 HTTP checks. |
| #378 encrypted payload boundary | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | 9 ahead / 0 behind | Fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039], integrated [41738299062], matrix [41738298906] — success. Fresh clone 1,433 tests / 1,429 passed / 0 failed / 4 skipped; `npm run dev:verify`, seven migration ledgers and disposable restore passed. |
| #379 durable encrypted payload store | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | 10 ahead / 0 behind | Fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657], integrated [41738351629], matrix [41738351607] — success. Fresh clone 1,438 tests / 1,434 passed / 0 failed / 4 skipped; repeatability and disposable restore passed. |
| #380 additive customer UX requirements | `55006ab19bcbb685fc3e84c4230fd865087887f3` | 7 ahead / 0 behind | Matrix [41763251774], G9 [41763251777], integrated [41763251674], CI [41763251702] — success. Matrix log: 228 requirements, 38 chapters, 259 pilot tests passed, 0 failed, 28 HTTP checks. Documentation/design candidate only. |
| #381 restricted-role provider RLS | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | 11 ahead / 0 behind | Fresh clone [41738364008], provider lifecycle [41738363993], integrated [41738364009], CI [41738364070], matrix [41738363997] — success. Fresh clone 1,438 tests / 1,434 passed / 0 failed / 4 skipped; live PostgreSQL restricted-role RLS proof passed. |
| #382 provider operation worker | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | 12 ahead / 0 behind | Fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748], integrated [41738377787], CI [41738377743], matrix [41738378040] — success. Provider lifecycle log passed live PostgreSQL claim/renewal/fencing/retry/recovery and bounded worker authorization/routing/outcome tests. This remains a bounded worker pass, not a supervised independent production host. |
| #384 customer asset repository | `291129b77ab50623e41dd28c4a746ef70da28183` | 142 ahead / 0 behind | Fresh clone [41786048886], PostgreSQL [41786048950], browser [41786049023], provider lifecycle [41786048922], integrated [41786048948], matrix [41786048963], G9 [41786048971] — success. Fresh clone 1,464 tests / 1,460 passed / 0 failed / 4 skipped; seven migration ledgers, repeatability and disposable restore passed. Browser customer OIDC/workspace/support/logout journey 1/1 passed. |
| #385 additive asset requirements | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | 6 ahead / 0 behind | Matrix [41764308125], G9 [41764308165], integrated [41764308133], CI [41764331361] — success. Matrix log: 228 requirements, 38 chapters, 259 pilot tests passed, 0 failed, 28 HTTP checks. Documentation/change-control candidate only. |
| #386 upload idempotency reservation | `7e6727cf9508c498ffcc14ba5b43ed1bee891ee0` | 159 ahead / 0 behind | Fresh clone [41800272683], PostgreSQL [41800272797], provider lifecycle [41800272858], matrix [41800272982], QA [41800272798] — success. Fresh clone 1,468 tests / 1,464 passed / 0 failed / 4 skipped; seven migration ledgers, repeatability and disposable restore passed. Its branch includes current #384 head. |
| #387 actor-scoped customer work queue | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | 24 ahead / 0 behind | Fresh clone [41784823307], PostgreSQL [41784823446], browser [41784823265], integrated [41784823525], matrix [41784823273], G9 [41784823256] — success. Fresh clone 1,429 tests / 1,425 passed / 0 failed / 4 skipped; restore passed. Browser customer OIDC/workspace/support/logout 1/1 passed. Work-queue GET derives tenant/actor from trusted credentials. |
| #389 database-engine evaluation plan | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | 3 ahead / 0 behind | Matrix [41795128670], G9 [41795128672], integrated [41795128802], CI [41795128689] — success. Matrix log: 228 requirements, 38 chapters, 259 pilot tests passed, 0 failed, 28 HTTP checks. Documentation/evaluation plan only; PostgreSQL remains the control candidate. |
| #390 payload-operation integrity | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | 22 ahead / 0 behind | Fresh clone [41805934645], PostgreSQL [41805934647], provider lifecycle [41805934711], pilot matrix [41805934646], integrated [41805934725], CI [41805934653] — success. Fresh clone 1,439 tests / 1,435 passed / 0 failed / 4 skipped; all seven migration groups including identity, repeatability and disposable restore 76/76. PostgreSQL integration 1,423 tests / 1,417 passed / 0 failed / 6 skipped. Pilot matrix 228/38, 259 passed, 0 failed, 28 HTTP checks. |

### Provider stack and asset-stack reconciliation

Live branch comparison confirms:

- #390 versus #381: diverged; #381 is 1 commit ahead / 12 behind; merge base is #379 head `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44`.
- #390 versus #382: diverged; #382 is 2 commits ahead / 12 behind; same merge base.
- #386 versus #384: #386 is 17 commits ahead / 0 behind; current #384 parent is included.

The #381/#382 descendants still need conflict-aware synchronization with #390. Preserve #390's two deferred tenant/application-scoped composite FKs and UUID/TEXT key contract, #381's restricted-role RLS proof, and #382's retention/key-rotation/envelope-v2/keyring/worker behavior. Overlapping payload-store, PostgreSQL integration-test and workflow files must be reconciled deliberately; no force update or wholesale test replacement is appropriate.

The provider payload migration family and customer-asset migration family have **not** yet been applied together in one fresh clone with repeatability, live PostgreSQL tests and disposable backup/restore. Separate successful fresh-clone runs do not prove the combined migration graph.

### Seven approved pointers — current disposition

1. **v34-to-228 reconciliation — AMBER.** The original v34 export remains 45 rows: 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Preserve all 228 approved requirements and 38 chapters. Owner disposition of the crosswalk and additive candidates remains required.
2. **Fresh-clone setup — GREEN for local/CI handover.** #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859` and is an ancestor of current main. Multiple exact-head candidate runs prove `npm run dev:verify`, seven migration groups including identity, repeatability and disposable restore. This is not production recovery certification.
3. **PostgreSQL durability/recovery — AMBER.** Live PostgreSQL integration, checksummed/repeatable migrations, identity group, tenant/application RLS, provider payload encryption and #390 referential integrity have candidate evidence. Combined provider+asset migration proof and production backup destination/key custody/RPO/RTO/independent restore rehearsal remain.
4. **Identity/OIDC/sessions — AMBER.** #310 is merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; browser/session successors are merged ancestors of main. Current browser evidence covers synthetic-IdP login, protected workspace/support access, secure session handling, logout/revocation and tenant/application assignment. Production IdP onboarding/JWKS rotation and complete production role/delegation governance remain unproven.
5. **Customer workspace/support — AMBER.** Current exact-head logs prove ticket creation, list/history, replies, tenant/application/actor scope, admin queue/status/assignment/severity and protected customer OIDC journey. Main-branch UI source/test confirms internal notes are admin-only (customer reply queries filter `customer_visible`; customer authors cannot create internal notes) and CSV exports support current-page and all-filtered-results modes with spreadsheet-formula neutralization. SLA response/resolution timers, escalation and breach reporting remain absent. Asset repository/upload reservation/scan foundations exist; actual binary transfer, concrete storage/scanner integration, publication/download lifecycle and complete customer asset UI remain.
6. **Scheduler/workflow operations — AMBER.** Campaign scheduler has a continuous loop and independent worker entrypoint, with live PostgreSQL lease renewal, dispatch fencing, retry/dead-letter and restart recovery tests. Provider worker remains bounded; workflow outbox has no independently supervised production entrypoint. Restricted service identity, approved dispatch configuration, worker supervision, delivery metrics/alerts and operational recovery remain.
7. **Release/continuity — RED.** This run did not have repository-ruleset/branch-protection read permission; controls are NOT ASSESSED here and no settings were changed. The continuity charter remains PROPOSED / OWNER REVIEW REQUIRED. Production restore, runbooks, rollback, second-engineer release path and independent handover rehearsal remain unproven.

### Continuity and safety boundary

- The current main commit has no combined status entries exposed by the connected status endpoint; do not infer mainline green from PR-head workflows.
- The charter's clean-clone handover remains supported by local/CI evidence, but production backup/recovery and a second-engineer release are not demonstrated.
- No approved requirement or chapter was edited. No PR was merged, no branch was deleted, no chargeable cloud resource was provisioned and no real external/provider action was triggered in this update.


## Dated operating update — 2026-11-04 16:54 IST

**Dynamically resolved current main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Main tree:** `0c01985a303e9348e728acd04b0a55a80020f9a9`  
**Approved product baseline:** 228 requirements / 38 chapters; unchanged.

### Exact-main CI evidence

The direct GitHub commit check-runs endpoint returned **13 check runs for this exact main SHA; all 13 completed successfully**. This corrects the earlier limitation from the combined-status-only query: the classic combined status has no status contexts and reports `pending`, but the check-runs endpoint contains the actual successful workflow jobs.

- [Same-commit integrated validation](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913): PASS. PostgreSQL suite: 1,410 tests / 1,404 passed / 0 failed / 6 skipped.
- [EPER CI](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771): PASS.
- [228 requirement / 38 chapter matrix](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818): 228 requirements; 259 pilot tests / 259 passed / 0 failed; 28 HTTP checks passed. The artifact explicitly classifies this as an automated pilot, not acceptance evidence.
- [G9 reconciliation](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648): PASS.
- [Six-family HTTP smoke](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652): PASS.
- [Container runtime](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533): PASS.
- Release artifact, QA technical evidence, and the same-commit gate also completed successfully on the same SHA.

The latest main commit reverts the accidentally unscoped provider payload test file. The integrated PostgreSQL job on this SHA passes the commercial tariff-overage guard, ticketing and workflow checks, and tenant/application isolation assertions.

### Merged foundation ancestry

- PR #306 is confirmed closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; current main is 653 commits ahead and 0 behind that merge commit.
- PR #310 is confirmed closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; current main is 652 commits ahead and 0 behind that merge commit.
- #306 is not open work. Its fresh-clone developer setup is part of the integrated main history.

### Live open-PR inventory and exact-head Actions

The current open set was refreshed dynamically. Each run below is associated with the exact head SHA recorded in the live PR metadata; no prior-head green result is substituted.

| PR | Exact head | Exact-head workflow evidence |
|---|---|---|
| #377 scorecard | `903b4054d5c65c85f23f5cfe017b25df24c50516` | Integrated [41810591113], CI [41810591215], matrix [41810591236], G9 [41810591160], release [41810591139], HTTP [41810591111], container [41810591140], QA [41810591276], technical evidence [41810591212] — all completed successfully. |
| #378 encrypted payload boundary | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | Fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039], integrated [41738299062] — success. |
| #379 durable PostgreSQL payload store | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | Fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657], integrated [41738351629] — success. |
| #380 customer asset/application requirements | `55006ab19bcbb685fc3e84c4230fd865087887f3` | Matrix [41763251774], G9 [41763251777], integrated [41763251674], CI [41763251702] — success. |
| #381 restricted-role RLS proof | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | Fresh clone [41738364008], provider lifecycle [41738363993], integrated [41738364009], CI [41738364070] — success on its own base. |
| #382 provider worker/retention/keyring | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | Fresh clone [41738377819], PostgreSQL [41738377859], provider lifecycle [41738377748], integrated [41738377787], CI [41738377743] — success on its own base. |
| #384 customer asset repository | `291129b77ab50623e41dd28c4a746ef70da28183` | Fresh clone [41786048886], PostgreSQL [41786048950], browser [41786049023], integrated [41786048948], provider lifecycle [41786048922] — success. |
| #385 additive asset requirements | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | Matrix [41764308125], G9 [41764308165], integrated [41764308133], CI [41764331361] — success. |
| #386 upload idempotency reservation | `7e6727cf9508c498ffcc14ba5b43ed1bee891ee0` | Fresh clone [41800272683], PostgreSQL [41800272797], provider lifecycle [41800272858], matrix [41800272982] — success. |
| #387 actor-scoped customer work queue | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | Fresh clone [41784823307], PostgreSQL [41784823446], browser [41784823265], integrated [41784823525], matrix [41784823273] — success. |
| #389 database-engine evaluation plan | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | Matrix [41795128670], G9 [41795128672], integrated [41795128802], CI [41795128689] — success. |
| #390 payload-operation integrity | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | Fresh clone [41805934645], PostgreSQL [41805934647], provider lifecycle [41805934711], integrated [41805934725], CI [41805934653] — success. |
| #391 RLS/integrity reconciliation | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | Fresh clone [41820073308], provider lifecycle [41820073247], matrix [41820073834], QA [41820073253], technical evidence [41820073304] — success. |

PR #391 is a new draft successor based directly on #390 head `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f`. Its exact-head fresh-clone log confirms:

- `npm run dev:verify` completed; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- All seven PostgreSQL migration groups ran, including identity; repeatability checks passed.
- 1,439 tests / 1,435 passed / 0 failed / 4 skipped.
- Disposable PostgreSQL backup/restore passed: 76 source/restored base tables and 7 migration-ledger tables.

Its live provider lifecycle job passed 1/1 PostgreSQL test for atomic payload enqueue, lease renewal/fencing, retry exhaustion and recovery. The added restricted-role assertions use the actual `eper_provider_catalogue_access` NOLOGIN role: same tenant/application read succeeds, cross-tenant and cross-application reads return no row, and unauthorized writes fail with SQLSTATE `42501`. The payload is created by `enqueueWithPayload`, so it satisfies the deferred integrity constraints.

**Scope limitation for #391:** its returned exact-head workflow set does not include EPER CI, same-commit integrated validation or browser E2E. Those lanes are not claimed as passed on this head.

### Provider-stack integration blocker found by source inspection

The new #391 correction is useful but does not yet integrate the full worker/keyring branch.

- #391 versus #381: diverged; #391 is 13 commits ahead / 1 behind; common base is #379 head `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44`.
- #391 versus #382: diverged; #391 is 13 ahead / 2 behind; same common base.
- #382 versus #391: diverged; #382 is 2 ahead / 13 behind.

The #382 tree carries retention metadata migration `022_provider_payload_lifecycle_metadata.sql`, envelope-v2 migration `023_provider_payload_envelope_v2.sql`, keyring/rotation behavior, provider worker implementation and its tests. #391 carries `022_provider_payload_operation_integrity.sql` and a corrected lifecycle RLS test. The audit migration runner sorts full filenames and records filenames in its checksum ledger, so equal numeric prefixes are distinct ledger entries; the issue is not the shared `022` prefix.

A concrete integration incompatibility is confirmed: #382's separate `postgres-encrypted-provider-payload-store.integration.test.mjs` creates payloads with standalone `store.put()` in both its RLS/retention test and its key-rotation test. Once #390's deferred payload↔operation foreign keys are present, those payload-only transactions cannot commit without a matching provider-operation row. The standalone test was green on #382's older base because that base does not contain migration 022 integrity. #391's new RLS assertions move the restricted-role proof onto a payload created through `enqueueWithPayload`, but do not yet adapt the separate #382 RLS/keyring test file.

**Next action:** reconcile #382's worker/keyring/retention changes onto the #390/#391 integrity base; adapt both standalone payload-store integration tests to create matching operations (or otherwise satisfy the deferred relationship); preserve the #381 restricted-role test intent; then rerun the complete fresh-clone, all migration groups, repeatability, live PostgreSQL, provider lifecycle and disposable restore suite on one exact candidate head. Do not merge separate green stacks as if they were one combined candidate.

### Seven approved pointers — current disposition

1. **v34-to-228 reconciliation — AMBER.** Original v34 source rows and statements remain preserved; 45 source candidates are classified as partial shared-control links and additive drafts, with no fabricated exact full-coverage matches. Owner disposition remains outstanding. Approved 228 requirements / 38 chapters remain unchanged.
2. **Fresh-clone developer setup — GREEN for local/CI scope.** #306 merge is confirmed on main. Current-main integrated checks and #391 candidate fresh-clone logs confirm repeatable setup, identity migrations and disposable restore. This is not production recovery certification.
3. **PostgreSQL durability/recovery — AMBER.** Main's integrated PostgreSQL suite is green; #391 adds payload-operation integrity and restricted-role evidence. Provider plus asset migrations and #382 keyring/retention tests are not yet validated together. Production backup destination/key custody/RPO/RTO and independent recovery rehearsal remain.
4. **Identity/OIDC/sessions — AMBER.** #310 and browser/session successors are merged ancestors. Synthetic-IdP browser coverage exists for login, protected workspace, secure sessions, CSRF, logout/revocation and tenant/application assignment. Production IdP onboarding/JWKS rotation and full production role/delegation governance remain unproven.
5. **Customer workspace/support — AMBER.** Customer ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note visibility and CSV export have implementation/test evidence. SLA timers/escalation/breach reporting and complete binary asset upload/storage/scan/share/download UI remain.
6. **Scheduler/workflow operations — AMBER.** Campaign scheduler has a continuous process entrypoint and live PostgreSQL lease/fencing/retry/dead-letter/recovery evidence. Provider worker remains bounded; independent host supervision, restricted service identity, approved dispatch configuration, metrics/alerts and operational recovery remain.
7. **Release/continuity — RED.** Current-main release build/checks pass, but branch/ruleset controls were not changed or fully re-read in this run. The continuity charter remains proposed/owner-review-required; production restore, rollback runbooks and second-engineer release rehearsal remain unproven.

No Business UAT status or authorization is recorded by this update. No approved requirement or chapter was edited. No PR was merged, no branch was force-updated or deleted, no chargeable cloud resource was provisioned and no real external/provider action was triggered.

## 2026-11-04 17:57 IST — provider worker integrity reconciliation and exact-head refresh

**Dynamically resolved main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Main tree:** `0c01985a303e9348e728acd04b0a55a80020f9a9`  
**Approved baseline:** 228 requirements / 38 chapters; unchanged.

### Exact-main CI and repository controls

The direct commit check-runs endpoint returned 13 completed check-runs on this exact main SHA; all 13 succeeded. The same-commit integrated PostgreSQL suite reports 1,410 tests / 1,404 passed / 0 failed / 6 skipped. The 228/38 automated pilot matrix reports 259 passed / 0 failed and 28 HTTP checks. The matrix artifact explicitly labels itself an automated pilot, not acceptance evidence.

- Integrated validation: [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913)
- EPER CI: [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771)
- 228/38 matrix: [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818)
- G9: [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648)
- Six-family HTTP: [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652)
- Container runtime: [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533)

Repository release-control finding: the live `main` branch response reports `protected=false`, `protection.enabled=false`, and required-check enforcement `off`; the repository rulesets endpoint returns an empty list. No settings were changed. This is a confirmed control gap, not an unverified permission failure.

PR #306 remains closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 remains closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Both merge commits are confirmed ancestors of current main. Browser/session successors #324, #329 and #337, and the customer/workflow foundation #376, are also confirmed merged ancestors.

### Live open-PR inventory and exact-head Actions

The current open set was refreshed from GitHub. Runs below were fetched by each PR's current head SHA; relevant job summaries and logs were inspected. A green run from a prior head is not substituted for the listed head.

| PR | Exact current head | Exact-head workflow evidence and observed result | Blocker / next action |
|---|---|---|---|
| [#392 provider worker/integrity successor](https://github.com/sbannai/enterprise-product-engineering/pull/392) | `8ea1a309b9bc28d132a8fb16a3d36c7a03bbcaac` | Fresh clone [41830482932], provider lifecycle [41830483213], payment-store [41830483045], 228/38 matrix [41830482958], QA [41830482988], workflow config [41830483063] — all success. Fresh clone: 1,456 passed / 0 failed / 4 skipped; `npm run dev:verify`, seven migration groups including identity, repeatability, disposable restore 76/76 and 7 migration ledgers. Matrix: 228 requirements / 38 chapters / 259 passed / 0 failed / 28 HTTP checks. Provider lifecycle: queue 1/1, worker 6/6, host 5/5, wake listener 3/3, NOTIFY 1/1, keyring unit 6/6, payload integrity tests 2/2; live lifecycle 1/1 includes operation-backed ciphertext persistence, restricted-role RLS, retention/legal-hold/audit deletion and v2 PostgreSQL key-rotation assertions using `enqueueWithPayload`. | Draft, stacked on #391. No same-commit integrated gate, EPER CI, browser E2E, release artifact or independent service supervisor evidence. Complete combined integration/release lanes before merge. |
| [#390 payload-operation integrity](https://github.com/sbannai/enterprise-product-engineering/pull/390) | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | Fresh clone [41805934645], PostgreSQL [41805934647], provider lifecycle [41805934711], integrated [41805934725], matrix [41805934646] — success. Fresh clone: 1,435 passed / 0 failed / 4 skipped; restore 76/76. Integrated PostgreSQL: 1,417 passed / 0 failed / 6 skipped. | Integrity foundation; retain as #391/#392 base. Do not merge independently from the provider worker/keyring descendants. |
| [#391 restricted-role RLS on integrity base](https://github.com/sbannai/enterprise-product-engineering/pull/391) | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | Fresh clone [41820073308], provider lifecycle [41820073247], matrix [41820073834] — success. Fresh clone: 1,435 passed / 0 failed / 4 skipped; restore 76/76. Live lifecycle 1/1 uses `eper_provider_catalogue_access`: in-scope read succeeds, cross-tenant/application reads are hidden, out-of-scope write fails with SQLSTATE 42501. | Base for #392. No same-commit integrated or browser E2E lane on this head. |
| [#382 provider worker source branch](https://github.com/sbannai/enterprise-product-engineering/pull/382) | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | Fresh clone [41738377819], provider lifecycle [41738377748], integrated [41738377787] — success. Fresh clone: 1,446 passed / 0 failed / 4 skipped; restore 76/76. Its older-base provider lane covered queue, bounded worker, keyring and payload tests. | Superseded for integration by #392 on the #390/#391 integrity base. Retain as source history; do not merge independently. |
| [#377 operating scorecard](https://github.com/sbannai/enterprise-product-engineering/pull/377) | Live head is maintained in this PR description; do not pin the scorecard branch's own SHA in this file. | Exact-head EPER CI, integrated validation, 228/38 matrix, G9, release, HTTP, container and QA results are recorded in the PR description for the current head. Prior-head green runs are invalid after any branch update. | Keep draft pending owner review of the crosswalk, repository controls and continuity charter. |
| [#381 original restricted-role RLS branch](https://github.com/sbannai/enterprise-product-engineering/pull/381) | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | Fresh clone [41738364008], provider lifecycle [41738363993], integrated [41738364009] — success. Fresh clone: 1,434 passed / 0 failed / 4 skipped; restore 76/76. | Superseded for integration by #391/#392. Retain as source history; do not merge independently. |
| [#386 upload idempotency](https://github.com/sbannai/enterprise-product-engineering/pull/386) | `7e6727cf9508c498ffcc14ba5b43ed1bee891ee0` | Fresh clone [41800272683], PostgreSQL [41800272797], provider lifecycle [41800272858], matrix [41800272982] — success. Fresh clone: 1,464 passed / 0 failed / 4 skipped; restore 79/79. | Asset retry/session semantics and a combined provider-plus-asset migration candidate remain. |
| [#389 database-engine evaluation plan](https://github.com/sbannai/enterprise-product-engineering/pull/389) | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | Matrix [41795128670], G9 [41795128672], integrated [41795128802] — success. Matrix: 228/38, 259 passed, 28 HTTP checks. | Documentation/evaluation plan only. No comparative live database benchmark result; PostgreSQL remains the current persistence candidate. |
| [#379 durable encrypted PostgreSQL payload store](https://github.com/sbannai/enterprise-product-engineering/pull/379) | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | Fresh clone [41738351740], PostgreSQL [41738351604], provider lifecycle [41738351657], integrated [41738351629] — success. Fresh clone: 1,434 passed / 0 failed / 4 skipped; restore 76/76. | Base for #390; do not merge independently of the integrity and worker descendants. |
| [#387 customer work queue](https://github.com/sbannai/enterprise-product-engineering/pull/387) | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | Fresh clone [41784823307], PostgreSQL [41784823446], browser [41784823265], integrated [41784823525] — success. Fresh clone: 1,425 passed / 0 failed / 4 skipped; restore 75/75. Browser customer OIDC/workspace/support/logout journey 1/1. | Queue API and browser journey exist; complete task-detail UI and SLA remain. |
| [#384 customer asset repository](https://github.com/sbannai/enterprise-product-engineering/pull/384) | `291129b77ab50623e41dd28c4a746ef70da28183` | Fresh clone [41786048886], PostgreSQL [41786048950], browser [41786049023], integrated [41786048948] — success. Fresh clone: 1,460 passed / 0 failed / 4 skipped; restore 79/79. Browser customer OIDC/workspace/support/logout 1/1. | Repository/reservation and scan-processing boundaries exist; actual binary transfer, scanner/storage integration and complete customer asset UI remain. |
| [#385 additive asset requirements](https://github.com/sbannai/enterprise-product-engineering/pull/385) | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | Matrix [41764308125], G9 [41764308165], integrated [41764308133] — success. Matrix: 228/38, 259 passed, 28 HTTP checks. | Requirements/change-control candidate only; owner disposition required. |
| [#380 customer asset/workflow UX requirements](https://github.com/sbannai/enterprise-product-engineering/pull/380) | `55006ab19bcbb685fc3e84c4230fd865087887f3` | Matrix [41763251774], G9 [41763251777], integrated [41763251674] — success. Matrix: 228/38, 259 passed, 28 HTTP checks. | Requirements/design candidate only; preserve the approved 228/38 baseline and obtain owner disposition for additions. |
| [#378 encrypted payload boundary](https://github.com/sbannai/enterprise-product-engineering/pull/378) | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | Fresh clone [41738299068], PostgreSQL [41738298973], provider lifecycle [41738299039], integrated [41738299062] — success. Fresh clone: 1,429 passed / 0 failed / 4 skipped; restore 75/75. | Foundation for #379; retain the stacked dependency path and avoid separate merge. |

### Provider worker/integrity reconciliation — new exact-head work

PR #392 is the reconciled successor on top of #391/#390. Two focused changes are now on its owning branch:

1. The worker route resolver verifies the selected tenant and application as well as connection and capability before dispatch; mismatches become `PROVIDER_OPERATION_ROUTE_MISMATCH` and no dispatch occurs. Exact commit: `f70e5e744cf8502a6ba52ec2705ea3e45aa9964d`.
2. The live PostgreSQL lifecycle test now verifies v2 envelope writes and key rotation using atomic `enqueueWithPayload()`: key A is written, key A remains readable after active write key changes to B, new rows use key B, and removing a still-referenced key fails closed. This avoids the invalid payload-only `store.put()` fixtures under the reciprocal deferred foreign keys. Exact commit: `8ea1a309b9bc28d132a8fb16a3d36c7a03bbcaac`.

The current #392 exact-head provider lifecycle log confirms the complete job succeeded. The top-level PostgreSQL lifecycle test is 1/1; its assertions include encrypted persistence, restricted-role RLS, retention/legal-hold/audit deletion and the new database key-rotation path. The separate payload-store integration file still explicitly proves invalid UUID and orphan rejection (2/2). The worker host and queue-wake tests prove bounded event-driven execution and reconnect behavior, not a separately supervised production service.

#381 and #382 PR descriptions have been updated to identify them as retained source branches superseded for integration by #391/#392. Neither branch has been deleted or merged.

### Combined migration boundary

The provider stack now has one exact-head fresh-clone and provider lifecycle proof through #392: #379 payload store, #390 integrity migration 022, #392 lifecycle metadata migration 023 and envelope-v2 migration 024. All seven developer migration groups, including identity, repeatability, live PostgreSQL tests and disposable restore pass on #392.

The customer-asset stack remains separate: #384/#386 have their own fresh-clone runs and restore 79/79. **No single fresh clone has yet applied the complete provider and customer-asset migration families together**, run repeatability and live PostgreSQL integration, and completed a disposable restore. That remains a P0 integration proof.

### Seven approved pointers — updated disposition

1. **v34-to-228 reconciliation — AMBER.** The approved 228 requirements and 38 chapters remain unchanged. The original v34 source export remains 45 rows: 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition remains outstanding; no source row is silently promoted to exact coverage.
2. **Fresh-clone setup — GREEN for local/CI scope.** #306 is merged and an ancestor of main. #392 independently proves `npm run dev:verify`, seven migration groups including identity, repeatability and disposable restore 76/76. This is not production recovery certification or a second-engineer handover.
3. **PostgreSQL durability — AMBER.** Mainline integration is green; #392 now proves the provider integrity/worker/keyring stack with live PostgreSQL, reciprocal deferred FKs, restricted-role RLS, key rotation, retention/legal hold and restore. Combined provider-plus-asset migration proof, production backup destination/key custody, RPO/RTO and independent restore rehearsal remain.
4. **Identity/OIDC/sessions — AMBER.** #310 and browser/session successors remain merged ancestors. Synthetic-IdP browser coverage verifies login, protected workspace/support access, secure session/CSRF handling, logout/revocation and tenant/application assignment. Production IdP onboarding, JWKS rotation and full role/delegation governance remain unproven.
5. **Customer workspace/support — AMBER.** Ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note visibility and CSV export have source/test evidence. SLA response/resolution timers, escalation/breach reporting, complete binary asset transfer and customer asset UI remain.
6. **Scheduler/workflow operations — AMBER.** Campaign scheduler has a continuous process entrypoint with lease/fencing/retry/dead-letter/recovery evidence. #392 adds provider worker event-driven host/wake/reconnect and keyring tests. Independent provider-service entrypoint/supervision, approved production dispatch wiring, metrics/alerts and operational recovery remain.
7. **Release/continuity — RED.** Main branch protection is disabled, required-check enforcement is off and no repository rulesets exist. The continuity charter remains proposed/owner-review-required. Production restore, backup/key custody, runbooks/rollback and a second-engineer release rehearsal remain unproven.

### Continuity and safety boundary

- The current mainline CI evidence is from exact SHA `2c380d79c55c9183a42ed534ffd1a504f7d41316`; PR-head green runs are not substituted for main.
- The scorecard branch's current-head Actions are recorded in this PR's description; never infer validation from prior-head runs.
- No approved requirement or chapter was edited. No PR was merged, no branch was deleted, no repository settings were changed, no chargeable cloud resource was provisioned and no real external/provider action was triggered.
- No acceptance or release authorization is implied by automated tests.


## Dated operating update — 2026-11-04 18:25 IST

### Dynamically resolved mainline and repository controls

- Current `refs/heads/main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`.
- Main tree: `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- Current main check-runs: 13/13 completed successfully on this exact SHA.
- Exact-main runs: [EPER CI 41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771), [same-commit integrated validation 41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913), [228/38 matrix 41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818), [G9 41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648), [six-family HTTP 41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652), [container smoke 41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533), and [controlled QA 41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702).
- The exact-main PostgreSQL job applied payment, audit/admin, identity, capability/agent, workflow, campaign-scheduler and ticketing migrations; repeated workflow/ticketing/capability migrations; and ran the PostgreSQL-enabled EPER suite. The 228/38 matrix reports 259 passed, 0 failed and 28 HTTP checks passed.
- Repository settings were read directly: `main.protected=false`; branch-protection `enabled=false`; required-check enforcement is `off`; repository rulesets endpoint returns `[]`. This is a release-control blocker, not an inferred setting.
- The current main commit is the revert of an unintended provider-payload test commit. This exact main SHA and its 13 successful check-runs are authoritative; no prior-main status is carried forward.

### Merged developer and identity foundations

The following merge SHAs were re-read from GitHub PR metadata and compared against current main; current main contains each merge commit as an ancestor:

- PR #306 fresh-clone developer setup: `6e8dd438e5091b1802d65e4f29951389fe077859`.
- PR #310 durable customer identity/OIDC foundation: `88b9708d748c19dc80a1a2d7ad4960914451db7e`.
- PR #324 browser-bound OIDC transaction guards: `a554990cb7f4969bb218aad7a2e9944aec62fa05`.
- PR #329 customer workspace browser sessions: `82a82d92222c613c02e55f01211ecbb32ce63bba`.
- PR #337 durable OIDC identity and CSRF enforcement: `18315e1654b52f1546936a8fd28daed907cab31e`.
- PR #376 consolidated Customer Admin/workflow/provider connection foundations: `9749701bfed527b906183192ca06cc1998e70166`.

PR #306 is merged and is not open work. Browser/session successor PRs are also merged. This establishes the protocol/browser/session foundation, not production IdP onboarding or production authentication readiness.

### Current open-PR register — exact current heads

The following run references were queried through commit check-runs and Actions `head_sha` filters for each listed current head. Relevant fresh-clone, PostgreSQL, provider, browser, matrix and integrated job logs were inspected. A green run from an earlier head is not substituted.

| PR | Current head | Exact-head evidence | Current disposition / blocker |
|---|---|---|---|
| [#392 provider worker/integrity successor](https://github.com/sbannai/enterprise-product-engineering/pull/392) | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | [Fresh clone 41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500), [provider lifecycle 41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478), [PostgreSQL payment 41833626430](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626430), [228/38 matrix 41833626441](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626441), workflow validation 41833626448, QA 41833626477 — all success on this head. | Draft, stacked on #391. Fresh clone: 1,461 tests / 1,457 passed / 0 failed / 4 skipped; seven migration groups including identity; repeatability; disposable backup/restore; 76 source/restored base tables; 7 migration ledgers. Provider lifecycle: queue 1/1, worker 7/7, host 5/5, wake listener 3/3, post-commit NOTIFY 1/1, keyring 6/6, PostgreSQL payload integrity 2/2. The live lifecycle test now proves operation-backed PostgreSQL v2 key rotation and fail-closed behavior when a still-referenced key is unavailable, alongside reciprocal deferred FKs, restricted-role RLS and retention/legal-hold/audit. Worker parks deterministic configuration blockers as NEEDS_ATTENTION. No exact-head EPER CI, same-commit integrated gate, browser E2E, release-artifact or independent production supervisor/metrics evidence. |
| [#391 restricted-role RLS on integrity base](https://github.com/sbannai/enterprise-product-engineering/pull/391) | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | Fresh clone 41820073308, provider lifecycle 41820073247, matrix 41820073834 — success. | Draft dependency for #392; retain as foundation, do not merge separately from the reconciled provider stack. |
| [#390 payload-operation integrity](https://github.com/sbannai/enterprise-product-engineering/pull/390) | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | Fresh clone 41805934645, PostgreSQL 41805934647, provider lifecycle 41805934711, integrated 41805934725, separate matrix 41805934646 — success. | Integrity foundation for #391/#392; not a stand-alone provider release. |
| [#377 operating scorecard](https://github.com/sbannai/enterprise-product-engineering/pull/377) | `2661111bb5ecec41bb75ac519d47b6ebe8121d14` | EPER CI 41832379582, integrated 41832379647, separate matrix 41832379758, G9 41832379637, release 41832379643, HTTP 41832379766, container 41832379717 — success. Integrated workflow's duplicate matrix job was skipped; separate matrix passed 259/0 and 28 HTTP checks. | Documentation only. This update creates a new scorecard head; its new-head Actions must be checked separately. |
| [#382 original provider worker](https://github.com/sbannai/enterprise-product-engineering/pull/382) | `8aa4344a02f6f77d5566c7b24d571a5681b68ac2` | Fresh clone 41738377819, provider lifecycle 41738377748, integrated 41738377787, separate matrix 41738378040 — success on its own older base. | Retained source branch; worker/keyring changes have been transplanted into #392. Do not merge independently. |
| [#381 original restricted-role RLS](https://github.com/sbannai/enterprise-product-engineering/pull/381) | `e63f747db7e1f11e4fc7b74fae1591a575870a1d` | Fresh clone 41738364008, provider lifecycle 41738363993, integrated 41738364009, separate matrix 41738363997 — success on its own older base. | Retained source branch; RLS proof has been carried onto #390/#391. Do not merge independently. |
| [#386 asset upload idempotency](https://github.com/sbannai/enterprise-product-engineering/pull/386) | `7e6727cf9508c498ffcc14ba5b43ed1bee891ee0` | Fresh clone 41800272683, PostgreSQL 41800272797, provider lifecycle 41800272858, matrix 41800272982 — success. | Includes current #384 asset head. Fresh clone: 1,468 tests / 1,464 passed / 0 failed / 4 skipped; restore 79/79. Asset upload reservation is durable/idempotent; combined provider-plus-asset migration candidate still absent. |
| [#389 database-engine evaluation plan](https://github.com/sbannai/enterprise-product-engineering/pull/389) | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | Matrix 41795128670, G9 41795128672, integrated 41795128802, CI 41795128689 — success. | Documentation/evaluation plan only; no comparative live PostgreSQL/MySQL/MongoDB benchmark has been executed. PostgreSQL remains the approved target. |
| [#379 durable encrypted PostgreSQL payload store](https://github.com/sbannai/enterprise-product-engineering/pull/379) | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | Fresh clone 41738351740, PostgreSQL 41738351604, provider lifecycle 41738351657, integrated 41738351629 — success. | Base of #390; do not merge independently. |
| [#387 customer workflow queue](https://github.com/sbannai/enterprise-product-engineering/pull/387) | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | Fresh clone 41784823307, PostgreSQL 41784823446, browser 41784823265, integrated 41784823525, separate matrix 41784823273 — success. Browser customer OIDC/workspace/support/logout journey 1/1. | Actor-scoped work-queue API is present; full task-detail/action UI and support SLA remain. |
| [#384 customer asset repository](https://github.com/sbannai/enterprise-product-engineering/pull/384) | `291129b77ab50623e41dd28c4a746ef70da28183` | Fresh clone 41786048886, PostgreSQL 41786048950, browser 41786049023, integrated 41786048948 — success. Fresh clone: 1,464 tests / 1,460 passed / 0 failed / 4 skipped; restore 79/79. Browser OIDC journey 1/1 and Product Admin remediation 1/1. | Durable asset metadata/RLS, upload verification ports and scan worker exist. Concrete binary storage/scanner provider, full customer upload/list/share/download UI and one combined provider+asset clean-clone proof remain. |
| [#385 additive asset requirements](https://github.com/sbannai/enterprise-product-engineering/pull/385) | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | Matrix 41764308125, G9 41764308165, integrated 41764308133 — success; matrix 259/0 and 28 HTTP checks. | Requirements/change-control candidate only; owner disposition required. |
| [#380 customer asset/workflow UX requirements](https://github.com/sbannai/enterprise-product-engineering/pull/380) | `55006ab19bcbb685fc3e84c4230fd865087887f3` | Matrix 41763251774, G9 41763251777, integrated 41763251674 — success; matrix 259/0 and 28 HTTP checks. | Requirements/design candidate only; approved 228/38 baseline and original v34 source remain unchanged. |
| [#378 encrypted provider payload boundary](https://github.com/sbannai/enterprise-product-engineering/pull/378) | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | Fresh clone 41738299068, PostgreSQL 41738298973, provider lifecycle 41738299039, integrated 41738299062 — success. Fresh clone: 1,433 tests / 1,429 passed / 0 failed / 4 skipped; restore 75/75. | Foundation for #379; retain dependency chain and avoid separate merge. |

### Seven approved pointer disposition

1. **v34-to-228 reconciliation — AMBER.** Approved baseline remains 228 requirements / 38 chapters (Chapters 463–500). Original v34 export remains 45 rows with original IDs/statements/acceptance criteria preserved; current crosswalk has 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition is still required; no baseline requirement/chapter is silently changed.
2. **Fresh-clone developer setup — GREEN for local/CI setup.** PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`, an ancestor of current main. Current #392 exact-head fresh clone runs `npm run dev:verify`, all seven migration groups including identity, repeatability and disposable PostgreSQL backup/restore. This is not a second-engineer handover or production DR certification.
3. **PostgreSQL durability — AMBER.** Main exact-commit CI and #392 exact-head fresh clone/provider lifecycle prove live PostgreSQL, identity migration, repeatability, reciprocal payload/operation FKs, restricted-role RLS, operation-backed v2 key rotation, retention/legal hold/audit and disposable restore. The provider and asset branches remain separate; no single clean clone has yet applied both complete migration families, run the combined live tests and restored the combined schema. Production backup destination/key custody, RPO/RTO and independent restore rehearsal remain.
4. **Identity/OIDC/sessions — AMBER.** #310 and #324/#329/#337/#376 are merged ancestors. Browser-bound OIDC, secure session cookies, CSRF, durable sessions/revocation and tenant/application assignment checks have synthetic-IdP browser E2E on current open customer-journey heads. Production IdP onboarding, production JWKS rotation and full operator/role/delegation governance are not evidenced; do not claim production login.
5. **Customer workspace/support — AMBER.** Ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note separation and CSV export are implemented/tested. #387 adds actor-scoped workflow queue API; #384/#386 add asset repository and idempotent upload reservation. SLA response/resolution timers, escalation/breach reporting, complete task-detail UI and full customer asset binary lifecycle/UI remain.
6. **Scheduler/workflow operations — AMBER.** Campaign worker has continuous process execution, lease renewal/fencing, idempotency, retry/dead-letter and restart recovery tests. #392 adds event-driven provider host/wake/reconnect tests and safe configuration-blocker handling. A separately supervised production provider/outbox service, approved production dispatcher wiring, metrics/alerts and operational recovery remain.
7. **Release/continuity — RED.** Current GitHub branch response explicitly reports `main.protected=false`, required-check enforcement off and no repository rulesets. The continuity charter remains proposed/owner-review-required. Production backup/key custody, restore/runbooks/rollback, alert/incident ownership and a second-engineer clean-clone release rehearsal remain unproven.

### Combined provider and customer-asset integration boundary

The provider stack is #378 → #379 → #390 → #391 → #392. #392 is based on the current #391 head and contains current main as an ancestor. The asset stack is #384 → #386; #386 includes the current #384 head. These are separate feature histories with a common main ancestor. No combined provider-plus-asset candidate has a single exact-head fresh-clone, migration-repeatability, live PostgreSQL and disposable restore result. The next P0 is a conflict-aware integration candidate preserving both migration families and their RLS/FK constraints; do not merge the branches independently to reduce PR count.

### Continuity and safety boundary

- No approved requirement or chapter was edited.
- No branch was force-updated or deleted; no PR was merged in this update.
- No repository protection settings were changed.
- No chargeable cloud resource or real external/provider action was used.
- Automated technical checks do not authorize business acceptance, production readiness or UAT.


## Exact-head validation and PR inventory correction — 2026-11-04 18:30 IST

The scorecard commit `9c8a8e89d04f1c5ada10db566e2542e53a1f11d2` has now completed exact-head validation. Its applicable workflows all completed successfully: [EPER CI 41834857690](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857690), [same-commit integrated gate 41834857716](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857716), [separate 228/38 matrix 41834857691](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857691), [G9 reconciliation 41834857725](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857725), [release artifact 41834857695](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857695), [six-family HTTP 41834857667](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857667), [container smoke 41834857672](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857672), and [controlled QA 41834857704](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41834857704). The integrated workflow's duplicate matrix job was skipped; the separate matrix completed with 259 passed, 0 failed, 28 HTTP checks passed and no failed chapters. G9 tests: 5 passed, 0 failed. Release candidate was packaged and checksummed; no deployment occurred.

**Open-PR inventory correction:** PR #382 has since been closed unmerged as superseded by #392. It is no longer part of the current open-PR register. Its branch has not been deleted. Worker/keyring functionality is carried on the current #392 head `312a9358150c1967feba9307f1b71fbffd8cb8f5`; #392 exact-head fresh-clone, provider lifecycle, PostgreSQL payment and matrix workflows all pass. The active open-PR register now excludes #382.

This correction changes the scorecard file again. All green evidence above belongs to the prior exact scorecard head `9c8a8e89d04f1c5ada10db566e2542e53a1f11d2`; it must not be treated as validation of the new file commit until the new exact head's Actions complete.


## Superseded provider-branch closure correction — 2026-11-04 18:32 IST

PR #381 and PR #382 are now both **closed unmerged** and are excluded from the current open-PR register. Their branches were not deleted.

The unique #381 commit `e63f747db7e1f11e4fc7b74fae1591a575870a1d` added restricted-role RLS assertions and a workflow path trigger for the standalone encrypted-payload integration test. The active successor path has carried the security proof into the operation-backed lifecycle test on #391/#392: it uses `SET LOCAL ROLE eper_provider_catalogue_access`, verifies same-scope reads, cross-tenant and cross-application row hiding, and rejects unauthorized writes with SQLSTATE `42501`. The current #392 workflow also includes the standalone payload integration test path; its exact-head run passes the invalid-UUID and orphan-FK rejection cases. This is why the old RLS branch can be closed without discarding its behavior. Keep the closed branch as source history until normal repository retention policy permits cleanup; do not delete it in this delivery cycle.

The preceding scorecard head `aafdb2e9ede5ee0c85cfc3e2a9644d7b28ba4979` completed exact-head validation: EPER CI [41835329928], same-commit integrated gate [41835329760], separate 228/38 matrix [41835329905], G9 [41835329842], release artifact [41835329836], six-family HTTP [41835329921], container smoke [41835329841] and controlled QA [41835330028] all succeeded. The integrated workflow's duplicate matrix job was skipped; the separate matrix reports 259 passed, 0 failed and 28 HTTP checks passed; G9 reports 5 passed, 0 failed.

This closure correction changes the scorecard file head again. The new file commit's exact-head checks must be evaluated independently; prior green runs belong to `aafdb2e9ede5ee0c85cfc3e2a9644d7b28ba4979` only.


## Exact-head delivery refresh — 2026-11-04 19:43 IST

### Dynamically resolved mainline

- `refs/heads/main` resolves to `2c380d79c55c9183a42ed534ffd1a504f7d41316` (tree `0c01985a303e9348e728acd04b0a55a80020f9a9`).
- The commit message is `revert: remove unintended provider payload test commit from main`. The combined provider/asset candidate below is still a draft PR and is not in main.
- Current-main check-runs were fetched directly for this exact SHA; all completed successfully. Relevant push evidence: [EPER CI 41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771), [same-commit integrated validation 41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913), [228/38 matrix 41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818), [G9 41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648), [six-family HTTP 41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652), and [container smoke 41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533).
- GitHub branch metadata explicitly reports `main.protected=false`; the repository rulesets endpoint returns an empty list. The branch-protection detail endpoint itself returned 403 to this integration, so no settings were changed.
- The 228 requirements / 38 chapters remain the approved baseline.

### Merged foundation ancestry

The merge commits below were compared against current main; each is an ancestor with zero commits behind main:

- #306 fresh-clone setup: `6e8dd438e5091b1802d65e4f29951389fe077859`.
- #310 provider-neutral identity/OIDC foundation: `88b9708d748c19dc80a1a2d7ad4960914451db7e`.
- #324 browser-bound OIDC transactions: `a554990cb7f4969bb218aad7a2e9944aec62fa05`.
- #329 durable browser sessions/customer workspace: `82a82d92222c613c02e55f01211ecbb32ce63bba`.
- #337 CSRF/session enforcement: `18315e1654b52f1546936a8fd28daed907cab31e`.
- #376 customer admin/workflow/provider foundations: `9749701bfed527b906183192ca06cc1998e70166`.

#306 is merged, not open work. The merged identity chain establishes protocol and browser/session foundations, not production identity-provider onboarding.

### Current open-PR register — current head and exact-head evidence

Every row below was resolved from the current open-PR inventory. Workflow runs were queried using that PR's current head SHA; the relevant job logs were inspected. All returned current-head runs for these PRs completed successfully. These references supersede earlier heads and runs in this file.

| PR | Current head | Relevant exact-head Actions | Disposition |
|---|---|---|---|
| [#393 combined asset/provider candidate](https://github.com/sbannai/enterprise-product-engineering/pull/393) | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | [Fresh clone 41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369), [provider lifecycle 41844357288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357288), [PostgreSQL 41844357332](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357332), [integrated gate 41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419), [separate matrix 41844357424](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357424), workflow config 41844357320, controlled QA 41844357245, technical simulation 41844357341. | Draft; stacked on current #386 head. Combined migrations/tests/restore pass. Durable binary storage/download/scanner wiring and customer asset UI remain incomplete. No browser E2E on this exact head. |
| [#386 asset upload idempotency](https://github.com/sbannai/enterprise-product-engineering/pull/386) | `a1b7341d71a4086c983dd3362a4704c124a52b74` | [Fresh clone 41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258), [PostgreSQL 41837639319](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639319), [browser OIDC 41837639329](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639329). | Draft; 24 commits ahead / 0 behind current #384 base. Browser OIDC/workspace/support/logout 1/1; fresh clone 1,474 tests / 1,470 passed / 0 failed / 4 skipped; restore 79 source/restored tables and 7 migration ledgers. |
| [#377 scorecard](https://github.com/sbannai/enterprise-product-engineering/pull/377) | `38bc03ec19ace1d130aa1388cc78bc40be4280e9` | [EPER CI 41836290719](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41836290719), [integrated 41836290604](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41836290604), [separate matrix 41836290616](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41836290616), G9 41836290357. | Documentation only; 37 commits ahead / 0 behind main. This appended refresh creates a new head and must be validated separately. |
| [#384 asset repository](https://github.com/sbannai/enterprise-product-engineering/pull/384) | `291129b77ab50623e41dd28c4a746ef70da28183` | [Fresh clone 41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886), [PostgreSQL 41786048950](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048950), [browser 41786049023](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786049023), integrated 41786048948. | Draft; durable metadata/RLS and scan-worker foundations. Fresh clone 1,464 / 1,460 passed / 0 failed / 4 skipped; restore 79 tables / 7 ledgers; browser OIDC 1/1. |
| [#391 restricted-role RLS reconciliation](https://github.com/sbannai/enterprise-product-engineering/pull/391) | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | [Fresh clone 41820073308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073308), [provider lifecycle 41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247), matrix 41820073834. | Draft dependency on #390; restricted-role same-scope/cross-tenant/cross-application RLS proof retained. Fresh clone 1,439 / 1,435 passed / 0 failed / 4 skipped; restore 76 tables / 7 ledgers. |
| [#392 provider worker/integrity successor](https://github.com/sbannai/enterprise-product-engineering/pull/392) | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | [Fresh clone 41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500), [provider lifecycle 41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478), [PostgreSQL 41833626430](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626430). | Draft dependency on #391. Fresh clone 1,461 / 1,457 passed / 0 failed / 4 skipped; restore 76 tables / 7 ledgers; provider queue/worker/host/wake/NOTIFY/keyring/payload tests passed. |
| [#390 payload-operation integrity](https://github.com/sbannai/enterprise-product-engineering/pull/390) | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | [Fresh clone 41805934645](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934645), [PostgreSQL 41805934647](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934647), provider lifecycle 41805934711, integrated 41805934725. | Draft dependency on #379; integrity foundation for #391/#392. Fresh clone 1,439 / 1,435 passed / 0 failed / 4 skipped; restore 76 tables / 7 ledgers. |
| [#389 database-engine evaluation plan](https://github.com/sbannai/enterprise-product-engineering/pull/389) | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | [Separate matrix 41795128670](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128670), [integrated 41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802). | Documentation/evaluation plan only; no comparative live PostgreSQL/MySQL/MongoDB benchmark has been executed. PostgreSQL remains the approved target. |
| [#379 durable encrypted payload store](https://github.com/sbannai/enterprise-product-engineering/pull/379) | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | [Fresh clone 41738351740](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351740), [PostgreSQL 41738351604](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351604), provider 41738351657, integrated 41738351629. | Draft dependency on #378; fresh clone 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76 tables / 7 ledgers. |
| [#387 actor-scoped customer work queue](https://github.com/sbannai/enterprise-product-engineering/pull/387) | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | [Fresh clone 41784823307](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823307), [PostgreSQL 41784823446](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823446), [browser 41784823265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823265), integrated 41784823525. | Draft; browser OIDC/workspace/support journey 1/1. Fresh clone 1,429 / 1,425 passed / 0 failed / 4 skipped; restore 75 tables / 7 ledgers. Full task-detail/action UI and SLA remain. |
| [#385 additive asset requirements](https://github.com/sbannai/enterprise-product-engineering/pull/385) | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | [Matrix 41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125), [G9 41764308165](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308165), integrated 41764308133. | Requirements/change-control candidate only; owner disposition required. Its CW-060 candidate overlaps the CW-060 row in #380 and must be reconciled before either is accepted. |
| [#380 client asset/workflow UX requirements](https://github.com/sbannai/enterprise-product-engineering/pull/380) | `55006ab19bcbb685fc3e84c4230fd865087887f3` | [Matrix 41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774), [G9 41763251777](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251777), integrated 41763251674. | Requirements/design candidate only. CW-060 overlaps #385; retain its distinct CW-061 workflow-driven customer application UX candidate for owner disposition. |
| [#378 encrypted provider payload boundary](https://github.com/sbannai/enterprise-product-engineering/pull/378) | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | [Fresh clone 41738299068](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299068), [PostgreSQL 41738298973](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738298973), provider 41738299039, integrated 41738299062. | Draft base of provider stack; fresh clone 1,433 / 1,429 passed / 0 failed / 4 skipped; restore 75 tables / 7 ledgers. |

### Combined provider + customer-asset candidate — PR #393

PR #393 is draft, based on current #386 head `a1b7341d71a4086c983dd3362a4704c124a52b74`. It is 2 commits ahead / 0 behind that base and 166 commits ahead / 0 behind current main. The branch chain remains intact: provider stack #378 → #379 → #390 → #391 → #392; asset stack #384 → #386; #393 combines the provider stack with the current asset stack. No branch was force-updated and no PR was merged.

Exact-head fresh-clone log [41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369):

- `npm run dev:verify` completed successfully: 1,509 tests / 1,505 passed / 0 failed / 4 skipped.
- The actual `eper/scripts/dev-verify.mjs` applies and then re-runs all seven migration groups: payments, audit, workflows, campaign scheduler, capabilities, ticketing and identity.
- The identity migration `001_customer_oidc_sessions.sql` applied.
- The combined audit migration sequence applied the customer asset and provider files with shared numeric prefixes as distinct filenames: `021_customer_asset_repository.sql`, `021_encrypted_provider_payload_store.sql`, `022_customer_asset_scan_dispatch.sql`, `022_provider_payload_operation_integrity.sql`, `023_customer_asset_upload_reservation.sql`, `023_provider_payload_lifecycle_metadata.sql`, and `024_provider_payload_envelope_v2.sql`.
- The log contains explicit repeatability headings for all seven groups; the repeatability pass completed.
- `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- Disposable PostgreSQL backup/restore: `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; source/restored base-table count 80; migration-ledger table count 7.

The exact-head provider lifecycle job [41844357288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357288) passed the queue lifecycle, worker, host, wake-listener, post-commit notification, keyring and PostgreSQL payload-integrity tests. The PostgreSQL job [41844357332](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357332) passed the live integration steps. The same-commit integrated gate [41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419) emitted `PASS: all applicable technical lanes completed on the same commit`; its duplicate matrix lane was skipped, and the separate 228/38 matrix workflow [41844357424](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357424) completed successfully.

The #393 head does not have a browser E2E run. Its parent #386 current head has a separate exact-head browser run [41837639329](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639329): customer OIDC login/workspace/support/logout/revocation 1/1 and Product Admin remediation 1/1. That parent result is not relabelled as a #393 browser result.

### Customer-asset completion blockers found by code inspection

The combined migration/test proof is real, but it does not establish a complete production binary lifecycle:

1. `eper/apps/api/main.ts` constructs `PostgresCustomerAssetRepository` but does not inject `assetUploadPort`, `assetUploadVerificationPort`, `assetMalwareScanPort`, `assetUploadResolver`, `assetUploadVerificationResolver`, `assetMalwareScanResolver` or `assetDownloadResolver`. The production entrypoint therefore has no configured binary-storage or scanner provider; upload/verification/download paths fail closed rather than performing a real provider action.
2. The durable PostgreSQL asset repository exposes metadata listing, pending-upload lookup, upload-session verification/scanning, reservation, completion and scan-job methods, but no durable `getForDownload`/authorized-download lookup. The download route still reads legacy `EPER_CUSTOMER_APPLICATION_ASSETS_JSON` and `accessReference`, rather than resolving a PostgreSQL asset. A durable asset created through the new repository cannot yet complete the download journey.
3. The scan worker process entrypoint exists, but it requires a separately supplied scanner module, service identity/token and tenant/application configuration. No concrete scanner module, supervisor configuration, metrics or alerts are included.
4. The asset APIs and metadata tests exist; a complete customer-facing upload/progress/list/share/preview/download UI is not yet delivered.

Focused security review of the new upload boundary found: direct-upload grants require HTTPS and an exact configured hostname, reject URL username/password, cap expiry at 15 minutes, validate header names/values, and are issued only after durable upload reservation. Opaque provider upload references remain server-side; the short-lived signed upload capability is intentionally client-visible and must never be logged. The internal scan boundary requires a service bearer token and trusted scanner identity. No plaintext provider secret or signed capability logging was found in the inspected paths. This is a focused code-path review, not a complete security audit.

### Seven-pointer disposition — refreshed

1. **v34-to-228 — AMBER.** Preserve 228 requirements / 38 chapters. The 45-row v34 source export and statements remain intact; current crosswalk still has 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition remains open. #380 and #385 both reuse CW-060 with different wording/acceptance; reconcile to one candidate, while retaining #380's distinct CW-061 workflow-driven customer application UX candidate.
2. **Fresh-clone setup — GREEN for local/CI.** #306 merge SHA is an ancestor of current main. #393 now proves fresh-clone build/typecheck, all seven migration groups, all-seven repeatability and disposable restore on the combined provider/asset candidate. This is not a second-engineer handover.
3. **PostgreSQL — AMBER, major combined proof achieved.** #393 proves combined asset/provider migrations, identity, live PostgreSQL integration, repeatability and restore on one exact head. It is still a draft and not main. Production backup destination/key custody, RPO/RTO and independent restore rehearsal remain.
4. **Identity/OIDC — AMBER.** #310 and browser/session successors #324/#329/#337/#376 are merged ancestors. Browser routes, secure `__Host-eper_session` cookie, CSRF and durable tenant/application assignment checks exist. Synthetic-IdP browser E2E passes on current #386/#384/#387 heads; production IdP onboarding and production JWKS/key custody are not evidenced. No production-login claim.
5. **Customer workspace/support — AMBER.** Ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note visibility and export are implemented/tested. SLA response/resolution timers and escalation/breach evidence remain. Asset metadata/upload reservation/scan foundations exist, but binary provider wiring, durable download and customer UI are incomplete. #387 still lacks full task-detail/action UI.
6. **Scheduler/workflow — AMBER.** Campaign worker has a separate process entrypoint and continuous lease/fencing/retry/recovery tests. Asset scan worker has a separate entrypoint and bounded lease/retry/dead-letter logic but no concrete scanner or supervisor/metrics. Provider worker host has a continuous loop/wake/reconnect logic but no `start:provider-worker` process script or independent supervisor/metrics. Workflow outbox still lacks a demonstrated separately supervised production process. Production dispatch adapter and operational alerts remain.
7. **Release/continuity — RED.** Main protection is disabled and rulesets are empty. Fresh-clone and disposable restore are CI proofs only. Production backup/key custody, runbooks, rollback, incident ownership and second-engineer release rehearsal remain unproven.

### Continuity/safety boundary

No PR was merged, no branch was force-updated or deleted, no repository settings were changed, no chargeable cloud resource was provisioned, and no real storage/scanner/payment/provider action was triggered. The scorecard update is documentation-only. This section makes no business acceptance or UAT assessment.


## Exact-head delivery refresh — 2026-11-04 20:45 IST

### Dynamically resolved mainline and merged foundations

- refs/heads/main resolves to 2c380d79c55c9183a42ed534ffd1a504f7d41316 (tree 0c01985a303e9348e728acd04b0a55a80020f9a9).
- The exact-main check-run set has 13/13 completed successfully. Main PostgreSQL integrated job [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913) reported 1,410 tests / 1,404 passed / 0 failed / 6 skipped. The exact-main 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818) reports 228 requirements, 38/38 chapters, 259 passed / 0 failed and 28 HTTP checks. G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648) reports 5/5.
- GitHub branch metadata reports main.protected=false, required-check enforcement off, and the repository rulesets endpoint returns an empty list. No settings were changed.
- PR #306 is closed/merged at 6e8dd438e5091b1802d65e4f29951389fe077859; current main is 653 commits ahead / 0 behind that merge. PR #310 is closed/merged at 88b9708d748c19dc80a1a2d7ad4960914451db7e; current main is 652 commits ahead / 0 behind that merge. #306 is not open work. #310 establishes provider-neutral OIDC protocol/durable-session foundation; production IdP onboarding remains separate.

### Current open PR inventory and exact-head Actions

The live open-PR search returned 14 PRs. Every current head below was resolved from GitHub and checked directly through that commit's check-run endpoint; each returned check's head_sha matched the PR head. Relevant job logs were inspected. No stale green result was substituted after a head change.

| PR | Exact current head | Exact-head evidence / outcome |
|---|---|---|
| [#394 PostgreSQL asset-download authorization](https://github.com/sbannai/enterprise-product-engineering/pull/394) | 09ee86677a4af5114a479cc9fe232be497fcd0d0 | [Fresh clone 41856413859](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413859): 1,510 tests / 1,506 passed / 0 failed / 4 skipped; seven migration groups including identity applied and repeated; local developer verification PASS; disposable backup/restore PASS, 80/80 base tables and 7 ledgers. [PostgreSQL 41856413882](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413882), [matrix 41856413654](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413654) (259/0, 38 chapters, 28 HTTP checks), and [controlled QA 41856413748](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413748) passed. Chromium browser job [41856413726](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413726) remains in progress at the Install Chromium step; no conclusion/log is available yet. No same-commit integrated gate or dedicated provider lifecycle run is present on this head. Draft, based on #393. |
| [#385 customer asset requirements](https://github.com/sbannai/enterprise-product-engineering/pull/385) | 2a2b059b37d06621f8e4efb2e2b6f467520114b5 | [Integrated 41764308133](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308133), [matrix 41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125), [G9 41764308165](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308165) passed; 259/0 and 28 HTTP checks. Documentation/candidate only. |
| [#377 scorecard](https://github.com/sbannai/enterprise-product-engineering/pull/377) | a35708326327fb41de6ee31f2437d0763c329c6d | [EPER CI 41846921539](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41846921539), [integrated 41846921562](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41846921562), [matrix 41846921575](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41846921575), [G9 41846921388](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41846921388) passed. This update is appended to the same scorecard PR; the resulting new head requires its own exact-head validation. |
| [#393 combined asset/provider candidate](https://github.com/sbannai/enterprise-product-engineering/pull/393) | 73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e | [Fresh clone 41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369): 1,509 / 1,505 passed / 0 failed / 4 skipped; 7 migrations repeated; restore 80/80. [Provider lifecycle 41844357288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357288), [PostgreSQL 41844357332](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357332), [integrated 41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419), and [separate matrix 41844357424](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357424) passed. No browser E2E on this exact head. Draft, based on #386. |
| [#386 asset upload idempotency](https://github.com/sbannai/enterprise-product-engineering/pull/386) | a1b7341d71a4086c983dd3362a4704c124a52b74 | [Fresh clone 41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258): 1,474 / 1,470 passed / 0 failed / 4 skipped; restore 79/79. [PostgreSQL 41837639319](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639319), [browser OIDC 41837639329](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639329), and [provider lifecycle 41837639531](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639531) passed. Browser customer OIDC/workspace/support/logout 1/1 and Product Admin remediation 1/1. |
| [#384 customer asset repository](https://github.com/sbannai/enterprise-product-engineering/pull/384) | 291129b77ab50623e41dd28c4a746ef70da28183 | [Fresh clone 41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886): 1,464 / 1,460 passed / 0 failed / 4 skipped; restore 79/79. [PostgreSQL 41786048950](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048950), [browser 41786049023](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786049023), [integrated 41786048948](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048948) passed. |
| [#391 restricted-role RLS](https://github.com/sbannai/enterprise-product-engineering/pull/391) | 7d7e5297b649d0dfe2318c5d2f5a1f81b5457749 | [Fresh clone 41820073308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073308), [provider lifecycle 41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247), matrix 41820073834 passed. Provider lifecycle asserts durable claims, renewal, fencing, retry exhaustion and recovery (1/1). |
| [#392 provider worker/integrity successor](https://github.com/sbannai/enterprise-product-engineering/pull/392) | 312a9358150c1967feba9307f1b71fbffd8cb8f5 | [Fresh clone 41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500): 1,461 / 1,457 passed / 0 failed / 4 skipped; restore 76/76. [Provider lifecycle 41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478) and [PostgreSQL 41833626430](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626430) passed; encrypted payload integrity 2/2. |
| [#390 payload-operation integrity](https://github.com/sbannai/enterprise-product-engineering/pull/390) | 3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f | [Fresh clone 41805934645](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934645): 1,439 / 1,435 passed / 0 failed / 4 skipped; restore 76/76. [PostgreSQL 41805934647](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934647), provider 41805934711 and integrated 41805934725 passed. |
| [#389 database-engine evaluation plan](https://github.com/sbannai/enterprise-product-engineering/pull/389) | aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2 | [Integrated 41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802): 1,410 / 1,404 passed / 0 failed / 6 skipped; [matrix 41795128670](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128670) passed. This is an evaluation plan only; no live PostgreSQL/MySQL/MongoDB benchmark has run. |
| [#379 durable encrypted payload store](https://github.com/sbannai/enterprise-product-engineering/pull/379) | 82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44 | [Fresh clone 41738351740](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351740): 1,438 / 1,434 passed / 0 failed / 4 skipped; restore 76/76. [PostgreSQL 41738351604](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351604), provider 41738351657 and integrated 41738351629 passed. |
| [#387 actor-scoped workflow queue](https://github.com/sbannai/enterprise-product-engineering/pull/387) | 53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d | [Fresh clone 41784823307](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823307): 1,429 / 1,425 passed / 0 failed / 4 skipped; restore 75/75. [PostgreSQL 41784823446](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823446), [browser 41784823265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823265), integrated 41784823525 passed. Browser journey 1/1; queue remains API/read-model only, not a full task-detail/action UI. |
| [#380 customer asset/workflow UX requirements](https://github.com/sbannai/enterprise-product-engineering/pull/380) | 55006ab19bcbb685fc3e84c4230fd865087887f3 | [Matrix 41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774): 259/0, 38/38 chapters, 28 HTTP checks; [integrated 41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674) passed. Documentation/design only. |
| [#378 encrypted provider payload boundary](https://github.com/sbannai/enterprise-product-engineering/pull/378) | 813de84caa4c9cf4eb7c5a2c89a92b30d662ff05 | [Fresh clone 41738299068](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299068): 1,433 / 1,429 passed / 0 failed / 4 skipped; restore 75/75. [PostgreSQL 41738298973](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738298973), provider 41738299039 and integrated 41738299062 passed. In-memory codec boundary only; durable storage is downstream in #379. |

### PR #394 — durable PostgreSQL download authorization delivered; provider still intentionally disabled

The current #394 head adds PostgresCustomerAssetRepository.getDownloadAsset(tenant, application, asset). It establishes transaction-local tenant/application context and returns an opaque object reference only when the asset is active, upload status is available, scan status is clean/not-required, and the asset is either restricted to the requested application or explicitly linked to it as customer-shared. The server uses this lookup exclusively in PostgreSQL mode; missing rows, revoked links or lookup failures do not fall back to the legacy JSON manifest. A durable audit writer is now passed from the API composition root.

Exact-head test evidence from fresh-clone log [41856413859](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413859):
- PostgreSQL customer asset repository integration test passed, including authorized download lookup, cross-application denial, cross-tenant denial and quarantined-asset denial.
- API regression passed: PostgreSQL download never falls back to a legacy manifest entry; a missing PostgreSQL row returns 404 and does not invoke the storage provider.
- Full fresh-clone suite: 1,510 / 1,506 passed / 0 failed / 4 skipped.
- All seven migration groups, including identity, applied and repeated; disposable backup/restore passed with 80 source/restored base tables and seven migration ledgers.

The provider boundary remains deliberately unconfigured: eper/apps/api/main.ts passes the durable asset repository and audit writer, but does not supply assetStoragePort, upload/verification/scanner ports or their resolvers. Therefore this change authorizes only the database lookup; it does not issue a real signed download URL or claim binary download completion. No storage/scanner adapter was invoked. The customer upload/progress/list/share/preview/download UI is still incomplete.

The Chromium OIDC/browser workflow [41856413726](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413726) was still in progress at the Install Chromium step at 20:45 IST; it has no result yet. #394 has no same-commit integrated gate or dedicated provider-lifecycle check on this exact head. Treat its fresh-clone/PostgreSQL/matrix/QA checks as the current evidence and wait for browser completion before describing the whole journey as validated.

### Seven-pointer disposition — 20:45 IST

1. **v34-to-228 — AMBER.** The approved 228 requirements / 38 chapters remain unchanged. The v34 export retains 45 source rows; the technical crosswalk records 0 exact full-coverage matches, 45 partial shared-control links and 45 additive v1.6.0 draft candidates. Owner disposition is still required. CW-060 is duplicated between #380 and #385 and must become one owner-dispositioned candidate; preserve #380's separate CW-061.
2. **Fresh-clone setup — GREEN for local/CI.** #306 is merged and an ancestor of main. #394's current exact head runs npm run dev:verify, all seven migration groups/repeatability and disposable restore. This is not a second-engineer handover.
3. **PostgreSQL durability — AMBER.** Combined provider/asset migrations, identity, live PostgreSQL, repeatability and disposable restore pass on #393/#394 exact heads. Production backup destination/key custody, retention, RPO/RTO and independent restore rehearsal remain.
4. **Identity/OIDC — AMBER.** #310 and successors #324/#329/#337/#376 are merged ancestors. Provider-neutral OIDC, browser callback, secure cookies, CSRF, durable sessions/revocation and tenant/application assignments have synthetic-IdP browser evidence on #386/#384/#387. Production IdP onboarding, JWKS rotation/key custody and full operator credential lifecycle remain unproven.
5. **Customer workspace/support — AMBER.** Ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note separation and CSV export have implementation/test evidence. SLA timers/escalation/breach evidence, full task-detail/action UI, and complete asset binary provider/UI remain. #394 closes the PostgreSQL download lookup gap only.
6. **Scheduler/workflow — AMBER.** Campaign worker and outbox worker core prove continuous polling, leases/fencing, idempotency, bounded retry/dead-letter and restart recovery. Provider worker host/wake/reconnect and encrypted payload/keyring lifecycle are tested. Separate provider/outbox production process supervision, restricted worker identity, approved production dispatcher, metrics/alerts and operational recovery remain.
7. **Release/continuity — RED.** Main remains unprotected, required checks are not enforced and no repository rulesets exist. Production backup/key custody, runbooks, rollback/incident ownership and second-engineer release rehearsal remain. The continuity charter is still proposed and requires owner approval.

### Dependency and safety boundary

- Asset chain: #384 → #386 → #393 → #394. Provider chain: #378 → #379 → #390 → #391 → #392. #394 is based on #393; no branches were force-updated or deleted.
- #380 and #385 both carry CW-060; reconcile once, preserving #380's CW-061.
- PostgreSQL remains the approved target. #389 is an evaluation plan only; no comparative live MySQL/MongoDB benchmark or engine switch is evidenced.
- No PR was merged, no branch was deleted or force-updated, no repository settings were changed, no chargeable cloud resource was provisioned, and no real external/provider action was triggered. This record does not make a business-acceptance or UAT decision.


## Browser evidence correction — 2026-11-04 20:56 IST

The earlier 20:45 snapshot recorded PR #394's Chromium job as in progress. It has since completed successfully on the same exact head 09ee86677a4af5114a479cc9fe232be497fcd0d0. Browser run [41856413726](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41856413726) passed the synthetic-IdP customer OIDC/workspace/support/logout/revocation journey (1/1) and Product Admin application-remediation journey (1/1). A fresh direct check-run read now shows all seven #394 checks completed successfully with head_sha equal to 09ee86677a4af5114a479cc9fe232be497fcd0d0. This does not add a same-commit integrated gate or a dedicated provider-lifecycle run, and it does not configure a real storage/scanner provider. The earlier in-progress statement above is superseded by this correction.


## Latest dynamic repository and delivery refresh — 2026-11-04 22:10 IST

This is a point-in-time snapshot. The next refresh must resolve `main`, open PRs, PR heads and Actions dynamically again; none of the recorded SHAs or PR numbers are permanent selectors.

### Integrated mainline

- Dynamically resolved `main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- Main branch metadata: `protected=false`; required-status-check enforcement is off; repository rulesets endpoint returns an empty list.
- Direct commit check-runs: 13/13 completed successfully on this exact main SHA. Same-commit integrated run [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913) passed; PostgreSQL suite 1,410 total / 1,404 passed / 0 failed / 6 skipped. Separate 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818) passed 259 pilot tests, 0 failed, 28 HTTP checks. G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648) passed 5/5. EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771) passed.
- PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 is merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Current main is a descendant of both merge commits. Identity/browser/session successor PRs #324, #329, #337 and #376 are also confirmed merged ancestors of current main. #310's protocol foundation is not, by itself, the production browser-login completion claim.

### Current open PR inventory — direct REST enumeration

The authoritative open-pulls endpoint returned these 15 open PRs. Direct check-run reads were performed for each exact head; every returned check-run's `head_sha` matched that PR's current head. Relevant job logs were inspected for fresh-clone, PostgreSQL, provider lifecycle, browser, matrix and integrated-gate lanes where present.

| PR | Exact head at this snapshot | Base | Capability / current disposition |
|---|---|---|---|
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | #393 integration branch | PostgreSQL customer-asset download authorization; 7/7 exact-head checks successful. |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | #393 integration branch | Provider-neutral storage catalogue metadata; 6/6 exact-head checks successful after a focused TypeScript correction. |
| #377 | `ce2928970bf7ca0b86677f0bb887537c40d61c11` | main | Seven-checkpoint scorecard; 13 successful check-runs and one duplicate matrix lane skipped; separate matrix passed. |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | main | Customer-level asset repository requirements/design v1.7.0 draft; exact-head CI/matrix/G9 passed. |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | main | Client asset and workflow-driven application UX requirements v1.6.0 draft; exact-head CI/matrix/G9 passed. |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | #386 | Combined customer-asset and provider worker/payload integration; fresh clone, PostgreSQL, provider lifecycle, integrated gate and separate matrix passed. |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | #384 | Upload idempotency reservation; fresh clone, PostgreSQL, provider lifecycle and Chromium browser checks passed. |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | main | Tenant-isolated customer asset repository foundation; fresh clone, PostgreSQL, provider lifecycle, browser, integrated gate and matrix passed. |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | #379 | Provider payload/operation referential integrity; fresh clone, PostgreSQL, provider lifecycle, integrated gate and matrix passed. |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | #390 | Restricted-role RLS proof reconciled with payload integrity; fresh clone, provider lifecycle and matrix passed. |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | #391 | Provider worker/host integration with payload integrity; fresh clone, PostgreSQL, provider lifecycle and matrix passed. |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | main | PostgreSQL/MySQL/MongoDB evaluation plan only; technical CI/matrix passed; no comparative benchmark is evidenced. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | #378 | Durable encrypted PostgreSQL provider payload store; fresh clone, PostgreSQL, provider lifecycle, integrated gate and matrix passed. |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | main | Actor-scoped customer workflow queue read model; fresh clone, PostgreSQL, browser, integrated gate and matrix passed. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | main | Encrypted provider payload boundary; fresh clone, PostgreSQL, provider lifecycle, integrated gate and matrix passed. |

### Dependency and branch hygiene

Live comparisons against current main show every listed PR head is based on current main (0 commits behind). The feature-stack edges are also linear and non-diverged:

- Asset chain: #384 → #386 (24 ahead / 0 behind) → #393 (2 ahead / 0 behind) → #394 and #395 (each 12 ahead / 0 behind).
- Provider chain: #378 → #379 (1 ahead / 0 behind) → #390 (12 ahead / 0 behind) → #391 (1 ahead / 0 behind) → #392 (18 ahead / 0 behind).
- Direct-main branches at this snapshot: #377 (40 ahead), #380 (5 ahead), #385 (4 ahead), #387 (22 ahead), #389 (1 ahead); all 0 behind.
- No force update or branch deletion was performed. The open feature branches remain attached to their PR dependency stacks. Do not merge a child independently to main while its base is an unmerged integration branch.

### Exact-head corrections and newly completed work

**PR #394 — current head `c2b7a2c8e7ff3211869e061544672c7db1eb7261`.** The PR description was corrected from its stale earlier head to this live head and current evidence. All seven exact-head checks passed:
- Fresh clone [41868477584]: `npm run dev:verify`, 1,510 tests / 1,506 passed / 0 failed / 4 skipped; all seven PostgreSQL migration groups applied and repeated, including identity; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- Disposable PostgreSQL 16 restore: [same fresh-clone run](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477584); `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`, 80 source/restored base tables, 7 migration ledgers.
- Live PostgreSQL integration [41868477557] passed.
- Chromium [41868477503] passed synthetic-IdP customer OIDC/workspace/support/logout/revocation 1/1 and Product Admin remediation 1/1.
- Matrix [41868477299]: 38/38 chapters, 259 pilot tests passed / 0 failed, 28 HTTP checks.
- Controlled QA [41868477804] passed.
- Delivered: tenant/application-scoped PostgreSQL download lookup; active/upload-complete/clean-scan gates; restricted-vs-shared application authorization; no JSON-manifest fallback in PostgreSQL mode; durable download audit; cross-tenant/application/quarantine/lease regression coverage.
- Still missing: concrete storage download/upload/verification adapters and malware scanner wiring; signed URL issuance and binary transfer; complete customer asset UI. There is no same-commit integrated gate or dedicated provider-lifecycle run on #394's exact head. This PR is an authorization lookup increment, not the complete binary lifecycle.

**PR #395 — current head `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9`.** The prior head `0a85090687806032659473392ddb7d9be4777e9f` failed TypeScript definite-assignment analysis at `storage-provider-registration.ts:46` (`TS2454 serialized used before assigned`). A first helper-annotation correction did not resolve the compiler diagnostic. The focused final correction throws the stable schema-validation error directly from the JSON serialization catch. The final exact head then passed all six check-runs:
- Fresh clone [41869040234]: 1,518 tests / 1,514 passed / 0 failed / 4 skipped; all seven migration groups including identity applied and repeated; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- Disposable restore: `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`, 80/80 base tables and 7 ledgers.
- Provider lifecycle [41869040134], PostgreSQL integration [41869040101], matrix [41869040066] and controlled QA [41869040232] passed.
- Delivered: metadata catalogue and schema validation for S3, Azure Blob, Google Cloud Storage and Dropbox; explicit adapter/capability/auth-mode registry validation; secret-bearing metadata rejection.
- Still missing: executable adapters, credential resolution/lifecycle, provider network operations, scanner invocation and customer binary UI. No browser E2E or same-commit integrated gate was returned on this exact head.

PR #393's description was updated to record these successors and to avoid claiming the original missing download lookup is still unaddressed. The integration branch still lacks configured storage/scanner adapters, a separately supervised worker host, operational metrics/alerts and the complete customer asset UI.

### Seven approved pointers — refreshed disposition

1. **v34-to-228 reconciliation — AMBER.** Preserve all 228 approved requirements and 38 chapters. The v34 source export preserves 45 candidate rows and original statements/acceptance criteria; current crosswalk remains 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition is still required. Do not silently promote candidates or alter the approved baseline.
2. **Fresh-clone developer setup — GREEN for local/CI.** #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`, an ancestor of current main. Exact-head successors #393/#394/#395 independently ran `npm run dev:verify`. A second engineer's independent handover/release rehearsal is still not evidenced.
3. **PostgreSQL durability — AMBER.** Current #394/#395 runs prove clean-clone verification, seven migration groups including identity, migration repeatability, live PostgreSQL tests and disposable backup/restore. Production backup destination, encryption/key custody, retention, RPO/RTO, point-in-time recovery and an independent production recovery rehearsal remain unproven. PostgreSQL remains the approved target; #389 is a plan, not a benchmark.
4. **Identity/OIDC/sessions — AMBER.** #310 merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; #324/#329/#337/#376 are also merged ancestors of main. Browser callback/session routes, secure cookies, CSRF, durable sessions/revocation and tenant/application assignment/role checks have synthetic-IdP browser evidence. Production IdP onboarding, key/JWKS rotation and operational credential lifecycle remain unproven.
5. **Customer workspace/support — AMBER.** Customer ticket submission/history/replies, tenant/application/actor scoping, admin triage/assignment/severity, internal-note separation and export have implementation/test evidence. Browser OIDC/workspace/support journey passes on #394. SLA timers, escalation and breach reporting remain; full task-detail/action UX and the customer asset binary UI remain incomplete.
6. **Scheduler/workflow operations — AMBER.** Continuous worker-loop foundations, lease renewal/fencing, idempotency, retry/dead-letter and recovery/replay have PostgreSQL/worker tests. The provider host has bounded pass, queue wake/reconciliation and shutdown tests. Independently supervised production worker entrypoints, restricted operational identities, approved dispatch wiring, metrics/alerts and recovery runbooks remain.
7. **Release/continuity — RED.** Main is explicitly unprotected, required-check enforcement is off and no rulesets exist. Production restore/key-custody runbooks, incident/rollback ownership and a second-engineer release path are not evidenced. The continuity charter remains proposed and requires owner approval.

### Continuity and safety

The continuity standard remains `eper/docs/ENGINEERING_CONTINUITY_AND_INDEPENDENCE_CHARTER.md`. No PR was merged; no branch was force-updated or deleted; no repository settings changed; no chargeable cloud resources were provisioned; no real external/provider action was invoked. This update does not make a UAT or business-acceptance decision.


## Open-PR inventory delta — 2026-11-04 22:14 IST

A new open draft PR was created after the 22:10 inventory snapshot. The current open-PR register now contains 16 entries; re-read the repository's open-pulls endpoint on every subsequent run.

### PR #396 — independent customer-asset scan recovery

- Current head: `a4f0f929aad3b3eb5b6e6aea27070d90f4da9366`.
- Base: PR #394 at `c2b7a2c8e7ff3211869e061544672c7db1eb7261`; comparison: 6 ahead / 0 behind.
- Adds tenant/application-scoped recovery of expired scan leases at or above max attempts; bounded batch with `FOR UPDATE SKIP LOCKED`; atomic dead-letter transition, asset quarantine/failure and audit append; separate opt-in PostgreSQL recovery process and package start script. It does not load a scanner or storage provider.
- A review found the first wait-loop version added an AbortSignal listener on every interval but did not remove it on normal timer completion. The owning branch was corrected: the current helper removes the listener on both timer completion and shutdown. The prior head's runs are stale and are not reused.
- Current exact-head checks: matrix [41870621522](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41870621522) and payment contract [41870621496](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41870621496) completed successfully. Fresh-clone [41870621733], PostgreSQL [41870621558], provider lifecycle [41870621548] and controlled QA [41870621498] are still in progress at this snapshot. Each returned check-run's `head_sha` matches the current PR head.
- Relevant in-progress job steps show typecheck/build already passed in provider lifecycle and payment integration; fresh-clone lockfile install passed and `npm run dev:verify` is running. Do not claim final PostgreSQL/restore/recovery proof until the exact-head jobs complete.
- Remaining: independent process supervision/restart, health metrics/alerts/runbooks; concrete scanner module/provider; concrete API storage upload/download/verification adapters; binary transfer and complete customer asset UI; production restore/key custody.
- Dependency: asset stack is now #384 → #386 → #393 → #394 → #396, with #395 as a parallel metadata-catalogue child of #393. All edges are ahead/0-behind. Do not merge child branches independently to main.

The 22:10 table remains a historical snapshot; this addendum is the later exact-head correction. Approved 228 requirements / 38 chapters remain unchanged. No merge, provider invocation, cloud provisioning or external action was performed.


## PR #396 final exact-head result — 2026-11-04 22:18 IST

The current asset-recovery child PR #396 has advanced through two test-fixture corrections. The authoritative current head is `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81`; prior heads and their runs are stale.

- The first exact-head failure was the existing RLS expected asset/session set not including the new recovery fixture. The owning branch updated the set/counts.
- The next exact-head failure was an assumed 21-row lifecycle audit count; the actual query intentionally covers the original 18 lifecycle events while the new `customer.asset.scan.exhausted` event is asserted separately. The owning branch restored the 18 count and clarified the assertion.
- Current exact-head check-runs: 7/7 completed successfully, all `head_sha` values match `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81`.
- Fresh-clone [41871265755](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265755): `npm run dev:verify`, 1,510 tests / 1,506 passed / 0 failed / 4 skipped; all seven PostgreSQL migration groups including identity applied and repeated; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; disposable PostgreSQL 16 restore `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`, 80/80 base tables, 7 migration ledgers.
- PostgreSQL asset repository integration test 730 passed, including two concurrent exhausted-scan sweeps finalizing one job once, repeat sweep returning zero, dead-letter state, asset failed/quarantined state, recovery audit, and tenant/application RLS.
- Provider lifecycle [41871265677](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265677), PostgreSQL integration [41871265396](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265396), payment contract [41871265037](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265037), 228/38 matrix [41871265459](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265459) and controlled QA [41871264880](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871264880) passed.
- Matrix: 38 chapters, 259 pilot tests passed / 0 failed, 28 HTTP checks. QA suite: 1,486 total / 1,446 passed / 0 failed / 40 skipped.
- The scan-recovery worker now has its own opt-in start script and process, but independent supervision/restart/health metrics/alerts remain outstanding. It does not invoke a scanner or storage provider. Concrete API storage upload/download/verification adapters, binary transfer and complete customer asset UI remain outstanding.

The current open-PR inventory is now 16 entries: #396 is a child of #394; #395 remains a parallel catalogue-metadata child of #393. The seven approved requirements pointers and the 228/38 baseline are unchanged. No merge or production-provider action was performed.


## Latest operating update — 2026-11-04 22:54 IST

**Dynamically resolved main:** `2c380d79c55c9183a42ed534ffd1a504f7d41316` (tree `0c01985a303e9348e728acd04b0a55a80020f9a9`). Direct current-main check-run query returned 13/13 completed-success checks, all with this exact `head_sha`. The same-commit integrated PostgreSQL job reports 1,410 tests / 1,404 passed / 0 failed / 6 skipped. The separate 228/38 matrix reports 259 passed / 0 failed and 28 HTTP checks; G9 is 5/5. Main remains technically green.

### Current open PR inventory — dynamically refreshed

| PR | Exact current head | Scope / disposition |
|---|---|---|
| #398 | `7317acf156a3bce5da03b14052391aed44745ddc` | Provider runtime registry; exact adapter-key binding and deterministic fail-closed worker handling added in this update. Exact-head workflows are queued; not yet validated. |
| #377 | This scorecard refresh | Documentation-only evidence record; new file commit requires its own exact-head validation. |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | Consolidated customer asset/provider stack. |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | PostgreSQL-backed customer asset download authorization. |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | Independent expired-scan lease recovery and dead-letter/quarantine. |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | Customer asset repository and scan-worker foundation. |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | Provider catalogue metadata and capability validation. |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | Additive asset requirements. |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | Customer application/asset UX requirements. |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | Upload idempotency reservation. |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | Restricted-role provider RLS foundation. |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | Provider operation worker host, encrypted payload store and keyring. |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | Reciprocal deferred payload/operation foreign keys. |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | Database-engine evaluation plan only. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | Durable encrypted PostgreSQL provider payload store. |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | Actor-scoped customer workflow queue API/read model. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | Encrypted provider payload boundary. |

The current-head workflow query was refreshed for every open PR. Representative run-detail reads across all 17 heads confirmed that the selected PR runs refer to the exact current head. All relevant returned runs for the 16 heads other than the newly changed #398 completed successfully. For #398, all six newly triggered runs are queued on `7317acf156a3bce5da03b14052391aed44745ddc`; earlier heads `5b9d337`, `c289dec`, `098ae0e` and their runs are stale and are not reused.

### Newly corrected provider registry boundary — PR #398

The exact-head review found two concrete fail-closed gaps and corrected them on the owning branch:

1. Runtime resolution previously matched provider key/version but did not compare the catalogue-selected adapter key. The selection now requires an exact provider + adapter key + semantic version + capability match; adapter-key substitution is rejected.
2. A missing/unapproved runtime adapter previously surfaced as a generic dispatch error and would consume transient retry budget. `ProviderRuntimeRegistryError` is now classified as a deterministic configuration blocker and persisted as `NEEDS_ATTENTION` for operator review.

New regression tests cover catalogue adapter-key substitution and parking an unregistered adapter without retry. Current exact-head checks are queued, so this correction is not yet reported as test-passed. The registry remains process-local; production worker composition, credential resolution and concrete provider drivers are not wired.

### PostgreSQL exact-head evidence

- PR #392 exact head `312a9358150c1967feba9307f1b71fbffd8cb8f5`: fresh clone [41833626500] passed `npm run dev:verify`, 1,461 tests / 1,457 passed / 0 failed / 4 skipped; all seven migration groups including identity were applied and repeated; disposable PostgreSQL 16 restore passed with 76 source/restored base tables and seven migration ledgers. Provider lifecycle [41833626478] passed: queue lifecycle 1/1, worker 7/7, host 5/5, wake listener 3/3, post-commit NOTIFY 1/1, keyring 6/6 and payload integrity 2/2. No integrated gate, browser E2E or independently supervised provider process is evidenced on this head.
- PR #394 exact head `c2b7a2c8e7ff3211869e061544672c7db1eb7261`: fresh clone [41868477584] passed 1,510 tests / 1,506 passed / 0 failed / 4 skipped; seven migration groups including identity and repeatability; restore 80/80 base tables and seven ledgers. Chromium [41868477503] passed customer OIDC/workspace/support/logout/revocation 1/1 and Product Admin remediation 1/1.
- PR #396 exact head `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81`: fresh clone [41871265755] passed 1,510 / 1,506 / 0 / 4; seven migrations, repeatability, restore 80/80 and seven ledgers. PostgreSQL scan-recovery integration passed bounded concurrent exhausted-lease recovery, single finalization, repeat-sweep idempotency, dead-letter state, asset quarantine/failure, audit and tenant/application RLS.
- PR #398 previous head `5b9d337` had passed its six workflow set and its QA log included the new registry tests, but those results are stale for the corrected current head `7317acf`. Do not carry them forward.

### Requirements, identity, support and workflow boundaries

- **v34-to-228:** the main crosswalk preserves all 45 source rows and original statements/acceptance criteria. Current technical disposition remains 0 exact full matches, 45 partial shared-control links and 45 additive v1.6.0 draft candidates. Four overlap the existing v1.5.0 approval control. Owner approval is pending. The approved 228 requirements and 38 chapters remain unchanged.
- **Fresh clone / PostgreSQL:** PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`, and current main is a descendant (653 commits ahead / 0 behind). The seven-group `dev:verify`, identity migration repeatability, live PostgreSQL and disposable restore evidence are present on current asset/provider child heads. CI restore is not production disaster-recovery certification.
- **Identity:** PR #310 is merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; successor PRs #324, #329, #337 and #376 are also merged ancestors of main. Browser routes, secure cookies, CSRF, durable sessions/revocation and tenant/application assignment tests exist with a synthetic IdP. Production IdP onboarding, production JWKS/key rotation and operator credential lifecycle are not evidenced.
- **Support:** current-main tests cover customer ticket creation, history/listing and replies; trusted tenant/application/actor scoping; admin triage/status, assignment and P1 severity rationale; internal-note visibility; and CSV export (including formula neutralization and all-filtered-pages export). SLA timers, breach monitoring and escalation automation are not evidenced.
- **Scheduler/workflow:** continuous campaign/outbox worker components, lease renewal/fencing, idempotency, retry/dead-letter and audited replay have test evidence. Campaign scheduler has an opt-in worker entrypoint. Workflow outbox remains a reusable process component without an independently deployed worker entrypoint. Restricted production host composition, approved dispatcher, supervision/restart policy, operational metrics/alerts and recovery rehearsal remain.
- **Release/continuity:** live branch metadata reports `protected=false`; repository rulesets collection is empty. The continuity charter is still marked proposed/owner-review-required. Production backup destination, key custody, retention, RPO/RTO, failover drill and second-engineer clean-clone/release/rollback path remain unproven.

### Merged foundation verification

PR #306 merge `6e8dd438e5091b1802d65e4f29951389fe077859`, PR #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e`, and identity successors #324 (`a554990cb7f4969bb218aad7a2e9944aec62fa05`), #329 (`82a82d92222c613c02e55f01211ecbb32ce63bba`), #337 (`18315e1654b52f1546936a8fd28daed907cab31e`) and #376 (`9749701bfed527b906183192ca06cc1998e70166`) are confirmed ancestors of current main. They are not open work.

No approved requirement or chapter was changed. No PR was merged, no branch was deleted/force-updated, no repository setting was changed, no chargeable cloud resource was provisioned and no real external/provider action was invoked.


### Snapshot correction — scorecard branch head changed in this run

The 22:54 open-PR snapshot above was written while PR #377 still pointed to its prior head. Appending that snapshot advanced the scorecard PR itself to `83b674a3937bc04c00b1d349aa2878d28e0c1017`. Its own exact-head workflows were subsequently created and remain queued. Therefore PR #377 is also pending validation; the sentence above about the other 16 heads applies to the pre-update scorecard head and is superseded for #377. At the latest refreshed state, the 15 unchanged open PR heads other than #398 and #377 retain their successful exact-head evidence. Do not carry the prior #377 green checks forward.


## Operating refresh — 2026-11-04 23:42 IST

### Dynamically resolved mainline and current exact-head Actions

- Current `main` ref resolves to `2c380d79c55c9183a42ed534ffd1a504f7d41316`.
- Direct commit check-runs: 13/13 completed successfully on that exact SHA. Same-commit integrated validation [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913) passed; the mainline PostgreSQL suite reports 1,410 tests / 1,404 passed / 0 failed / 6 skipped. The separate 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818) reports 259 pilot tests passed / 0 failed and 28 HTTP checks passed. G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648) passed 5/5.
- PR #306 is closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 is closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Both merge commits are ancestors of current main (main is 653 commits ahead / 0 behind #306; #310 is likewise a merged ancestor). Neither is open work.
- The continuity charter remains **PROPOSED / OWNER REVIEW REQUIRED**. The rulesets endpoint returns an empty collection. The branch-protection endpoint returned HTTP 403 to this integration, so branch protection itself could not be independently re-read in this run; do not infer that it is enabled.

### Live open-PR inventory and exact heads

The open PR search returned the following current set. Every returned check-run for each listed head has a matching `head_sha`. All applicable returned workflows are completed-success; duplicate matrix subjobs are skipped only where a separate exact-head chapter-matrix workflow succeeded.

| PR | Exact current head | Delivery scope |
|---|---|---|
| #377 | `90417e84692ad5f357d1d204831f8e3e9fdc733d` (before this scorecard refresh commit) | Seven-checkpoint evidence |
| #398 | `7317acf156a3bce5da03b14052391aed44745ddc` | Fail-closed provider runtime adapter registry |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | Asset/provider integration candidate |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | PostgreSQL customer asset download authorization |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | Independent exhausted-scan recovery |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | Tenant-isolated customer asset repository |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | Provider-neutral storage catalogue contract |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | Customer asset requirements |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | Asset library and workflow-driven customer UX requirements |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | Upload idempotency reservation |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | Restricted-role RLS on payload-integrity stack |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | Provider worker/keyring on integrity stack |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | Payload-operation referential integrity |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | Database-engine evaluation plan (plan only) |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | Durable encrypted PostgreSQL payload store |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | Actor-scoped customer workflow queue |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | Encrypted provider-payload boundary |

Relevant current-head job logs were inspected for each open PR (fresh-clone or integrated gate); no failing job was returned. #398's previous queued state is superseded: its six current-head checks have now all completed successfully.

### Newly completed provider runtime registry validation

PR #398 current head `7317acf156a3bce5da03b14052391aed44745ddc`:

- Fresh clone [41878295166](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41878295166): 1,522 tests / 1,518 passed / 0 failed / 4 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`.
- Seven migration groups, including identity, applied and repeatability checks passed.
- Disposable PostgreSQL 16 backup/restore: `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; 80 source/restored base tables; seven migration ledgers.
- Provider lifecycle [41878295173](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41878295173) passed its queue, worker, host, wake-listener, notification, keyring and payload-integrity test groups.
- PostgreSQL/payment integration [41878295161](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41878295161), 228/38 matrix [41878295162](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41878295162) and controlled QA [41878295169](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41878295169) completed successfully.
- The log contains intentional negative-test constraint/RLS/rollback errors; corresponding test assertions passed. They are not CI failures.

The registry correction now requires exact provider/adapter/version/capability identity and parks deterministic missing/unapproved adapter errors as `NEEDS_ATTENTION`, not transient retries. It remains process-local and is **not** yet wired into an independently hosted worker composition root. Secret resolution and concrete storage/scanner drivers remain outstanding.

### Seven-pointer disposition — unchanged baseline

1. **v34-to-228 reconciliation — AMBER.** Preserve all 45 v34 source rows and original statements/acceptance criteria. Current crosswalk: 0 exact full matches, 45 partial shared-control links, 45 additive draft candidates. Owner disposition remains required. Approved 228 requirements / 38 chapters are unchanged.
2. **Fresh-clone developer setup — GREEN for local/CI.** #306 merge verified. Current asset/provider child heads run `npm run dev:verify`; second-engineer handover is not yet demonstrated.
3. **PostgreSQL durability — AMBER.** Seven migration groups including identity, repeatability, live PostgreSQL and disposable restore are evidenced. CI restore is not production disaster-recovery certification; off-host backup, key custody, retention, RPO/RTO and independent recovery rehearsal remain.
4. **Identity/OIDC/sessions — AMBER.** #310 and successor browser/session PRs are merged. Browser routes, secure cookies, CSRF, durable sessions/revocation and tenant/application assignment checks have synthetic-IdP E2E evidence. Production IdP onboarding, production JWKS/key rotation and operator credential lifecycle remain unproven.
5. **Customer workspace/support — AMBER.** Ticket submission/history/replies, tenant/application/actor scope, admin triage/assignment/severity, internal-note visibility and CSV export are tested. SLA timers, breach monitoring/escalation and complete asset binary/UI journey remain.
6. **Scheduler/workflow operations — AMBER.** Continuous worker components, leases/fencing, idempotency, retries, dead-letter and recovery/replay have test evidence. Independent production supervision, approved dispatcher, metrics/alerts and recovery rehearsal remain.
7. **Release/continuity — RED.** Rulesets collection is empty; branch-protection endpoint could not be read (403). The charter is proposed/owner-review-required. Production recovery and second-engineer release/rollback path remain unproven.

No PR was merged. No branch was deleted or force-updated. No repository settings were changed. No chargeable cloud resources or real external/provider actions were invoked. This is engineering evidence only; it does not confer production or business acceptance.


## Operating refresh — 2026-11-05 00:30 IST

### Dynamically resolved mainline and repository controls

- Current `main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- Direct commit check-runs: 13/13 completed successfully on this exact SHA. Relevant exact-main evidence: integrated validation [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913), 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818), G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648), EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771).
- Integrated PostgreSQL result: 1,410 tests / 1,404 passed / 0 failed / 6 skipped. Requirements pilot: 228 requirements / 38 chapters, 259 passed / 0 failed; 28 HTTP checks passed. G9: 5/5.
- The live main-branch endpoint explicitly reports `protected=false`, `protection.enabled=false`, and required-check enforcement `off`. The repository rulesets endpoint returns an empty collection. This is now direct evidence, not an inference from the earlier 403 response.
- PR #306 is closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; PR #310 is closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Both merge commits are ancestors of current main (main is 653 commits ahead / 0 behind each).

### Live open-PR inventory and exact-head evidence

The live open-PR search returned 17 PRs. The exact current head for each was read from PR metadata; the linked runs below were queried by that exact SHA and their relevant job logs inspected. All applicable runs on the 16 unchanged heads completed successfully. #377's listed head is its pre-refresh head; this scorecard update creates a new head and invalidates those prior checks for the new file content.

| PR | Exact head at refresh | Relevant exact-head evidence |
|---|---|---|
| #377 | `0c26671e612c2114517b8f5e871bd3a25b9fdb53` | [Integrated 41885296952](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41885296952), [matrix 41885297015](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41885297015), [G9 41885297541](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41885297541) — PASS on the pre-refresh head |
| #398 | `f85a7676a12d9ba9a003de6603c34f86460fa2c4` | [Fresh clone 41893090407](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090407), [provider lifecycle 41893090220](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090220), [PostgreSQL 41893090275](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090275), [matrix 41893089871](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893089871), [QA 41893089988](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893089988) — PASS |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | [Integrated 41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419), [fresh clone 41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369) — PASS |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | [Browser E2E 41868477503](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477503), [fresh clone 41868477584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477584) — PASS |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | [Fresh clone 41871265755](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265755), [provider lifecycle 41871265677](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265677) — PASS |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | [Fresh clone 41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886), [integrated 41786048948](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048948) — PASS |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | [Fresh clone 41869040234](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040234), [provider lifecycle 41869040134](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040134) — PASS |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | [Matrix 41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125), [integrated 41764308133](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308133) — PASS |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | [Matrix 41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774), [integrated 41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674) — PASS |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | [Fresh clone 41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258), [browser E2E 41837639329](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639329) — PASS |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | [Fresh clone 41820073308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073308), [provider lifecycle 41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247) — PASS |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | [Fresh clone 41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500), [provider lifecycle 41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478) — PASS |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | [Fresh clone 41805934645](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934645), [integrated 41805934725](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934725) — PASS |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | [CI 41795128689](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128689), [integrated 41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802) — PASS; evaluation plan only |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | [Fresh clone 41738351740](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351740), [PostgreSQL 41738351604](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351604) — PASS |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | [Fresh clone 41784823307](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823307), [browser E2E 41784823265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823265) — PASS |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | [Fresh clone 41738299068](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299068), [provider lifecycle 41738299039](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299039) — PASS |

### New provider-worker composition delivery on #398

PR #398's latest head `f85a7676a12d9ba9a003de6603c34f86460fa2c4` adds `provider-runtime-worker-composition.ts` and `provider-runtime-worker-composition.test.mjs`. The factory routes the provider worker's dispatch dependency through the exact allowlisted runtime registry. Tests prove exact provider/adapter/version/capability selection, idempotency/correlation propagation, and fail-closed parking when the registry is empty.

Fresh-clone [41893090407](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090407): 1,525 tests / 1,521 passed / 0 failed / 4 skipped. `npm run dev:verify` applied and repeated payments, audit, workflows, campaign-scheduler, capabilities, ticketing and identity migration groups. Disposable PostgreSQL 16 backup/restore reported `EPER_POSTGRES_BACKUP_RESTORE_SMOKE=PASS`; seven migration-ledger tables were present. Provider lifecycle [41893090220](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090220), PostgreSQL integration [41893090275](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090275) and matrix [41893089871](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893089871) passed on this exact head. The new composition does not resolve credentials or perform network/provider calls.

### Seven-pointer disposition and capability boundaries

1. **v34-to-228 reconciliation — AMBER.** Preserve 45 v34 source rows and original statements/acceptance criteria. Current crosswalk: 0 exact full-coverage matches, 45 partial shared-control links, 45 additive draft candidates. Owner disposition remains required. Approved 228 requirements / 38 chapters remain unchanged.
2. **Fresh-clone setup — GREEN for local/CI.** #306 merge is verified as an ancestor of main. Latest #398 fresh clone passes `npm run dev:verify`; independent second-engineer handover is not demonstrated.
3. **PostgreSQL durability — AMBER.** Seven migration groups including identity, repeatability, live PostgreSQL tests and disposable restore are evidenced. Production off-host backup, key custody/retention, approved RPO/RTO and independent restore rehearsal remain unproven.
4. **Identity/OIDC/sessions — AMBER.** #310 and browser/session successors are merged ancestors. Browser routes, secure cookies, CSRF, durable sessions/revocation and tenant/application assignment checks have synthetic-IdP browser evidence. Production IdP onboarding, production JWKS rotation and credential lifecycle remain unproven.
5. **Customer workspace/support — AMBER.** Mainline tests cover customer ticket creation/list/history/replies, trusted tenant/application/actor scope, admin triage/status/assignment, severity/P1 rationale, internal-only versus customer-visible replies, and filtered CSV export across pages. SLA response/resolution timers, breach detection and escalation have no implementation evidence. Customer asset binary upload/download and complete asset UI remain incomplete.
6. **Scheduler/workflow operations — AMBER.** Campaign scheduler has a separate worker entrypoint and PostgreSQL restart/fencing tests; workflow outbox has lease renewal, idempotency, retry/dead-letter/replay components; provider worker has a continuous host/wake-source component and queue fencing tests. A separately hosted provider-operation process, platform supervision/restart policy, approved production dispatcher, metrics/alerts and operational recovery rehearsal remain outstanding.
7. **Release/continuity — RED.** Main protection is explicitly disabled (`protected=false`, required-check enforcement `off`); rulesets collection is empty. The continuity charter remains proposed/owner-review-required. Production recovery and second-engineer clean-clone build/test/release/rollback are not evidenced.

No approved requirement or chapter was changed. No PR was merged, no branch was deleted or force-updated, no repository setting was changed, no chargeable cloud resource was provisioned and no real external/provider action was invoked by this refresh.


## Latest exact-head delivery refresh — 2026-11-05 01:10 IST

### Repository baseline

- Dynamically resolved `main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- Main check-runs: all 13 returned check-runs completed successfully on that exact SHA.
- Main branch metadata explicitly reports `protected=false` and required-status-check enforcement `off`; repository rulesets endpoint returns an empty collection.
- PR #306 merge SHA `6e8dd438e5091b1802d65e4f29951389fe077859` and PR #310 merge SHA `88b9708d748c19dc80a1a2d7ad4960914451db7e` are both verified ancestors of current main (compare: main is ahead, zero behind).

### Current open PR inventory

The live open-pull request query returned the following current heads. Exact-head check-run reads were performed for every row; all returned check-run `head_sha` values matched the listed SHA. Successful checks are not carried across head changes.

| PR | Exact head | Delivery focus |
|---|---|---|
| #399 | `a58a47303d2b6c54bbe9793afc8d3775fbfafc74` | Customer workspace upload UI and durable role authorization |
| #398 | `f85a7676a12d9ba9a003de6603c34f86460fa2c4` | Provider runtime registry and worker composition seam |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | Provider/asset integration stack |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | PostgreSQL customer asset download authorization |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | Independent exhausted-scan recovery |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | Tenant-isolated asset repository |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | Provider-neutral storage catalogue contract |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | Additive customer asset requirements |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | Customer asset and workflow-driven application UX requirements |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | Upload idempotency reservation |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | Restricted-role RLS on payload-integrity base |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | Provider worker/keyring on integrity/RLS base |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | Payload-operation referential integrity |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | Database engine evaluation plan |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | Durable encrypted PostgreSQL payload store |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | Actor-scoped customer work queue |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | Encrypted provider-payload boundary |
| #377 | `da9a55009f5338ad49f5fd0f012f21464947fd3b` | This scorecard |

All current open PR heads have completed relevant exact-head Actions. Where an integrated workflow skips its duplicate matrix lane, the separate matrix workflow passed on the same head. Relevant fresh-clone, PostgreSQL, provider-lifecycle, browser, matrix and integrated job logs were inspected. No failing exact-head check was returned. The #377 check-run set itself is 13 successful plus one duplicate matrix skip, with the separate exact-head matrix successful. Its comparison to current main is 47 ahead / 0 behind before this addendum; the new file commit below requires its own validation.

### New customer upload journey — PR #399

PR #399 is a stacked child of #393, based on exact #393 head `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e`; current PR head is `a58a47303d2b6c54bbe9793afc8d3775fbfafc74`. It remains draft and mergeable.

Delivered:
- Customer Client Assets workspace upload form for PNG/JPG/WEBP/GIF, MP4/MOV/WEBM, PDF, DOCX, PPTX and XLSX.
- Assigned-application selection, application-restricted/customer-shared scope, display name, transfer status and post-upload verification/scanning status.
- Short-lived upload capability transfer with browser credentials omitted, redirects rejected and no referrer.
- Server validates HTTPS, exact configured storage hostname, PUT/POST method, bounded expiry (maximum 15 minutes) and safe upload headers.
- Server rechecks current tenant/application role permission on metadata creation, upload-grant issuance and completion; session-bound CSRF is required for all browser mutations in PostgreSQL identity mode.
- New `customer.asset.upload` permission is available in durable workflow role definitions and role-assignment checks. OIDC session labels are not authorization.

Exact-head evidence:
- Fresh-clone [41898030981](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030981): `npm run dev:verify`; 1,517 tests / 1,513 passed / 0 failed / 4 skipped; all seven PostgreSQL migration groups including identity applied and repeated; disposable PostgreSQL backup/restore smoke PASS, source/restored base-table counts 80/80.
- Browser [41898030812](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030812): 1/1 customer OIDC workspace/support/logout/revocation browser scenario passed. The same job log includes durable upload API tests for metadata, grant and verification with CSRF and role allow/deny.
- Matrix [41898030900](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030900): 259 pilot tests passed / 0 failed; 28 HTTP checks passed.
- PostgreSQL payment integration [41898030614](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030614) and payment contracts [41898030660](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030660): successful.

Boundary: the upload API/UI is tested with injected synthetic storage/verification adapters. The current API composition root does not yet supply concrete `assetUploadPort`, `assetUploadVerificationPort` or `assetMalwareScanPort` implementations. No production storage driver or malware scanner is added; no live binary upload was exercised. Pending uploads remain unavailable until object verification and a clean scan. PR #399 must follow #393 in the stack.

### Provider runtime composition — PR #398

Current exact head: `f85a7676a12d9ba9a003de6603c34f86460fa2c4`.

The branch adds `provider-runtime-worker-composition.ts`. The factory requires an explicit runtime registry and routes dispatch through exact provider key, adapter key, semantic version and capability. It preserves idempotency/correlation data. An empty registry parks work as `NEEDS_ATTENTION` without consuming retry attempts. It does not discover adapters, resolve credentials, load SDKs or perform external actions.

Exact-head evidence:
- Fresh clone [41893090407](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090407): 1,525 tests / 1,521 passed / 0 failed / 4 skipped; `npm run dev:verify`; all seven migration groups including identity; disposable PostgreSQL 16 backup/restore PASS with 80/80 base tables.
- Provider lifecycle [41893090220](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090220), PostgreSQL integration [41893090275](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090275) and matrix [41893089871](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893089871): successful on this exact head.
- PR #398 remains draft. An independently hosted provider process, real storage/scanner drivers, secret resolution, process supervision, metrics/alerts and recovery rehearsal remain outstanding.

### Seven-pointer disposition

1. **v34-to-228 — AMBER.** Preserve the approved 228 requirements and 38 chapters. The crosswalk still has 45 v34 source candidates, 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition remains required; no automatic baseline expansion.
2. **Fresh-clone setup — GREEN for local/CI.** #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`, verified ancestor of main. Current #399/#398 fresh-clone evidence includes `npm run dev:verify`, seven migration groups and disposable restore. A second engineer has not independently completed handover.
3. **PostgreSQL durability — AMBER.** Seven groups including identity, migration repeatability, live PostgreSQL integration and disposable backup/restore are evidenced. Production off-host backup, key custody/retention, approved RPO/RTO and independent restore rehearsal remain unproven.
4. **Identity/OIDC/sessions — AMBER.** #310 merge `88b9708d748c19dc80a1a2d7ad4960914451db7e` is a verified main ancestor. Browser routes, secure cookies, CSRF, durable sessions/revocation and tenant/application role/assignment checks have synthetic-IdP browser evidence. Production IdP onboarding, production JWKS rotation and credential lifecycle remain unproven.
5. **Customer workspace/support — AMBER, improved by #399.** Customer upload form and API journey are implemented and synthetic-adapter tested; server rechecks role and CSRF. Concrete storage upload/verification/scanner drivers and actual binary-transfer E2E remain. Existing ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note visibility and export tests remain. SLA timers, breach detection and escalation are not evidenced.
6. **Scheduler/workflow operations — AMBER.** Leases/fencing, idempotency, retry/dead-letter/recovery and provider registry/worker composition tests exist. Independent provider-worker host, production dispatcher approval, supervision/restart, metrics/alerts and operational recovery rehearsal remain.
7. **Release/continuity — RED.** Main metadata explicitly reports `protected=false` and required-check enforcement `off`; repository rulesets collection is empty. Production restore, key custody/RPO/RTO and second-engineer build/test/release/rollback remain unproven. The continuity charter remains proposed / owner review required.

No approved requirement or chapter was changed. No PR was merged, no branch was deleted or force-updated, no repository setting was changed, no chargeable cloud resource was provisioned and no real external/provider action was invoked by this refresh.


## Dated operating refresh — 2026-11-05 06:07 IST

### Dynamically resolved mainline and exact evidence

- Current `main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree `0c01985a303e9348e728acd04b0a55a80020f9a9`.
- Direct commit check-run query: 13/13 completed successfully; every returned check-run `head_sha` equals the main SHA.
- Same-commit integrated validation [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913): PostgreSQL suite 1,410 tests / 1,404 passed / 0 failed / 6 skipped.
- 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818): 228 requirements, 38 chapters, 259 pilot tests passed / 0 failed; 28 HTTP checks passed.
- G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648): 5/5 passed. EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771): success.
- Main branch metadata reports `protected=false`, `protection.enabled=false`, required-check enforcement `off`; repository rulesets endpoint returns an empty collection.

### Merged foundation verification

The following merge commits were re-read from PR metadata and compared against current main. Each is an ancestor of main (zero commits behind):

- PR #306 fresh-clone setup: `6e8dd438e5091b1802d65e4f29951389fe077859`.
- PR #310 durable identity/OIDC foundation: `88b9708d748c19dc80a1a2d7ad4960914451db7e`.
- PR #324 browser-bound OIDC transaction guards: `a554990cb7f4969bb218aad7a2e9944aec62fa05`.
- PR #329 customer workspace browser sessions: `82a82d92222c613c02e55f01211ecbb32ce63bba`.
- PR #337 durable identity/CSRF enforcement: `18315e1654b52f1546936a8fd28daed907cab31e`.
- PR #376 consolidated customer/admin/workflow/provider foundations: `9749701bfed527b906183192ca06cc1998e70166`.

### Live open-PR inventory and exact-head Actions

The live query returned 18 open PRs. For each row, the selected Actions run was queried using that PR's current head SHA; the workflow-run detail endpoint independently returned the same `head_sha`, completed with `success`. Relevant job steps/logs were inspected. No failed exact-head run was returned. The listed run is a representative primary lane, not a claim that it is the only workflow for that PR.

| PR | Exact current head | Exact-head run |
|---|---|---|
| #399 | `a58a47303d2b6c54bbe9793afc8d3775fbfafc74` | [Fresh clone 41898030981](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030981) |
| #377 | `8763ebaed81b273ca09532af3ab2b76ae8ca2c5a` | [Integrated 41899757646](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41899757646) |
| #398 | `f85a7676a12d9ba9a003de6603c34f86460fa2c4` | [Provider lifecycle 41893090220](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41893090220) |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | [Integrated 41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419) |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | [PostgreSQL 41868477557](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477557) |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | [Provider lifecycle 41871265677](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265677) |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | [Fresh clone 41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886) |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | [Provider lifecycle 41869040134](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040134) |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | [Integrated 41764308133](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308133) |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | [Integrated 41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674) |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | [Fresh clone 41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258) |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | [Provider lifecycle 41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247) |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | [Provider lifecycle 41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478) |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | [Integrated 41805934725](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934725) |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | [Integrated 41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802) |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | [Provider lifecycle 41738351657](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351657) |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | [Integrated 41784823525](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823525) |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | [Provider lifecycle 41738299039](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299039) |

Live comparisons of all 18 heads against current main report zero commits behind. The asset stack remains #384 → #386 → #393, with #394/#395/#396/#398/#399 as dependent or parallel descendants. The provider stack remains #378 → #379 → #390 → #391 → #392. Do not merge a child independently of its required base.

The prior scorecard snapshot recorded #377's head before its latest update; the live head at the start of this refresh was `8763ebaed81b273ca09532af3ab2b76ae8ca2c5a`. This addendum records that pre-refresh head rather than embedding a self-referential commit SHA. The new file commit must receive its own exact-head checks.

### Fresh-clone and PostgreSQL evidence

On #399 exact head `a58a47303d2b6c54bbe9793afc8d3775fbfafc74`, fresh-clone [41898030981](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030981) reports 1,517 tests / 1,513 passed / 0 failed / 4 skipped; `npm run dev:verify` passed; all seven migration groups including identity applied and repeatability passed; disposable PostgreSQL 16 backup/restore passed with 80/80 source/restored base tables and seven migration ledgers. The job log's expected negative RLS, immutable-ledger and injected-failure cases are covered by passing assertions; they are not workflow failures.

This is local/CI disposable restore evidence, not production recovery certification. Off-host backup, encryption/key custody, retention, recovery objectives and an independent restore rehearsal remain.

### Seven-pointer disposition

1. **v34-to-228 reconciliation — AMBER.** Preserve 45 original v34 source rows and their statements/acceptance criteria. Crosswalk remains 0 exact full-coverage matches, 45 partial shared-control links and 45 additive draft candidates. Owner disposition remains required; approved 228 requirements / 38 chapters are unchanged.
2. **Fresh-clone setup — GREEN for local/CI.** #306 merge is verified above. #399's exact-head fresh-clone command and PostgreSQL restore pass. Independent second-engineer handover remains unproven.
3. **PostgreSQL durability — AMBER.** Seven migration groups including identity, repeatability, live PostgreSQL integration and disposable restore are evidenced. Production recovery controls remain outstanding.
4. **Identity/OIDC/sessions — AMBER.** #310 and its browser/session successors are merged ancestors of main. Protocol validation, browser routes, secure cookies, CSRF, durable sessions/revocation and tenant/application assignment checks have synthetic-IdP browser evidence. Production IdP onboarding, JWKS rotation and operator credential lifecycle remain unproven.
5. **Customer workspace/support — AMBER.** Customer ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note visibility and export have test evidence. SLA timers/breach escalation are not evidenced. #399 adds the customer asset upload UI and API contract, but actual binary transfer remains unproven.
6. **Scheduler/workflow operations — AMBER.** Continuous worker/process logic, lease/fencing, idempotency, retries, dead-letter and recovery tests exist. Main `eper/package.json` has no standalone workflow-outbox worker start command; independent workflow-outbox process launch, restricted worker identity, supervision, metrics/alerts and approved dispatch remain outstanding.
7. **Release/continuity — RED.** Main protection is disabled and repository rulesets are empty. The continuity charter remains proposed / owner review required. Independent production restore and second-engineer build/test/release/rollback are not evidenced.

### Customer asset and workflow composition blockers

PR #399's current `eper/apps/api/main.ts` creates the PostgreSQL customer asset repository and upload authorizer, then calls `createAppServer` without supplying concrete `assetUploadPort`, `assetUploadVerificationPort`, `assetMalwareScanPort` or download storage port. Its tests use synthetic adapters. Therefore the upload form/API contract is not yet evidence of real binary transfer, provider-observed object verification, malware scanning or clean-scan-gated download. Keep #399 draft until a local provider-neutral adapter is wired and the complete bytes-to-clean-scan-to-download journey is tested.

The workflow outbox has a continuous process class and runtime composition, but the current main package scripts expose no independently launchable workflow-outbox worker entrypoint. Add a dedicated restricted-context executable and supervision/health/metrics contract before describing workflow outbox as independently operable.

No approved requirement or chapter was changed. No PR was merged, no branch was deleted or force-updated, no repository setting was changed, no chargeable cloud resource was provisioned and no real external/provider action was invoked by this refresh.


## Dated operating refresh — 2026-11-05 08:04 IST

This refresh supersedes the 06:07 IST inventory. Main and every PR head were resolved dynamically; PR #400 is the new workflow-outbox worker increment. All SHA/run claims below refer to exact heads, not stale runs.

### Mainline and merged foundations

- Current `main`: `2c380d79c55c9183a42ed534ffd1a504f7d41316`; tree `0c01985a303e9348e728acd04b0a55a80020f9a9`. The latest-commit query was repeated at the end of this refresh; main remained unchanged.
- Direct GitHub check-run endpoint returned 13 check-runs, all `completed/success`, all with `head_sha` equal to current main. The combined commit-status endpoint returned no status contexts; use the check-run endpoint for this evidence.
- Main integrated [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913): PostgreSQL suite 1,410 tests / 1,404 passed / 0 failed / 6 skipped.
- Main 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818): 228 requirements, 38 chapters, 259 pilot tests passed / 0 failed; 28 HTTP checks passed. G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648): 5/5 passed.
- PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; comparing that merge SHA to current main reports 653 commits ahead, 0 behind.
- PR #310 is merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; comparing that merge SHA to current main reports 652 commits ahead, 0 behind. Its protocol foundation is not by itself proof of production IdP onboarding.

### Current open-PR inventory and exact-head Actions

The live open-PR query returned 19 draft PRs. Each representative workflow below was retrieved by the PR's current exact head SHA; all listed heads compare to current main with zero commits behind. PR #400 has a full exact-head check-run query with all 18 returned check-runs carrying the same current head SHA.

| PR | Current exact head | Representative exact-head run |
|---|---|---|
| #400 | `5b59a997d9ee484a5fb6bbea44e64d41961fc4b1` | [Integrated 41959003189](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003189) |
| #399 | `a58a47303d2b6c54bbe9793afc8d3775fbfafc74` | [Fresh clone 41898030981](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030981) |
| #398 | `d8f0ad73dd4ea2b37a1d6802251d50ecfe1c916c` | [Fresh clone 41960471681](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471681) |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | [Fresh clone 41871265755](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265755) |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | [Fresh clone 41869040234](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040234) |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | [Fresh clone 41868477584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477584) |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | [Integrated 41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419) |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | [Provider lifecycle 41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478) |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | [Provider lifecycle 41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247) |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | [Integrated 41805934725](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934725) |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | [Integrated 41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802) |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | [Integrated 41784823525](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823525) |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | [Fresh clone 41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258) |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | [Integrated 41764308133](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308133) |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | [Fresh clone 41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886) |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | [Integrated 41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674) |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | [Integrated 41738351629](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351629) |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | [Integrated 41738299062](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299062) |
| #377 | `8698d31488efa47a8c5b618fb60593457d8407a9` | [Integrated 41959466430](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959466430) |

The #398 current head has both fresh-clone [41956096246](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41956096246) and provider lifecycle [41956096308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41956096308) completed successfully. Its fresh-clone log reports 1,539 tests / 1,535 passed / 0 failed / 4 skipped, disposable restore 80/80 base tables and seven migration ledgers.

### New workflow-outbox worker increment — PR #400

- PR: [#400 — independent workflow outbox worker](https://github.com/sbannai/enterprise-product-engineering/pull/400), draft, unmerged.
- Exact current head: `a66ff2eecbcdf1377751bef3e026055c5016e924`, 12 commits ahead of current main, 0 behind.
- Direct check-run query: 18 check-runs, 17 success and one skipped duplicate matrix job; all 18 `head_sha` values equal the current PR head.
- Initial head `2d492218a78941c8a93ebc96d7df452b74e53580a` failed TypeScript because the CommonJS `pg` Pool constructor was imported as an ESM value. Exact job log inspected; corrected with `createRequire`.
- Next head `74248e155c192e3b62e5fc3d7df452b74e53580a` failed because `pg.Pool` did not structurally satisfy `AuditSqlPool`; exact job log inspected; a narrow query/result adapter was added. Both failed heads are superseded and are not counted as evidence for the current head.
- Current exact-head fresh clone [41957403725](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403725): `npm run dev:verify` PASS; 1,434 tests / 1,430 passed / 0 failed / 4 skipped; the seven migration-group repeatability test passed; disposable PostgreSQL backup/restore PASS, 75/75 source/restored base tables and seven migration ledgers.
- Current exact-head PostgreSQL integration [41957403762](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403762): 1,418 tests / 1,412 passed / 0 failed / 6 skipped.
- Controlled QA [41957403719](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403719): 1,410 tests / 1,374 passed / 0 failed / 36 skipped. New worker configuration, dispatcher approval, denied-dispatch dead-letter and worker tests passed.
- CI [41957403772](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403772), provider lifecycle [41957403815](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403815), container [41957403748](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403748), release build [41957403781](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403781), six-family HTTP [41957403831](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403831), G9 [41957403753](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403753), requirements matrix [41957403707](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403707) and same-commit integrated gate [41957403840](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41957403840) passed.
- Delivered in the PR: standalone `start:workflow-outbox-worker`; explicit opt-in; dedicated database URL/role assertion; checks for non-superuser/no-BYPASSRLS, RLS on outbox tables, non-ownership and required read/update grants; dispatcher module path confinement; per-event approval before dispatch; immediate dead-letter for denied approval; structured pass/error logs; bounded settings and graceful SIGINT/SIGTERM shutdown.
- Remaining proof: the live startup gate has not yet been exercised against a provisioned dedicated workflow-outbox login; no approved dispatcher module is bundled; external process supervisor, health endpoint/metrics sink, alert routing, backlog/dead-letter dashboards and independent restart/recovery rehearsal remain. This is an executable foundation, not a production-operability declaration.

### Seven-pointer disposition

| Pointer | Status | Evidence and remaining boundary |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | Preserve 45 original v34 rows. Crosswalk remains 0 exact full-coverage, 45 partial shared-control links and 45 additive draft candidates. Owner disposition required; approved 228/38 baseline unchanged. |
| 2. Fresh-clone developer setup | GREEN local/CI | #306 merge verified; current #400 `dev:verify` and disposable restore pass. Independent second-engineer handover not demonstrated. |
| 3. PostgreSQL migrations/integration/recovery | GREEN local/CI; AMBER operations | Seven groups, repeatability, live PostgreSQL and disposable restore evidenced. Off-host backup, encryption/key custody, retention, RPO/RTO and independent restore rehearsal remain. |
| 4. Identity/OIDC/sessions | AMBER | #310 and browser/session successors are merged ancestors. Synthetic-IdP browser evidence covers routes, secure cookies, CSRF, durable sessions/revocation and tenant/application assignment. Production IdP onboarding/JWKS rotation, operator credential lifecycle and support-admin OIDC/delegation remain. |
| 5. Customer workspace/support | AMBER | Ticket submission/history/replies, tenant/application scope, admin triage/assignment/severity, internal-note visibility and export have tests. SLA timers/breach escalation remain. #399 still lacks concrete binary upload/verification/scanning/storage/download adapters in the API composition root. |
| 6. Scheduler/workflow operations | AMBER | #400 makes the workflow outbox independently launchable and exact-head CI passes. The live restricted-role gate, approved deployment dispatcher, external supervision, health/metrics/alerts and restart/recovery rehearsal remain. |
| 7. Release controls/continuity | RED | Main remains unprotected and rulesets are empty. The charter remains proposed/owner review required. Production recovery and second-engineer release/rollback path remain unproven. |

### Asset composition blocker retained

On #399 exact head `a58a47303d2b6c54bbe9793afc8d3775fbfafc74`, `eper/apps/api/main.ts` creates the PostgreSQL customer asset repository and upload authorizer but does not provide concrete upload, verification, malware-scan, storage or download-resolver ports to the server composition. Keep #399 draft until the complete real-bytes → verification → scan → clean-status → authorized-download path is wired and tested.

### Release and continuity controls

Current main branch metadata reports `protected=false`, required status checks off, and the repository rulesets endpoint returns an empty collection. The charter remains proposed and requires owner review. No branch-protection setting was changed.

No approved requirement or chapter was changed. No PR was merged, no branch was deleted or force-updated, no chargeable cloud resource was provisioned and no real external/provider action was triggered by this refresh.


## Exact-head correction — 2026-11-05

This correction supersedes the #398 and #400 rows and the earlier #400 validation block above. Main was resolved again; it remains `2c380d79c55c9183a42ed534ffd1a504f7d41316`. The main-commit check-run endpoint still returns 13 completed successes, all for that exact SHA.

### PR #398 — provider runtime registry

- Current exact head: `f3acd3123041530c3968249f42114625027674f8`; 230 commits ahead of main, 0 behind.
- Six exact-head workflows completed successfully: fresh clone [41958996554](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996554), controlled QA [41958996528](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996528), PostgreSQL integration [41958996599](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996599), provider lifecycle [41958996584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996584), requirements matrix [41958996496](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996496) and controlled technical simulation [41958996891](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996891).
- Fresh-clone log: 1,546 tests / 1,542 passed / 0 failed / 4 skipped; `npm run dev:verify` PASS; seven migration groups repeated; disposable restore 80/80 base tables and seven migration ledgers.
- Runtime composition still does not start from API `main.ts`; production secret manager, credential/key custody, concrete approved provider adapters, lifecycle supervision and operational observability remain absent. Provider dispatch remains disabled.

### PR #400 — independent workflow outbox worker

- Current exact head: `5b59a997d9ee484a5fb6bbea44e64d41961fc4b1`; 28 commits ahead of main, 0 behind; draft and unmerged.
- Direct check-run query returned 19 check-runs: 18 success, one skipped duplicate matrix job, 0 failures. Every check-run `head_sha` equals the current PR head.
- Fresh clone [41959003074](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003074): `npm run dev:verify` PASS; 1,436 tests / 1,431 passed / 0 failed / 5 skipped; all seven migration groups applied and repeated; disposable backup/restore PASS, 75/75 source/restored base tables and seven migration ledgers.
- PostgreSQL integration [41959003045](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003045) PASS. It applied `015_workflow_outbox_worker_access.sql`, provisioned a disposable login with membership in the NOLOGIN group, and ran the live `assertRestrictedWorkerDatabaseRole` gate: 1 test / 1 passed / 0 failed / 0 skipped.
- Same-commit integrated gate [41959003189](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003189), CI [41959003230](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003230), G9 [41959003114](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003114), requirements matrix [41959003425](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003425), provider lifecycle [41959003043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003043), container [41959003431](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003431), release build [41959003221](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003221), six-family HTTP [41959003062](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003062), payment gateway [41959003316](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003316), controlled QA [41959003380](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003380), controlled technical simulation [41959003402](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003402) and workflow configuration [41959003115](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003115) all passed.
- The migration creates `eper_workflow_outbox_worker_access` as NOLOGIN/NOSUPERUSER/NOBYPASSRLS and grants SELECT on tenant/application assignments and outbox records plus column-scoped UPDATE on the delivery projection only. The disposable login test proves the startup gate checks exact `current_user`, non-superuser/no-BYPASSRLS, ENABLE+FORCE RLS, non-ownership, required column grants, no table-wide UPDATE, and no INSERT/DELETE/TRUNCATE or elevated-role inheritance.
- The worker command is independently launchable and disabled by default. It requires a deployment-bundled dispatcher with per-event durable approval; denied events are dead-lettered immediately. No concrete production dispatcher is bundled. External process supervision, health endpoint/metrics sink, alert routing, backlog/dead-letter monitoring and independent restart/recovery rehearsal remain unproven. This is a validated worker foundation, not a production-operability declaration.

### Current open-PR inventory correction

The live open-PR query still returns 19 draft PRs. Exact heads for #398, #400 and #377 changed since the preceding inventory; the other 16 heads remain as listed above. Current compare results: #398 230 ahead / 0 behind; #400 28 ahead / 0 behind; resolve #377 head/compare dynamically from PR metadata (self-reference). The current scorecard branch itself remains draft and unmerged.

### Seven-pointer status after this correction

| Pointer | Status | Current boundary |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | 45 source rows retained; 0 exact full-coverage, 45 partial links, 45 additive draft candidates; owner disposition pending; approved 228/38 unchanged. |
| 2. Fresh-clone setup | GREEN local/CI | #306 merge is an ancestor of main; #400 current exact-head fresh-clone and restore pass. Independent second-engineer handover remains. |
| 3. PostgreSQL durability | GREEN local/CI; AMBER operations | Seven groups and repeatability, live PostgreSQL, disposable restore and live restricted worker-role gate pass. Off-host backup, retention, key custody, RPO/RTO and independent restore rehearsal remain. |
| 4. Identity/OIDC | AMBER | #310 and browser/session successors are merged ancestors; synthetic-IdP browser proof remains. Production IdP onboarding/JWKS rotation, operator credential lifecycle and support-admin OIDC/delegation remain. |
| 5. Customer workspace/support | AMBER | Ticket journey, tenant/application scope, admin triage/assignment/severity, internal-note visibility and export are tested. SLA automation remains absent; #399 still lacks concrete asset upload/verification/scanning/storage/download ports in the API composition root. |
| 6. Scheduler/workflow operations | AMBER | Independent outbox executable, restricted role group, live role gate, approval boundary, leases/fencing, retries/dead-letter and structured pass counters are validated. Concrete dispatcher, process supervisor, health/metrics/alerts and independent recovery rehearsal remain. |
| 7. Release/continuity | RED | Main is still unprotected; rulesets are empty; second-engineer release/rollback and production recovery are not demonstrated. |

No approved requirement or chapter changed. No PR was merged, no branch was deleted or force-updated, no chargeable cloud resource was provisioned and no real external/provider action was triggered by this refresh.


## Dated operating update — 2026-11-05 08:32 IST

**Current main SHA:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Tree SHA:** `0c01985a303e9348e728acd04b0a55a80020f9a9`  
**Mainline evidence:** 13/13 check-runs completed successfully on this exact SHA; 8/8 push-triggered workflow runs completed successfully on this exact SHA. No current-main test result is inferred from a PR head.  
**Approved baseline:** 228 requirements across 38 chapters; unchanged.

- Main integrated validation: [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913)
- Main requirements matrix: [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818)
- Main G9: [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648)
- Main CI: [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771)

### Merged foundation verification

The live PR metadata reports #306 and #310 closed/merged. Their merge commits are ancestors of current main:

| PR | Merge SHA | Delivered foundation |
|---|---|---|
| #306 | `6e8dd438e5091b1802d65e4f29951389fe077859` | Reproducible local developer setup, PostgreSQL bootstrap, migration repeatability and disposable backup/restore |
| #310 | `88b9708d748c19dc80a1a2d7ad4960914451db7e` | Durable identity/session store and provider-neutral OIDC protocol foundation |
| #324 | `a554990cb7f4969bb218aad7a2e9944aec62fa05` | Browser-bound OIDC transaction guards |
| #329 | `82a82d92222c613c02e55f01211ecbb32ce63bba` | OIDC browser sessions for customer support journey |
| #337 | `18315e1654b52f1546936a8fd28daed907cab31e` | Durable OIDC identity and CSRF enforcement |
| #376 | `9749701bfed527b906183192ca06cc1998e70166` | Customer-admin, workflow and provider-connection foundation integration |

Each merge SHA was compared with current main; the merge commit is the comparison base and current main is ahead with zero commits behind.

### Current open-PR inventory — exact heads resolved for this update

All entries below were returned by the live open-PR query, then individually re-read through PR metadata. Each exact head was queried for Actions runs and compared with current main; every listed comparison is ahead/0-behind. The representative run is associated with the listed exact head. Relevant primary job logs were inspected. No failed exact-head workflow was found. PRs remain draft/unmerged.

| PR | Current exact head | Representative exact-head workflow |
|---|---|---|
| #400 | `c445691f27a06ee36b590f374d5f7ddc6a8ab119` | [Fresh clone 41960896718](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896718); [PostgreSQL 41960896927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896927); [Integrated 41960896797](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896797) |
| #398 | `d8f0ad73dd4ea2b37a1d6802251d50ecfe1c916c` | [Fresh clone 41960471681](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471681); [Provider lifecycle 41960471550](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471550); [PostgreSQL 41960471564](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471564) |
| #377 | Self-reference — resolve the current head from PR metadata; exact-head validation is maintained in the PR description to avoid a changing SHA in its own file |
| #399 | `a58a47303d2b6c54bbe9793afc8d3775fbfafc74` | [Fresh clone 41898030981](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030981); [Browser 41898030812](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030812) |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | [Fresh clone 41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369) |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | [Fresh clone 41868477584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477584) |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | [Fresh clone 41871265755](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265755) |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | [Fresh clone 41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886) |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | [Fresh clone 41869040234](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040234) |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | [PostgreSQL/integrated 41764308133](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308133) |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | [PostgreSQL/integrated 41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674) |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | [Fresh clone 41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258) |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | [Fresh clone 41820073308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073308) |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | [Fresh clone 41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500) |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | [Fresh clone 41805934645](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934645) |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | [PostgreSQL/integrated 41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802) |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | [Fresh clone 41738351740](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351740) |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | [Fresh clone 41784823307](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823307) |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | [Fresh clone 41738299068](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299068) |

### New delivery: independently launchable workflow outbox worker — PR #400

PR [#400](https://github.com/sbannai/enterprise-product-engineering/pull/400) current head is `5b59a997d9ee484a5fb6bbea44e64d41961fc4b1`, ahead of current main with zero behind. All 14 workflow runs returned for this exact head completed successfully, including CI, fresh-clone, PostgreSQL integration, provider lifecycle, requirements matrix, G9, HTTP smoke, container smoke, release build, configuration validation and same-commit integrated validation.

Exact-head evidence:

- Fresh-clone [41959003074](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003074): `npm run dev:verify` PASS; 1,436 tests / 1,431 passed / 0 failed / 5 skipped; all seven PostgreSQL migration groups including identity applied and repeatability passed; disposable PostgreSQL 16 backup/restore PASS with 75/75 source/restored base tables.
- PostgreSQL integration [41959003045](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003045): migration `015_workflow_outbox_worker_access.sql` applied; CI provisioned a separate ephemeral `eper_workflow_outbox_worker_runtime` LOGIN and granted the NOLOGIN privilege group. The worker-specific live restricted-role test passed 1/1 with zero failures and zero skips; the same PostgreSQL job's broader privileged-role contract/operations suites also passed. This is disposable CI evidence, not a production login deployment.
- Provider operation lifecycle [41959003043](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003043): PASS.
- Same-commit integrated gate [41959003189](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003189): PASS.
- Requirements matrix [41959003425](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003425): PASS.
- G9 [41959003114](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41959003114): PASS.

Delivered in #400: `start:workflow-outbox-worker` and a standalone process entrypoint; explicit opt-in; PostgreSQL-only dedicated login; startup verification of current_user, non-superuser/no-BYPASSRLS, no elevated or owner membership, ENABLE/FORCE RLS, non-ownership and least-privilege table/column grants; confined dispatcher-module loading; per-event durable approval check; immediate dead-letter for denied approval; bounded runtime settings; structured pass/error counters; SIGINT/SIGTERM shutdown. The worker calls the existing continuous outbox runtime and does not rely on an API timer.

Remaining operational boundary: no approved dispatcher module is supplied or enabled; no real provider dispatch is performed; production DBA login/secret provisioning is not demonstrated; external supervisor, health/metrics sink, alert routing, backlog/dead-letter dashboards and independent restart/recovery rehearsal remain. PR #400 stays draft and unmerged pending owner review and operational handover.

### Provider runtime successor — PR #398

Current exact head `f3acd3123041530c3968249f42114625027674f8`; all six exact-head workflows completed successfully. Fresh-clone [41958996554](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996554): 1,546 tests / 1,542 passed / 0 failed / 4 skipped; `dev:verify` PASS; disposable restore PASS with 80/80 source/restored base tables. Provider lifecycle [41958996584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41958996584) PASS. Runtime composition/credential-scope checks are present, but API process activation, concrete production secret manager, approved executable adapter/allowlist, external supervisor and operational metrics remain absent. No provider action is enabled.

### Customer asset boundary — PR #399

Current exact head `a58a47303d2b6c54bbe9793afc8d3775fbfafc74`. Fresh-clone [41898030981](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030981): 1,517 tests / 1,513 passed / 0 failed / 4 skipped; `dev:verify` PASS; disposable restore 80/80. Browser [41898030812](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41898030812): synthetic-IdP customer OIDC/workspace/support/logout and admin browser checks passed. These tests use synthetic storage/verification adapters. The API composition still does not supply concrete upload, provider-observed verification, malware-scan, storage and download-resolver implementations; actual binary upload-to-authorized-download remains unproven.

### Requirements and seven-pointer disposition

The current main crosswalk preserves all 45 v34 source rows and acceptance criteria: 0 exact full-coverage matches, 45 partial shared-control links, 45 additive draft candidates, 4 approval overlaps, and 0 changes to the approved 228 requirements / 38 chapters. Owner disposition of additive candidates remains pending.

| Pointer | Status | Current evidence and boundary |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | Technical crosswalk preserved; no fabricated exact chapter mappings. Owner disposition required for additive candidates; baseline unchanged. |
| 2. Fresh-clone developer setup | GREEN local/CI | #306 merge verified; current #400 `dev:verify` and disposable restore pass. Independent second-engineer handover not witnessed. |
| 3. PostgreSQL migrations/integration/recovery | GREEN local/CI; AMBER operations | Seven groups including identity, repeatability, live PostgreSQL tests and disposable restore evidenced. Off-host backup, encryption/key custody, retention, RPO/RTO and independent restore rehearsal remain. |
| 4. Customer identity/OIDC | AMBER | #310 and browser/session successors #324/#329/#337 are merged ancestors. Synthetic-IdP browser E2E covers secure cookies, CSRF, durable session/revocation and tenant/application assignment. Production IdP onboarding, real-provider JWKS/key rotation and operational credential lifecycle remain. |
| 5. Customer workspace/support | AMBER | Ticket submission/history/replies, tenant/application scoping, admin triage/assignment/severity, internal-note visibility and export have test evidence. SLA deadline/breach/escalation automation remains; actual binary asset lifecycle remains incomplete. |
| 6. Scheduler/workflow operations | AMBER | Campaign worker remains independently startable; #400 adds independently launchable workflow outbox worker and exact-head tests for continuous runtime, lease/fencing, retries/dead-letter, approval gate and shutdown. Production dispatcher, supervision, health/metrics/alerts and independent recovery rehearsal remain. |
| 7. Release/continuity | RED | Direct main-branch metadata reports `protected=false`, `protection.enabled=false`, and required-status-check enforcement `off`; the repository rulesets endpoint returns an empty collection. The continuity charter remains proposed/owner review required; second-engineer release/rollback path is not evidenced. |

No approved requirement/chapter changed. No PR was merged or closed. No branch was deleted or force-updated. No chargeable cloud resource, deployment or real external/provider action was used. No UAT authorization is made by this scorecard.

**Scorecard self-reference:** Resolve the current #377 head and compare dynamically from PR metadata; do not pin this file's own changing SHA. The preceding head `10afc8b091ada3d2400a32ba3e3d54b773234e14` had 14 exact-head check-runs (13 success, one skipped duplicate matrix), 259 pilot tests and 28 checks passed, G9 5/5, and successful CI/integrated/HTTP/container/release lanes. This file update creates a new head; its exact-head validation is recorded in the PR description after the new head's own workflows complete. The scorecard remains draft and is not part of main.


## Latest exact-head correction — provider runtime contract PR #398

Current #398 head: `d8f0ad73dd4ea2b37a1d6802251d50ecfe1c916c`, 231 commits ahead of main and 0 behind. The only change since the preceding exact-head snapshot is the added provider runtime process contract document. All six workflows on this exact head passed.

- Fresh clone [41960471681](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471681): 1,547 tests / 1,543 passed / 0 failed / 4 skipped; `npm run dev:verify` PASS; disposable restore 80/80 base tables and seven migration ledgers.
- PostgreSQL integration [41960471564](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471564): 1,418 tests / 1,412 passed / 0 failed / 6 skipped.
- Provider lifecycle [41960471550](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471550), requirements matrix [41960471694](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471694), controlled QA [41960471676](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471676) and controlled technical simulation [41960471591](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471591) passed.
- The added document defines a process contract only; it does not supply a production secret manager, credential resolver or provider dispatcher. PR remains draft.


## Security hardening follow-up — 2026-11-05

PR #400 current exact head: `c445691f27a06ee36b590f374d5f7ddc6a8ab119`; current main remains `2c380d79c55c9183a42ed534ffd1a504f7d41316`; compare is ahead/0-behind. All 14 exact-head workflow runs completed successfully.

The worker context-discovery grant was narrowed with additive workflow migration `016_workflow_outbox_assignment_column_grants.sql`: revoke table-wide SELECT from `eper_workflow_outbox_worker_access`, then grant only `tenant_id`, `application_id` and `assignment_status`. The live startup role gate now requires those three column reads, rejects table-wide SELECT and rejects reads of assignment version, actor IDs and lifecycle timestamps. This preserves the worker's active-scope discovery while reducing unnecessary cross-tenant metadata exposure.

- Fresh-clone [41960896718](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896718): `npm run dev:verify` PASS; 1,437 tests / 1,432 passed / 0 failed / 5 skipped; migration contract test passed; disposable PostgreSQL 16 restore PASS, 75/75 source/restored base tables.
- PostgreSQL integration [41960896927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896927): workflow migrations 015 and 016 applied; ephemeral dedicated worker login provisioned; live restricted-role contract passed.
- Same-commit integrated validation [41960896797](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896797): PASS.
- CI [41960896932](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896932), requirements matrix [41960896943](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896943), G9 [41960896979](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896979), provider lifecycle [41960896826](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896826), six-family HTTP [41960896658](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896658), container smoke [41960896816](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896816), release build [41960896651](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896651), workflow configuration [41960896840](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896840) and payment contract [41960896962](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896962): PASS.

The worker still requires a separately provisioned production login and an owner-approved dispatcher module; no dispatcher module is present in the repository. External supervisor, health/metrics/alerts and independent restart/recovery rehearsal remain. This is CI-only, not production deployment.


## Provider runtime process-contract follow-up — 2026-11-05

PR #398 current exact head: `d8f0ad73dd4ea2b37a1d6802251d50ecfe1c916c`; current main remains `2c380d79c55c9183a42ed534ffd1a504f7d41316`; compare is ahead/0-behind. All six exact-head workflow runs completed successfully.

New document: `eper/docs/PROVIDER_RUNTIME_PROCESS_CONTRACT.md`. It explicitly defines the production startup, static adapter provenance/allowlist, server-side secret custody, durable scoped persistence, wake-listener ordering, readiness/liveness separation, bounded telemetry, signal-driven shutdown, lease recovery and release-evidence gates. It keeps the provider runtime disabled until concrete production secret manager/key custody, statically reviewed adapters, dedicated grants/RLS, process supervisor, health/metrics/alerts, process-level shutdown/recovery tests and second-engineer/owner release evidence exist.

- Fresh-clone [41960471681](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471681): `npm run dev:verify` PASS; 1,546 tests / 1,542 passed / 0 failed / 4 skipped; disposable restore 80/80 base tables; seven migration ledgers.
- Provider lifecycle [41960471550](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471550): queue-wake 1/1, keyring 6/6, encrypted payload-store 2/2; zero failures.
- PostgreSQL integration [41960471564](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471564): PASS.
- Requirements matrix [41960471694](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960471694): PASS.

The process contract is design/implementation-gate documentation, not production enablement. No provider dispatch, production credentials, deployment or cloud provisioning is enabled. PR #398 remains draft/unmerged.


## Exact-head refresh — 2026-11-05 (after PR head movement)

This is a dated evidence snapshot, not a replacement for dynamic resolution. On every subsequent review, resolve `refs/heads/main` and each open `refs/pull/<number>/head` first, then query Actions using the returned SHA. The earlier PR #398 head `d8f0ad73dd4ea2b37a1d6802251d50ecfe1c916c` and PR #399 head `a58a47303d2b6c54bbe9793afc8d3775fbfafc74` recorded above were superseded during this review; their earlier green runs are not evidence for the new heads.

- Main resolved at `2c380d79c55c9183a42ed534ffd1a504f7d41316`; unchanged during this review.
- PR #398 live head: `c2de2c035ab5376f94094f37f4825ce4175a9513` (compare: 0 behind main). Exact-head provider lifecycle [41962395345](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395345), fresh-clone [41962395373](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395373), PostgreSQL integration [41962395311](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395311), and 228/38 matrix [41962395343](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395343) passed. Fresh-clone: 1,546 tests / 1,542 passed / 0 failed / 4 skipped; `npm run dev:verify` PASS; disposable restore PASS with 80 source/restored base tables and seven migration ledgers. Provider lifecycle logs: worker 8/8, host 9/9, queue-wake 3/3, PostgreSQL NOTIFY 1/1, keyring 6/6, encrypted payload store 2/2. The branch adds an explicit adapter registry, scoped credential-resolution boundary, inert composition root and event-driven worker host. Production secret-manager/key custody, concrete approved adapters, production worker-role deployment, a separate process entrypoint/supervisor, readiness/liveness, production telemetry/alerts and independent restart/recovery evidence remain absent. No provider dispatch is enabled.
- PR #399 live head: `743b1759d16844b2fc804c57a19a2c9abd6b90d6` (compare: 0 behind main). Exact-head fresh-clone [41962787493](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962787493), browser [41962787550](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962787550), PostgreSQL integration [41962787575](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962787575), and 228/38 matrix [41962787676](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962787676) passed. Fresh-clone: 1,518 tests / 1,514 passed / 0 failed / 4 skipped; `npm run dev:verify` PASS; disposable restore PASS with 80 source/restored base tables and seven migration ledgers. Browser E2E passed the PostgreSQL-backed synthetic-IdP customer workspace/support/logout journey; Product Admin browser check also passed. The new scan-worker test confirms an infected result is recorded as infected, never retried as a clean candidate and never marked clean.
- PR #399 remains incomplete for real binary transfer. Its API composition root supplies the PostgreSQL asset repository and upload authorizer but does not supply concrete `assetUploadPort`, `assetUploadVerificationPort`, `assetMalwareScanPort`, `assetStoragePort` or `assetDownloadResolver`. The scanner worker still requires a host-provided scanner module. Current tests prove injected/synthetic adapter contracts, not an actual customer file upload, provider-observed object verification, malware scan and authorized download. Keep the branch draft until that lifecycle is integrated and exercised with real file bytes in a disposable local adapter.
- These are exact-head CI and local PostgreSQL results only. They do not establish a production provider, storage, scanner, supervisor or release operation. No cloud resource or external/provider action was used.

## Dynamic exact-head operating update — 2026-11-05 10:12 IST

This is a time-bounded evidence snapshot. On every subsequent run, resolve `refs/heads/main` and every current `refs/pull/<number>/head` before querying Actions. Do not reuse a head or run from an earlier snapshot.

### Mainline resolution and current-main checks

- Current main SHA: `2c380d79c55c9183a42ed534ffd1a504f7d41316`.
- Commit date: 2026-11-03 16:36:07 UTC; commit message: `revert: remove unintended provider payload test commit from main`. Main has not advanced since this commit.
- The exact-main push set returned eight successful workflow runs. Key technical evidence: EPER CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771), same-commit integrated validation [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913), 228/38 matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818), G9 [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648), six-family HTTP [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652), container smoke [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533), and controlled QA [41675875702](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875702).
- Integrated main test job: 1,410 tests; 1,404 passed, 0 failed, 6 skipped. The 228/38 matrix reports 228 requirements across 38 chapters and 228 automated pilot classifications, with no failed chapters. G9 reconciliation is 5/5.
- The matrix explicitly classifies itself as an automated pilot, not business acceptance or production evidence. Do not promote pending requirements to final closure.
- Repository metadata currently reports `main.protected=false`; the repository rulesets endpoint returns an empty collection. Required branch protection and status-check enforcement are therefore not active. No repository setting was changed.

### Merged setup and identity foundations

- PR #306 is closed/merged at `6e8dd438e5091b1802d65e4f29951389fe077859`. The merge commit is an ancestor of current main. It is not open.
- PR #310 is closed/merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. The merge commit is an ancestor of current main. It delivered the durable identity/session foundation, not the whole production login lifecycle.
- Browser/session successors are also merged ancestors: #324 `a554990cb7f4969bb218aad7a2e9944aec62fa05`, #329 `82a82d92222c613c02e55f01211ecbb32ce63bba`, #337 `18315e1654b52f1546936a8fd28daed907cab31e`, and consolidation #376 `9749701bfed527b906183192ca06cc1998e70166`.
- These successors add browser transaction guards, durable OIDC customer workspace/support access, CSRF/session enforcement and customer-admin/workflow/provider foundations. Browser tests use a synthetic identity provider; production IdP onboarding, metadata/JWKS lifecycle, key rotation and operational credential custody remain separate gates.

### Current open PR inventory — dynamically resolved snapshot

Every row below was resolved from current PR metadata. Each listed representative Actions run belongs to the exact head SHA shown in the row. The other returned exact-head workflows for that PR also completed successfully; no failed or pending exact-head workflow was returned. Every listed PR remains draft. Branch bases intentionally form feature stacks; merge only after dependency review.

| PR | Current exact head | Base branch | Representative exact-head Actions |
|---|---|---|---|
| #400 | `c445691f27a06ee36b590f374d5f7ddc6a8ab119` | main | [Fresh clone 41960896718](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896718); [PostgreSQL 41960896927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896927); [integrated 41960896797](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896797) |
| #399 | `46ce7442ef5c1ed7f7cfc4852125069d90aab59f` | integration/asset-provider-stack-validation | [Fresh clone 41967430984](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41967430984); [PostgreSQL 41967430999](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41967430999); [browser 41967430987](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41967430987) |
| #398 | `c2de2c035ab5376f94094f37f4825ce4175a9513` | integration/asset-provider-stack-validation | [Provider lifecycle 41962395345](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395345); [fresh clone 41962395373](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395373); [PostgreSQL 41962395311](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395311) |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | fix/postgres-customer-asset-download-authorization | [Provider lifecycle 41871265677](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265677) |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | integration/asset-provider-stack-validation | [Fresh clone 41869040234](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040234) |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | integration/asset-provider-stack-validation | [Browser 41868477503](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477503) |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | fix/customer-asset-upload-idempotency | [Integrated 41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419) |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | fix/provider-rls-integrity-stack | [Provider lifecycle 41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478) |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | fix/provider-payload-operation-integrity | [Provider lifecycle 41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247) |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | feat/postgres-encrypted-provider-payload-store | [PostgreSQL 41805934647](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934647) |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | main | [Integrated 41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802) |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | main | [Browser 41784823265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823265) |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | feat/customer-asset-repository-foundation | [Fresh clone 41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258) |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | main | [Integrated 41764308133](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308133) |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | main | [Fresh clone 41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886) |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | main | [Integrated 41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674) |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | feat/provider-payload-encryption-boundary | [Provider lifecycle 41738351657](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351657) |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | main | [Provider lifecycle 41738299039](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299039) |

PR #377 is this scorecard branch. Its pre-update head was `1a623d74b824a6d8c05031e7b9fe8fe6afd2c231`; that head's nine returned exact-head workflows passed, but this documentation update creates a new head. Re-resolve PR #377 and validate the new exact head; do not reuse those prior runs as evidence for the new commit.

### Fresh-clone and PostgreSQL evidence

- Main contains `npm run dev:verify` and the seven ordered migration groups: payments, audit, capabilities, ticketing, campaign scheduler, workflows and identity. The developer verification test asserts application and repeatability of all seven groups.
- PR #400 exact-head fresh-clone [41960896718](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896718): 1,437 tests / 1,432 passed / 0 failed / 5 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; disposable PostgreSQL 16 backup/restore PASS; 75 source/restored base tables and seven migration ledgers.
- PR #400 PostgreSQL [41960896927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896927): migrations 015 and 016 applied; ephemeral dedicated worker login satisfied the live restricted-role gate (1/1). The worker can discover only tenant, application and active-assignment columns; table-wide SELECT and unrelated assignment metadata are denied.
- PR #399 exact-head fresh-clone [41967430984](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41967430984): 1,520 tests / 1,516 passed / 0 failed / 4 skipped; all seven migration groups repeated; disposable restore PASS; 80 source/restored base tables and seven migration ledgers.
- PR #399 exact-head PostgreSQL [41967430999](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41967430999): the scheduler pause/dispatch fence race and bounded idempotency tests passed; the full PostgreSQL integration job completed successfully.
- PR #398 exact-head fresh-clone [41962395373](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395373): 1,546 tests / 1,542 passed / 0 failed / 4 skipped; `dev:verify` and disposable restore PASS; 80 source/restored base tables and seven migration ledgers.
- These exact-head PR checks descend from current main; they are not a fresh-clone run on the exact main SHA. Current-main integrated validation is green, but a fresh-clone workflow record for the exact main SHA was not returned in the current push-run set.

### Identity, customer workspace and support

- Durable customer identity/session foundation #310 and browser/session successors #324/#329/#337 are merged ancestors. The current browser test on #399 exact head passed the PostgreSQL-backed synthetic-IdP customer workspace/support/logout journey (1/1); Product Admin browser remediation also passed (1/1).
- Current customer support tests cover trusted tenant/actor derivation; application assignment; customer ticket creation, listing, history and replies; idempotency; tenant/application denial; admin queue, triage, status and assignment; severity/P1 rationale; internal-versus-customer-visible replies; and CSV export with formula-cell neutralization. PostgreSQL store tests verify internal notes are filtered at the SQL boundary and customers cannot create internal notes.
- SLA deadline calculation, breach detection, escalation scheduling and SLA reporting remain unproven; do not infer them from ticket severity or status.
- PR #399 adds customer asset upload UI, CSRF and durable application-role checks, idempotent upload reservation, scan-result validation and PostgreSQL-authorized download metadata. Its `main.ts` composition still does not supply concrete `assetUploadPort`, `assetUploadVerificationPort`, `assetMalwareScanPort`, `assetStoragePort` or `assetDownloadResolver`. The browser tests use synthetic/injected adapters and do not upload actual file bytes through storage, provider-observed verification, malware scanning and authorized download. The complete binary asset lifecycle is therefore NOT delivered.

### Scheduler, workflow and provider runtime

- Current main campaign scheduler has an independent `start:campaign-worker` entrypoint. Tests cover asynchronous claimed execution, tenant scope, idempotency, bounded retries, lease renewal/loss, cancellation, atomic dispatch fencing and PostgreSQL restart recovery. The worker entrypoint is opt-in, requires PostgreSQL audit, a worker identity and deployment-owned adapter path.
- PR #400 adds `start:workflow-outbox-worker` and a dedicated process entrypoint. Exact-head tests cover continuous scope draining, lease renewal/fencing, idempotency, bounded retries/dead-letter, graceful SIGINT/SIGTERM, restricted PostgreSQL role and immediate parking of unapproved dispatch. The dispatcher module must be explicitly supplied from the deployment-owned dispatcher directory; no production dispatcher module is supplied in the repository.
- Worker stdout has bounded lifecycle/pass counters and safe error codes. External supervision, readiness/liveness integration, metrics sink, alert thresholds, restart policy and independent recovery rehearsal remain.
- PR #398 adds a fail-closed provider adapter registry, transient credential-resolution boundary, inert composition root and event-driven worker host. Its lifecycle tests pass (worker 8/8, host 9/9, queue wake 3/3, PostgreSQL NOTIFY 1/1, keyring 6/6, encrypted payload store 2/2). Production secret-manager/key custody, concrete approved adapters, deployment-owned dispatcher, separate process supervisor and operational telemetry remain.
- PR #389 is an evaluation plan only. PostgreSQL remains the control candidate; MySQL 8.4 LTS and MongoDB are comparison candidates. No engine replacement, migration or cutover decision is authorized or evidenced. PostgreSQL CI failures must first be classified by root cause, not treated as an automatic engine decision.

### Seven-pointer disposition and continuity

| Pointer | Assessment | Evidence and remaining boundary |
|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | 45 source rows preserved; 0 exact full-coverage matches; 45 partial shared-control links; 45 additive v1.6.0 draft candidates; 4 approval overlaps; 0 changes to approved 228 requirements / 38 chapters. Owner disposition remains pending. |
| 2. Fresh-clone developer setup | GREEN local/CI | #306 merged; `dev:verify`, all seven migration groups and repeatability, live PostgreSQL checks and disposable restore pass on current-main descendant PR heads. Exact-main fresh-clone run and independent second-engineer handover remain unrecorded. |
| 3. PostgreSQL durability | GREEN local/CI; AMBER operations | Migration repeatability, identity group, live PostgreSQL role/integration tests and disposable restore pass. Off-host backup, encryption/key custody, retention, RPO/RTO and independent restore rehearsal remain. |
| 4. Customer identity/OIDC | AMBER | Durable sessions, browser routes, secure cookies, CSRF, tenant/application assignment and synthetic-provider browser E2E pass. Real IdP onboarding/JWKS/key rotation and production credential operations remain. |
| 5. Customer workspace/support | AMBER | Ticket lifecycle/admin/export and browser workspace journey have evidence. SLA automation and actual binary asset lifecycle remain incomplete. |
| 6. Scheduler/workflow operations | AMBER | Campaign worker recovery and workflow outbox worker executable/lease/fencing/retry/dead-letter/approval boundaries have CI evidence. Production dispatcher, supervisor, health/metrics/alerts and recovery rehearsal remain. |
| 7. Release/continuity | RED | Main is unprotected and no rulesets are configured. The continuity charter is proposed and requires owner review. Off-host recovery, tested runbooks and a second-engineer release/rollback path are not demonstrated. |

No approved requirement or chapter was changed. No chargeable cloud resource, production deployment, production credential or real external/provider action was used. No merge or branch deletion was performed in this update.

**Next concrete work:** complete the local binary asset adapter and real-bytes upload/verify/scan/download test; then finish the workflow outbox worker's deployment-owned dispatcher contract, external supervision, health/metrics/alerts and restart/recovery evidence. In parallel, obtain owner disposition for the v1.6.0 additive candidates and owner approval for repository protection and the continuity charter.


## Dated operating update — 2026-11-05 10:44 IST

**Dynamically resolved main SHA:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`  
**Assessment standard:** this scorecard and the Engineering Continuity & Independence Charter.  
**Approved baseline:** 228 requirements across 38 chapters; no approved requirement or chapter was changed.

### Exact-main evidence

All 13 check-runs returned for the exact main SHA completed successfully and each `head_sha` equals main:

- Integrated same-commit gate [41675875913](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875913): all applicable technical lanes passed on one commit.
- CI [41675875771](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875771): success.
- Requirements matrix [41675875818](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875818): 228 requirements / 38 chapters; 259 pilot tests passed, 0 failed; 28 HTTP checks passed; no failed chapters.
- G9 reconciliation [41675875648](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875648): 5/5 passed.
- Six-family HTTP [41675875652](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875652), container smoke [41675875533](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41675875533), release artifact and payment/PostgreSQL lanes: success.
- PostgreSQL/payment integration log: 1,410 tests / 1,404 passed / 0 failed / 6 skipped.

PR #306 is merged as `6e8dd438e5091b1802d65e4f29951389fe077859`; comparison confirms it is an ancestor of current main (653 commits ahead, 0 behind). PR #310 is merged as `88b9708d748c19dc80a1a2d7ad4960914451db7e` and is also an ancestor of current main. These merge SHAs were resolved from live PR metadata.

**Fresh-clone qualification:** no fresh-clone workflow record was returned for the exact main SHA. The current-main descendant PR runs below prove reproducible fresh-clone behavior on those exact PR heads, not on main itself.

### Seven-checkpoint assessment

| Checkpoint | Status | Delivered capability and exact evidence | Blocker | Next action |
|---|---|---|---|---|
| 1. Product USP and positioning | AMBER | v34 source reconciliation preserves 45 source rows; 45 partial shared-control links and 45 additive v1.6.0 draft candidates are recorded. Four approval-control overlaps are identified. Approved 228/38 baseline is unchanged. | No exact full-coverage match is claimed; owner disposition of additive scope is pending. | Obtain owner disposition for each additive candidate and preserve the source crosswalk. |
| 2. CI and persistence foundations | GREEN local/CI; AMBER exact-main handover | Current main's 13 exact-head checks pass. PR #399 head `26200efb1e36e7b9072b85297be080f340276325` fresh-clone [41973096321](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096321): 1,520 tests / 1,516 passed / 0 failed / 4 skipped; `npm run dev:verify`, all seven migration groups including identity, repeatability and disposable PostgreSQL backup/restore pass; 80/80 source/restored base tables and seven migration ledgers. | No fresh-clone result on the exact main SHA; off-host backup, retention, key custody, recovery objectives and independent restore rehearsal are not evidenced. | Run the documented clean-clone command set against the exact main SHA and complete an independent restore rehearsal. |
| 3. Architecture and execution boundaries | AMBER | Tenant/application assignment, least-privilege PostgreSQL roles, RLS and customer browser session boundaries have exact-head tests. PR #399 browser [41973096281](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096281) passes the synthetic-IdP customer workspace/support/logout journey (1/1). | Production IdP onboarding/key lifecycle and concrete storage/scanner adapters remain absent; actual binary transfer is not demonstrated. | Wire a disposable local storage/verification/scanner adapter through the real composition root and exercise real bytes end to end. |
| 4. Workflow execution design and schema | AMBER | PR #400 exact-head PostgreSQL/fresh-clone tests verify the independent outbox worker entrypoint, restricted worker role, active assignment discovery, lease renewal/fencing, idempotency, bounded retry/dead-letter and shutdown. Provider stack PR #392 verifies operation-backed payload v2 key rotation and fail-closed key retirement. | No deployment-owned approved dispatcher module is supplied; independent process supervision, readiness/liveness, metrics sink, alerts and recovery rehearsal remain. | Complete the approved dispatcher contract and a separately supervised local worker recovery drill. |
| 5. Integrated validation | GREEN for checked technical scope | Exact-main integrated gate, CI, matrix, G9, six-family HTTP, container and release checks pass. Matrix is 259/0 with 28 HTTP checks; G9 is 5/5. | The exact-main fresh-clone gap and incomplete end-to-end asset journey remain. | Extend exact-main clean-clone and customer binary lifecycle coverage without broadening approved scope. |
| 6. PR consolidation and governance | RED for repository controls; AMBER for stack traceability | Every current open PR was re-resolved from live metadata and its returned check-runs were checked against its exact head. Stacked base relationships were compared; no unexplained orphan base branch was found. All listed PRs remain drafts. | Main reports `protected=false`; the repository rulesets endpoint is empty. The continuity charter remains proposed and requires owner review. | Obtain owner approval for required checks/rulesets, then apply and verify the controls in a separately reviewed change. |
| 7. Workflow publisher/runtime implementation | AMBER | PR #400 supplies a separate `start:workflow-outbox-worker` process, not an API timer. Exact-head tests cover dedicated database identity, scoped claims, lease fencing, idempotent event delivery, retry/dead-letter and graceful shutdown. | No bundled/approved production dispatcher, external supervisor, operational telemetry/alerts, deployment configuration or second-engineer recovery proof. | Add a deployment-owned approved dispatcher and demonstrate restart, lease recovery and observable backlog/dead-letter behavior. |

### Live open-PR inventory — exact current heads

Every row below was re-read from live PR metadata. Exact-head check-runs were queried by commit and their `head_sha` values matched the listed commit. Duplicate integrated-matrix jobs reported as `skipped` are not counted as failures; a separate matrix job passed where listed.

| PR | Exact head | Base branch | Exact-head Actions evidence |
|---|---|---|---|
| #399 | `26200efb1e36e7b9072b85297be080f340276325` | `integration/asset-provider-stack-validation` | 7/7 success; fresh clone [41973096321](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096321), browser [41973096281](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096281). |
| #377 | `a60de969deb5582dcbea84f7ba5dbf773dc945a7` | `main` | 13 success plus one skipped duplicate matrix record; integrated [41970527423](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41970527423), matrix [41970527424](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41970527424), G9 [41970527430](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41970527430). |
| #398 | `c2de2c035ab5376f94094f37f4825ce4175a9513` | `integration/asset-provider-stack-validation` | 6/6 success; fresh clone [41962395373](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395373), provider lifecycle [41962395345](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395345). |
| #400 | `c445691f27a06ee36b590f374d5f7ddc6a8ab119` | `main` | 18 success plus one skipped duplicate matrix record; fresh clone [41960896718](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896718), PostgreSQL [41960896927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896927), provider lifecycle [41960896826](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896826), integrated [41960896797](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896797). |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | `fix/customer-asset-upload-idempotency` | 12 success plus one skipped duplicate matrix record; fresh clone [41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369), provider lifecycle [41844357288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357288). |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | `integration/asset-provider-stack-validation` | 7/7 success; browser [41868477503](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477503), fresh clone [41868477584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477584). |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | `fix/postgres-customer-asset-download-authorization` | 7/7 success; fresh clone [41871265755](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265755), provider lifecycle [41871265677](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265677). |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | `main` | 18 success plus one skipped duplicate matrix record; fresh clone [41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886), browser [41786049023](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786049023). |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | `integration/asset-provider-stack-validation` | 6/6 success; fresh clone [41869040234](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040234), provider lifecycle [41869040134](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040134). |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | `main` | 13 success plus one skipped duplicate matrix record; matrix [41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125), G9 [41764308165](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308165). |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | `main` | 13 success plus one skipped duplicate matrix record; integrated [41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674), matrix [41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774). |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | `feat/customer-asset-repository-foundation` | 8/8 success; fresh clone [41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258), browser [41837639329](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639329), PostgreSQL [41837639319](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639319). |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | `fix/provider-payload-operation-integrity` | 5/5 success; fresh clone [41820073308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073308), provider lifecycle [41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247). |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | `fix/provider-rls-integrity-stack` | 7/7 success; fresh clone [41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500), provider lifecycle [41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478). |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | `feat/postgres-encrypted-provider-payload-store` | 12 success plus one skipped duplicate matrix record; PostgreSQL [41805934647](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934647), fresh clone [41805934645](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934645). |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | `main` | 13 success plus one skipped duplicate matrix record; integrated [41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802). This is an engine evaluation plan, not an engine change. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | `feat/provider-payload-encryption-boundary` | 12 success plus one skipped duplicate matrix record; fresh clone [41738351740](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351740), provider lifecycle [41738351657](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351657). |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | `main` | 17 success plus one skipped duplicate matrix record; browser [41784823265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823265), integrated [41784823525](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823525). |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | `main` | 17 success plus one skipped duplicate matrix record; provider lifecycle [41738299039](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299039). |

### Exact-head failure correction

PR #399's superseded head `f5216d137fdf20411d1dc03b125ec301e73b97e` had one browser E2E failure: the test submitted the ticket before the asynchronously loaded assigned-application selector had become enabled and selected, producing an empty application path. The exact job log showed no request failure or page error; the request was `/customer/applications//tickets`. The owning branch was corrected to wait for an enabled, selected application before filling/submitting the ticket. New head `26200efb1e36e7b9072b85297be080f340276325` was rerun; all seven exact-head checks passed, including browser and fresh-clone. The prior failed run is superseded and is not evidence for the new head.

### Customer workspace and support boundaries

- Durable customer identity/session foundation #310 and successor browser/session changes are merged ancestors. Current synthetic-IdP browser evidence passes; this is not a real IdP onboarding/key-rotation demonstration.
- Customer support tests cover submission, history, replies, tenant/application scope, admin triage/assignment/severity, internal-note separation and export. SLA deadline calculation, breach detection, escalation scheduling and SLA reporting remain unproven.
- The asset UI and API metadata/session/scan/download authorization layers are present across the current stack, but the production composition root still lacks concrete upload, upload-verification, malware-scan and storage/download adapters. No actual customer bytes have been shown to complete upload, provider-observed verification, scan, clean-state publication and authorized download.

### Provider runtime and continuity boundaries

- Provider worker/host tests cover bounded recovery, scoped payload access, fencing, wake/reconnect, shutdown, safe failure codes and PostgreSQL payload integrity. PR #392 additionally passes operation-backed v2 key rotation and fails closed when a still-referenced key is removed.
- No production secret-manager/key custody, concrete approved provider adapter, deployment-owned dispatcher, independent process supervisor, readiness/liveness, metrics sink, alert routing or operational recovery rehearsal is evidenced.
- Main is explicitly unprotected (`protected=false`) and the repository rulesets endpoint is empty. The continuity charter remains proposed and requires owner review. Off-host backup retention, encryption/key custody, recovery objectives and second-engineer release/rollback demonstration remain outstanding.
- No chargeable cloud resource, production credential or real external/provider action was used in this assessment.

**Owners:** Repository owner for approval-controlled repository settings and requirements disposition; engineering team for code/runtime closure. A named independent second engineer and completed handover are not yet evidenced.


## Open-PR inventory delta — 2026-11-05 10:46 IST

A new open draft PR was created after the 10:44 inventory snapshot:

- PR #401 — [PostgreSQL capacity validation plan](https://github.com/sbannai/enterprise-product-engineering/pull/401)
- Exact head: `f1f901836e28d62dd82cbdce0c33d19487703353`.
- Base: `integration/asset-provider-stack-validation` at `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e`; compare to current main confirms 167 ahead / 0 behind.
- Exact-head check-runs: 3/3 success, all `head_sha` values match. Controlled QA [41973770308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973770308) reports 1,485 tests / 1,445 passed / 0 failed / 40 skipped; matrix [41973770234](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973770234) reports 259 passed / 0 failed and 28 HTTP checks; controlled technical simulation [41973770179](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973770179) reports 74 passed / 0 failed.
- This is a documentation-only plan. No load harness was run, no pool or runtime configuration changed, and PostgreSQL throughput/concurrency/latency capacity remains NOT MEASURED. The next action is a synthetic workload harness against disposable local PostgreSQL 16, with raw metrics and repeatable stages.

The 10:44 table remains a timestamped snapshot; this delta is the current additional open-PR record. Resolve all future inventories from live GitHub metadata.


## PostgreSQL capacity harness safety follow-up — 2026-11-05 10:49 IST

The current live head of PR #401 is now `66ed1df3d37d5eae0c56c65835e8b44580800283`, superseding the earlier documentation-only `f1f901836e28d62dd82cbdce0c33d19487703353` and initial harness `95db48643e2a4048f723ba0d7e4f285786416237` snapshots. Its base remains `integration/asset-provider-stack-validation` at `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e`; compare to main is 170 ahead / 0 behind.

The PR now includes `npm run bench:postgres-api`, a read-only closed-loop API route probe, plus nine fail-closed tests. Review found that PostgreSQL URI query parameters could otherwise override the host after the initial URL hostname check. The current implementation rejects all database URI query/fragment options, non-PostgreSQL schemes, non-loopback DB/API hosts, non-`_bench` DB names, API URL userinfo, protocol-relative/backslash/control-character paths, health-only routes, write methods and out-of-range concurrency. The tests verify those refusal paths and that credentials/host strings are not printed.

All seven exact-head check-runs match `66ed1df3d37d5eae0c56c65835e8b44580800283` and passed:

- Fresh clone [41975138961](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975138961): 1,519 tests / 1,515 passed / 0 failed / 4 skipped; `npm run dev:verify` PASS; seven migration groups including identity, repeatability and disposable backup/restore PASS; 80/80 source/restored base tables.
- PostgreSQL integration [41975138727](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975138727): all logged test groups passed.
- Provider lifecycle [41975138693](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975138693): queue 1/1, worker 7/7, host 5/5, wake/reconnect 3/3, PostgreSQL NOTIFY 1/1, keyring 6/6 and payload referential integrity 2/2 passed.
- Controlled QA [41975138801](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975138801): 1,495 tests / 1,455 passed / 0 failed / 40 skipped.
- Matrix [41975138703](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975138703): 259 passed / 0 failed, 28 HTTP checks, no failed chapters.
- Payment contract [41975138808](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975138808) and controlled technical simulation [41975138785](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975138785): success.

The harness has not been run against a live local EPER API and disposable PostgreSQL database. It measures a selected read-only API route, not PostgreSQL alone, and it cannot independently prove that the API uses the same database URL. Therefore throughput, concurrency ceiling, p50/p95/p99, saturation and capacity remain NOT MEASURED. Next action: operator-run synthetic workload on a disposable loopback database and read-only local route, retaining raw metrics. No shared/staging/production database, chargeable cloud resource, production credential or external/provider action was used.


## Dated operating update — 2026-11-05 live exact-head audit

**Dynamically resolved main SHA:** `2c380d79c55c9183a42ed534ffd1a504f7d41316`.  
**Approved baseline:** 228 requirements across Chapters 463–500 (38 chapters); unchanged.  
**Open PR inventory:** 20 open PRs, all draft at this audit. Every exact-head run below was queried by the live head SHA. No PR was merged, no branch was deleted, and no external/provider action or chargeable cloud resource was triggered.

### Mainline and merged foundations

- PR #306 is merged at `6e8dd438e5091b1802d65e4f29951389fe077859`; a live compare confirms it is an ancestor of current main (653 commits ahead, 0 behind). Main contains `npm run dev:verify`, the seven ordered migration groups (payments, audit, workflows, campaign scheduler, capabilities, ticketing, identity), and a repeatability loop across all seven.
- PR #310 is merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`; a live compare confirms it is an ancestor of current main (652 commits ahead, 0 behind).
- The last exact-main evidence recorded in this scorecard at 10:44 IST was 13/13 successful check-runs for `2c380d79c55c9183a42ed534ffd1a504f7d41316`. The current combined-status lookup returned no status contexts, so this audit does not claim a newer mainline workflow result or substitute PR runs for a mainline run.
- Current main's latest commit is a deliberate revert of an unintended provider-payload test change. Its diff removes `eper/tests/postgres-encrypted-provider-payload-store.integration.test.mjs`; the corresponding payload-store and integrity tests are present and passing on the open #390–#392 stack, but are not currently in main. Track this as a mainline coverage gap until that reviewed stack is integrated.

### Requirements reconciliation correction

- The original v34 source export remains 45 rows, with original IDs/statements/acceptance criteria preserved.
- Current crosswalk disposition for those 45 rows: 0 exact full-coverage matches, 45 partial links to shared controls, 45 additive v1.6.0 draft candidates; four approval-related overlaps retain the existing human-approval control.
- The approved 228 IDs and 38 chapters remain unchanged.
- The v1.6.0 draft now also contains owner-directed candidates CW-056 through CW-059 (workflow rule engine, visual workflow designer, customer/application alert/video defaults and central policy boundaries). The current crosswalk does not yet reconcile those four later draft candidates. Keep them separate from the original 45 v34 rows and the earlier CW-046–055 commercial additions; add explicit crosswalk entries before claiming the full v1.6.0 draft is reconciled. No exact 228 REQ-ID match is asserted for them.

### Current open-PR inventory — exact live heads

Every PR below was re-resolved from live metadata. The representative runs are associated with the exact head shown; relevant job logs were inspected. A duplicate integrated-matrix job marked skipped is not a failure. Earlier heads and their green runs are superseded whenever the live head changed.

| PR | Exact current head | Base branch | Exact-head Actions evidence |
|---|---|---|---|
| #401 | `4638154b9bd51315359f81156aff40ae03595873` | integration/asset-provider-stack-validation | Fresh clone [41975816057](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975816057), PostgreSQL [41975816008](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975816008), provider lifecycle [41975816032](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975816032), matrix [41975816081](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975816081), controlled QA [41975816010](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975816010), payment contract [41975815952](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975815952). All seven exact-head workflows passed. |
| #400 | `c445691f27a06ee36b590f374d5f7ddc6a8ab119` | main | Fresh clone [41960896718](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896718), PostgreSQL [41960896927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896927), integrated [41960896797](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896797), provider lifecycle [41960896826](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896826), workflow configuration [41960896840](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896840). 18 success, one skipped duplicate matrix record, zero failures. |
| #399 | `26200efb1e36e7b9072b85297be080f340276325` | integration/asset-provider-stack-validation | Fresh clone [41973096321](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096321), PostgreSQL [41973096266](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096266), browser [41973096281](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096281), matrix [41973096306](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096306). 7/7 success. |
| #398 | `c2de2c035ab5376f94094f37f4825ce4175a9513` | integration/asset-provider-stack-validation | Provider lifecycle [41962395345](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395345), fresh clone [41962395373](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395373), PostgreSQL [41962395311](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41962395311). 6/6 success. |
| #396 | `f9d32a10cb6337b4f49c9d3b80abea16e99e6d81` | fix/postgres-customer-asset-download-authorization | Provider lifecycle [41871265677](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265677), fresh clone [41871265755](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41871265755). 7/7 success. |
| #395 | `8c6ccf4d0a4ccb85bcc30f58b2521e55de1179f9` | integration/asset-provider-stack-validation | Provider lifecycle [41869040134](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040134), fresh clone [41869040234](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41869040234). 6/6 success. |
| #394 | `c2b7a2c8e7ff3211869e061544672c7db1eb7261` | integration/asset-provider-stack-validation | Browser [41868477503](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477503), fresh clone [41868477584](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41868477584). 7/7 success. |
| #393 | `73dbdf079d9dc32f12661f12f04fc6bbe6d5a81e` | fix/customer-asset-upload-idempotency | Integrated [41844357419](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357419), fresh clone [41844357369](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357369), provider lifecycle [41844357288](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41844357288). 12 success, one skipped duplicate matrix record, zero failures. |
| #392 | `312a9358150c1967feba9307f1b71fbffd8cb8f5` | fix/provider-rls-integrity-stack | Provider lifecycle [41833626478](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626478), fresh clone [41833626500](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41833626500). 7/7 success. |
| #391 | `7d7e5297b649d0dfe2318c5d2f5a1f81b5457749` | fix/provider-payload-operation-integrity | Provider lifecycle [41820073247](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073247), fresh clone [41820073308](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41820073308). 5/5 success. |
| #390 | `3fd2f46b99d6c1da4a17175a7cdbefe4c2b39f7f` | feat/postgres-encrypted-provider-payload-store | PostgreSQL [41805934647](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934647), fresh clone [41805934645](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41805934645). 12 success, one skipped duplicate matrix record, zero failures. |
| #389 | `aff3f4194fa37cd33dba3f4e2f5f97e97a87ddc2` | main | Integrated [41795128802](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41795128802). 13 success, one skipped duplicate matrix record, zero failures. Documentation/evaluation only; no engine change. |
| #387 | `53c084060b06bc8d7c3f5ef5482ada4cb32f8b3d` | main | Browser [41784823265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823265), integrated [41784823525](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41784823525). 17 success, one skipped duplicate matrix record, zero failures. |
| #386 | `a1b7341d71a4086c983dd3362a4704c124a52b74` | feat/customer-asset-repository-foundation | Fresh clone [41837639258](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639258), browser [41837639329](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639329), PostgreSQL [41837639319](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41837639319). 8/8 success. |
| #385 | `2a2b059b37d06621f8e4efb2e2b6f467520114b5` | main | Integrated [41764308133](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308133), matrix [41764308125](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308125), G9 [41764308165](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41764308165). 13 success, one skipped duplicate matrix record, zero failures. |
| #384 | `291129b77ab50623e41dd28c4a746ef70da28183` | main | Fresh clone [41786048886](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786048886), browser [41786049023](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41786049023). 18 success, one skipped duplicate matrix record, zero failures. |
| #380 | `55006ab19bcbb685fc3e84c4230fd865087887f3` | main | Integrated [41763251674](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251674), matrix [41763251774](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41763251774). 13 success, one skipped duplicate matrix record, zero failures. |
| #379 | `82041c8b8be5e1cd2b1f1bdbc801bd358bfe1d44` | feat/provider-payload-encryption-boundary | Provider lifecycle [41738351657](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351657), fresh clone [41738351740](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738351740). 12 success, one skipped duplicate matrix record, zero failures. |
| #378 | `813de84caa4c9cf4eb7c5a2c89a92b30d662ff05` | main | Provider lifecycle [41738299039](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41738299039). 17 success, one skipped duplicate matrix record, zero failures. |
| #377 | `935aa0484cf0430750edadc1d9c41552e903dbe2` (pre-update self-head; this record creates a new head) | main | Integrated [41975348730](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975348730), matrix [41975348780](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975348780), G9 [41975348754](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975348754). 13 success, one skipped duplicate matrix record, zero failures before this update. |

### Seven-pointer disposition

| Pointer | Status | Delivered capability and exact evidence | Remaining blocker / next action |
|---|---|---|---|
| 1. v34-to-228 reconciliation | AMBER | Original 45 v34 source rows and the approved 228/38 baseline are preserved. Crosswalk reports 0 exact full matches, 45 partial shared-control links and 45 additive v1.6.0 candidates; CW-046–055 are separately owner-directed additions. | Reconcile CW-056–059, now present in the v1.6.0 draft, as separate additive draft candidates. Obtain owner disposition; do not change 228/38. |
| 2. Fresh-clone developer setup | GREEN local/CI; AMBER handover | PR #306 merge SHA is verified as a main ancestor. Current main includes `dev:verify` and all seven migration groups/repeatability. #401 exact-head fresh clone [41975816057](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975816057): 1,526 tests / 1,522 passed / 0 failed / 4 skipped; `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`; seven groups including identity applied/repeated; disposable PostgreSQL 16 restore PASS, 80/80 source/restored base tables and seven migration ledgers. | No independent second-engineer clone/build/change/PR/release/rollback demonstration. |
| 3. PostgreSQL migrations, integration and recovery | GREEN local/CI; AMBER operations | #401 fresh clone proves all seven migration groups and repeatability plus 80/80 restore; PostgreSQL job [41975816008](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41975816008) passed all logged groups. #400 PostgreSQL job [41960896927](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41960896927) applies migrations 015/016 and passes the live restricted worker-login test 1/1. | Off-host backup/retention, encryption/key custody, RPO/RTO, independent restore rehearsal and production recovery evidence remain. |
| 4. Provider-neutral identity/OIDC/sessions | AMBER | #310 merged at `88b9708d748c19dc80a1a2d7ad4960914451db7e`. Successor browser/session changes are merged ancestors. #399 browser [41973096281](https://github.com/sbannai/enterprise-product-engineering/actions/runs/41973096281) passes synthetic-IdP customer workspace/support/login/logout/revocation (1/1), plus Product Admin remediation (1/1). Secure cookies, CSRF and tenant/application assignment are covered by exact-head tests. | Production IdP onboarding, metadata/JWKS lifecycle, key rotation and credential operations remain. Do not represent synthetic IdP as production provider onboarding. |
| 5. Customer workspace and support | AMBER | Customer ticket submission/history/replies and tenant/application authorization pass browser/API/PostgreSQL tests. Support admin triage/assignment/severity, internal-note separation and filtered export have backend tests; customer browser workspace/support journey passes. | Support-admin browser E2E and owner-defined SLA deadlines/calendars/breach/escalation/reporting remain. Actual file-byte upload, provider-observed verification, malware scan and authorized download are not delivered end to end: #399 still lacks concrete upload, verification, scan, storage and download adapters in the production composition root. |
| 6. Scheduler, workflow operations and remaining capabilities | AMBER | Campaign scheduler remains an independent worker with leases/fencing, idempotency, retries and PostgreSQL restart recovery. #400 provides a separate workflow-outbox process. Its exact-head tests cover continuous scope draining, durable approval checks, retry/dead-letter, lease renewal/fencing, idempotency, graceful SIGINT/SIGTERM and restricted DB identity. Provider payload v2 integrity/key rotation passes on #392. | #400 deliberately supplies no dispatcher module. External supervisor, readiness/liveness, metrics sink, alert routing, backlog/dead-letter monitoring, restart policy and independent recovery rehearsal remain. |
| 7. Release controls, recovery and independent handover | RED | Local disposable backup/restore and runbooks exist; exact-head release artifacts are reproducible on PR branches. | Charter remains proposed and requires owner review. Branch protection/rulesets were last recorded as unprotected/empty in the scorecard, but were not re-read by an available settings endpoint in this audit; treat controls as NOT VERIFIED, not enabled. No second-engineer release/rollback path or production recovery rehearsal is demonstrated. |

### Exact-head failure and supersession notes

- PR #399's superseded browser head failed because the test submitted before the asynchronously populated assigned-application selector was enabled and selected. The owning branch added a wait for the enabled selected application. The current head `26200efb1e36e7b9072b85297be080f340276325` passes browser 1/1 and all seven exact-head workflows. The previous failure is not counted against the current head.
- PR #401 had intermediate heads whose runs were cancelled or superseded. Do not count their green or cancelled states. Current head `4638154b9bd51315359f81156aff40ae03595873` has seven successful exact-head workflows listed above. Its PR description still contains an earlier head snapshot and should be refreshed to avoid stale evidence.
- PR #377's current pre-update self-head is `935aa0484cf0430750edadc1d9c41552e903dbe2`; this scorecard commit supersedes it. Re-resolve the new self-head and require new exact-head Actions before calling this documentation update validated.

### Continuity and next actions

The charter remains a proposed operating control and requires owner review. No current settings endpoint was available in this audit to independently verify branch protection/rulesets. The latest mainline revert also leaves provider-payload integration test coverage only on the open #390–#392 stack.

1. Reconcile CW-056–059 in the v1.6.0 crosswalk as separate draft additions without changing the 228/38 baseline.
2. Complete a disposable local asset storage/verification/scanner/download adapter chain and a real-bytes browser E2E; do not treat synthetic adapters as the delivered file lifecycle.
3. Supply an owner-approved deployment dispatcher for the workflow outbox worker, then prove external supervision, readiness, metrics/alerts, restart and lease recovery.
4. Obtain owner-defined support SLA policy and test deadlines, breach detection and escalation.
5. Obtain owner review for repository protection and the continuity charter; demonstrate the complete independent second-engineer release/rollback path.
6. Integrate the provider-payload integrity stack only after dependency-order review and rerun exact-head plus mainline checks; restore the deleted integration-test coverage through the reviewed branch, not by cherry-picking an orphan test.

No approved requirement or chapter was changed. No merge, production deployment, production credential use, external/provider action or chargeable cloud provisioning occurred in this audit.
