# B01 Business UAT — Readiness-First Execution Plan

**Document ID:** EPER-B01-BUSINESS-UAT-READINESS-PLAN-001  
**Date:** 2026-10-19  
**Scope:** Option A; 228 requirements / 38 chapters unchanged. First pilot tranche: Chapter 463, six existing cases.  
**Purpose:** Begin meaningful Business UAT preparation now without confusing preparation or exploratory walkthroughs with authorized formal acceptance.

## 1. Decision: prepare Business UAT now; keep formal acceptance gated

Outstanding design/contract approvals should not prevent preparation of test data, actor journeys, business walkthroughs, defect capture, and evidence-capture templates. They do prevent recording formal pass/fail outcomes where the expected business rule is not approved, and they prevent declaring UAT passed.

Run three separate lanes:

1. **Lane A — Readiness preparation (start now):** scenario walkthroughs, environment/build identification, synthetic data planning, tester/role mapping, evidence templates, and defect triage rehearsal. These activities do not mark a canonical case executed.
2. **Lane B — Exploratory business walkthrough (only in a safe, non-production/test environment):** users can inspect screens and try clearly labelled draft journeys to identify usability and missing-functionality gaps. Capture findings as exploratory observations, not acceptance evidence; do not use real transactions, external payment, notifications, or irreversible actions without environment-specific approval.
3. **Lane C — Formal Business UAT (gated):** execute approved case steps against approved expected results only after the D10/session authorization, target/environment, build, test data, actor/tenant, oracle, and evidence plan are recorded. Only then may a canonical case move from NOT_RUN to an actual outcome.

## 2. Chapter 463 readiness run sheet

| Canonical case | Business walkthrough focus | Preparation that can start now | Formal-execution blocker |
|---|---|---|---|
| B01-463-01 / REQ-46301 | Create/read/update record and inspect lifecycle history | Draft a synthetic requisition/record set; list expected business fields and questions | Approved procurement object model, lifecycle states/transitions, schema and persistence expectations |
| B01-463-02 / REQ-46302 | Role/tenant access and approval authority | Prepare actor-role matrix template and positive/negative access journeys | Approved role×action×resource×tenant/delegation/SoD matrix and test identities |
| B01-463-03 / REQ-46303 | Required fields, validation and business-rule feedback | Prepare missing-field, invalid-value and boundary-value test-data candidates | Approved required/conditional fields, thresholds, precedence, error outcomes and rule version |
| B01-463-04 / REQ-46304 | Audit trail, attribution and retrieval | Define evidence capture checklist and sample audit questions | Approved material-event taxonomy, payload, access, integrity and retention requirements |
| B01-463-05 / REQ-46305 | Exception, retry, recovery and escalation | Map failure injection points and record the recovery questions; no live retries yet | Approved exception taxonomy, idempotency/retry/backoff/replay/compensation/escalation policy |
| B01-463-06 / REQ-46306 | Reports, filters, KPI values and reconciliation | Prepare sample reporting questions and synthetic source/expected-value worksheet | Approved KPI definitions/formulas, report access, lineage, freshness and reconciliation tolerance |

All rows above are preparation activities. They do not approve the draft oracle or change the canonical execution capture.

## 3. Minimum readiness packet for each canonical case

Complete one packet per existing case ID, without creating duplicate case IDs:
- Requirement ID, SRS ID and TRC ID verified against the controlled baseline.
- Business owner/tester and test actor/role/tenant identified.
- Approved requirement-specific source and measurable expected result, or explicitly marked BLOCKED — ORACLE NOT APPROVED.
- Test environment, application URL, build/commit SHA and preflight/health result.
- Synthetic test data reference and reset/cleanup method.
- Reviewed positive and negative steps; external side effects disabled or approved.
- Evidence checklist: timestamp, tester, build, steps, expected/actual results, screenshots/log references, defect/exception ID.
- D10/session authorization reference before formal execution.
- Business reviewer, final decision and approval reference after execution.

## 4. Immediate actions and exit checks

**Now, without waiting for design approval**
1. Keep the six canonical Chapter 463 rows and IDs unchanged.
2. Prepare synthetic data and the six case packets using draft markers for any unapproved expected result.
3. Confirm whether a safe non-production application endpoint and build are available. Do not infer hosting from green CI.
4. Run a business walkthrough only if that safe endpoint is actually available and its use is approved; log discoveries as exploratory observations.
5. Triage observations into (a) defect against an approved rule, (b) missing business decision, (c) usability/requirement gap, or (d) environment/test-data issue.
6. Keep candidate-oracle approval, exact HLD→LLD binding, contract approval and D10 authorization as separate gates.

**Before formal UAT**
- Each case has a measurable approved oracle and source binding.
- Test identities/data and environment are approved.
- Technical preflight passes on the identified build.
- D10/session authorization is recorded.
- Evidence capture is ready and business approver is identified.

## 5. Status semantics — no false closure

- READY_FOR_WALKTHROUGH: preparation complete; exploratory walkthrough may occur if environment use is approved.
- BLOCKED_ORACLE: expected business result depends on an unapproved policy/source.
- READY_FOR_FORMAL_UAT: all case-level approvals, environment, data, and D10 authorization are recorded.
- NOT_RUN: no formal case execution has occurred.
- PASS / FAIL / BLOCKED: only after an authorized formal execution with actual evidence and a reviewed result.

## 6. Current baseline and gate status

- Canonical Chapter 463 cases: 6, preserved.
- Requirements baseline: 228; chapters: 38; Option A and IDs unchanged.
- Approved acceptance oracles: 0/6 currently evidenced.
- Exact approved HLD→LLD pairs: 0/6 currently evidenced.
- Full approved DATA/API/EVENT slots or approved N/A: 0/18 currently evidenced.
- Formal Business UAT: not authorized / not executed.
- CI success is technical automation evidence, not business acceptance.
- No production transactions or paid AWS resources are authorized by this plan.

**Disposition:** Start readiness preparation now. Use exploratory walkthroughs only in an approved safe environment. Keep formal Business UAT execution gated until its explicit authorization and acceptance controls are satisfied.
