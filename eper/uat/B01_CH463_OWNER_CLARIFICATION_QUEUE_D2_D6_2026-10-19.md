# B01 Chapter 463 — Owner Clarification Queue (D2–D6)

**Document ID:** EPER-B01-CH463-OWNER-CLARIFICATION-QUEUE-001  
**Date:** 2026-10-19  
**Status:** CONTROLLED DECISION QUEUE — NO POLICY VALUES APPROVED BY THIS DOCUMENT  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Baseline:** Option A; 228 requirements / 38 chapters unchanged.

## Purpose

The Library and repository review has already recovered the source material available for Chapter 463. The remaining business gates are specific unresolved policy decisions, not a request for the user to re-upload existing artifacts. This queue gives each decision owner a narrow question, the source-supported facts, and the evidence required to close it. It does not guess values or self-approve policy.

## D2 — Required fields and lifecycle rules

**Requirement impact:** REQ-46301 / SRS-FR-2323; also REQ-46303 / SRS-FR-2325.

**Source-supported facts:** Chapter 463 names requester, business purpose, category, quantity, estimated value and required date as requisition field candidates and describes lifecycle/business controls.

**Not yet approved:** Field requiredness/conditionality, data types/formats, validation messages, object/field catalogue, state names, allowed transitions, uniqueness/concurrency rules.

**Owner question:** Which controlled field catalogue and lifecycle/state table is authoritative for Chapter 463, including exact version/locator? If none exists, who will approve the catalogue and transition table, and under which change ID?

**Closure evidence:** Approved catalogue and state table; per-field required/conditional/format rules; transition matrix; version/status; owner/approver role and date; archive locator; requirement/SRS/TRC mapping.

**Safe interim disposition:** `CLARIFICATION_REQUIRED`; do not assume that every source-listed candidate field is unconditionally mandatory.

## D3 — Delegated authority, roles and segregation of duties

**Requirement impact:** REQ-46302 / SRS-FR-2324; REQ-46305 / SRS-FR-2327.

**Source-supported facts:** Chapter 463 establishes delegated authority and SoD principles. Section 463.33 requires human approval for supplier selection, award, contract commitment and material commercial decisions when AI assists.

**Not yet approved:** Role × action × resource × tenant matrix; approval thresholds; delegation/substitution/expiry; self-approval and conflict combinations; approver routing; AI review record schema and enforcement binding.

**Owner question:** Which approved authority/SoD matrix and delegation policy govern each procurement action? What controlled record captures the mandatory human approval for AI-assisted material decisions?

**Closure evidence:** Approved authority matrix and policy version; delegation rules; SoD combinations; AI review schema and enforcement design; negative test proving an AI recommendation alone cannot award/commit; approval/change metadata.

**Safe interim disposition:** deny execution authorization for policy-dependent cases; do not invent roles, limits or a confidence threshold.

## D4 — Audit event coverage, integrity and retention

**Requirement impact:** REQ-46304 / SRS-FR-2326; cross-cutting REQ-46302 and REQ-46305.

**Source-supported facts:** Chapter 463 requires procurement-event audit evidence and retention according to policy.

**Not yet approved:** Material-event catalogue; exact evidence fields; retention duration/legal hold; integrity mechanism/key ownership; audit-write failure policy; access/export rules; API/event contract.

**Owner question:** Which controlled audit/security standard defines the material events, required evidence, retention and failure behavior for Chapter 463?

**Closure evidence:** Approved event catalogue and audit schema; integrity/retention/access specification; audit query operation; exact DATA/API/EVENT locators or authorized N/A; negative access and integrity test requirements.

**Safe interim disposition:** do not claim tamper-proof storage or choose fail-open/fail-closed behavior without approved control text.

## D5 — Exception, receiving, matching and recovery policy

**Requirement impact:** REQ-46305 / SRS-FR-2327; related authorization/audit requirements.

**Source-supported facts:** Chapter 463 identifies emergency/sole-source exceptions with documented justification. The broader procurement flow lists partial receipts, returns/reversals, two-/three-way matching and AP handoff.

**Not yet approved/evidenced:** Exception eligibility and approvers; required evidence; thresholds; state machine; retry/backoff/exhaustion; replay authorization; compensation; receiving/return/reversal contracts; matching tolerance; invoice eligibility and idempotent AP handoff.

**Owner question:** Which approved exception and recovery policy applies, and which receiving/AP integration contract owns partial receipt, return/reversal, matching and handoff behavior? Are all those flows in this requirement’s approved scope, or should any be explicitly mapped elsewhere?

**Closure evidence:** Approved exception taxonomy/state machine; approver/evidence rules; recovery/replay/compensation policy; receiving/AP operation and event contracts; matching policy and tolerances; explicit requirement mapping and change metadata.

**Safe interim disposition:** keep receiving/AP behavior blocked until the requirement mapping and interfaces are verified; do not invent retry counts, tolerances or eligibility thresholds.

## D6 — Reporting catalogue, KPI formula book and reconciliation

**Requirement impact:** REQ-46306 / SRS-FR-2328.

**Source-supported facts:** Chapter 463 names reporting themes including spend by category/supplier/entity/channel, contract utilization, maverick spend, savings, cycle time, sourcing outcomes, pipeline/forecast and AP/GL reconciliation.

**Not yet approved:** Report catalogue, formulas/numerators/denominators/exclusions, source of truth, as-of and freshness rules, reconciliation tolerance, currency treatment, allowed dimensions and tenant access.

**Owner question:** Which approved report catalogue/formula book defines the Chapter 463 KPIs and source-of-truth reconciliation? If no approved formula exists for a KPI, should it remain `CLARIFICATION_REQUIRED` until a named business/finance owner approves it?

**Closure evidence:** Approved report catalogue and formula book; controlled fixture data and expected outputs; source lineage; currency/time-window rules; freshness/tolerance; report API/schema and owner approval.

**Safe interim disposition:** `CLARIFICATION_REQUIRED` for metrics without a controlled formula. Do not infer formulas from field names or accept generic report envelopes as KPI contracts.

## D7–D9 — Architecture and contract gates (dependent, not owner policy defaults)

- **D7:** approve and publish the controlled HLD baseline and exact requirement-specific HLD→LLD pairs for all six requirements.
- **D8:** approve versioned DATA contracts or explicit authorized N/A, with exact schema/version/source locator.
- **D9:** approve versioned API and EVENT contracts or explicit authorized N/A; reconcile canonical event names against the controlled event catalogue.

The HLD and LLD delta documents and the 18-slot contract pack are candidate review inputs only. They do not close D7–D9 until formal decisions and controlled publication exist.

## D10 — Controlled release and Business UAT authorization

D10 remains separate. It may be considered only after the source/contract/case packet prerequisites are met, the hosted target and pinned build are preflighted, access/test data/session are confirmed, and a signed execution authorization is recorded. CI success alone cannot grant D10.

## Current gate state

- Approved executable acceptance oracles: **0/6**.
- Exact approved HLD→LLD pairs: **0/6**.
- Verified DATA/API/EVENT bindings: **0/18**.
- Hosted technical preflight: **not executed**.
- Business UAT: **HOLD / NOT AUTHORIZED / NOT EXECUTED**.
- G9: **NOT FROZEN**. G10: **NOT ISSUED**.

## Decision recording format

For each D2–D6 decision, record: decision ID; approved/rejected/amended/clarification-required disposition; policy/source ID and exact version/locator; accountable owner and approver role; decision/change ID; effective date; rationale; affected REQ/SRS/TRC IDs; contract/test impact; evidence archive locator. A missing response is not approval.
