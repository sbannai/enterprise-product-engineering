# B01 Owner Decision Log

**Scope:** B01, Chapters 463–470, 48 requirements  
**Status:** Controlled decision template — no approvals implied  
**Related artifacts:** `B01_BUSINESS_UAT_EXECUTION_READINESS.md`, `B01_BRD_SRS_CASE_RECONCILIATION.csv`, `B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv`.

## Purpose
Record explicit owner decisions and evidence for the operational B01 entry gates and each requirement's test-case approval. This log is not itself an authorization or approval.

## Decision rules
- Only the designated, authorized owner/approver may decide; identify the person, role, date/time, evidence reference and rationale.
- Keep decisions `PENDING` until the authorized person records them.
- Do not treat green CI, a successful health preflight, a drafted test, or a populated register as business approval.
- For requirement-level decisions, cite the approved BRD/SRS version and exact section/paragraph plus the approved case version.
- A decision to defer/reject/return for rework must include a next action and owner.
- Do not store passwords, access tokens, session cookies or other secrets in this log.
- Do not change execution outcome or business acceptance fields in the authoritative capture register based on this decision log alone.

## Included decisions
- 13 operational/entry-gate decisions.
- 48 requirement-level test-case/source-acceptance approvals.
- All decisions start at `PENDING` and `OPEN`; this is intentional.

## Minimum evidence for a decision
1. Decision owner and approver identity/role.
2. Decision and rationale.
3. Controlled source/case version and exact locator.
4. Evidence/ticket/archive reference.
5. UTC decision date/time.
6. Next action, owner and due date if unresolved.

**Current gate position:** B01 remains blocked until all readiness checklist gates E1–E13 are evidenced and the business owner explicitly authorizes execution.
