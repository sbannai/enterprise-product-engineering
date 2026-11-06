# B01 Requirements Baseline Decision Request

**Batch:** B01 — Chapters 463–470  
**Scope:** 48 requirements, REQ-46301–REQ-47006; SRS-FR-2323–SRS-FR-2370  
**Purpose:** Obtain the minimum authorized decisions required to approve requirement-level UAT cases.  
**Current disposition:** HOLD — do not execute business UAT or mark cases approved until the decisions below are recorded.

## Why a decision is needed

The repository's B01 case-gap register marks all 48 requirements as missing a verified approved acceptance-criteria source and missing approved scenario/expected-result references. Existing test cases are explicitly draft templates. Technical CI and automated pilot passes do not constitute business acceptance.

## Decisions requested from the authorized owners

### D1 — Confirm the controlled source baseline
The requirements owner and business owner must identify the authoritative, approved versions of:
- Requirement-level BRD for Chapters 463–470.
- SRS baseline containing SRS-FR-2323 through SRS-FR-2370.
- Applicable HLD/LLD references where architecture or implementation behavior is part of a requirement's acceptance.

For each source, record document ID, version, approval status, approval reference/date, and exact section/page/requirement locator. A file labelled draft or approval-pending must not be treated as approved solely because it exists in the archive.

**Decision:** APPROVE SOURCE SET / REJECT SOURCE SET / RETURN FOR CORRECTION  
**Source references:** To be supplied by owner  
**Approver / date / approval record:** To be completed by owner

### D2 — Decide how generic acceptance language will be handled
The current SRS baseline includes generic acceptance wording (for example, that a capability is available, constraints are enforced, and valid/invalid processing is handled). The owner must either:
1. approve a referenced, requirement-specific rule or acceptance source that makes the expected behavior testable; or
2. return the requirement for clarification and provide the missing actor, conditions, business rules, valid/invalid examples, state changes, and measurable expected outcomes.

Do not convert generic wording into a claimed business rule without owner confirmation.

**Decision:** REQUIREMENT-SPECIFIC SOURCE APPROVED / CLARIFICATION REQUIRED  
**Requirement IDs and exact locators:** To be completed by owner

### D3 — Review the 48 proposed test-case templates
Review eper/uat/B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv. For each of the 48 rows, confirm:
- actor, role, tenant and preconditions;
- valid and invalid scenario steps;
- exact expected result and no-change/rollback behavior where applicable;
- test-data reference;
- evidence to capture;
- BRD/SRS and, where applicable, HLD/LLD source locator.

A template is not approved until the requirement-specific content is checked and the reviewer records a decision.

**Decision:** APPROVE CASES / APPROVE WITH SPECIFIED CHANGES / REJECT AND RETURN  
**Case-level review record:** To be completed by owner/reviewer

### D4 — Authorize B01 execution only after entry gates pass
Once D1–D3 are recorded, the UAT lead must verify E1–E13 in eper/uat/B01_E1_E13_EVIDENCE_REQUEST_MATRIX.csv. The business owner then explicitly authorizes the B01 session, tester, target, build, and scope. Any unmet gate keeps execution on HOLD.

**Decision:** AUTHORIZE B01 / KEEP B01 ON HOLD  
**Authorized tester / target / build / session window:** To be completed by owner  
**Approver / date / approval reference:** To be completed by owner

## Approval and audit rules

- Do not pre-fill approvals, dates, execution results, evidence references, or owner decisions.
- Do not change any of the 228 requirement statuses from PENDING/NOT_RUN on the strength of this request.
- Keep technical CI, automated pilot evidence, business UAT outcomes, and final acceptance as distinct evidence classes.
- Any requirement returned for clarification remains blocked until the approved source and revised case are linked.
- If the owner cannot identify an approved source baseline, escalate that as a requirements-governance decision; do not create a substitute approval.

## Current gate conclusion

**B01 remains HOLD / NOT EXECUTED.** The next closure action is an authorized D1–D3 decision, not another technical rerun. After those decisions, update the 48 case rows and re-evaluate E13 before requesting execution authorization.
