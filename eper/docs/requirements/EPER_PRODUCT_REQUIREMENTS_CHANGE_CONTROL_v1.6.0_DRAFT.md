# EPER Product Requirements Addendum — v1.6.0 (DRAFT)

**Document ID:** EPER-PRD-ADD  
**Status:** Draft for owner approval; not an implementation authorization  
**Supersedes:** None  
**Baseline preserved:** 228 approved requirements across Chapters 463–500  
**Source:** Customer & Admin Workspace Wireframe v34 (2026-10-27)

## 1. Purpose

This draft carries forward the 45 candidate requirements captured from the owner-selected v34 wireframe. The original requirement IDs, complete statements, acceptance criteria, proposed priorities and wireframe source locators are preserved in:

- `source/EPER_CW_Wireframe_v34_Requirements_Source_Export.csv`
- `../product-baselines/EPER_Customer_Admin_Workspace_Wireframe_v34_Campaign_Scheduler_Agents_Ticketing_2026-10-27.html`

The technical reconciliation is in [EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md](EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md).

## 2. Version decision

The existing controlled register already records EPER-ACT-APPROVAL-001 as version 1.5.0. The source workbook's proposal to call v34 requirements v1.5.0 is therefore superseded by repository history. This candidate feature set is carried as **v1.6.0 DRAFT**. Do not update the controlled current version to 1.6.0 until the owner approves the 45-row additive scope and proposed priorities.

## 3. Candidate population

The draft population is exactly 45 IDs:

- EPER-CW-001 through EPER-CW-045.
- Original requirement statements and acceptance criteria are retained verbatim in the source CSV.
- Proposed Must/Should classifications remain proposals, not approved delivery commitments.
- All 45 are additive at the customer-workspace feature level because the 228 registry exposes shared generic control patterns rather than detailed workspace feature acceptance criteria.
- Existing shared controls and additive requirements are linked in the crosswalk; no exact 228 REQ-ID mapping is claimed where the source does not establish one.

## 4. Mandatory cross-cutting acceptance

Every candidate feature must, where applicable:
1. Resolve tenant, actor, role, application and entitlements from trusted server-side identity and assignment state.
2. Enforce tenant/application scope on reads, writes, exports, downloads, events and asynchronous worker actions.
3. Persist authoritative state in PostgreSQL with migrations, versioning, concurrency and restart tests.
4. Record attributable audit events and fail closed where protected persistence/audit is unavailable.
5. Use stable API contracts, request/correlation IDs, safe error messages and bounded pagination.
6. Provide accessible responsive UI with loading, empty, disconnected, error and success states.
7. Provide executable positive and negative acceptance tests tied to exact commit SHA and workflow run.
8. Keep external sends, publishing and CRM mutations blocked until the exact action has durable human approval and is re-authorized at execution.

## 5. Candidate requirements

See the complete 45-row source export. The source IDs are immutable and must not be reused. Each implementation PR, test, defect and release note must reference the candidate ID and v1.6.0 draft.

## 6. Approval and change control

- Owner decision: approve, revise or defer the v1.6.0 candidate scope and priority classifications.
- Until approval, candidates remain DRAFT and must not be reported as approved baseline requirements.
- Any owner-directed changes must update this draft, crosswalk and source trace without deleting the original source statements.
- The approved 228 requirements and 38 chapters remain unchanged.
- Business UAT authorization remains a separate gate and is not granted by this addendum.
