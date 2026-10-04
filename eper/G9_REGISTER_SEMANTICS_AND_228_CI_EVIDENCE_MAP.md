# G9 Register Semantics and 228-Requirement CI Evidence Map

**Date:** 2026-10-04  
**Register schema:** `eper/WHOLE_BATCH_ACCEPTANCE_REGISTER.json` v1.1.0  
**Classification:** Automated pilot evidence only; not business UAT or formal acceptance.

## Source execution

- Workflow: [EPER-REEXEC-003 228 Requirement Pilot Test Matrix](https://github.com/sbannai/enterprise-product-engineering/actions/runs/37188613347)
- Tested commit: `1142a5ccf34538a77089c3b6a0592a359a03101d`
- Artifact: `EPER-REEXEC-003-228-REQUIREMENT-TEST-MATRIX-37188613347`
- SHA-256: `c38e5ae28d3932404bb6e754c714ca648649de7f5be46f59d08b136e707b8c82`
- Artifact result: 38/38 chapter suites PASS; 248/248 tests PASS; 228/228 requirement rows classified `AUTOMATED_PILOT_TEST_PASS_NOT_BUSINESS_UAT`.

## Register change

The 228 rows now have two separate fields:
- `automatedPilotTestEvidence`: records the run URL/ID, tested commit, artifact name/digest, chapter test file, requirement ID source/title presence and PASS classification.
- `approvedAcceptanceTestExecution`: remains `NOT_EXECUTED`; approval-case, version, session, environment, actual result, tester, business authority and evidence reference are null pending authorized execution.

Legacy `requirementTest=false` and `testExecution=false` values were deliberately preserved. They remain reserved for execution against approved requirement-specific acceptance cases, not merely a pilot test containing a requirement ID.

## Reconciliation rules

1. Automated pilot evidence PASS must never automatically set business UAT, final acceptance, release, production or traceability freeze to PASS.
2. The recorded artifact is tied to commit `1142a5c...`; later code changes require a fresh run to establish current-code execution.
3. The matrix proves the chapter suite passed and the requirement ID is present in test source and execution output. It does not prove the test oracle was approved by the business owner.
4. Do not infer defect-free status; record a controlled defect/no-defect decision during authorized acceptance execution.
5. A requirement advances only when its authoritative requirement-specific acceptance evidence and approval are present.

## Current disposition

- Automated pilot evidence: 228/228 PASS at the cited commit.
- Approved acceptance-test execution: 0/228; NOT EXECUTED.
- Business UAT / formal UAT sign-off: NOT EXECUTED.
- G9 traceability freeze: HOLD / NOT FROZEN.
