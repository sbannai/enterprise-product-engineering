# B01 Source-Cited Acceptance and Design Crosswalk — Draft

**Date:** 2026-10-13  
**Scope:** B01, Chapters 463–470, 48 requirements (six rows per chapter)  
**Status:** DRAFT FOR CONTROLLED REVIEW — NOT APPROVED; NO BUSINESS UAT AUTHORIZATION  
**Baseline guard:** Preserve 228 requirements / 38 chapters and `B01-BASELINE-APPROVAL-001`.

## Purpose

Consolidate the source state already present in the repository into one chapter-level crosswalk, so missing decisions are explicit and source material is not mistaken for approval. This document does not create business rules, authorize execution, or promote candidate architecture references to exact HLD/LLD bindings.

## Crosswalk

| Chapter | Requirement range | SRS range | Domain/source context in repository | What is established | Open control / disposition |
|---:|---|---|---|---|---|
| 463 | REQ-46301–REQ-46306 | SRS-FR-2323–2328 | `B01_CH463_SOURCE_VERIFIED_ACCEPTANCE_CRITERIA_INTAKE.md`; cited detailed BRD §§463.46–463.47 | Six chapter-level criteria and 14 validation checks extracted | Source marked **In Development**; row-level mapping and executable oracles not approved. Exact HLD/LLD pairs and DATA/API/EVENT decisions still require approval. HOLD. |
| 464 | REQ-46401–REQ-46406 | SRS-FR-2329–2334 | `B01_CH464_SOURCE_FORENSIC_DISPOSITION.md`; `B01_CH464_470_DOMAIN_REVIEW_MATRIX.md` | Supplier relationship domain themes and requirement/SRS identities recovered | Exact approved HLD/LLD locators not evidenced; owner-approved rules, measurable oracles, HLD→LLD pairs, and DATA/API/EVENT contract or approved N/A pending. HOLD. |
| 465 | REQ-46501–REQ-46506 | SRS-FR-2335–2340 | `B01_CH465_SOURCE_FORENSIC_DISPOSITION.md`; `B01_CH464_470_DOMAIN_REVIEW_MATRIX.md` | Inventory/warehouse domain themes and six requirement identities recovered | Candidate HLD and supporting LLD components are context only; exact bindings not evidenced. Business rules and measurable oracles pending. HOLD. |
| 466 | REQ-46601–REQ-46606 | SRS-FR-2341–2346 | `B01_CH466_SOURCE_FORENSIC_DISPOSITION.md`; `B01_CH464_470_DOMAIN_REVIEW_MATRIX.md` | Order-management themes and six requirement identities recovered | Exact approved HLD/LLD locators and paired traceability not evidenced; pricing/credit and lifecycle outcomes need approved source values. HOLD. |
| 467 | REQ-46701–REQ-46706 | SRS-FR-2347–2352 | `B01_CH467_SOURCE_FORENSIC_DISPOSITION.md`; `B01_CH464_470_DOMAIN_REVIEW_MATRIX.md` | Logistics/transportation themes and six requirement identities recovered | Exact approved HLD/LLD locators not evidenced; carrier/rate rules and measurable event outcomes need approved sources. HOLD. |
| 468 | REQ-46801–REQ-46806 | SRS-FR-2353–2358 | `B01_CH468_SOURCE_FORENSIC_DISPOSITION.md`; `B01_CH464_470_DOMAIN_REVIEW_MATRIX.md` | Manufacturing/production themes and six requirement identities represented in the consolidated disposition | Exact approved HLD/LLD locators not evidenced; approved process/quality limits and row-level source mappings remain open. HOLD. |
| 469 | REQ-46901–REQ-46906 | SRS-FR-2359–2364 | `B01_CH469_SOURCE_FORENSIC_DISPOSITION.md`; `B01_CH464_470_DOMAIN_REVIEW_MATRIX.md` | Requirement/SRS identities and reusable capability patterns recovered | Chapter-specific source/domain evidence is limited; do not infer beyond cited material. Exact bindings and approved measurable acceptance criteria pending. HOLD. |
| 470 | REQ-47001–REQ-47006 | SRS-FR-2365–2370 | `B01_CH470_SOURCE_FORENSIC_DISPOSITION.md`; `B01_CH464_470_DOMAIN_REVIEW_MATRIX.md` | Six-row SRS sequence represented in master registers | Chapter-specific source/domain evidence limited; recovery source for REQ-47006 was not located in the cited search. Exact bindings and approved measurable criteria pending. HOLD. |

## Requirement-level control totals

The current source-reconciliation record `B01_48_SRS_HLD_LLD_SOURCE_RECONCILIATION.md` reports:

- SRS requirement row locators: **48/48 confirmed**.
- Exact approved HLD locators evidenced: **0/48**.
- Exact approved LLD bindings evidenced: **0/48**.
- Approved HLD→LLD pairs evidenced: **0/48**.
- DATA/API/EVENT contract or approved N/A evidenced in that reconciliation: **0/48**.
- Business UAT authorized: **0/48**.

These are evidence counts in the named reconciliation, not a claim that no related design material exists anywhere.

The current case checklist `B01_48_CASE_APPROVAL_CHECKLIST.csv` has 48 rows, with owner dispositions marked `CLARIFICATION_REQUIRED`; owner, target date and approval-reference fields are blank and execution authorization remains NO. The current oracle scaffold `B01_48_PROPOSED_ORACLE_SCAFFOLD.csv` has 48 proposed-pattern rows, explicitly not approved, with source locator and owner decision reference pending.

## Controlled closure sequence

1. For each requirement, identify the authoritative approved detailed source and exact section/page/requirement locator. For Chapter 463, the cited intake source is explicitly in development, so obtain/locate an approved version or controlled decision before using it.
2. Record the owner disposition, accountable owner, decision/change reference and date. If the source is insufficient, record the precise missing rule, owner and target date; do not invent a value.
3. Approve the measurable positive, negative and boundary oracle, including actor/role/tenant, preconditions/test data, expected state/response, no-side-effect constraints and evidence fields.
4. Record exact HLD locator, exact LLD binding, explicit HLD→LLD pair, and DATA/API/EVENT contract/version or approved N/A. Candidate labels and component names do not count.
5. Update the case checklist only after the above evidence is approved. Keep `uat_execution_authorized=NO` until all defined entry gates are met.
6. Separately run the authorized target/build preflight using the protected `eper-business-uat` environment and service-owner-approved HTTPS host/build. Health/build success alone is not business acceptance.
7. Only then execute authorized scenarios and reconcile evidence. Keep G9 NOT FROZEN and G10 NOT ISSUED until their own closure controls pass.

## Source register

- `eper/uat/B01_48_SRS_HLD_LLD_SOURCE_RECONCILIATION.md`
- `eper/uat/B01_48_CASE_APPROVAL_CHECKLIST.csv`
- `eper/uat/B01_48_ACCEPTANCE_CRITERIA_RESOLUTION_MATRIX.csv`
- `eper/uat/B01_48_PROPOSED_ORACLE_SCAFFOLD.csv`
- `eper/uat/B01_48_REQUIREMENT_ACCEPTANCE_DECISION_QUEUE.md`
- `eper/uat/B01_CH463_SOURCE_VERIFIED_ACCEPTANCE_CRITERIA_INTAKE.md`
- `eper/uat/B01_CH464_SOURCE_FORENSIC_DISPOSITION.md` through `B01_CH470_SOURCE_FORENSIC_DISPOSITION.md`
- `eper/uat/B01_CH464_470_DOMAIN_REVIEW_MATRIX.md`
- `eper/uat/AUTHORIZED_TARGET_PREFLIGHT_WORKFLOW_NOTES.md`

## Decision boundary

This is a repository-generated consolidation of existing source dispositions, not a new approval. No requirement, source, oracle, architecture binding, environment, test result, or release gate is promoted to PASS by this document.
