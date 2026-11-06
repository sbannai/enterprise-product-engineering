# Chapter 463 — Row-Level Domain Mapping Proposal

- Change control: `B01-CH463-CC-001`
- Status: **REVIEW PROPOSAL — NOT APPROVED; NOT AN EXECUTABLE UAT SPECIFICATION**
- Source: `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx`
- Source status: **In Development**
- Preserve: Option A; 228 requirements; 38 chapters; all REQ/SRS/TRC IDs; six capability families and one router.
- Safety: `EPER_UAT_API_ENABLED=false`; no chargeable AWS resources.

## Purpose

Reduce repeated source review by putting a candidate source-to-requirement join in one place for the authorized Procurement business owner and design authority to accept, amend, or reject. The existing source identifies Chapter 463-level criteria in §463.46 and validation checks in §463.47, but it does not approve a one-to-one mapping for the six generic requirement rows. Every mapping below is therefore a **candidate only**.

## Candidate row-level join

| Retained requirement | Candidate domain intent to confirm | Source anchors for review | Candidate acceptance focus (not approved oracle) | Decisions still required |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | Procurement object and lifecycle record management; determine whether the canonical object is requisition, sourcing event, purchase order, contract, or a governed combination | §§463.7–463.8, 463.16, 463.18, 463.21–463.23; §463.46 criteria 3–5; §463.47 checks 3, 6–9, 11 | For an owner-selected object and approved transition, verify persisted state, version/history, linked approval/evaluation/terms evidence and downstream lineage; invalid transition/replay must not cause unauthorized mutation or duplicate effects | D1 object-to-requirement mapping; D2 field/state catalogue; D7 exact HLD/LLD pair; D8 schema; D9 API/event applicability and contracts |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Procurement authorization, approval routing, delegated authority and segregation of duties | §§463.3, 463.8, 463.14, 463.16, 463.24–463.25; §463.47 checks 8, 12 | An explicitly authorized actor can perform an approved action; unauthorized or conflicting-duty action is denied with no protected-state mutation and required audit evidence | D1 mapping; D3 actor/role/action/scope/limits/delegation/SoD matrix; D4 audit rules; D7–D9 approved bindings |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | Procurement validation across category, budget, required fields, thresholds and exception rules | §§463.7–463.8, 463.15–463.16, 463.21–463.25, 463.27; §463.47 checks 1, 8–10 | Inputs satisfying approved rules are accepted; owner-approved invalid/boundary inputs produce specified stable validation results without unauthorized state mutation | D1 mapping; D2 mandatory/conditional fields, formats, lifecycle, thresholds and rule version; D5 exception policy; D7–D9 bindings |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | Procurement material-event audit and retrievable evidence across evaluation, award, approval and downstream transaction lineage | §§463.3, 463.14–463.16, 463.18, 463.22, 463.24; §463.47 checks 5, 6, 12 | Required material events can be retrieved with the approved actor/time/version/correlation envelope; unauthorized alteration or access follows the approved control | D4 event catalogue, fields, integrity, access, retention and failure/retrieval behavior; D7–D9 bindings |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | Procurement exceptions, emergency/sole-source handling and recovery/continuity without duplicate commercial effects | §§463.3, 463.8, 463.14–463.16, 463.22–463.25, 463.27; §463.47 checks 4, 10, 13, 14 | An approved exception follows authorized disposition; simulated failure/retry follows approved recovery rules without duplicate award/order or loss of lineage | D2 rules; D3 authority/SoD; D5 exception taxonomy, justification, approver, retry/backoff, compensation, escalation and terminal states; D7–D9 bindings |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | Governed procurement reporting and KPI reconciliation across sourcing, approvals, purchase orders, receiving, AP and finance | §§463.12, 463.15–463.16, 463.24–463.25; §463.46 criteria 1, 3, 5; §463.47 checks 1, 5, 10, 11 | Report over an owner-approved seeded dataset reconciles to authoritative records; access, as-of time, freshness and stale/inconsistent-data handling match the approved report contract | D6 report catalogue, formula, source lineage, filters, access, freshness and tolerance; D7–D9 bindings |

## Cross-cutting constraints to confirm

1. **Human approval boundary:** the source states that AI is advisory and cannot independently award suppliers or commit enterprise funds (§§463.33, 463.44–463.47). Confirm its exact retained requirement mapping and implementation control in the controlled baseline.
2. **No invented policy values:** thresholds, mandatory-field conditionality, role limits, retention periods, retry/backoff values, KPI formulas and freshness tolerances remain unresolved unless found in an approved controlled source.
3. **No inferred contracts:** candidate labels such as `DATA:authoritative-domain`, `API:capability-resource`, and `EVENT:material-lifecycle` are descriptors only. Each row requires exact approved DATA/API/EVENT contract/version/locator or an explicitly approved N/A with rationale.
4. **No inferred design traceability:** candidate HLD/LLD anchors remain supporting-only until the design authority supplies approved exact section/module locators and explicit HLD→LLD pairing.
5. **No acceptance promotion from CI:** successful technical tests establish implementation behavior only, not approval of procurement policy, mapping, or business acceptance criteria.

## Owner disposition required

For each row, the authorized Procurement business owner and design authority must record one of:
- **ACCEPT** — with approver, role, effective date, controlled source version/locator, approval reference and change ID;
- **AMEND** — with the exact changed mapping and controlled change reference; or
- **REJECT / CLARIFICATION REQUIRED** — with rationale and named accountable owner.

Do not update the decision register from this proposal alone. Record the disposition in the existing controlled decision record first; then update the crosswalk and derive measurable positive, negative and boundary oracles from the approved decisions.

## Current gate

This proposal does not close any approval. D1–D10 remain OPEN; exact approved HLD/LLD pairs 0/6; verified DATA/API/EVENT bindings 0/18; approved executable oracles 0/6. Business UAT remains **HOLD / NOT AUTHORIZED / NOT EXECUTED**; G9 **NOT FROZEN**; G10 **NOT ISSUED**. No requirements, IDs, baseline counts, UI journeys or architecture boundaries changed.
