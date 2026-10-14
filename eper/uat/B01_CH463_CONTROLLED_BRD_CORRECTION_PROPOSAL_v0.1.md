# B01 Chapter 463 Controlled BRD Correction Proposal v0.1

- Date: 2026-10-14
- Change control: B01-CH463-CC-001
- Source-precedence decision: B01-CH463-SOURCE-CORRECTION-DECISION-001 (Option A approved 2026-10-12)
- Status: PROPOSAL — NOT APPROVED; NOT A BASELINE
- Baseline guard: preserve 228 requirements, 38 chapters and current REQ/SRS/TRC identifiers unless a separately approved change authorizes revisions.

## Verified discrepancy

Inspected source: EM-BRD-001_Detailed_Chapters-461-470_v1.0.docx, Chapter 463, extracted pages 9–12.

Current title: “CHAPTER 463 — ENTERPRISE EVENT & MESSAGE MANAGEMENT”. Sections 463.1–463.20 contain generic event/message-management boilerplate. Section 463.21 lists six generic requirements. This conflicts with the approved Option A domain selection: Enterprise Procurement & Source-to-Pay.

## Proposed correction

Proposed title: “CHAPTER 463 — ENTERPRISE PROCUREMENT & SOURCE-TO-PAY”.

A title-only edit is insufficient. Replace generic §§463.1–463.20 with procurement-specific text only where supported by authoritative, approved source material. Preserve the controlled 20-section structure. For any missing source, explicitly record SOURCE NOT AVAILABLE / CLARIFICATION REQUIRED; do not invent procurement rules or promote draft catalogue entries.

## Requirement identity and evidence impact

| Requirement / traceability | Existing §463.21 wording | Evidence required before approval |
|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | Maintain authoritative records and lifecycle history. | Approved procurement object/aggregate, ownership, fields, lifecycle and version rules. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Enforce role-based authorization before material actions. | Approved actor-role-action-resource/tenant matrix and segregation-of-duties rules. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | Validate mandatory business conditions before material changes. | Approved procurement policy/rule catalogue, thresholds, validation and transaction outcomes. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | Preserve audit evidence for material events. | Approved audit events, evidence fields, retention, integrity and retrieval controls. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | Support controlled exception handling. | Approved failure taxonomy, retry/idempotency, recovery/compensation and terminal-state rules. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | Provide governed reporting for status, exceptions and performance. | Approved report/KPI catalogue, formulas, lineage, freshness and access controls. |

This is an evidence checklist, not new approved business rules or acceptance oracles.

## Required reissue evidence

1. Before/after excerpts for the title and every changed section.
2. Row-level impact assessment for the six existing REQ/SRS/TRC mappings.
3. Source filename, version, exact locator, approval authority and effective date for each new procurement assertion.
4. Integrity comparison proving the 228-requirement / 38-chapter baseline is preserved.
5. Design-authority and baseline-custodian approvals, change reference, effective version/date, provenance and checksum.
6. Updated source register and traceability links to the actual reissued artifact.

## Approval boundary

This proposal does not approve or reissue the BRD, approve criterion mappings, HLD/LLD bindings or DATA/API/EVENT contracts, approve acceptance oracles, authorize Business UAT, freeze G9 or authorize release. Draft procurement catalogue/API/event IDs are not promoted as authoritative.

Disposition: source defect confirmed; correction proposal only. Corrected authoritative source not yet issued. SRC-003 remains OPEN / NO-GO and B01 Business UAT remains HOLD pending required approvals and evidence.
