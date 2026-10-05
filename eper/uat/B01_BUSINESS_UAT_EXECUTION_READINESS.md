# EPER B01 Business UAT Execution Readiness Checklist

**Batch:** B01  
**Scope:** Chapters 463–470; 48 requirements  
**Register:** `eper/uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv`  
**Status at preparation:** NOT EXECUTED — READINESS CHECKLIST ONLY

This checklist prepares the first business UAT batch. It is not evidence that the environment is configured, access is authorized, UAT has run, or any requirement is accepted.

## 1. Entry gate — do not execute until every item is verified

Record a real value/reference and the responsible person for each item. Do not mark an item complete based only on this checklist or a technical CI pass.

| Gate | Required verification | Evidence/reference to capture | Status |
|---|---|---|---|
| E1 | Protected GitHub Environment `eper-business-uat` exists and required reviewers/branch restrictions are configured as approved | Settings evidence or authorized admin confirmation | PENDING |
| E2 | `UAT_ALLOWED_HOST` is set to the exact approved host | Environment variable configuration confirmation; never record secrets | PENDING |
| E3 | Service owner approved the HTTPS base URL and health path | Approval/ticket reference | PENDING |
| E4 | Authorized target preflight passed for the expected deployed build ID | Workflow run URL and artifact references | PENDING |
| E5 | Business owner authorized B01 execution | Approval reference, approver, date | PENDING |
| E6 | Named tester identity and session authorization are valid | Access request/authorization reference | PENDING |
| E7 | OAuth login has been verified using the approved identity provider | Authentication test evidence reference; do not capture tokens | PENDING |
| E8 | Required role and tenant scope are confirmed for the tester | Access matrix / authorization evidence | PENDING |
| E9 | Test data is approved and identifiable | Approved test-data reference | PENDING |
| E10 | Target audit logs and business reports are accessible | Access verification evidence | PENDING |
| E11 | Evidence archive location and naming/reference convention are available | Archive index/location reference | PENDING |
| E12 | Defect and exception handling routes, owners, and escalation path are known | Tracker/project reference | PENDING |
| E13 | Every in-scope B01 requirement has a reviewed scenario reference, explicit expected result, and approved requirement/SRS acceptance-criteria source reference | Completed case-gap register and source-document references; business/requirements owner approval | PENDING |

**Gate decision:** B01 may start only after the authorized business owner confirms E1–E13 are satisfied. E13 is requirement-specific: a pattern/capability label is not an executable test case. Each of the 48 rows must point to reviewed scenario steps, an explicit expected result, and the approved source acceptance criteria. If any item is blocked or unknown, record the blocker and stop; do not manufacture execution records.

The initial gap inventory is `eper/uat/B01_REQUIREMENT_CASE_GAP_REGISTER.csv`. It records missing case inputs as gaps only; it is not an approved test-case set and must not be used to infer results.

## 2. Batch scope

B01 covers exactly the 48 register rows for Chapters 463–470:

- Chapter 463: REQ-46301 through REQ-46306
- Chapter 464: REQ-46401 through REQ-46406
- Chapter 465: REQ-46501 through REQ-46506
- Chapter 466: REQ-46601 through REQ-46606
- Chapter 467: REQ-46701 through REQ-46706
- Chapter 468: REQ-46801 through REQ-46806
- Chapter 469: REQ-46901 through REQ-46906
- Chapter 470: REQ-47001 through REQ-47006

The register's `pattern`, `capability`, `scenario_reference`, and `expected_result` fields remain the starting point for each row. Confirm each scenario and expected result against approved requirement-level acceptance criteria before executing it. Do not assume all requirements in a pattern are interchangeable.

## 3. Per-requirement execution protocol

For each requirement, one row at a time:

1. Confirm requirement ID and SRS mapping against the authoritative register.
2. Confirm approved scenario, test data, tester identity, target environment, and build commit.
3. Execute the approved steps on the authorized target only.
4. Record timestamp, environment, build commit, session authorization reference, actual steps, expected result, actual result, and outcome.
5. Link immutable or controlled evidence in the evidence archive; do not put credentials or tokens in the register.
6. For `FAIL`, record a defect or exception reference and route it to an owner.
7. For `BLOCKED`, record an exception reference and blocker owner/next action.
8. For `NOT_APPLICABLE`, record the evidence and rationale required by the approved process; a business decision of `WAIVED` requires an authorized approver and date.
9. Keep business decision `PENDING` until the authorized business decision is actually made and recorded.
10. Never mark `ACCEPTED` unless the executed outcome is `PASS` and approver/date are recorded.

Do not pre-fill execution timestamps, actual results, evidence references, or approvals. Do not change `NOT_RUN` to an executed outcome before execution.

## 4. Batch closeout criteria

B01 is ready for business review only when all 48 rows have either:
- complete execution evidence and an outcome; or
- a documented blocker/exception with owner and next action.

B01 is accepted only after the authorized business owner records decisions with the required evidence and approval metadata. A batch report must distinguish executed, passed, failed, blocked, not applicable, accepted, rejected, waived, and pending counts. Never derive acceptance from test-run success alone.

## 5. Batch session log

Complete this section during authorized execution; leave blank until then.

- Session ID:
- Business owner / authorizer:
- Tester:
- UAT target host (no credentials):
- Health preflight run / artifact:
- Deployed build commit:
- Approved test-data reference:
- OAuth verification evidence:
- Role/tenant verification evidence:
- Audit/report access evidence:
- Execution start/end timestamps:
- Evidence archive/index reference:
- Defect/exception tracker:
- Business decision / approver / date:
- Open blockers and owners:

## 6. Current evidence boundary

At checklist creation, this document establishes only the planned B01 scope and entry/exit criteria. It does not prove any environment setup, target reachability, OAuth verification, execution, acceptance, G9 traceability freeze, or G10 certification. Keep the authoritative register's existing statuses until supported by real evidence and authorized decisions.


## Current RC4 readiness checkpoint — 2026-10-05

- Operative candidate: RC4 artifact `11306122539`; GitHub artifact digest `sha256:7206c96e72ce6a3279cd62063a694c3c4ecc558d92ae66622297a988f87e075a`.
- The 48 draft requirement-level cases are present in `B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv`; they remain draft/unapproved and must not be executed as business acceptance without owner decisions.
- The 48-case approval checklist is present and all execution authorization fields remain `NO` pending review.
- E1–E13 evidence requests are prepared; target/environment authorization and business owner approval remain pending.
- Upstream blockers: #72 owner acceptance/source decisions and #73 SRC-003 authoritative Chapter 463 design evidence.

**Execution rule:** when upstream decisions and E1–E13 evidence are satisfied, use the RC4 candidate and create a real UAT session record before executing B01. Technical QA or simulation results do not populate business acceptance.