# B01 Blocker-to-Closure Matrix

**Batch:** B01  
**Scope:** Chapters 463–470; 48 requirements (6 per chapter)  
**Purpose:** One controlled view of the blockers preventing authorized business UAT. This matrix does not alter requirement definitions or mark evidence accepted.  
**Baseline:** Current checked-in B01 gap register, case approval checklist, and business UAT readiness checklist. Re-check these source files before changing any status.

## Current disposition

- **Business UAT:** NOT EXECUTED.
- **48 requirement cases:** Draft cases exist; review/approval remains pending.
- **Execution authorization:** NO for every checklist row.
- **E1–E13:** Pending until a real evidence reference and responsible owner are recorded.
- **AWS:** No chargeable resource provisioning is authorized by this matrix.
- **Technical CI:** A green build or health check is not business acceptance.

## Requirement batches — close in chapter-sized batches

| Batch | Requirements | Capability-family coverage | Current blocker | Closure evidence required | Exit condition |
|---|---|---|---|---|---|
| B01-A | REQ-46301–REQ-46306 | Records, Authorization, Business Validation, Audit & Evidence, Exception Handling, Governed Reporting | Draft cases not approved; LLD exact binding/acceptance oracle pending | Approved LLD locator and requirement/SRS acceptance source; reviewed case with measurable expected result and evidence plan | All 6 case rows approved; execution authorization remains NO until E1–E13 are cleared |
| B01-B | REQ-46401–REQ-46406 | Same six capability families | Same register-defined source and case-approval blockers; verify each row, do not infer closure from adjacent chapter | Requirement-specific approved source locator, reviewed scenario, test data/preconditions, positive and negative path, measurable result | All 6 case rows approved |
| B01-C | REQ-46501–REQ-46506 | Same six capability families | Same register-defined source and case-approval blockers; verify each row | Same evidence set, mapped to each requirement and SRS ID | All 6 case rows approved |
| B01-D | REQ-46601–REQ-46606 | Same six capability families | Same register-defined source and case-approval blockers; verify each row | Same evidence set, mapped to each requirement and SRS ID | All 6 case rows approved |
| B01-E | REQ-46701–REQ-46706 | Same six capability families | Same register-defined source and case-approval blockers; verify each row | Same evidence set, mapped to each requirement and SRS ID | All 6 case rows approved |
| B01-F | REQ-46801–REQ-46806 | Same six capability families | Same register-defined source and case-approval blockers; verify each row | Same evidence set, mapped to each requirement and SRS ID | All 6 case rows approved |
| B01-G | REQ-46901–REQ-46906 | Same six capability families | Same register-defined source and case-approval blockers; verify each row | Same evidence set, mapped to each requirement and SRS ID | All 6 case rows approved |
| B01-H | REQ-47001–REQ-47006 | Same six capability families | Same register-defined source and case-approval blockers; verify each row | Same evidence set, mapped to each requirement and SRS ID | All 6 case rows approved |

**Important:** The chapter batches above are work-planning groupings, not claims that every row has an identical defect. The row-level gap register and case checklist remain authoritative for the exact requirement ID, SRS mapping, source locator, and status.

## Entry-gate closure matrix

| Gate | Required closure evidence | Responsible role to identify | Current status | Blocks execution? |
|---|---|---|---|---|
| E1 | Evidence that GitHub Environment `eper-business-uat` exists and has approved protection/reviewer rules | Repository/environment administrator | PENDING | Yes |
| E2 | Confirmation that `UAT_ALLOWED_HOST` is configured to the exact approved hostname; do not expose secrets | Environment administrator | PENDING | Yes |
| E3 | Service-owner approval for HTTPS base URL and health path | Service owner | PENDING | Yes |
| E4 | Authorized preflight run URL plus artifact proving the expected deployed build identity | Release/UAT operator | PENDING | Yes |
| E5 | Explicit B01 execution approval with approver identity, date, and reference | Business owner | PENDING | Yes |
| E6 | Named tester and valid session authorization evidence | Identity/access owner | PENDING | Yes |
| E7 | Approved identity-provider OAuth login evidence; never capture tokens | Identity/access owner | PENDING | Yes |
| E8 | Tester role and tenant-scope authorization evidence | Business/access owner | PENDING | Yes |
| E9 | Approved test-data reference and permitted-use confirmation | Business data owner | PENDING | Yes |
| E10 | Evidence that target audit logs and business reports are accessible | Audit/reporting owner | PENDING | Yes |
| E11 | Controlled evidence archive location, naming convention, and index reference | Evidence custodian | PENDING | Yes |
| E12 | Defect/exception routes, named owners, and escalation path | UAT lead / operations owner | PENDING | Yes |
| E13 | All 48 rows have reviewed scenarios, measurable expected results, and approved requirement/SRS acceptance-source references | Requirements owner + business owner | PENDING | Yes |

## Execution control sequence

1. **Resolve source authority first.** Record the exact approved LLD version/locator and bind each requirement to the correct SRS/BRD acceptance source. Receiving a document is not the same as recording formal approval.
2. **Review the 48 cases in eight chapter batches.** Confirm actor/role/tenant, preconditions and data, positive and negative paths, measurable expected result, and evidence-capture plan. Record reviewer, decision, date, and approval reference in the checklist.
3. **Close E1–E12 with real evidence.** Each gate needs a reference and accountable owner; never infer it from a CI pass or this matrix.
4. **Authorize explicitly.** Keep execution authorization `NO` until the business owner approves B01 and every entry gate is verified. Any unresolved gate means STOP.
5. **Run technical evidence bridge and verify output.** Capture the actual workflow run URL, commit SHA, artifact name, and artifact digest. A workflow file existing on main is not proof that a run completed.
6. **Execute business UAT only against the approved HTTPS target.** For each case, record real timestamp, tester, environment/build, authorization reference, actual result, expected result, and evidence link.
7. **Reconcile outcomes.** Failed/blocked cases become tracked defects/exceptions. Acceptance requires a recorded PASS plus named approver and date. Do not infer G9 freeze or G10 certificate issuance.

## Closure decision

**Current decision: BLOCKED — NOT AUTHORIZED FOR BUSINESS UAT.**  
Reason: the checked-in baseline shows pending case approvals, no execution authorization, and pending E1–E13 gates. This is a controlled readiness disposition, not a declaration that the underlying product is complete or incomplete.

## Source-of-truth files

- `eper/uat/B01_REQUIREMENT_CASE_GAP_REGISTER.csv`
- `eper/uat/B01_48_CASE_APPROVAL_CHECKLIST.csv`
- `eper/uat/B01_BUSINESS_UAT_EXECUTION_READINESS.md`
- `eper/uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv`

Update those row-level registers when evidence changes; keep this matrix as the consolidated batch-control view.
