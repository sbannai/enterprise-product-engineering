# EPER Business UAT Execution Plan — October 2026

**Status:** PROPOSED PLAN — NOT AUTHORIZATION TO EXECUTE  
**Scope:** Chapters 463–500; 38 chapters; 228 requirements  
**Current business UAT state:** NOT EXECUTED / ACCEPTANCE PENDING  
**Environment:** Target and release candidate must be verified by the authorized target preflight before use  
**Plan owner:** To be nominated by the business owner  
**Business acceptance owner:** PENDING NOMINATION

## 1. Objective and control rule

Execute requirement-specific business scenarios with authorized business testers, capture actual results and controlled evidence, resolve defects, and obtain explicit business decisions for all 228 requirements.

Automated CI, pilot matrices, technical simulations, health checks, and capability-level tests are supporting evidence only. They do not count as business UAT execution or acceptance.

Do not populate execution timestamps, actual results, evidence references, or approval fields until real execution has occurred. Do not promote a requirement to ACCEPTED without a passing executed case and recorded authorized approval.

## 2. Proposed timebox (all dates are targets, not commitments)

| Date | Activity | Exit evidence |
|---|---|---|
| Tue 6 Oct–Fri 9 Oct | Prepare test pack, nominate business owner/testers, close environment/access/test-data gates, review draft cases against authoritative BRD/SRS criteria | Approved case baseline; named roles; entry-gate evidence; target preflight for identified build |
| Mon 12 Oct | B01 pilot: Chapters 463–470 (48 requirements) | Session log, row-level actual outcomes/evidence, defects, pilot retrospective |
| Tue 13 Oct–Fri 16 Oct | Full execution waves across remaining chapters, continuing B01 only if pilot exit is approved | Actual result and evidence for each executed requirement; blockers/defects assigned |
| Mon 19 Oct–Tue 20 Oct | Retest, evidence reconciliation, exception decisions, business acceptance review | Retest evidence, reconciled 228-row register, signed decision or explicit outstanding blockers |

**Schedule rule:** If the entry gate is not met, move the affected execution date. Never create retrospective execution evidence or report planned work as complete.

## 3. Execution waves

| Wave | Chapters | Requirements | Purpose |
|---|---|---:|---|
| B01 pilot | 463–470 | 48 | Validate access, data, scenario quality, evidence capture, defect routing and business usability |
| B02 | 471–478 | 48 | Execute after pilot exit and approved case baseline |
| B03 | 479–486 | 48 | Execute after prior wave controls remain effective |
| B04 | 487–494 | 48 | Execute and reconcile outcomes |
| B05 | 495–500 | 36 | Complete remaining chapter scope |
| Retest/acceptance | All chapters with defects or exceptions | As applicable | Retest fixes, adjudicate exceptions, reconcile evidence and capture approval |

Each wave has six requirements per chapter. All 228 rows remain in scope. B02–B05 dates are scheduled within the full execution window and may run in parallel only when approved testers and environment capacity permit.

## 4. Mandatory entry gate

B01's authoritative checklist is eper/uat/B01_BUSINESS_UAT_EXECUTION_READINESS.md. Before a business execution session, verify and reference evidence for all applicable items:

1. Approved protected GitHub Environment and reviewer/branch restrictions.
2. Exact approved HTTPS target host and service-owner approval.
3. Authorized target preflight passing against the expected deployed build ID.
4. Business owner authorization for the batch and named tester.
5. Valid identity-provider login; no tokens or credentials in evidence.
6. Tester role and tenant scope verified.
7. Approved safe test data available.
8. Audit logs/reports accessible to the tester.
9. Evidence archive and naming convention available.
10. Defect/exception owners and escalation route known.
11. Every in-scope requirement has a reviewed scenario, explicit expected result, and authoritative BRD/SRS acceptance-criteria reference approved by the relevant owner.

Any unknown, failed, or pending mandatory gate means DO NOT START that batch. Record the blocker, owner, and next action.

## 5. Per-requirement execution procedure

For every requirement row:

1. Confirm requirement ID, chapter, BRD/SRS mapping and approved acceptance-criteria source.
2. Confirm tester identity/role, tenant, test data, target host, deployed build commit and scenario version.
3. Execute the approved steps on the authorized non-production target.
4. Record execution timestamp, tester, environment/build, actual steps/result, expected result, outcome and evidence reference.
5. Record one of PASS, FAIL, BLOCKED, or NOT_APPLICABLE as supported by the actual session. Keep unexecuted cases NOT_RUN.
6. For FAIL, open/link a defect with severity, owner, due date, and retest requirement.
7. For BLOCKED, link the blocker/exception and name the owner and next action.
8. NOT_APPLICABLE requires documented rationale and the approved decision route; a waiver requires named authority and date.
9. Keep the business decision PENDING until an authorized approver records it.
10. Do not mark ACCEPTED unless the case actually passed and approver/date/evidence are present.

Never store passwords, access tokens, session cookies, private customer data, or other secrets in the register or screenshots.

## 6. Defect and retest policy

- Critical/high-impact failures affecting security, tenant isolation, material data integrity, auditability, or a core business outcome block the affected requirement and the relevant batch acceptance.
- A fix must identify the code/build change and be re-deployed to the authorized target before retest.
- Retest the failed scenario and its relevant regression scenarios; preserve original failure evidence and link new retest evidence.
- Do not overwrite a failed result. Record a new retest attempt and decision.
- Any accepted exception/waiver must state scope, risk, compensating control, approver and expiry/review date where applicable.
- Escalate unowned or overdue defects to the nominated UAT lead and business acceptance owner.

## 7. Exit and sign-off criteria

Business UAT can be recommended for closure only when:

- All 228 requirements have a reconciled row-level disposition.
- Every in-scope mandatory scenario has actually been executed, or an explicitly authorized exception/waiver exists.
- Failed scenarios have passed retest or have an authorized, documented disposition.
- No unresolved blocker or defect violates the approved release/acceptance policy.
- Evidence links are accessible, attributable, and reconciled to requirement IDs and build identity.
- The business acceptance owner reviews the outcome counts and signs the final decision.
- Technical CI results remain separate from business execution and acceptance counts.

Final status report must separately count NOT_RUN, PASS, FAIL, BLOCKED, NOT_APPLICABLE, retest attempts, business ACCEPTED, REJECTED, WAIVED, and PENDING. Do not calculate business acceptance from CI results.

## 8. Roles to nominate before the first session

| Role | Responsibility | Status |
|---|---|---|
| Business acceptance owner | Authorizes UAT scope and makes final accept/reject/waiver decisions | PENDING |
| UAT lead/coordinator | Schedules sessions, manages batch entry/exit and daily reporting | PENDING |
| Requirement/business SMEs | Validate expected outcomes against authoritative BRD/SRS criteria | PENDING |
| Business testers | Execute scenarios and record truthful actual outcomes/evidence | PENDING |
| Technical lead | Owns defects, fixes, build identity, deployment and retest readiness | PENDING |
| Evidence/QA controller | Reconciles register, evidence archive, exceptions and sign-off trail | PENDING |

One person may hold multiple roles only if the governance policy permits it; the final business approver must have explicit authority.

## 9. Daily control report

At the end of each session, publish:
- Requirements scheduled / attempted / executed.
- Counts by actual outcome and business decision, separately.
- Evidence-completeness count.
- New, open, fixed, retested and overdue defects.
- Blockers with owner, next action and due date.
- Build ID and authorized target preflight reference.
- Decision: continue, pause, or escalate; approver and timestamp.

## 10. Current decision and blockers

This plan is not proof that execution readiness has been achieved. At plan creation:
- Business acceptance owner and tester names: not confirmed.
- Authorized target, deployed build, and target preflight: must be confirmed for the execution session.
- Requirement-specific draft cases and acceptance oracles: require review against authoritative BRD/SRS criteria; draft patterns alone are insufficient.
- AWS infrastructure: do not provision until an approved plan and explicit authorization exist.
- Business execution and business sign-off: NOT EXECUTED.

**Immediate next action:** nominate the business acceptance owner and tester group, then resolve the B01 entry checklist in eper/uat/B01_BUSINESS_UAT_EXECUTION_READINESS.md. In parallel, review the 48 B01 draft cases and record owner decisions for the missing measurable acceptance oracles before booking the pilot.
