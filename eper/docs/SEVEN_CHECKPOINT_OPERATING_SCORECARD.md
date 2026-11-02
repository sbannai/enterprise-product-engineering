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
