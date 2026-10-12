# B01 Chapter 463 Controlled Source-Correction Delta

- Change control: `B01-CH463-CC-001`
- Related PR: #120
- Status: **PROPOSED CONTROLLED EDITS — NOT APPLIED TO SOURCE BASELINES**
- Canonical domain source: Volume XIII Chapter 463 — Enterprise Procurement & Source-to-Pay, v1.0 (In Development)
- Baseline: preserve `B01-BASELINE-APPROVAL-001` (2026-10-11)

## Source-level corrections

| Source artifact | Existing conflicting content | Controlled disposition | Required validation before reissue |
|---|---|---|---|
| `EM-BRD-001_Detailed_Chapters-461-470_v1.0.docx`, §463.21 | Chapter 463 identified as “Enterprise Event & Message Management” with six generic requirements | Replace or formally supersede the chapter label/scope block with the canonical Chapter 463 Procurement & Source-to-Pay domain framing; do not silently rewrite the approved baseline | Compare complete affected section to the dedicated Volume XIII Chapter 463 BRD; retain original; record revision diff, reviewer, approver, version and effective date |
| `HLD_463_470_Controlled_Traceability_Recovery_Matrix_46301_46306_v1.9.docx`, Chapter 463 heading and scope basis | Chapter 463 identified as “Enterprise Event & Message Management” | Correct or formally supersede the misleading label and scope references; keep the traceability HOLD and all unresolved bindings visible | Verify no candidate HLD-CAP/LLD pattern is promoted as an exact locator; record revision diff and approval |
| Chapter-source register | Legacy label conflicts with the dedicated domain BRD and approved Option A decision | Record the dedicated Chapter 463 source identity, version/status, locator and provenance; cross-reference `B01-CH463-SOURCE-CORRECTION-DECISION-001` | Verify source file, version and current status against the controlled document; do not call v1.0 an approved final baseline |
| Requirement traceability register | Existing six generic requirements may be misread as procurement-specific acceptance criteria | Preserve REQ/SRS/TRC identifiers but mark procurement-domain rule mappings as pending until explicit rule-level approval | Require six approved row mappings with positive, negative and boundary oracle evidence before promotion |

## Exact identifier preservation

| Requirement | SRS | Traceability | Mapping disposition |
|---|---|---|---|
| REQ-46301 | SRS-FR-2323 | TRC-46301 | Procurement rule mapping pending approval |
| REQ-46302 | SRS-FR-2324 | TRC-46302 | Procurement rule mapping pending approval |
| REQ-46303 | SRS-FR-2325 | TRC-46303 | Procurement rule mapping pending approval |
| REQ-46304 | SRS-FR-2326 | TRC-46304 | Procurement rule mapping pending approval |
| REQ-46305 | SRS-FR-2327 | TRC-46305 | Procurement rule mapping pending approval |
| REQ-46306 | SRS-FR-2328 | TRC-46306 | Procurement rule mapping pending approval |

## Exit criteria for this change

1. The corrected or superseding BRD/HLD artifacts exist with versioned diffs and formal approval evidence.
2. The canonical source register identifies the dedicated Chapter 463 domain source without overstating its approval status.
3. All six retained requirements have explicit approved procurement rule mappings and measurable positive/negative/boundary oracles.
4. Exact approved HLD and LLD locators, explicit pairs, DATA ownership/schema and API/Event contract/version (or approved N/A) are evidenced row by row.
5. Cross-register validation passes without changing the 228-requirement / 38-chapter baseline.
6. Business UAT remains disabled until its separate entry gates and authorization are complete.

## Non-negotiable guardrails

- This file is a change delta, not the corrected BRD/HLD itself.
- No baseline artifact is overwritten by this change.
- Keep `EPER_UAT_API_ENABLED=false`.
- No chargeable AWS resources.
- CI success is not approval of the source corrections or Business UAT.
