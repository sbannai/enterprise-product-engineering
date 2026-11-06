# B01 Authorized UAT Access Package

**Batch:** B01 — Chapters 463–470 — 48 requirements  
**Status:** PREPARATION TEMPLATE — NOT AUTHORIZED / NOT EXECUTED  
**Control source:** `B01_BUSINESS_UAT_EXECUTION_READINESS.md` and `B01_OWNER_DECISION_LOG.csv`

## Purpose
Collect the minimum approved access and environment evidence required before executing business UAT. This package is a checklist and evidence index; it does not grant access, configure the environment, authorize testing, or certify any requirement.

## A. Environment and target
1. The environment owner confirms the protected GitHub Environment `eper-business-uat`, required reviewers, and branch restrictions.
2. The owner configures `UAT_ALLOWED_HOST` as an environment variable containing only the exact approved host (including port if non-default). Never put credentials in the variable.
3. The service owner records approval for the HTTPS base URL and a safe, read-only health path.
4. The service owner supplies the expected deployed build/commit identifier and the JSON field containing it.
5. Run **EPER Authorized UAT Target Preflight** only after the above inputs are approved. Record workflow URL, run ID, artifact reference, observed build ID, and timestamp.
6. A preflight PASS proves reachability/build identity only; it does not establish login, authorization, business functionality, acceptance, release authorization, G9 freeze, or G10 certification.

## B. Tester identity, OAuth and authorization
1. Identify the named tester using the organization's approved identity/access request process.
2. Confirm the approved identity provider and OAuth client/application configuration through the responsible administrator; do not record client secrets, tokens, cookies, or authorization codes in this repository.
3. Verify login using the authorized tester account and record only a sanitized evidence/ticket reference, timestamp, and outcome.
4. Obtain the approved role-to-action matrix and confirm the tester's role, allowed actions, and tenant scope.
5. Confirm any least-privilege restrictions and approved negative tests. Never probe another tenant or attempt privileged actions unless explicitly in the approved test scope.

## C. Test data
1. Record the approved data-set/reference, data owner, tenant/scope, refresh/reset method, and permitted test window.
2. Confirm data is synthetic or otherwise approved for UAT and contains no unapproved personal/sensitive information.
3. Record pre-test state or controlled snapshot reference when the test requires before/after comparison.
4. Define cleanup/reset and duplicate/replay safety for the approved cases.

## D. Audit, reporting and evidence
1. Confirm the tester or evidence collector has read access to required audit events and business reports.
2. Verify the evidence archive location, access controls, naming convention, retention policy, and immutable/versioned reference method.
3. Use sanitized evidence: timestamps, record IDs, correlation IDs, report/export references, and redacted screenshots where permitted. Do not commit secrets or unnecessary personal data.
4. Confirm evidence can be retrieved by an independent reviewer using the reference alone.

## E. Defect and exception handling
1. Identify the approved defect/exception tracker, triage owner, severity definitions, SLA, and escalation route.
2. Ensure a blocker owner and next action can be recorded for every blocked case.
3. Agree how failed tests, test-environment failures, data issues, and requirement ambiguity are distinguished.
4. Never change an outcome to PASS because an issue was closed; rerun the approved case and attach fresh evidence.

## F. Go/no-go for B01
The authorized business owner must review all E1–E13 readiness gates and the 48 requirement-level cases. B01 starts only when every gate has evidence and every case has approved steps, expected results, source locators, and approved data. Any unknown or pending gate means **NO-GO**.

## Evidence references to record
Use `B01_ACCESS_EVIDENCE_REGISTER.csv` for each evidence item. Keep the related owner decisions in `B01_OWNER_DECISION_LOG.csv`. Record unresolved items as blockers; do not mark a gate complete based on a planned action.

## Current boundary
This package is a preparation artifact only. No access is presumed to be provisioned, no target is presumed approved, and no test execution or business acceptance is claimed.
