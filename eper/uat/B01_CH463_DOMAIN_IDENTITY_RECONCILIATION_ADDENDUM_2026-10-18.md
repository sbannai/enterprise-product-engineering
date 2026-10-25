# Chapter 463 Domain-Identity Reconciliation Addendum

**Document ID:** EPER-CH463-SOURCE-RECONCILIATION-ADDENDUM-001  
**Date:** 2026-10-18  
**Status:** CONTROLLED RECONCILIATION NOTE — DOMAIN DECISION RESOLVED; CONTRACT APPROVALS STILL OPEN  
**Applies to:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Baseline:** Preserve Option A and the 228-requirement / 38-chapter baseline.

## 1. Purpose

This addendum reconciles the stale domain-conflict language in `eper/contracts/CH463_PROCUREMENT_DATA_API_EVENT_CONTRACT_SPECIFICATION_DRAFT.md` with the already-recorded controlled source-correction decision. It does not approve any DATA, API, EVENT, HLD/LLD binding, acceptance oracle, or UAT execution.

## 2. Controlling decision

The canonical Chapter 463 domain identity is **Volume XIII, Chapter 463 — Enterprise Procurement & Source-to-Pay**, under `B01-CH463-SOURCE-CORRECTION-DECISION-001`, approved 2026-10-12.

That decision resolves the domain label/source-precedence issue. It does **not** itself approve candidate procurement entities, API operations, event names, schemas, or requirement-level bindings. Existing procurement domain materials may be used as candidates only where their exact controlled version, locator, and approval authority can be demonstrated.

## 3. Disposition of the stale conflict note

The final section (“Recovery from already-submitted sources — domain identity conflict”) of the current contract draft correctly records historical conflicting labels, but its instruction to keep Chapter 463 domain identity unresolved is superseded by the controlling decision above.

Apply these interpretations:

- The prior label “Enterprise Event & Message Management” is historical conflicting source text, not the current canonical Chapter 463 domain identity.
- The HLD candidate's procurement label is consistent with the resolved domain identity, but a candidate document is not automatically an approved HLD binding.
- The six requirement patterns (authoritative records/lifecycle, authorization, business validation, audit evidence, exception handling, governed reporting) remain the requirement scope; do not rename, renumber, or replace their IDs.
- Do not reopen the domain choice unless a new controlled decision formally supersedes `B01-CH463-SOURCE-CORRECTION-DECISION-001`.

## 4. What remains unapproved

This addendum does not change the evidence counts:

| Gate item | Current evidenced state | Closure evidence required |
|---|---:|---|
| Exact approved HLD → LLD pairs | 0/6 | Approved HLD and LLD document/version plus exact section/page/row locator pair for each requirement |
| DATA/API/EVENT requirement bindings | 0/18 verified | Each contract mapped to its authoritative source locator and version, with owner/design-authority approval or an explicit approved N/A and rationale |
| Approved executable acceptance oracles | 0/6 | Existing approved BRD/SRS criteria traced to exact source/version/locator; ambiguous or draft-only criteria stay unresolved |
| Technical preflight | Not executed against hosted target | Pinned commit, target environment, access, configuration and recorded results |
| D10 execution authorization | Not issued | Separate controlled authorization after prerequisites pass |

Contract candidates remain **DRAFT / NOT APPROVED**. Event-name differences (including `RequisitionSubmitted` vs `PurchaseRequisitionSubmitted`, and `RequisitionDecisionRecorded` vs `PurchaseRequisitionApproved`) must be reconciled to the controlled event catalogue and owner decision; this note does not select a canonical event name.

## 5. Required follow-through

1. Update the contract draft's final section so it refers to this addendum and no longer presents domain identity as unresolved.
2. For each of six requirements, recover exact source locators from the existing controlled Library/repository artifacts; do not ask for another upload when source material already exists.
3. Produce versioned DATA/API/EVENT candidate specifications using the existing procurement model and platform contract conventions, clearly marking each as candidate until approved.
4. Record explicit decisions for event naming, N/A applicability, actor/tenant/SoD behavior, lifecycle transitions, and report lineage only where the source does not already decide them.
5. Preserve the existing SRC-003/G9 reconciliation registers; update them rather than creating a parallel closure register.
6. Keep the six Business UAT cases `NOT_RUN`; no UAT execution, pass, G9 freeze, G10 issuance, or release authorization follows from this reconciliation.

## 6. Gate disposition

**Domain identity: RESOLVED.**  
**Contract/source bindings: OPEN.**  
**Business UAT: HOLD — NOT AUTHORIZED / NOT EXECUTED.**  
**G9: NOT FROZEN. G10: NOT ISSUED.**

This addendum is a reconciliation control, not a contract approval or business acceptance record.
