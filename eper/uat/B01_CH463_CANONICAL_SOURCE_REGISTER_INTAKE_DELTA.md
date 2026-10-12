# B01 Chapter 463 Canonical Source Register — Intake Delta

- Change control: `B01-CH463-CC-001`
- Decision record: `B01-CH463-SOURCE-CORRECTION-DECISION-001`
- Status: **SOURCE REGISTER DELTA — DOMAIN SOURCE IDENTIFIED; BASELINE CORRECTION AND REQUIREMENT MAPPING OPEN**
- Baseline guard: preserve `B01-BASELINE-APPROVAL-001` (2026-10-11); preserve 228 requirements and 38 chapters.

## Canonical domain source

| Field | Recorded value |
|---|---|
| Document | `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx` |
| Version | v1.0 |
| Domain | Chapter 463 — Enterprise Procurement & Source-to-Pay |
| Lifecycle/status evidence | Stage 1 functional BRD completion; status **In Development** |
| Scope locator | Chapter 463, sections 463.1–463.46 |
| Acceptance-related locators | §463.46 acceptance criteria; §463.47 validation checklist (locator is reported in the source intake record; verify against the controlled document before promoting row mappings) |
| Authority boundary | Canonical domain-specific source under approved Option A source-precedence decision; not evidence that the BRD is a formally approved final baseline |
| Provenance | Source file located in project evidence library; filename and source identity recorded in controlled intake |

## Conflicting references to correct or formally supersede

1. Consolidated BRD `EM-BRD-001_Detailed_Chapters-461-470_v1.0.docx`, §463.21 — legacy “Enterprise Event & Message Management” label/block.
2. `HLD_463_470_Controlled_Traceability_Recovery_Matrix_46301_46306_v1.9.docx` — Chapter 463 heading labels “Enterprise Event & Message Management”.

These remain uncorrected source artifacts until a controlled replacement/supersession is reviewed and approved. This register does not silently rewrite or replace them.

## Requirement-level mapping status

The existing identifiers remain reserved:
- REQ-46301 / SRS-FR-2323 / TRC-46301
- REQ-46302 / SRS-FR-2324 / TRC-46302
- REQ-46303 / SRS-FR-2325 / TRC-46303
- REQ-46304 / SRS-FR-2326 / TRC-46304
- REQ-46305 / SRS-FR-2327 / TRC-46305
- REQ-46306 / SRS-FR-2328 / TRC-46306

The dedicated domain BRD’s existence does not itself prove how each retained generic requirement maps to procurement rules. For every row, the controlled correction still needs an explicit rule locator, approved positive/negative/boundary oracle, exact approved HLD and LLD locator/pair, and DATA/API/EVENT contract/version or separately approved N/A.

## Decision

- Source precedence: **RESOLVED — Option A**.
- Canonical source identity recorded: **YES**.
- Conflicting BRD/HLD artifacts corrected/reissued: **NO evidence in this register**.
- Requirement-level procurement mappings approved: **NOT EVIDENCED**.
- Exact HLD/LLD pairs and DATA/API/EVENT bindings: **OPEN**.
- Business UAT: **HOLD**; execution authorization **NO**.

## Guardrails

Keep `EPER_UAT_API_ENABLED=false`. Do not provision chargeable AWS resources. Automated CI is not business acceptance.