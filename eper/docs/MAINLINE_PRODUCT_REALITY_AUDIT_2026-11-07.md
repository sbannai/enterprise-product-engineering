# EPER Mainline Product Reality Audit — 7 November 2026

**Audit baseline:** `22f976db832c4b14cf31ea92b70b0610673491ea`  
**Audit timestamp:** 2026-11-07 03:02 UTC  
**Approved baseline:** 228 requirements / 38 chapters; unchanged.  
**Status:** Initial evidence pass; PR-by-PR and requirement-by-requirement reconciliation remains in progress.

## Executive finding

Mainline has meaningful automated coverage. It is not accurate to say that we tested nothing or only trivial components. The latest exact-main CI validates real PostgreSQL behavior, all six capability-family HTTP smoke paths, a customer OIDC browser flow, a 228-requirement/38-chapter pilot matrix, fresh-clone setup, traceability, and controlled technical simulation.

The gap is that these lanes prove bounded technical scopes. They do not prove every customer journey, every requirement, production operations, or business acceptance. Branch-only evidence was also at risk of being reported as if it were mainline capability. This audit separates those evidence classes.

## 1. Exact-main evidence

Main SHA: `22f976db832c4b14cf31ea92b70b0610673491ea`  
Commit: `test(assets): assert PostgreSQL audit resource columns correctly`

All 11 workflows returned completed/success on this exact SHA:

| Workflow | Run |
|---|---:|
| EPER CI | [42331249265](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249265) |
| Integrated validation, same-commit | [42331249067](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249067) |
| Customer OIDC browser E2E | [42331249128](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249128) |
| Six-family capability HTTP smoke | [42331249035](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249035) |
| Controlled UAT technical simulation | [42331249082](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249082) |
| Fresh-clone developer setup | [42331248955](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331248955) |
| 228 requirement / 38 chapter pilot matrix | [42331249222](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249222) |
| G9 reconciliation CI | [42331248980](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331248980) |
| Workflow configuration validation | [42331249033](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249033) |
| Container runtime smoke | [42331249012](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331249012) |
| Controlled QA re-execution | [42331248952](https://github.com/sbannai/enterprise-product-engineering/actions/runs/42331248952) |

### What main CI demonstrably tests

The workflow definition at `.github/workflows/ci.yml` and the exact-main job log show:

- PostgreSQL 16 ephemeral service, typecheck/build and full EPER Node test suite.
- Payment, audit/admin, identity, capability, workflow, scheduler and ticketing schema application.
- Customer-asset migrations 021, 022 and 023 applied and replayed; checks for RLS enable/force, expected policies, least-privilege grants and preserved sentinel data.
- Live PostgreSQL customer asset upload recovery integration.
- Live PostgreSQL workflow execution integration.
- Live PostgreSQL capability RLS, append-only audit, concurrency/idempotency and rollback checks.
- Read-only B01 readiness audit and controlled technical preflight evidence.

The live customer asset test `eper/tests/postgres-customer-asset-upload-recovery.integration.test.mjs` verifies concurrent same-key reservation replay, immutable request fingerprint conflict, actor/application isolation, provider grant persistence and recovery, audit records, then upload completion → transactional scan outbox → leased scan worker lifecycle. This is valuable mainline evidence.

**Important correction to the earlier status narrative:** main already contains this PostgreSQL upload-reservation/recovery and scan lifecycle coverage. The remaining gap is not “no asset backend tests”; it is the full customer-facing upload/download journey and the later provider-outcome/migration changes still sitting in stacked branches.

### Browser evidence boundary

Run 42331249128 passed Chromium OIDC login, protected access, logout/revocation and Product Admin application remediation. The configured test issuer is deterministic/local. It is not production identity-provider onboarding/interoperability evidence. The run does not prove every browser journey uses durable PostgreSQL-backed identity, assets and support stores.

### Requirement matrix boundary

The 228/38 matrix is a pilot and traceability check. It must not be interpreted as 228 requirements individually business-executed and accepted.

## 2. B01 readiness: direct measured blocker

The read-only readiness report printed in EPER CI run 42331249265 returned:

- `readiness = BLOCKED`
- Integrity errors: **0**
- B01 case checklist: 48; gap register: 48
- Entry gates: 13; pending/without evidence: **13**
- B01 cases without controlled baseline approval artifact: **48**
- B01 cases with incomplete acceptance oracle: **48**
- B01 cases with incomplete preparation: **48**
- B01 cases without complete review approval: **48**
- B01 cases not explicitly authorized: **48**
- Requirements in business execution capture: 228
- Requirements not run in business capture: **228**
- Requirements with complete business acceptance: **0**

This is not a code-test failure. It is an evidence, case-preparation, approval and authorization blocker. The readiness script is explicitly read-only and does not authorize UAT. Business UAT remains unauthorized.

## 3. Seven-checkpoint initial assessment

| Checkpoint | Status | What is evidenced | What remains unproven |
|---|---|---|---|
| 1. Product USP / customer journey | AMBER | Six-family HTTP smoke, pilot matrix, payment/receipt contracts, customer/admin journeys in bounded scopes | Full end-to-end vertical slices for every priority customer workflow; requirement-level business acceptance |
| 2. CI / persistence | GREEN for inspected CI scope; AMBER operations | PostgreSQL 16, migration replay, RLS/grants, live repositories, full suite, fresh clone | Production backup destination/retention, encryption/key custody, RPO/RTO, independently witnessed recovery |
| 3. Architecture / execution boundaries | AMBER | OIDC browser lifecycle, selected tenant/application isolation, least-privilege and audit tests | Production IdP onboarding, comprehensive authorization matrix and full durable browser-to-database journey |
| 4. Workflow schema / execution | AMBER | PostgreSQL workflow start/transition, idempotency, versioning, audit and existing scheduler tests | Independent outbox worker operational proof, full lease/claim concurrency, approval-revocation dispatch race and supervision |
| 5. Integrated validation | GREEN for named technical lanes; AMBER overall | 11 exact-main workflows, same-commit integration, six-family smoke, browser, fresh clone, matrix | Full customer journeys, all 228 business cases, operational proof and acceptance |
| 6. PR consolidation / governance | RED/AMBER | Live inventory: 29 open PRs, all drafts at audit start | Per-PR overlap, base/head divergence, issue linkage, exact-head test freshness, supersession and disposition; branch protection/ruleset verification |
| 7. Runtime operations / continuity | AMBER | Some worker, recovery, retry, audit and PostgreSQL lifecycle behavior exists | Independent host supervision, metrics/alerts, load/recovery, second-engineer release and DR rehearsal |

Status colors apply only to the stated scope. No overall completion percentage is inferred.

## 4. PR consolidation risk

At audit start, the repository returned 29 open PRs; all 29 were drafts. Several customer-asset/provider PRs are stacked on one another and compare as diverged from current main. In particular:

- #423 migration 026 is based on `fix/customer-asset-upload-ui-idempotency`, not main.
- That branch has a different audit migration inventory, including additional provider-payload migrations not in main's audit chain.
- Migration 026 reuses an index name already created by main's migration 023. With `CREATE INDEX IF NOT EXISTS`, PostgreSQL can skip creation of the intended partial index because the name already exists.
- PR #426's PostgreSQL tests are branch-only evidence and do not validate the actual main migration history.
- #400/#411 remain draft; passing branch checks do not replace PostgreSQL-backed concurrency, stale-claim fencing, approval-revocation race and operations evidence on an integrated mainline candidate.

No merge, bulk close, branch deletion or migration edit is authorized by this audit.

## 5. Required evidence classification

Every feature row in the forthcoming capability inventory must use one of these non-interchangeable states:

1. **Present on main** — code is in the audited main SHA.
2. **Unit/contract tested** — isolated logic or interface tests pass.
3. **Live PostgreSQL tested** — actual ephemeral PostgreSQL behavior passes.
4. **Browser E2E tested** — an actual browser journey passes; record whether stores/identity are synthetic or durable.
5. **Integrated journey verified** — UI, API, DB, authorization, audit and failure/recovery behavior pass together.
6. **Operationally proven** — supervision, monitoring, backup/restore, load, recovery and operator handover evidence exists.
7. **Business accepted** — approved owner decision and archived requirement-level evidence exist.

A feature cannot skip stages based on a green workflow badge.

## 6. Next audit work

1. Finish all-29 PR inventory with base/head SHA, ahead/behind, changed files, exact-head checks, overlapping paths, issue linkage and proposed disposition.
2. Build a mainline feature register by capability family: UI, API, persistence/migration, authorization, audit, tests and journey evidence.
3. Crosswalk all 228 approved requirements to observable code on main and explicit evidence. A chapter pilot pass alone is not a feature-completion claim.
4. Classify every relevant test as unit/mock, contract, ephemeral PostgreSQL, browser E2E, technical simulation or operational proof.
5. Produce a prioritized gap register with dependencies, acceptance tests, owner and ETA band.
6. Append a dated scorecard update without rewriting historical records.

## Guardrails

- Preserve 228 requirements and 38 chapters.
- No chargeable AWS resources.
- No merges or mass PR closures as part of this audit.
- No branch deletions.
- No Business UAT authorization.
- Keep API, UI and database maturity aligned.
- Report only evidence observed on the exact main SHA or clearly label branch-only evidence.


## 7. Execution update — 2026-11-07 03:07 UTC

### PR reconciliation first pass completed

Live open PR inventory after creating the audit PR: 30 open, all 30 draft. The 29 pre-existing PR heads were each compared against main `97bf4a3de60dd3f6002db068e9c16488ec4916d3`.

- All 29 pre-existing PRs are diverged from main and 74 commits behind.
- Ahead counts range from 4 to 270 commits.
- Large asset/provider stacks have broad overlapping changes across API composition, asset repositories, migrations, provider payload lifecycle and tests.
- #400 (workflow outbox worker) is 31 ahead / 74 behind; #411 (claim fencing) is 43 ahead / 74 behind.
- Smaller documentation PRs #380, #385, #378 and #379 are 4–8 commits ahead but still 74 behind; they also require baseline reconciliation.
- Audit PR #432 itself is one commit ahead / zero behind and documentation-only.

This is a branch divergence finding, not a disposition decision. No pre-existing PR was merged, closed or deleted. A per-PR feature/overlap/issue-link/CI freshness matrix is still required before retirement or extraction decisions.

### Audit PR CI failure root cause and narrow correction

Audit PR #432 triggered nine workflows: six passed and three failed. All three failures shared one underlying test in `eper/tests/customer-asset-upload-api.test.mjs`: its reservation fixture expiry was hard-coded to `2026-11-07T03:00:00.000Z`. The workflows ran after 03:00 UTC, so `startCustomerAssetUpload` correctly rejected the expired reservation. The test expected HTTP 200 but received HTTP 503. The full EPER suite showed 1 failure among 1,435 tests in that run; this same test caused the CI and integrated-validation failures.

A narrow main-based test-only correction is proposed in [PR #433](https://github.com/sbannai/enterprise-product-engineering/pull/433): set the fixture expiry to five minutes after test execution. No production expiry validation was weakened. At the time of this update, PR #433 is one commit ahead / zero behind main and its ten workflows are running. Do not merge until exact-head checks pass.

### Updated ETA

- PR compare/base divergence first pass: complete for 29 pre-existing PRs.
- Full per-PR scope/overlap/issue-link/CI freshness disposition: target within the remainder of the first working day.
- 228-requirement evidence crosswalk and prioritized gap register: target within two working days, dependent on the authoritative requirement/acceptance artefacts.
- First P0/P1 engineering closure: estimate 3–5 working days after scope and dependencies are confirmed.
- Business UAT: no responsible ETA until all 13 entry gates and 48 case-level approval/preparation gaps have owners and evidence; current audit still records 228/228 not run and 0/228 accepted.

No mainline product change, migration change, bulk PR closure, branch deletion, chargeable cloud resource or Business UAT authorization has been made.


## 8. Requirement and B01 source-register reconciliation — 2026-11-07

### 228-row business capture is explicit and complete as a register, but unexecuted

The mainline file `eper/uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv` contains 228 data rows (one for every approved requirement ID across Chapters 463–500). Every row currently has `outcome=NOT_RUN` and `business_decision=PENDING`. This supports the CI readiness count of 228 not run / zero accepted. It is not a missing register; it is a populated capture register with no business execution evidence yet.

The requirement registry `eper/packages/requirements/registry.ts` defines six repeating technical patterns for every chapter: authoritative records, authorization, business validation, audit evidence, exception handling and governed reporting. That gives 228 requirement bindings to shared capability contracts, but it does not make each chapter's business acceptance criterion specific or approved.

The existing technical crosswalk `eper/docs/requirements/EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md` explicitly states that it cannot make exact approved feature-to-REQ mappings: 45 wireframe candidate rows are only partially supported by shared controls; zero are fully covered by one exact 228 requirement; the 45 candidates remain additive v1.6.0 draft proposals. Do not import those 45 proposals into the approved 228 baseline or report them as owner-approved requirements.

### B01 baseline approval: reconcile a source-record conflict, do not assume

There is a recorded decision note `eper/uat/B01_BASELINE_APPROVAL_DECISION_001.md` stating B01-BASELINE-APPROVAL-001 was APPROVED for controlled BRD/SRS versions, Chapters 463–470, 48 requirements, on 2026-10-11. It explicitly excludes requirement-specific acceptance criteria, test oracles, case approval and UAT execution.

However, `eper/uat/B01_READINESS_BLOCKER_CLOSURE_PLAN.md` records a later source-package conflict: the GitHub checklist says approved while copies of the controlled source package describe the SRS/source baseline as working draft / approval pending; a standalone approval artifact with independently verifiable scope, approver, versions and effective date was not located in the searched materials. The latest CI readiness audit therefore correctly counts 48 cases as lacking a controlled baseline approval evidence locator.

The accurate status is **approval decision recorded, controlled source artifact/locator reconciliation unresolved**. This is more precise than saying no approval decision exists. Do not fill the 48 locators or flip status fields until the authoritative artifact is verified.

### B01 case-preparation gaps

The 48-row B01 case checklist and related acceptance matrix/gap register are structurally aligned. But all 48 case rows still lack actor/role/tenant confirmation, approved preconditions/test data, reviewed positive steps, reviewed negative paths, approved measurable expected results, evidence capture plan and complete review/approval fields. All 48 execution authorization fields remain NO. The 13 E1–E13 controls remain pending or without current evidence in the latest readiness run.

This confirms the near-term critical path is controlled source resolution and requirement-specific acceptance/case approval—not another round of generic technical CI.

## 9. Test-fixture correction status — 2026-11-07 03:08 UTC

PR #433 changes only the static reservation expiry in `eper/tests/customer-asset-upload-api.test.mjs` to a five-minute relative expiry. On exact PR head `3b8e02cc620a473fbcc84c9d4295ed4d116037a9`, 8 of 10 workflows have completed successfully, including EPER CI and controlled QA re-execution. Integrated validation and fresh-clone setup are still running at this update. The corrected test has not yet been declared fully accepted; wait for all ten exact-head workflows to finish.


## 10. Mainline update — 2026-11-07 03:09 UTC

PR #433 completed all 10/10 exact-head workflows successfully and was squash-merged to main. Merge commit: `2f42e87b0b88a74ef856a9b709d68d1d39eba1de`. The change is one test-fixture line: replace the stale fixed reservation expiry with a five-minute relative expiry. Production code and expiry enforcement are unchanged.

This confirms the earlier three workflow failures were all propagated by one time-expired test fixture. The correction was tested on its exact PR head before merge. The merged main SHA is now `2f42e87b0b88a74ef856a9b709d68d1d39eba1de`; post-merge main CI should still be observed rather than assumed.

The requirement source audit is also complete for the relevant register state: all 228 capture rows remain NOT_RUN/PENDING; the 48 B01 case rows are structurally aligned with the capture/gap/acceptance matrices but not prepared/reviewed/authorized. The controlled baseline decision note records approval, but the controlled source-package artifact/locator discrepancy remains unresolved. The v34-to-228 crosswalk explicitly classifies 45 candidate requirements as draft additions and makes zero exact feature-to-228 mappings; these are not to be promoted into the approved baseline without owner change control.


## 11. Full open-PR compare matrix — current main 2f42e87b0b88a74ef856a9b709d68d1d39eba1de

All 29 pre-existing open PRs were individually compared with current main. Every one is diverged and 75 commits behind. The ahead count below is the PR head's commits ahead of main; changed-file comparisons show the scope overlap described by the cluster labels. All 29 remain draft. This is a comparison/disposition register, not authorization to merge or close.

| PR | Ahead | Cluster / purpose | Initial disposition |
|---|---:|---|---|
| #422 | 270 | Asset upload + provider recovery | Do not merge wholesale; extract provider recovery contract only after migration-chain reconciliation |
| #426 | 251 | Asset migration PG16 validation | Rebuild as narrow main-based migration/replay test slice |
| #423 | 232 | Asset upload recovery metadata | Migration collision; rework against current migration 023, do not merge |
| #420 | 238 | Upload retry identity / verified customer binding | Extract identity-bound retry behavior after UI/API contract review |
| #416 | 229 | Upload retry identity persistence | Reconcile with #420; avoid duplicate implementation |
| #414 | 240 | Upload expiry worker isolation | Preserve worker lifecycle candidate; reconcile migrations 026–029 against main before extraction |
| #413 | 210 | Cross-application shared upload recovery | Defer until tenant/customer isolation invariants are proven |
| #412 | 191 | Asset scan lifecycle lock ordering | Candidate targeted concurrency fix; validate on main-based PostgreSQL tests |
| #411 | 43 | Workflow outbox claim fencing | Retain as candidate; requires main-based lease/fencing/approval-race tests |
| #402 | 194 | Upload reservation expiry and retry | Merge into one asset retry/expiry candidate with #413/#414; no separate wholesale merge |
| #401 | 185 | PostgreSQL capacity validation plan | Salvage benchmark scripts and test methodology; exclude unrelated asset/provider stack |
| #400 | 31 | Independent workflow outbox worker | Extract only after PostgreSQL claim/renew/ack/fail lifecycle and RLS proof |
| #399 | 223 | Customer asset workspace upload UI | Candidate browser journey; extract separately from backend/migration stack |
| #398 | 236 | Fail-closed provider runtime adapter registry | Preserve provider-neutral adapter boundary; isolate from asset/provider stack |
| #396 | 187 | Independent asset scan recovery | Reconcile with #412; avoid duplicate recovery workers |
| #395 | 183 | Provider-neutral storage catalogue | Extract provider registration contract after interface review |
| #394 | 178 | PostgreSQL-backed asset download authorization | Candidate high-priority customer journey slice; prove tenant isolation and browser download |
| #393 | 166 | Asset/provider integrated validation | Treat as evidence/test harness; do not use stacked branch as integration baseline |
| #392 | 39 | Provider worker runtime + payload integrity | Consolidate with #390/#391; one migration/test stream |
| #391 | 21 | Provider RLS + payload integrity | Consolidate with #390/#392; reconcile migration ordering and restricted-role proof |
| #390 | 20 | Provider payload-operation referential integrity | Candidate narrow provider persistence slice after migration reconciliation |
| #387 | 22 | Actor-scoped customer work queue | Candidate isolated workflow read-model slice; verify main API integration and actor/tenant isolation |
| #386 | 164 | Upload idempotency reservation before provider grant | Backend foundation candidate; compare with current main asset reservation behavior before extraction |
| #385 | 4 | Customer asset repository requirements docs | Salvage approved-neutral design material only; preserve draft/change-control status |
| #384 | 140 | Tenant-isolated customer asset repository foundation | Do not merge wholesale; main already has meaningful PG asset repository/recovery integration tests |
| #380 | 5 | Client asset / workflow-driven app UX requirements | Candidate product UX notes; preserve draft status and baseline separation |
| #379 | 8 | Durable encrypted PostgreSQL provider payload store | Consolidate with #390–#392; reconcile migration chain before any extraction |
| #378 | 7 | Encrypted provider payload storage boundary | Consolidate with #379; avoid duplicate provider boundary |
| #377 | 80 | Nov 3 scorecard and PR governance docs | Salvage any still-current evidence only; newer scorecard/audit supersedes stale baseline |

### Consolidated disposition

- **Asset upload/repository/scan/download/expiry/UI:** #422, #426, #423, #420, #416, #414, #413, #412, #402, #399, #396, #394, #393, #386, #384. These overlap heavily in API composition, repository, migration and test files. Build a main-based extraction sequence, not 15 separate merges.
- **Provider payload and storage integration:** #398, #395, #392, #391, #390, #379, #378. Consolidate into one provider integration plan and one forward-only migration sequence.
- **Workflow outbox and customer work queue:** #411, #400, #387. Keep separate from asset/provider migration work; require durable PostgreSQL lifecycle and tenant/actor evidence.
- **Capacity validation:** #401. Salvage benchmark methodology/scripts as an isolated, no-cloud validation task.
- **Requirements and UX documentation:** #385, #380. Review for useful product content, but do not change the approved 228-requirement baseline.
- **Scorecard documentation:** #377. Use only as historical source; current audit/scorecard supersedes it.

### Mainline and audit CI confirmation

Current main `2f42e87b0b88a74ef856a9b709d68d1d39eba1de` has all 9 observed workflows successful, including EPER CI, integrated validation and fresh-clone setup. Audit PR #432 was retargeted to current main; its exact head `9fe162ad07953750b93dd386ea70ac051731447c` has all 9 observed workflows successful and is now 4 commits ahead / 0 behind. It remains draft and unmerged pending review of this report.

### Next safe execution order

1. Preserve the current main baseline and keep PRs as source archives until each candidate has a feature-level disposition.
2. Prioritize a customer-facing asset journey extraction: PostgreSQL-backed upload reservation → provider grant/recovery → scan/outbox → download authorization → browser workflow, with migration and RLS proofs on main.
3. In parallel, prove workflow outbox lease fencing using two-connection PostgreSQL tests; keep provider payload lifecycle independent until its migration sequence is resolved.
4. Salvage the capacity benchmark script from #401 and run only against local/test PostgreSQL, no chargeable cloud infrastructure.
5. Once each source PR's unique value is either extracted or proven already present on main, close it as superseded with a traceable disposition comment. No PR is closed by this audit.
