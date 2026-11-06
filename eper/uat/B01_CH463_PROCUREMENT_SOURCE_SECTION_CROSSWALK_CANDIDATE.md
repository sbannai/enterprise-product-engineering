# Chapter 463 Procurement Source-Section Crosswalk — Candidate Only

- Change control: `B01-CH463-CC-001`
- Canonical domain source: dedicated Volume XIII Chapter 463, *Enterprise Procurement & Source-to-Pay*, v1.0 (source artifact status: In Development)
- Status: **CANDIDATE SECTION DISCOVERY — NOT APPROVED REQUIREMENT MAPPING**
- Baseline: preserve `B01-BASELINE-APPROVAL-001` dated 2026-10-11

## Purpose

This document records likely sections to inspect in the dedicated Chapter 463 domain source while correcting the conflicting consolidated BRD/HLD labels. It does not claim the six legacy generic requirement statements are valid procurement requirements. No section is promoted as a requirement-specific acceptance oracle without Design Authority approval.

## Section discovery candidates

| Retained requirement | Domain source sections to inspect | Candidate rationale only | Approval / mapping state |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | §§463.3, 463.21–27, 463.38–42 | Principles, requisitions/POs/commitments, object model and digital thread may contain record lifecycle and traceability rules | OPEN — not mapped |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | §§463.7–8, 463.17–20, 463.41–42 | Requisition approvals, approval controls, guided buying/governance may contain authorization and segregation rules | OPEN — not mapped |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | §§463.11–20, 463.23–27, 463.46–47 | Sourcing, evaluation, policy/compliance and acceptance/validation sections may contain business validation rules | OPEN — not mapped |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | §§463.40–42, 463.46–47 | Audit, governance, digital thread and acceptance/validation sections may establish required evidence and verification | OPEN — not mapped |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | §§463.3, 463.8, 463.23–27, 463.41–42 | Principles, approval controls, compliance and governance may specify exceptions and controlled handling | OPEN — not mapped |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | §§463.28–39, 463.42, 463.46–47 | Supplier performance, savings, risk, analytics, KPIs and validation sections may contain reporting rules | OPEN — not mapped |

## Mandatory next validation

For each row, an authorized reviewer must capture:
1. Exact source filename, version, status, section/subsection and page or heading locator.
2. Exact quoted or faithfully summarized business rule from the source.
3. Whether the existing REQ/SRS/TRC identity remains semantically valid for procurement scope.
4. If it does not, a controlled change proposal for replacement wording/mapping—do not silently repurpose a generic requirement.
5. Measurable positive, negative and boundary acceptance oracle with required policy values supplied/approved by the Design Authority.

## Explicit non-inferences

- These section candidates are navigation hints only; they are not source-verified row bindings.
- No procurement thresholds, mandatory fields, approval limits, exception taxonomy, KPI formulas, retention periods or data ownership are inferred here.
- Exact HLD/LLD locators, explicit HLD→LLD pairs, DATA/API/EVENT contracts or approved N/A, and Business UAT authorization remain open.
- Preserve all 228 requirements and 38 chapters; keep `EPER_UAT_API_ENABLED=false`; do not provision chargeable AWS resources.
