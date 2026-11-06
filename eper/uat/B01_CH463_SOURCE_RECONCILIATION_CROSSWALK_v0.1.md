# B01 Chapter 463 Source Reconciliation Crosswalk v0.1

- Date: 2026-10-14
- Related change control: B01-CH463-CC-001
- Related source-precedence decision: B01-CH463-SOURCE-CORRECTION-DECISION-001 (Option A, 2026-10-12)
- Related proposal: PR #140 — controlled BRD correction proposal
- Status: WORKING CROSSWALK — NOT APPROVED; NOT A BASELINE
- Baseline guard: preserve 228 requirements, 38 chapters, and existing REQ/SRS/TRC identities.

## 1. Sources compared

| Source | Observed content | Authority/status boundary |
|---|---|---|
| `EM-BRD-001_Detailed_Chapters-461-470_v1.0.docx`, Chapter 463 | Title says “Enterprise Event & Message Management”; §§463.1–463.20 are generic boilerplate; §463.21 has six generic requirements. | Defective source requiring controlled correction; do not silently overwrite or treat this title/body as aligned to Option A. |
| `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx` | Procurement-specific content §§463.1–463.47; includes core object model, roles, KPIs, digital thread, integration requirements, acceptance criteria, and validation checklist. | Cover states “Version 1.0 Baseline | Stage 1 – Functional BRD Completion | Status: In Development”. Treat as a substantive reconciliation source, not proof of approved/reissued BRD. |
| Approved source-precedence decision | Option A selects Enterprise Procurement & Source-to-Pay as Chapter 463 domain. | Establishes domain precedence, not approval of every assertion in the in-development BRD or of a replacement baseline. |

## 2. Section-level reconciliation map

| Defective detailed BRD location | Procurement source locator(s) to reconcile | Required action before source reissue |
|---|---|---|
| Chapter 463 title | Volume XIII cover; §463 Requirements Framework | Replace the legacy domain title only in a controlled reissue; include exact before/after excerpt. |
| §§463.1–463.3 objective, scope, stakeholders/personas | Procurement §§463.1–463.3 | Reconcile objective, scope and principles. Populate stakeholder/persona detail only when supported by an approved role/authority source; do not invent it. |
| §463.4 actors, roles and permissions | Procurement §§463.40, 463.44, 463.35 | Use role and foundation-service material as candidate source; verify authorization matrix, tenant boundaries, segregation of duties and approval status. |
| §§463.5–463.7 business process, functional requirements, business rules | Procurement §§463.4–463.34, with applicable policy references | Build a clause-level source mapping; identify missing policy thresholds, decision rules and exceptions as SOURCE NOT AVAILABLE / CLARIFICATION REQUIRED. |
| §463.8 data requirements | Procurement §§463.39, 463.7, 463.10, 463.14, 463.18, 463.21–463.27 | Reconcile business objects and attributes to an approved domain model; do not promote draft catalogue entries as authoritative schema. |
| §§463.9–463.10 interfaces/integrations and dependencies | Procurement §§463.26–463.27, 463.43–463.45 | Capture interface direction, owner, contract/version and error/reconciliation behavior from controlled interface sources; otherwise mark unresolved. |
| §§463.11–463.14 security, audit, exceptions, reporting | Procurement §§463.24–463.25, 463.28–463.37, 463.40–463.41, 463.44 | Reconcile each control to approved policy, evidence, retention, exception and metric definitions. A section heading is not a measurable oracle. |
| §§463.15–463.18 non-functional requirements, AI/automation, acceptance, dependencies | Procurement §§463.33, 463.35–463.37, 463.41, 463.46–463.47 | Separate stated capability intent from testable acceptance thresholds; secure owner disposition for missing thresholds and non-functional targets. |
| §§463.19–463.20 traceability and downstream traceability | Procurement §§463.42–463.45, plus the controlled requirement traceability register | Preserve existing requirement IDs and establish approved source → REQ/SRS → HLD → LLD → contract → test/evidence links. The procurement BRD's chapter-level links alone do not prove exact HLD/LLD bindings. |
| §463.21 six-requirement register | Procurement §§463.39–463.47 and relevant process sections; existing REQ/SRS/TRC identities | Keep REQ-46301..REQ-46306 / SRS-FR-2323..2328 / TRC-46301..46306 unchanged unless separately authorized. Create a row-by-row proposed criterion map, explicitly pending business owner approval. |
| §463.22 quality gate | Procurement §§463.46–463.47 and controlled gate definition | Reconcile quality gate language; do not declare acceptance or UAT authorized from the source checklist alone. |

## 3. Six-row requirement-to-source candidate map

These are **source candidates for review**, not approved requirement mappings, design bindings, or acceptance oracles.

| Requirement identity (preserve) | Procurement BRD candidate locators | Evidence/decision still needed |
|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 — authoritative records and lifecycle | §§463.7, 463.10, 463.14, 463.18, 463.21–463.27, 463.39, 463.42 | Approve the canonical procurement aggregates, attributes, ownership, lifecycle/state transitions, versioning and persistence rules; exact HLD/LLD bindings and data schema. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 — role-based authorization | §§463.8–463.10, 463.14–463.16, 463.24, 463.35, 463.40, 463.44 | Approve actor-role-action-resource/tenant matrix, bid confidentiality, delegated authority and segregation-of-duties rules; exact HLD/LLD and interface bindings. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 — business validation | §§463.3, 463.7–463.8, 463.12–463.16, 463.24–463.25, 463.46–463.47 | Approve threshold values, budget/sourcing/approval rules, validation outcomes, error semantics and transaction boundaries; measurable positive/negative oracle. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 — audit evidence | §§463.14–463.16, 463.22, 463.24, 463.35–463.36, 463.40, 463.46–463.47 | Approve audit event catalogue, required evidence fields, integrity, retention, retrieval and ownership; exact data/event contract or approved N/A. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 — exception handling | §§463.8, 463.10–463.14, 463.22, 463.24–463.27, 463.30, 463.36, 463.47 | Approve failure taxonomy, retry/idempotency, recovery/compensation, duplicate prevention, terminal states and observable outcomes. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 — governed reporting | §§463.28–463.29, 463.32–463.34, 463.37, 463.41–463.42 | Approve report/KPI definitions, formulas, source lineage, freshness, access controls and reconciliation rules; exact reporting design and acceptance oracle. |

## 4. Controlled reissue checklist

Before replacing the defective detailed Chapter 463 source, collect:

1. A clause-level before/after diff covering the title and every changed section.
2. A source locator for every new procurement assertion, including source version, owner, approval reference and effective date.
3. A six-row impact assessment preserving all existing REQ/SRS/TRC identities.
4. A baseline-integrity check showing no unapproved change to the 228 requirements / 38 chapters.
5. Explicit dispositions for gaps: SOURCE NOT AVAILABLE / CLARIFICATION REQUIRED; no inferred rules or silent N/A.
6. Design-authority and baseline-custodian approval, controlled version/effective date, provenance and checksum.
7. Updated controlled source register and downstream traceability only after the corrected source is formally issued.

## 5. Current disposition

- Domain precedence: Option A selected.
- Detailed BRD mismatch: confirmed.
- Procurement-specific content source: located, but marked In Development.
- Corrected authoritative detailed BRD: NOT ISSUED.
- Exact HLD/LLD bindings: still pending; this crosswalk does not close them.
- DATA/API/EVENT contracts: approval/version/owner dispositions still pending.
- Owner-approved measurable acceptance oracles: 0/48 across B01.
- Business UAT authorization: NO; G9 remains HOLD / NO-GO.

This document is a reconciliation aid only. It does not approve source content, alter the baseline, authorize execution, or certify release readiness.
