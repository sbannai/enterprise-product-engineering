# B01 Chapter 463 Requirement-to-Source Mapping Proposal — Review Required

- Change control: `B01-CH463-CC-001`
- Decision boundary: approved source precedence Option A; this file proposes mappings only.
- Canonical domain source: dedicated Volume XIII Chapter 463 Procurement & Source-to-Pay BRD v1.0, status **In Development**.
- Status: **PROPOSED FOR DESIGN-AUTHORITY REVIEW — NOT APPROVED TRACEABILITY**
- Preserve `B01-BASELINE-APPROVAL-001`, all 228 requirements and all 38 chapters.

## Proposed row-level mapping for review

| Retained requirement / SRS / TRC | Existing generic intent | Candidate Chapter 463 criterion/check | Why this is only a proposal | Approval still needed |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | Authoritative records and lifecycle history | §463.46(3),(4),(5); §463.47(3),(6),(7),(9),(11) | Sourcing/award evidence, commercial-term linkage, transaction flow and PO/AP lineage are related to traceability, but the generic “authoritative record state” semantics are not explicitly equated to these procurement criteria | Design Authority confirms semantic fit; Procurement owner selects required transaction types/stages; data/state owner supplies authoritative lifecycle and lineage rules |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Role-based authorization before material actions | §463.46(2),(3),(6); §463.47(6),(8),(12),(13) | Approval controls, award approval, SoD/security and human review are relevant, but the source does not provide the role/delegation/SoD matrix or exact authorization decisions | Design Authority + Procurement/Security approve role, delegation, SoD and AI decision boundaries |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | Validate mandatory business conditions before material changes | §463.46(1),(2),(4); §463.47(1),(3),(5),(7),(8),(9),(10) | The source identifies approval, budget, policy, evaluation, terms and compliance controls, but not the full mandatory-field list, threshold values, tolerances or exact state transitions | Procurement/Finance/Legal owners approve policy values, required fields, transition table and boundary outcomes |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | Audit evidence for material events | §463.46(1),(3); §463.47(5),(6),(12) | Auditable evaluation and retained award rationale are explicit source themes, but the source does not fully define audit event schema, immutability, retention or retrieval SLA | Security/Audit owner approves required evidence fields, protection, retention and retrieval criteria |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | Controlled exception handling | §463.46(2),(6); §463.47(4),(10),(13),(14) | Exceptions, thresholds, bid deadlines/confidentiality, AI human review and continuity are related; the source excerpt does not fully define exception taxonomy, override roles, escalation SLA or retry semantics | Procurement/Legal/Security/BCM owners approve exception types, evidence, approval path, escalation and recovery/idempotency rules |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | Governed status, exception and performance reporting | §463.46(1),(3),(5); §463.47(1),(5),(10),(11) | Auditable evaluation, transaction flow, compliance and lineage are reporting inputs; exact report catalogue, KPI formulas, refresh/freshness, access and reconciliation criteria are not supplied by these criteria alone | Procurement/Finance/Audit owners approve report catalogue, KPI formulas, lineage, access and freshness/reconciliation thresholds |

## Required disposition per row

The reviewer must choose one disposition for each retained ID:
- **CONFIRM** — existing requirement semantics remain valid and the proposed source mapping is accepted;
- **REVISE BY CONTROLLED CHANGE** — semantics or identifier mapping must change; provide impact analysis and approved rebaseline path;
- **REJECT PROPOSAL** — provide the authoritative replacement rule/locator or explain why the generic requirement is out of scope.

No row is considered mapped until the reviewer records exact source section/page or heading locator, source version/status, approval identity/date, measurable positive/negative/boundary outcomes and required policy/configuration values.

## Binding and execution gates (all remain open)

- Exact approved HLD locator and exact approved LLD locator/pair for each row.
- DATA ownership/schema/lifecycle/retention and approved N/A where applicable.
- API/EVENT contract IDs, versions, payload/schema and compatibility evidence, or separately approved N/A.
- Cross-artifact consistency validation preserving 228 requirements / 38 chapters.
- Actual authorized Business UAT execution and acceptance.

## Guardrails

This proposal is not a reissued BRD/SRS/HLD/LLD, does not amend the approved baseline, and does not authorize merge or Business UAT. Keep `EPER_UAT_API_ENABLED=false`; do not provision chargeable AWS resources. Green CI is technical evidence only.
