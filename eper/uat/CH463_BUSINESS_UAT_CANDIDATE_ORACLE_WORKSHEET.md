# Chapter 463 Business UAT — Candidate Oracle Worksheet

**Document ID:** EPER-B01-CH463-UAT-ORACLE-WORKSHEET-001  
**Prepared:** 2026-10-19  
**Status:** DRAFT — NOT APPROVED; NOT AN ACCEPTANCE AUTHORITY  
**Scope:** Existing six cases only: B01-463-01 through B01-463-06 / REQ-46301 through REQ-46306 / SRS-FR-2323 through SRS-FR-2328. Option A and the 228 requirements / 38 chapters remain unchanged.

## How to use this worksheet

This is a structured draft based on the current implementation tests and crosswalk, to accelerate a business walkthrough. It is not a substitute for the approved HLD/LLD, policy catalogue, or business oracle. The business owner must confirm or amend each expected outcome before formal UAT. Until then, formal cases remain `NOT_RUN`.

## Six-case candidate oracle matrix

| Canonical case / requirement | Candidate business journey | Candidate observable outcomes to validate | Negative / boundary check | Oracle status | Current formal UAT status |
|---|---|---|---|---|---|
| B01-463-01 / REQ-46301 / SRS-FR-2323 | Create an authoritative record, update its state, then attempt an update with a stale expected version. | Record identity and tenant are preserved; successful update increments version from 1 to 2; returned state matches the submitted change. Confirm which lifecycle states are actually permitted from the approved catalogue. | Stale version is rejected with the documented conflict outcome; no unintended overwrite. | NOT APPROVED — approved schema, lifecycle catalogue and conflict oracle missing. | NOT_RUN |
| B01-463-02 / REQ-46302 / SRS-FR-2324 | Evaluate a matching allow and deny policy together; then request an action with no matching policy. | Explicit deny takes precedence; absent matching authorization defaults to deny. Confirm approved role/action/resource/tenant policy and expected user-facing result. | Unauthorized action is denied and does not perform the protected operation. | NOT APPROVED — approved authority matrix and policy baseline missing. | NOT_RUN |
| B01-463-03 / REQ-46303 / SRS-FR-2325 | Validate one valid business input and one invalid input. | Valid input produces a valid result; invalid input produces a structured ERROR issue and invalid result. Replace the synthetic positive-amount rule with the approved domain rule before acceptance. | Boundary values, missing fields and error wording follow the approved rule catalogue. | NOT APPROVED — approved business rule catalogue and measurable domain oracle missing. | NOT_RUN |
| B01-463-04 / REQ-46304 / SRS-FR-2326 | Append evidence, retrieve it within the tenant, then query from a different tenant. | Evidence can be retrieved for the intended tenant; integrity hash is present and verifiable; cross-tenant query returns no foreign evidence. Confirm audit fields, timestamp trust, retention and access expectations. | Tampered evidence is detected or rejected according to approved design; another tenant cannot retrieve the entry. | NOT APPROVED — approved audit schema, retention and integrity-control specification missing. | NOT_RUN |
| B01-463-05 / REQ-46305 / SRS-FR-2327 | Create an exception, transition it through retrying and resolved, then attempt an invalid transition back to retrying. | Exception starts in the approved initial state; permitted transitions are recorded; invalid terminal transition is rejected. Confirm whether retry scheduling/backoff and escalation are in scope for this journey. | Duplicate/idempotent create and forbidden state transition behave as approved. | NOT APPROVED — approved exception lifecycle, retry and escalation specification missing. | NOT_RUN |
| B01-463-06 / REQ-46306 / SRS-FR-2328 | Publish a report row, query by report/filter, then query from another tenant. | Intended tenant can query the matching row; filters and limit are respected; other tenant receives no row. Confirm approved report definition, metric formulas, freshness and lineage. | Cross-tenant isolation and unauthorized report access are denied; empty results are represented as specified. | NOT APPROVED — approved report catalogue, metric definitions and data-lineage source missing. | NOT_RUN |

## Evidence packet required for each formal case

Capture all fields below in the controlled evidence register, using synthetic or approved test data only:

1. Canonical case ID, requirement ID, SRS ID, test attempt ID and case version.
2. Approved oracle/source reference, source version and approval record.
3. Environment/base URL, deployed build ID, timestamp with timezone and session authorization reference.
4. Tester identity and role, tenant/test-data identifiers, preconditions and setup evidence.
5. Steps and inputs, expected outcomes, actual outcomes, request/correlation IDs and sanitized response/log references.
6. Evidence filenames and hashes, defects/deviations, retest linkage, result and tester/business-owner sign-off.

Never store credentials, bearer tokens, or unnecessary personal data in the evidence packet.

## Readiness decisions

- Technical smoke evidence exists for all six HTTP operation paths on the recorded PR merge build. It is technical evidence only and does not approve the candidate business outcomes above.
- The protected UAT API is disabled in current configuration. Do not enable it or use a public route until the environment/security owner approves a safe execution route.
- The six cases remain `NOT_RUN` until a controlled, authorized business session is executed and evidence is captured.
- No requirement IDs, SRS IDs, canonical case IDs, or the 228/38 baseline may be changed by this worksheet.

## Source basis

- `eper/CH463_IMPLEMENTATION_TO_DESIGN_CROSSWALK.md`
- `eper/tests/requirement-acceptance-wave-01.test.mjs`
- `eper/uat/B01_BUSINESS_UAT_READINESS_FIRST_PLAN.md`

The source test patterns are implementation observations. They must not be presented as approved domain policy or formal acceptance criteria.


## 1.1 Existing Library decision sources reconciled — 2026-10-19

The worksheet was cross-checked against the existing Library artifacts surfaced for Chapter 463; this is not a request for the business owner to recreate the work from scratch:

- `CH463_Acceptance_Oracle_and_Approval_Matrix_v0.1.docx` — controlled change candidate, explicitly **NOT APPROVED / NOT A REISSUED BASELINE**. It already frames all six oracles and their missing decisions.
- `B01_CH463_Business_Rule_and_Acceptance_Register_v0.5.xlsx` — latest surfaced register version; the D1–D10 decision/control register records D4 audit, D5 exception handling, D6 reporting/KPIs, D7 HLD/LLD binding, D8 DATA/schema, D9 API/Event, and D10 controlled release as open where approvals/evidence are missing.
- `B01_CH463_UAT_Evidence_Readiness_v0.7.xlsx` — existing case-level readiness tracker. The surfaced case rows explicitly retain `DRAFT_TEMPLATE_NOT_APPROVED; REVIEW_REQUIRED; NOT_RUN`, execution authorization `NO`, and list missing oracle, design binding, actor/test data, expected result, reviewer, and approval reference.
- `B01_CH463_Controlled_Change_Approval_and_Evidence_Request_v0.1.docx` — controlled working candidate, not approval; confirms D1–D9 source/decision closure precedes D10.

**Reconciliation outcome:** the current candidate worksheet is a repo-side convenience view of existing Library work, not a replacement baseline. Use the existing v0.5 register and v0.7 evidence-readiness workbook as the primary working trackers; retain their open statuses and do not downgrade/overwrite them with this draft. No approved acceptance oracle, owner approval, or D10 disposition was found in the surfaced excerpts. Therefore the six formal cases remain `NOT_RUN`.

**Efficient next action:** continue from the existing decision register and evidence-readiness tracker, mapping each open decision to its owner/source artifact and collecting actual approved source evidence where available. Only issue an approval when the corresponding signed/controlled source is present.
