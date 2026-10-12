# Chapter 463 Procurement Domain Candidate Crosswalk — Owner Validation Required

- Record ID: B01-CH463-PROC-CANDIDATE-CROSSWALK-001
- Date: 2026-10-12
- Source: `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx`
- Source sections: §§463.1–463.47, particularly §§463.3, 463.7–463.8, 463.10–463.18, 463.21–463.43, 463.46–463.47
- Baseline: `B01-BASELINE-APPROVAL-001` preserved
- Status: CANDIDATE CROSSWALK — NOT APPROVED; do not use as an acceptance oracle or exact REQ mapping

## Why this exists

The Volume XIII BRD provides procurement-domain rules and chapter-level acceptance criteria. The controlled consolidated BRD and HLD recovery matrix conflict on Chapter 463's domain. This crosswalk captures plausible candidate anchors for review, but does not assert that the generic six requirement patterns are the approved procurement meaning of REQ-46301..REQ-46306.

## Six-row candidate crosswalk

| Existing requirement identity | Existing generic pattern / SRS | Candidate procurement-domain anchors in Volume XIII | Evidence locator | Approval state / required action |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | XX01 — authoritative records/lifecycle | Requisition, sourcing event, supplier qualification, award, PO and contract records; lifecycle/status and transaction lineage. This is a candidate only because the generic row says authoritative records/lifecycle, not which procurement aggregate owns it. | §§463.7–463.8, 463.9–463.10, 463.11–463.18, 463.21–463.43; chapter acceptance criteria §463.46 | OWNER MUST CONFIRM the domain object(s), lifecycle states, system of record and retention/history rule. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | XX02 — role-based authorization | Delegated approval authority, segregation of duties, controlled supplier participation, restricted/blocked supplier controls and award/commitment authority. | §§463.3, 463.8, 463.9–463.10, 463.12–463.18, 463.44, 463.46–463.47 | OWNER MUST CONFIRM roles, permission matrix, segregation constraints, approval thresholds and negative cases; do not infer them from section headings. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | XX03 — mandatory business conditions | Budget/category/sourcing requirement validation; supplier qualification; sourcing thresholds and policy; requisition/PO controls; approved commercial terms. | §§463.3–463.8, 463.10–463.18, 463.21–463.43, 463.46–463.47 | OWNER MUST CONFIRM exact validation rules, threshold values/configuration source, failure outcomes and measurable boundary tests. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | XX04 — audit evidence | Evidence-based supplier evaluation, retained award criteria/evidence/rationale, contract terms/version, procurement approvals and traceability into receiving/AP/financial reporting. | §§463.3, 463.10–463.18, 463.21–463.43, 463.45–463.47 | OWNER MUST CONFIRM required audit events/fields, actor/time/source lineage, immutability/retention and retrieval expectations. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | XX05 — controlled exception handling | Emergency and sole-source exceptions; policy exceptions; restricted supplier cases; sourcing/PO change controls; recovery and no-duplicate-award/order continuity checks. | §§463.3, 463.8, 463.9–463.18, 463.21–463.43, 463.46–463.47 | OWNER MUST CONFIRM exception categories, required justification/approvals, retry/replay/compensation rules and terminal outcomes. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | XX06 — governed reporting | Spend/category performance, sourcing and award visibility, procurement compliance, and reconciled transaction lineage to receiving, AP and financial reporting. | §§463.4–463.6, 463.21–463.43, 463.45–463.47 | OWNER MUST CONFIRM metric definitions, authoritative source, freshness, access rules, reconciliation tolerances and report acceptance thresholds. |

## Explicit limits

- These are **candidate domain anchors**, not approved one-to-one mappings. One generic pattern may span several procurement objects or controls.
- Chapter-level acceptance criteria in §463.46 and checklist items in §463.47 are useful source material, but they do not automatically become six requirement-level acceptance oracles.
- Do not populate exact HLD/LLD bindings by naming similarity or component pattern. The existing HLD recovery matrix states the exact HLD locator and HLD→LLD pair remain open.
- DATA/API/EVENT must be evidenced per requirement with an approved schema/entity owner and contract/version, or an authorized explicit N/A. No N/A is inferred from absence.
- Do not alter the approved BRD/SRS baseline, REQ/SRS IDs, chapter boundaries or execution authorization.

## Required decision

For each row, the design authority must select:
- `ACCEPT CANDIDATE` and provide exact controlled BRD rule locator plus measurable acceptance oracle; or
- `REJECT / REMAP` and provide the correct domain mapping/source; or
- `CLARIFICATION REQUIRED` with accountable owner and due date.

Then record exact approved HLD locator, LLD locator, HLD→LLD pair, DATA/API/EVENT disposition, source version and approval/change reference.

**Gate decision: HOLD. Business UAT remains unauthorized.**
