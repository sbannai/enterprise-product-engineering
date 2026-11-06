# HLD / LLD v2.9 — SRC-003 Source Intake and Row-Promotion Procedure

**Scope:** B01 / Chapters 463–470 / 48 requirements  
**Status:** Controlled procedure candidate; does not approve a design baseline or close any requirement.  
**Preservation rule:** Keep the 228-requirement / 38-chapter baseline unchanged.

## 1. Purpose

Replace repeated generic discovery with a repeatable intake-and-validation pass against a newly available authoritative source package. The current acquisition exception (v2.8) records that the available library did not expose the approved requirement-level BRD/SRS → HLD → LLD crosswalk, Chapter 463 procurement domain model, or requirement-level DATA/API/EVENT contracts. This procedure does not treat that absence as permission to infer design.

## 2. Inputs required to start a promotion pass

Register each received source artifact with:
- exact filename and repository/library location;
- version, baseline ID, effective date, and document status;
- approval record, approving authority, and approval date;
- source provenance / receipt reference;
- checksum or immutable revision identifier where available.

Minimum source package:
1. Approved requirement-level traceability crosswalk (or approved design source that explicitly establishes the same bindings).
2. Approved HLD with stable section/module/page/heading locators.
3. Approved LLD with stable section/module/page/heading locators and explicit HLD-to-LLD pairing.
4. Domain-specific Chapter 463 procurement/source-to-pay model and relevant policy/control definitions.
5. Governed data/schema ownership and API/event contract artifacts, each versioned—or explicit approved N/A decisions.
6. Formal baseline/approval record tying the above artifacts together.

If any input is absent, record `SOURCE NOT RECEIVED`; do not substitute a generated candidate, generic component catalogue, search result, or inferred object name.

## 3. Requirement-by-requirement procedure

Process the fixed set REQ-46301 through REQ-47006 (48 requirements), preserving existing REQ/SRS/TRC identifiers.

For each requirement, populate these fields:
- Requirement_ID, SRS_ID, Traceability_ID;
- source artifact filename, version/baseline, status, approval reference;
- exact HLD locator and the explicit requirement-to-HLD relationship;
- exact LLD locator and the explicit requirement-to-LLD relationship;
- explicit HLD-to-LLD pairing rationale/evidence;
- DATA owner + entity/schema + artifact/version/locator, or approved N/A reference;
- API contract + version/locator, or approved N/A reference;
- EVENT contract + version/locator, or approved N/A reference;
- evidence provenance, reviewer, disposition, and review date.

### Promotion rules

**PROMOTE** a field only when an approved/baselined source explicitly supports that exact relationship and its locator is stable and reproducible.

**HOLD** when the only support is a generic component, candidate HLD-CAP/HLD-CAND reference, chapter proximity, naming similarity, or an unapproved draft.

**SOURCE NOT AVAILABLE** when the source package does not expose the required evidence. This is a factual intake outcome, not a business approval and not a closure.

**APPROVED N/A** is valid only when the responsible authority explicitly approves non-applicability for the specific requirement and interface type. Blank cells or absence of a contract do not mean N/A.

Do not create procurement entities, aggregates, services, schemas, APIs, events, policies, or KPI formulas by inference.

## 4. Chapter 463 priority

For REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328, verify the evidence specifically for:
- REQ-46301: authoritative procurement domain object/aggregate and lifecycle/state model;
- REQ-46302: actor, role, action, resource, and tenant authorization;
- REQ-46303: business rules, validation boundaries, transaction/error behavior;
- REQ-46304: material audit events, evidence fields, integrity, retention, access, and failure behavior;
- REQ-46305: exception taxonomy, retry/idempotency, recovery/compensation, and terminal states;
- REQ-46306: report catalogue, metric definitions, lineage, freshness, access, and reconciliation.

These are evidence categories to locate, not proposed designs or approved acceptance criteria.

## 5. Gate calculation

Report separate counts for:
1. REQ→SRS mappings established;
2. exact approved HLD bindings;
3. exact approved LLD bindings;
4. explicit HLD→LLD pairs;
5. approved DATA ownership/schema or approved N/A;
6. approved API contract or approved N/A;
7. approved EVENT contract or approved N/A;
8. source baseline and approval provenance;
9. downstream test evidence and business acceptance.

Do not combine these into one percentage that masks missing mandatory gates. A requirement is not design-ready while a mandatory binding is missing. UAT execution remains unauthorized until the applicable design/source gates and requirement-specific measurable acceptance oracle have been approved.

## 6. Exit criteria

SRC-003 can be recommended for closure only after every in-scope requirement has the mandatory approved traceability and contract evidence, reviewers have accepted the source-backed rows, exceptions are resolved or formally dispositioned by the authorized owner, and the reconciliation register is recalculated from the accepted evidence. The procedure itself cannot close SRC-003.

## 7. Current recorded baseline (from acquisition exception v2.8)

| Control | Current state |
|---|---:|
| BRD→SRS mappings | 48/48 established |
| Pattern mappings | 48/48 supporting only |
| Exact HLD locators | 0/48 |
| Exact LLD locators | 0/48 |
| DATA/API/EVENT | 0/48 |
| SRC-003 | OPEN / NO-GO |

These are inherited findings from v2.8 and must be re-verified against any newly received package. This document does not claim a new source package was received or a new verification pass succeeded.
