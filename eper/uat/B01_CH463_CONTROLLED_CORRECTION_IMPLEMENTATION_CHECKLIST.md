# B01 Chapter 463 Controlled Source-Correction Implementation Checklist

- Change control: `B01-CH463-CC-001`
- Decision: `B01-CH463-SOURCE-CORRECTION-DECISION-001`
- Approved source-precedence choice: Option A (2026-10-12)
- Preserved baseline approval: `B01-BASELINE-APPROVAL-001` (2026-10-11)
- Status: **IMPLEMENTATION CHECKLIST — NOT A REISSUED OR REAPPROVED BASELINE**

## Approved decision boundary

The dedicated Volume XIII Chapter 463 **Enterprise Procurement & Source-to-Pay** artifact is the canonical domain-specific source. The conflicting consolidated BRD §463.21 and HLD recovery-matrix Chapter 463 heading must be corrected or formally superseded through controlled change.

This source-precedence decision does not approve the six requirement mappings, acceptance oracles, HLD/LLD locators, DATA/API/EVENT contracts, or Business UAT.

## Work items

| ID | Action | Evidence required | Status |
|---|---|---|---|
| CC-01 | Preserve current baseline and source artifacts unchanged | Baseline approval record; retained source versions | Required |
| CC-02 | Correct or formally supersede consolidated BRD Chapter 463 legacy Event & Message Management label/block | Revised controlled document, change history, reviewer/approver record | Open |
| CC-03 | Correct or formally supersede HLD recovery-matrix Chapter 463 heading and any misleading domain references | Revised controlled document, change history, reviewer/approver record | Open |
| CC-04 | Update source register to point to dedicated Volume XIII Chapter 463 Procurement & Source-to-Pay artifact | Exact filename, version, status, section locator, provenance | Open |
| CC-05 | Map each retained REQ-46301..06 and SRS-FR-2323..2328 to approved procurement-domain BRD rules | Explicit row-level mapping approved by design authority | Open |
| CC-06 | Define measurable positive, negative and boundary acceptance oracles | Approved rule, inputs, expected results and boundary values per requirement | Open |
| CC-07 | Capture exact approved HLD and LLD locators and explicit pairs | Document/version/baseline, exact section/module locator, requirement linkage | Open |
| CC-08 | Bind authoritative data/schema ownership and API/Event contracts, or approved N/A | Schema/owner and contract/version locator or signed N/A rationale | Open |
| CC-09 | Run consistency and gate validation without changing the 228-requirement / 38-chapter baseline | Validation results and exception register | Not started |
| CC-10 | Keep Business UAT execution disabled until all entry gates and approvals are evidenced | Gate sign-off and explicit authorization | HOLD |

## Six-row traceability guard

Retain these identifiers unless a separate approved change explicitly authorizes a traceable rebaseline:

- REQ-46301 / SRS-FR-2323 / TRC-46301
- REQ-46302 / SRS-FR-2324 / TRC-46302
- REQ-46303 / SRS-FR-2325 / TRC-46303
- REQ-46304 / SRS-FR-2326 / TRC-46304
- REQ-46305 / SRS-FR-2327 / TRC-46305
- REQ-46306 / SRS-FR-2328 / TRC-46306

Do not assume the existing generic requirement patterns are approved procurement acceptance criteria. Do not promote candidate HLD-CAP/HLD-CAND anchors or generic LLD component patterns as exact approved design references.

## Release guardrails

- Preserve 228 requirements and 38 chapters unchanged.
- Keep `EPER_UAT_API_ENABLED=false`.
- Do not provision chargeable AWS resources.
- Business UAT remains **HOLD** and execution authorization remains **NO** until the applicable evidence and approvals pass.
- Automated CI/simulation results are not business acceptance.
