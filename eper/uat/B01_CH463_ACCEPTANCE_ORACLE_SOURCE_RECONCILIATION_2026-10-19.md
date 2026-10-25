# B01 Chapter 463 — Acceptance Oracle Source Reconciliation

**Document ID:** EPER-B01-CH463-ORACLE-RECON-001  
**Date:** 2026-10-19  
**Status:** SOURCE-RECONCILIATION CANDIDATE — NOT APPROVED / NOT EXECUTABLE  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Baseline:** Preserve Option A and 228 requirements / 38 chapters. Business UAT remains HOLD / NOT AUTHORIZED / NOT EXECUTED.

## 1. Controlling rule

The selected acceptance source is **existing criteria only**. This artifact distinguishes:
- **Source-listed domain behavior:** stated in the Chapter 463 domain source, which remains marked In Development and is not by itself final policy approval.
- **Candidate test mechanics:** setup, seeded records, positive/negative cases, no-side-effect checks and evidence capture. These do not create business policy.
- **CLARIFICATION_REQUIRED:** the source does not define enough detail to produce a deterministic approved pass/fail oracle.
- **Approved executable oracle:** requires an approved BRD/SRS source, exact locator/version, measurable expected result, controlled policy parameters where relevant, and approval metadata. No oracle is promoted by this file.

Do not convert “100% of seeded cases” or “zero unauthorized side effects” into an acceptance threshold until the seed set and applicable policy are approved. These can be technical assertions once prerequisites exist.

## 2. Six-row oracle reconciliation

| Requirement / SRS / TRC | Source-listed behavior | Candidate test mechanics (not yet UAT-authorized) | Unresolved policy or design dependency | Oracle disposition |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | Procurement records have lifecycle/business controls. Chapter 463 names requester, business purpose, category, quantity, estimated value and required date as requisition field candidates. | Create a controlled fixture; submit a valid command and inspect persisted record/history; submit an invalid transition and verify no unintended mutation; capture response, state/history and logs. | Approved entity/object join; field requiredness/format/conditionality; lifecycle state table and transitions; uniqueness/version/idempotency semantics; canonical event name/schema. | **CLARIFICATION_REQUIRED** — field and lifecycle details are not approved enough for deterministic pass/fail. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Delegated authority and segregation of duties are domain principles. For AI-assisted procurement (§463.33), human approval is required for supplier selection, award, contract commitment and material commercial decisions. | Seed allow/deny actors from an approved authority matrix; attempt authorized/unauthorized operations; verify denied operations do not mutate state. For the AI boundary, verify an AI recommendation alone cannot commit an award/contract/material commercial decision and capture the human-review record. | Approved role × action × resource × tenant matrix; authority thresholds, delegation/substitution/expiry and SoD conflicts; approved AI reviewer/evidence schema and enforcement point. | **CLARIFICATION_REQUIRED** — AI human-approval boundary is source-listed, but its schema and full authority matrix are unresolved. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | Procurement validation responsibilities and sourcing/business controls are described, but detailed field-level rules and threshold configuration are not approved in reviewed sources. | Exercise valid/invalid fixtures against the approved rule catalogue once available; capture each validation issue and prove blocking failures do not partially commit. | Approved mandatory/conditional fields, formats, validation messages, threshold configuration, policy precedence and blocking-versus-warning semantics. | **CLARIFICATION_REQUIRED** — no approved executable rule catalogue/threshold source found. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | Procurement events require audit evidence and retention according to policy. | Generate each event from the approved material-event catalogue; retrieve evidence under an authorized actor; verify attribution/correlation and integrity behavior using the approved control specification. | Material-event catalogue; exact evidence fields; retention duration; integrity mechanism; audit-write failure policy; retrieval/access/export controls. | **CLARIFICATION_REQUIRED** — approved audit-control specification not found. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | Emergency/sole-source exceptions require documented justification. Source also lists partial receipts, returns/reversals, 2-/3-way matching and AP handoff in the broader procurement flow. | Submit an exception fixture with approved justification; verify missing-justification rejection only after requiredness is approved. Exercise retry/replay/reversal and AP handoff only after policy/contracts are approved; prove duplicate delivery cannot duplicate a commercial effect. | Exception eligibility/thresholds/approvers/evidence; retry/recovery/compensation policy; receipt/return/reversal and matching contracts; invoice eligibility and idempotent AP handoff. | **CLARIFICATION_REQUIRED** — source-listed behavior exists, but detailed exception and receiving/AP policies/contracts are absent. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | Reporting themes include spend by category/supplier/entity/channel, contract utilization, maverick spend, savings, cycle time, sourcing outcomes, pipeline/forecast and AP/GL reconciliation. | Run a report against controlled fixtures; independently calculate expected results from the approved formula book; verify tenant scoping, lineage and as-of/refresh metadata. | Approved report catalogue and formulas; numerator/denominator/exclusions; source of truth; as-of/freshness; reconciliation tolerance; currency treatment and access policy. | **CLARIFICATION_REQUIRED** — dimensions are listed, but no approved formula book or report contract was found. |

## 3. AI-assisted procurement control — explicit source-listed oracle candidate

Chapter 463 §463.33 states that AI may classify, recommend, summarize, compare or detect; must show evidence/assumptions/confidence and record model/version/reviewer; and requires human approval for supplier selection, award, contract commitment and material commercial decisions.

Candidate technical assertions once the approved implementation contract is identified:
1. An AI output alone cannot perform a supplier award or contract/material commercial commitment.
2. A protected action cannot proceed without the required human approval record.
3. The approval record identifies reviewer and model/version/evidence fields required by the approved schema.
4. Denial or missing approval causes no commercial state mutation.
5. Audit evidence can be retrieved under approved access rules.

These assertions are **not approved executable oracles** until the requirement join, data/API design, approved AI control record and exact source locators are established. Do not invent a confidence threshold.

## 4. Required oracle evidence packet

For each requirement, complete all fields before marking an oracle approved:
- Requirement ID, SRS ID and TRC ID.
- Approved BRD/SRS document ID, version/status, exact section/page/paragraph locator.
- Exact criterion from the approved source.
- Fixture/seed identifiers and preconditions.
- Actor, tenant, role and authorization basis.
- Positive, negative and boundary steps derived from approved policy.
- Deterministic expected business state, API result and required audit/event evidence.
- Test environment/build identifier and evidence archive locator.
- Business owner approval, design/contract references, decision/change ID and date.
- Disposition: APPROVED_EXECUTABLE, CLARIFICATION_REQUIRED, or BLOCKED_SOURCE_NOT_APPROVED.

Do not use CI success, candidate HLD/LLD text, implementation-derived fields or this note as a substitute for business acceptance approval.

## 5. Current gate state

- Approved executable acceptance oracles: **0/6**.
- Exact approved HLD→LLD pairs: **0/6**.
- Verified DATA/API/EVENT bindings: **0/18**.
- Business UAT: **HOLD / NOT AUTHORIZED / NOT EXECUTED**.
- G9: **NOT FROZEN**. G10: **NOT ISSUED**.

## 6. Next closure action

Use this matrix to target missing policy/source decisions rather than request broad repeated input. Close D2–D6 from existing controlled source material where sufficient; route only unresolved values or policy gaps to the named owner as explicit clarification requests. Once source and contract locators are approved, generate executable case packets and submit them for separate Business UAT authorization.
