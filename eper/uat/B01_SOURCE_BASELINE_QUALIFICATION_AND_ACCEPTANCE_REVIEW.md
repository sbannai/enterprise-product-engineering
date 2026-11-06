# B01 Source Baseline Qualification and Acceptance Criteria Decision Pack

**Assessment date:** 2026-10-04  
**Scope:** Chapters 463–470; 48 requirements  
**Decision state:** OWNER REVIEW REQUIRED — NOT APPROVED; B01 NOT AUTHORIZED FOR BUSINESS UAT

## 1. Newly identified consolidated source artifacts

| Layer | Candidate artifact | What it establishes | What it does not establish |
|---|---|---|---|
| BRD | `EM-BRD-001_Consolidated_BRD_Chapters_463-500_v1.0.docx` | 228 requirement IDs and recurring requirement pattern/priority mapping | Its own status says approval/sign-off required; generic recurring patterns do not replace detailed domain-specific outcomes |
| SRS | `EM-SRS-001_Consolidated_SRS_Chapters_463-500_v1.0.docx` | 228 BRD↔SRS mappings; SRS-FR-2323–2550 | Its own status says requirements-baseline approval required; requirement text defers actors, conditions, rules, constraints and outcomes to the parent BRD |
| HLD | `EM-HLD-001_Consolidated_HLD_Chapters_463-500_v1.0.docx` | Supporting architecture targets for all 228 requirements | Each row is marked “SUPPORTING DESIGN — EXACT LOCATOR PENDING”; not approved requirement-level traceability |
| LLD | `EM-LLD-001_Consolidated_LLD_Chapters_463-500_v1.0.docx` | Supporting detailed-design targets for all 228 requirements | Each row is marked “SUPPORTING DESIGN — EXACT BINDING PENDING” |
| Crosswalk | `EM-OPS_463-500_228_Requirement_Evidence_Crosswalk_v1.0.xlsx` | Current consolidated gate totals | Records exact HLD 0/228, exact LLD 0/228, explicit HLD→LLD pairs 0/228, DATA/API/EVENT dispositions 0/228, UAT 0/228, acceptance 0/228, G9 NOT FROZEN, G10 0/228 |

These artifacts are useful source candidates and reconciliation inputs. Their presence does not override their own approval and traceability limitations.

## 2. B01 acceptance criteria disposition by pattern

The following are **proposed review prompts**, not approved acceptance criteria. The business owner must confirm domain-specific actors, data objects, rules, thresholds, lifecycle states, evidence retention and exception semantics from an approved detailed BRD/source. A generic pattern alone is not an execution oracle.

| Pattern / SRS | Draft testable review prompt | Business decision required before approval |
|---|---|---|
| XX01 — SRS-FR-2323, 2329, 2335, 2341, 2347, 2353, 2359, 2365 | For an approved domain record, verify permitted create/read/update/lifecycle operations preserve a single authoritative identity, tenant scope and version/history; invalid or stale changes must not silently overwrite current state. | Identify the authoritative entity, allowed lifecycle states/transitions, uniqueness rules, required fields, concurrency/version policy, retention and exact success/error outcomes for each chapter. |
| XX02 — SRS-FR-2324, 2330, 2336, 2342, 2348, 2354, 2360, 2366 | Execute the same material action under an approved authorized and unauthorized role; prove policy outcome, tenant boundary, no unauthorized state mutation, and required security/audit evidence. | Approve role/action/resource matrix, privileged operations, tenant-crossing rules, deny semantics and expected user/API response per domain. |
| XX03 — SRS-FR-2325, 2331, 2337, 2343, 2349, 2355, 2361, 2367 | Submit one valid case and one case violating each owner-selected mandatory rule; valid input must reach the specified outcome, invalid input must return the specified validation outcome without unintended partial material change. | List mandatory rules, field constraints, boundary values, ordering/dependency rules, error codes/messages, transaction/rollback expectation and test data. |
| XX04 — SRS-FR-2326, 2332, 2338, 2344, 2350, 2356, 2362, 2368 | Perform a material action and verify a retrievable, attributable evidence record with the policy-required actor, tenant, target, action, timestamp, outcome and correlation linkage. | Approve event catalogue, mandatory fields, access policy, retention, immutability/integrity controls, sensitive-payload exclusions and expected evidence query. |
| XX05 — SRS-FR-2327, 2333, 2339, 2345, 2351, 2357, 2363, 2369 | Trigger an owner-approved recoverable failure and a non-recoverable/invalid transition; verify bounded retry/recovery, stable idempotency, correct terminal/exception state and required evidence. | Approve retryable classifications, retry/backoff limit, idempotency scope, compensation, escalation/DLQ rules, terminal states, owner and expected recovery outcomes. |
| XX06 — SRS-FR-2328, 2334, 2340, 2346, 2352, 2358, 2364, 2370 | Query a governed report for an approved tenant and filter; verify only authorized rows and approved values are returned and the report can be traced to its governed source. | Approve report catalogue, metric definitions/formulas, source lineage, freshness/aggregation rules, filter semantics, limits, access policy and reconciliation tolerance. |

SRS IDs in each row above are the six-per-chapter sequence for Chapters 463–470. Use the existing controlled REQ↔SRS register as the identity source; do not use this pattern table as a substitute for the 48-row case review.

## 3. Mandatory decisions before execution

1. **D1 — Baseline approval:** approve or return the candidate BRD/SRS/HLD/LLD versions, including approver, effective date, document version/hash, and authoritative locator.
2. **D2 — Acceptance source:** for all 48 requirements, link the approved detailed requirement/acceptance source or record a formal clarification request. No acceptance rule may be inferred solely from XX01–XX06.
3. **D3 — Case approval:** complete all 48 rows of `B01_48_CASE_APPROVAL_CHECKLIST.csv` with reviewer, decision date, approval reference, measurable expected result and evidence plan.
4. **E1–E13:** attach real entry-gate evidence and review decisions.
5. **D4 — Execution authorization:** name the approved tester, target environment/build, scope and session only after D1–D3 and E1–E13 are satisfied.

## 4. Current gate decision

- BRD↔SRS identity: 48/48 mappings established for B01.
- Candidate consolidated BRD/SRS: available for owner review; approval is not evidenced by these artifacts.
- Exact HLD/LLD bindings: still not evidenced at requirement level.
- Requirement-specific measurable acceptance criteria: still require source-backed owner decisions.
- Business UAT: NOT EXECUTED.
- Formal acceptance: NOT RECORDED.
- SRC-003/G3 and G9: OPEN / NO-GO.

**Decision requested:** authorized business and requirements owners must approve the controlled baseline and per-requirement acceptance or return specific rows for clarification. Until then, retain HOLD / NOT EXECUTED.
