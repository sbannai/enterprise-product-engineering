# Chapter 463 — Library Evidence Crosswalk (B01)

**Purpose:** Consolidate evidence already present in the project Library so the Chapter 463 closure path uses existing sources rather than requesting duplicate documents.

**Scope preserved:** REQ-46301–REQ-46306; SRS-FR-2323–SRS-FR-2328; TRC-46301–TRC-46306. This is an evidence crosswalk, not an approval, not a reissued baseline, and not Business UAT evidence.

## Source register

| Evidence ID | Existing Library artifact | What it proves | Limitation |
|---|---|---|---|
| LIB-463-01 | `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx` | Procurement domain scope and business controls. Sections 463.7–463.8 cover requisition fields, budget/sourcing validation, approval routing, delegation, escalation, and preventing ordering before approval. §§463.9–463.25 cover supplier qualification, sourcing, award, contracts, catalogs, POs, compliance, and commitment control. | Version 1.0 is marked Stage 1 Functional BRD Completion / In Development. Use as domain source under the recorded Option A precedence decision; do not claim the source was reissued or formally baselined. |
| LIB-463-02 | `EM-LLD-001_Consolidated_LLD_Chapters_463-500_v1.0(1).docx` | LLD module responsibilities: LLD-02 domain/components; LLD-03 data model; LLD-04 API/event; LLD-05 security; LLD-06 workflow/rules; LLD-07 integration; LLD-09 observability; LLD-10 traceability/test design. Also documents standard processing from authentication/tenant context through authorization, validation, domain commit, event publication, audit and telemetry. | Explicitly controlled detailed-design draft pending formal approval. Modules/components are supporting evidence until exact requirement-level bindings and approval are recorded. |
| LIB-463-03 | `EM-OPS-031_Requirement_by_Requirement_Traceability_Population_Validation_463_500_v1.docx` | Confirms the six-row pattern and SRS range: Chapter 463 maps to SRS-FR-2323–2328. Provides baseline component patterns for XX01–XX06. | Records exact downstream HLD/LLD, DATA/API/EVENT, implementation, test, UAT and release evidence as pending. |
| LIB-463-04 | `HLD_463_470_Detailed_Requirement_Architecture_Candidate_v0.3.docx` and `HLD_463_470_Controlled_Traceability_Recovery_Matrix_46301_46306_CH463_OptionA_Correction_Candidate.docx` | Candidate architecture anchors and row-level recovery analysis for all six requirements. | Candidate/supporting only; exact approved requirement-level HLD and HLD→LLD pair are not evidenced. |
| LIB-463-05 | `B01_CH463_LLD_DATA_API_EVENT_RECONCILIATION_CANDIDATE_v0.1.csv` and `B01_CH463_LOCATOR_CAPTURE_AND_PROMOTION_DELTA_v0.1.csv` | Existing row-level register of candidate LLD components, DATA/API/EVENT targets, domain-section candidates and exact open gates. | The registers explicitly classify mappings as supporting only and exact locators/contracts as open. |
| LIB-463-06 | `CH463_Acceptance_Oracle_and_Approval_Matrix_v0.1.docx` | Positive, negative and boundary test proposals for each requirement, plus the specific policy/control inputs needed for measurable oracles. | Candidate only; test oracles are blocked until the applicable policy, contract and approval evidence exists. |
| LIB-463-07 | `B01_CH463_Controlled_Change_Approval_and_Evidence_Request_v0.1.docx` and `B01_CH463_Approval_Decision_Register_v0.1.csv` | The existing D1–D10 decision/evidence list and accountable roles. | Decision register marks all D1–D10 OPEN; it is a request/register, not proof those decisions have been approved. |
| LIB-463-08 | `EM-OPS-049_050_G9_Reconciliation_Matrix_Master_463-470_BASELINE_2026-09-15.xlsx` | Frozen working baseline states: 48/48 REQ→SRS, 0/48 exact HLD, 0/48 exact LLD, 0/48 exact DATA/API/EVENT; G9 NO-GO. | Explicitly says this is not an approved release baseline. |

## Six-row evidence crosswalk

| Requirement | Existing domain evidence to cite | Existing design support | Minimum missing evidence to close |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 — authoritative records and lifecycle history | BRD §§463.7–463.8 (requisitions and approvals); §§463.16, 463.18, 463.21–463.27 (award, contracts, POs, receiving/fulfilment); §463.39 (core procurement object model, as referenced by the candidate reconciliation). | LLD-02/03; LLD-CMP-008 domain and LLD-CMP-007 application services are supporting components. | Approved object types/fields, lifecycle state-transition table, keys/tenant scope, history/retention and duplicate/idempotency behavior; exact approved HLD and LLD locators and their pairing; DATA/API/EVENT contract or approved N/A. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 — role-based authorization | BRD §463.8 (delegated approval); §§463.16, 463.24–463.25 (award/compliance/commitment controls); §463.35/§463.40 where referenced by the candidate mapping. | LLD-05; LLD-CMP-003 identity, -004 authorization and -005 tenant management are supporting components. | Approved roles/permissions, delegated limits, segregation-of-duties conflicts, delegation expiry/substitution and denial semantics; exact approved design bindings and applicable contract/N/A. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 — mandatory business-condition validation | BRD §§463.7–463.8 (required requisition data, budget/sourcing checks and approvals); §§463.15–463.16 (evaluation/award); §§463.21–463.25 (PO, compliance and commitment controls). | LLD-02/06; LLD-CMP-007 application services and -010 rules/decisions are supporting components. | Approved required-field catalogue, policy version, sourcing/approval thresholds, rule ordering, transaction invariants and error contract; exact approved design bindings. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 — preserve audit evidence | BRD §§463.14–463.16 (bid history, evaluation and award rationale); §463.24 (compliance); §463.42/§463.47 where referenced by the candidate mapping. | LLD-03/09; LLD-CMP-017 audit and -018 observability are supporting components. | Approved material-event list, audit schema/required attribution fields, integrity guarantees, retention/access and failure behavior; exact approved design and event contract/version or approved N/A. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 — controlled exception handling | BRD §463.3 (emergency/sole-source exceptions require justification); §§463.8, 463.14–463.16, 463.24–463.27 for approvals, controlled sourcing/award, compliance and PO changes. | LLD-06/07; LLD-CMP-009 workflow, -010 rules, -011 integration and -012 events are supporting components. | Approved exception taxonomy, rationale, authority/approver, retry/idempotency/compensation/recovery and DLQ policy; exact approved design and API/event contract/version or approved N/A. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 — governed reporting | BRD §§463.4–463.6 (category/demand/spend context); §§463.24–463.25 (compliance and commitments); §§463.41–463.47 where referenced by the candidate mapping. | LLD-09; LLD-CMP-016 reporting/analytics and -014 search are supporting components. | Approved report catalogue, KPI formulas/owners, filters and as-of semantics, freshness SLA, reconciliation tolerance and tenant access; exact approved design and report/API contract/version or approved N/A. |

## Existing governance decisions and control

- Option A source precedence is recorded as approved on 2026-10-12 under the Chapter 463 source-correction decision. The dedicated procurement BRD itself remains marked **In Development**.
- The approval packet's D1–D10 are still recorded **OPEN**. This includes requirement wording/domain mapping, procurement policy, SoD, audit, exception rules, reporting/KPIs, HLD/LLD binding, data ownership, API/event contracts and formal controlled release.
- The acceptance-oracle matrix says not to invent numerical thresholds, schema names, API/event IDs or approved N/A dispositions.
- The repository's automated pilot / CI pass is not Business UAT. Keep Business UAT, business acceptance, G9 freeze and G10 certification pending until their own evidence exists.

## Recommended execution sequence

1. Reuse the existing procurement BRD and crosswalk above; do not request the same files again.
2. Reconcile the legacy Chapter 463 heading conflict through the existing Option A decision and controlled source publication.
3. Use the six-row acceptance-oracle matrix to collect only the unresolved policy/control decisions from their named accountable roles.
4. For HLD/LLD, publish a controlled requirement-level binding/correction to the approved design family (or capture exact approved locators if they exist in the full authoritative artifact); do not promote candidate IDs by inference.
5. Define/version the six DATA/API/EVENT contracts from approved domain decisions and validate them with schema/contract tests.
6. Re-run traceability and technical gates. Keep business UAT and certification statuses unchanged unless separate authorized evidence is produced.

**Disposition:** Existing Library evidence is found and mapped. Design traceability, governed contracts, approval/baseline release and business acceptance remain open; no gate is represented as passed by this crosswalk.
