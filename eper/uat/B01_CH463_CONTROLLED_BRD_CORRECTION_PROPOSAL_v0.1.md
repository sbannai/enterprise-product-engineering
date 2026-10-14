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

## Source-grounded before/after review sheet (added 2026-10-14)

This appendix makes the correction review actionable without pretending that a corrected baseline exists. The “after” column names the target source areas to reconcile; it is not approved replacement prose.

| Source area | Verified current content / before | Proposed after-review target | Evidence status |
|---|---|---|---|
| Chapter title | `CHAPTER 463 — ENTERPRISE EVENT & MESSAGE MANAGEMENT` | `CHAPTER 463 — ENTERPRISE PROCUREMENT & SOURCE-TO-PAY` | Option A domain selection approved; source reissue pending |
| §§463.1–463.5 | Generic chapter purpose, scope, principles, terminology and stakeholders for event/message management | Procurement/source-to-pay purpose, scope, approved terminology and accountable actors, sourced from the controlled procurement BRD | Current generic text verified; replacement text not yet approved |
| §§463.6–463.10 | Generic event/message capabilities, flows and integration language | Procurement business capabilities, lifecycle, approval paths and integrations, each tied to approved source locators | Candidate procurement source exists; sampled catalogue entries are Draft |
| §§463.11–463.15 | Generic governance, security, audit and operational expectations | Procurement policy/authority, segregation of duties, audit/evidence and exception/recovery controls from approved sources | Requirement-specific authoritative binding not established |
| §§463.16–463.20 | Generic reporting, controls, quality and cross-cutting requirements | Procurement reporting/KPIs, lineage/freshness, controls and measurable quality criteria from approved sources | Report catalogue candidates exist; approval and acceptance oracles not established |
| §463.21, REQ-46301 / SRS-FR-2323 / TRC-46301 | “MUST Maintain authoritative records and lifecycle history.” | Preserve requirement identity; bind it to approved procurement aggregate, ownership, lifecycle and version rules | Approved authoritative object model not established |
| §463.21, REQ-46302 / SRS-FR-2324 / TRC-46302 | “MUST Enforce role-based authorization before material actions.” | Preserve requirement identity; bind to approved actor/role/action/resource/tenant and segregation-of-duties policy | Candidate permission vocabulary only; approval not established |
| §463.21, REQ-46303 / SRS-FR-2325 / TRC-46303 | “MUST Validate mandatory business conditions before material changes.” | Preserve requirement identity; bind to approved procurement rules, validation boundaries and transaction/error outcomes | Candidate operations only; approved rules and oracle not established |
| §463.21, REQ-46304 / SRS-FR-2326 / TRC-46304 | “MUST Preserve audit evidence for material events.” | Preserve requirement identity; bind to approved event catalogue, evidence fields, retention, integrity and retrieval controls | Candidate event/attribute records only; audit control approval not established |
| §463.21, REQ-46305 / SRS-FR-2327 / TRC-46305 | “MUST Support controlled exception handling.” | Preserve requirement identity; bind to approved failure taxonomy, retry/idempotency, recovery/compensation and terminal states | Candidate lifecycle/API conventions only; policy approval not established |
| §463.21, REQ-46306 / SRS-FR-2328 / TRC-46306 | “SHOULD Provide governed reporting for status, exceptions and performance.” | Preserve requirement identity; bind to approved report/KPI definitions, formulas, lineage, freshness and access rules | Candidate report catalogue only; metric approval and oracle not established |

### Procurement source areas to inspect during controlled review

The existing `EPER_Master_Repository_v57.5.xlsx` contains relevant candidate areas: `89_PROC_Object_Catalog`, `97_PROC_Lifecycle_States`, `100_PROC_Domain_Events`, `101_PROC_Attribute_Catalog`, `103_PROC_API_Catalog`, and `106_PROC_Reports`. These are source-retrieval locators, not approval evidence. The sampled catalogue entries are marked Draft. The related Volume XIII procurement BRD is also marked “In Development”. Neither may be silently elevated to the authoritative baseline.

### Controlled review decision requested

The design authority and baseline custodian should disposition each changed section as one of:
- `APPROVE SOURCE-BASED REPLACEMENT` — only with exact approved source locator/version and impact review;
- `SOURCE NOT AVAILABLE` — name accountable owner and target date;
- `CLARIFICATION REQUIRED` — state the unresolved business question and owner.

Do not rewrite the Library baseline in place. Do not change the six REQ/SRS/TRC identities or the 228/38 baseline through this proposal. After approval, issue a new controlled version with before/after diff, checksum, provenance, approval references and effective date.
