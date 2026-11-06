# Chapter 463 Procurement Domain Candidate Crosswalk — Owner Validation Required

- Record ID: B01-CH463-PROC-CANDIDATE-CROSSWALK-001
- Date: 2026-10-12
- Source: `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx`
- Source sections: §§463.1–463.47, particularly §§463.3, 463.7–463.8, 463.10–463.18, 463.21–463.43, 463.46–463.47
- Baseline: `B01-BASELINE-APPROVAL-001` preserved
- Source precedence: **APPROVED OPTION A**, decision record `B01-CH463-SOURCE-CORRECTION-DECISION-001`, change `B01-CH463-CC-001`, effective 2026-10-12
- Status: DOMAIN SOURCE CONFIRMED; SIX REQUIREMENT MAPPINGS STILL CANDIDATE — NOT APPROVED

## Why this exists

The Design Authority confirmed the dedicated Volume XIII Chapter 463 Procurement & Source-to-Pay artifact as the domain source. The conflicting consolidated BRD §463.21 and HLD recovery-matrix heading must be corrected or formally superseded under controlled change. This crosswalk captures plausible candidate anchors for row-level review; it does not assert that the generic six requirement patterns are already approved procurement requirements.

## Six-row candidate crosswalk

| Existing requirement identity | Existing generic pattern / SRS | Candidate procurement-domain anchors in Volume XIII | Evidence locator | Approval state / required action |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | XX01 — authoritative records/lifecycle | Requisition, sourcing event, supplier qualification, award, PO and contract records; lifecycle/status and transaction lineage. Candidate only because the generic row does not identify the procurement aggregate. | §§463.7–463.8, 463.9–463.10, 463.11–463.18, 463.21–463.43; acceptance criteria §463.46 | Domain source approved; owner must confirm domain object(s), lifecycle states, system of record and retention/history rule. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | XX02 — role-based authorization | Delegated approval authority, segregation of duties, controlled supplier participation, restricted/blocked supplier controls and award/commitment authority. | §§463.3, 463.8, 463.9–463.10, 463.12–463.18, 463.44, 463.46–463.47 | Domain source approved; owner must confirm roles, permission matrix, segregation constraints, approval thresholds and negative cases. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | XX03 — mandatory business conditions | Budget/category/sourcing requirement validation; supplier qualification; sourcing thresholds and policy; requisition/PO controls; approved commercial terms. | §§463.3–463.8, 463.10–463.18, 463.21–463.43, 463.46–463.47 | Domain source approved; owner must confirm exact validation rules, threshold source, failure outcomes and measurable boundary tests. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | XX04 — audit evidence | Evidence-based supplier evaluation, retained award criteria/evidence/rationale, contract terms/version, procurement approvals and traceability into receiving/AP/financial reporting. | §§463.3, 463.10–463.18, 463.21–463.43, 463.45–463.47 | Domain source approved; owner must confirm required audit fields/events, actor/time/source lineage, retention and retrieval expectations. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | XX05 — controlled exception handling | Emergency and sole-source exceptions; policy exceptions; restricted supplier cases; sourcing/PO change controls; recovery and no-duplicate-award/order continuity checks. | §§463.3, 463.8, 463.9–463.18, 463.21–463.43, 463.46–463.47 | Domain source approved; owner must confirm exception categories, justification/approvals, retry/replay/compensation rules and terminal outcomes. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | XX06 — governed reporting | Spend/category performance, sourcing and award visibility, procurement compliance, and reconciled transaction lineage to receiving, AP and financial reporting. | §§463.4–463.6, 463.21–463.43, 463.45–463.47 | Domain source approved; owner must confirm metric definitions, authoritative source, freshness, access rules, reconciliation tolerances and report thresholds. |

## Explicit limits

- The domain source is now confirmed, but these are still **candidate one-to-one mappings**. One generic pattern may span several procurement objects or controls.
- Chapter-level acceptance criteria in §463.46 and checklist items in §463.47 inform row-level decisions but do not automatically become six approved acceptance oracles.
- Do not infer exact HLD/LLD bindings by naming similarity or component pattern. Exact HLD locators and HLD→LLD pairs remain open.
- DATA/API/EVENT must be evidenced per requirement with approved schema/entity owner and contract/version, or an authorized explicit N/A. Absence is not N/A.
- Preserve the approved baseline and existing REQ/SRS/TRC IDs. This decision does not authorize execution.

## Required row-level disposition

For each row, record one of:
- `ACCEPT CANDIDATE` plus exact controlled BRD rule locator and measurable acceptance oracle;
- `REJECT / REMAP` plus the correct domain mapping/source; or
- `CLARIFICATION REQUIRED` plus accountable owner and due date.

Then record exact approved HLD locator, LLD locator, HLD→LLD pair, DATA/API/EVENT disposition, source version and approval/change reference.

**Gate decision: HOLD. All six Chapter 463 execution authorizations remain NO. Business UAT remains unauthorized.**
