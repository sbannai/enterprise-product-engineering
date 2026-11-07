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
