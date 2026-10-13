# B01 Chapter 463 Candidate Acceptance Oracle Pack

- Record ID: B01-CH463-CANDIDATE-ORACLES-001
- Date: 2026-10-12
- Baseline: B01-BASELINE-APPROVAL-001 preserved
- Status: DRAFT FOR ROW-LEVEL BUSINESS/DESIGN AUTHORITY REVIEW — NOT EXECUTABLE TEST CASES
- Domain source precedence: APPROVED OPTION A, 2026-10-12
- Change control: B01-CH463-CC-001
- Source context: Volume XIII Chapter 463 §§463.3–463.47, including chapter-level acceptance criteria §463.46 and validation checklist §463.47; consolidated BRD §463.21; SRS-FR-2323..2328; controlled HLD recovery matrix v1.9.

## Purpose and rule

Turn the six candidate mappings into reviewable acceptance-oracle proposals without fabricating threshold values, roles, lifecycle states, response codes, data contracts or approvals. Domain source precedence is now resolved in favor of Volume XIII Chapter 463 Procurement & Source-to-Pay. These proposals must not be run as UAT cases until each requirement's procurement mapping, exact rule, measurable oracle, design/interface bindings, test role/data, and applicable gate evidence are approved.

| Requirement / SRS | Candidate behavior under procurement interpretation | Proposed positive verification | Proposed negative / boundary verification | Measurable oracle still requiring owner decision | Evidence to capture |
|---|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | Preserve authoritative procurement record and lifecycle history for the owner-confirmed object(s), such as requisition, sourcing event, award or PO. | Create or transition one owner-selected record using a valid, approved state transition; verify the persisted state and history. | Attempt an owner-selected invalid transition or duplicate operation; verify no unauthorized state mutation and no duplicate business effect. | Record type/system of record; permitted states/transitions; mandatory fields; uniqueness/idempotency rule; history/retention requirements; exact persisted fields. | Before/after record snapshots, state-history entry, actor/time, correlation ID and audit event. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Enforce approved delegated authority and segregation-of-duties rules for procurement actions. | An explicitly authorized test actor performs one approved action in the owner-selected scenario. | An unauthorized actor or conflicting-duty actor attempts the same action and is denied without committing the protected action. | Approved role/permission matrix; entity/tenant scope; approval thresholds; delegation/substitution rules; exact denial outcome. | Actor and role claims, authorization decision, action result, approval history and audit record. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | Validate requisition, sourcing or PO conditions against approved procurement policy. | Submit a transaction whose values satisfy owner-approved mandatory conditions; verify acceptance and the expected downstream state. | Submit a transaction violating one approved condition and test configured threshold boundary values. | Exact rule/threshold source; currency/tax/entity/category semantics; validation timing; error/result contract; permitted override. | Input fixture, policy/config version, validation outcome, response/status, persisted state and correlation ID. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | Preserve evidence and rationale for supplier evaluation, award and procurement approvals. | Record an owner-selected evaluation/award decision with the required evidence and rationale; retrieve it by approved key. | Attempt a decision without required evidence or attempt unauthorized alteration of recorded evidence. | Required audit/evaluation fields; versioning and retention; immutable fields; retrieval SLA; access controls; correction procedure. | Decision/evaluation record, evidence references, actor/time, version history, retrieval result and audit event. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | Handle approved procurement exceptions and recover safely from failed or repeated operations. | Submit one approved exception with required justification and approvals; verify its governed disposition. | Submit an unapproved exception or replay a request after a simulated failure; verify approved denial/compensation and no duplicate award/order. | Exception taxonomy; approver/justification rules; retry/replay/idempotency policy; compensation behavior; terminal status and alerting. | Exception record, approval chain, idempotency/correlation keys, state transitions, side-effect comparison and audit trail. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | Produce governed procurement reporting for approved status, exceptions, spend and performance measures. | Query a report against an owner-approved seeded dataset and reconcile output to the authoritative source records. | Query as an unauthorized actor and test an owner-approved stale/inconsistent dataset scenario. | Metric definitions/formulas; source-of-truth; inclusion/exclusion rules; refresh/freshness SLA; reconciliation tolerance; access policy. | Dataset/version, query/filter, report output, reconciliation calculation, freshness timestamp and access decision. |

## Source-supported domain constraints (not a complete oracle)

The procurement BRD describes transparency, evidence-based supplier selection, delegated authority and segregation of duties, budget and sourcing controls, controlled emergency/sole-source exceptions, transaction lineage into receiving/AP/financial reporting, and an advisory-only AI boundary (§§463.3, 463.7–463.18, 463.44–463.47). These chapter-level statements provide candidate test themes; they do not specify every requirement-level expected value.

## Required approval fields — complete separately for each row

- Domain identity: `PROCUREMENT` (source precedence approved under B01-CH463-SOURCE-CORRECTION-DECISION-001); row-level mapping approval remains pending
- Approved canonical BRD filename/version and exact locator:
- Exact approved rule text or rule ID:
- Approved actor/role/tenant and test data:
- Positive scenario and expected result:
- Negative/boundary scenario and expected result:
- Exact measurable assertions and tolerance:
- HLD filename/version/locator:
- LLD filename/version/component/locator:
- Explicit HLD→LLD pair evidence:
- DATA schema/entity owner + version, API contract/operation + version, EVENT contract/topic/schema + version, or separately approved N/A:
- Reviewer/decision owner:
- Approval/change reference and date:

## Gate status

No candidate oracle is approved or executable from this document. Preserve all requirement IDs and the approved baseline. Keep all 48 case execution-authorization values `NO`; Business UAT remains on HOLD until the controlled BRD/HLD correction is completed and row-level mappings, measurable acceptance criteria, exact design/interface traceability, target/build identity, test data/roles and applicable gate evidence are approved.


## Source-locator crosswalk — proposed only, not requirement approval

Prepared 2026-10-12 from the retrieved Volume XIII Chapter 463 BRD v1.0 (cover status: **In Development**). The section references below are source-supported candidate locators to accelerate review; they are **not** approved one-to-one requirement mappings and do not supersede the controlled source-correction process. The source contains chapter-level criteria and checks, not all measurable values needed for executable tests.

| Requirement | Candidate BRD locator(s) for reviewer verification | Why this is a candidate | Gap that prevents promotion |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | §§463.7–463.8; relevant object lifecycle section to be confirmed against the row’s approved scope | Requisition creation, approval and status are explicit in the source; the actual authoritative object for this requirement is not yet owner-confirmed | Confirm canonical object/system of record, lifecycle states/transitions, required fields, history/retention and exact requirement-to-rule binding |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | §§463.3, 463.8, 463.46 criterion 2, §463.47 checks 8 and 12 | The source explicitly describes delegated authority, segregation of duties and approval controls | Approve role/permission matrix, thresholds, delegation rules, tenant/entity scope and exact denial result |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | §§463.7–463.8; §463.47 checks 8 and 10 | The source describes budget/sourcing validation, approval routing and threshold/exception checks | Approve exact policy/rule IDs, boundary values, currency/category/entity semantics, overrides and validation result contract |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | §§463.3, 463.15–463.18; §463.46 criterion 3; §463.47 checks 5–6 | The source requires evidence-based supplier selection and auditable evaluation/award rationale | Confirm the requirement’s target decision object, mandatory evidence fields, weighting/conflict rules, versioning and retention |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | §463.3; §463.47 checks 10 and 14 | The source describes documented emergency/sole-source exceptions and continuity/no-duplicate-award-or-order validation | Approve exception taxonomy/authority, retry/idempotency and compensation behavior, terminal states and measurable no-duplicate assertion |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | §§463.2, 463.45–463.46 criterion 5; §463.47 checks 10–11 | The source includes spend analytics/performance and transaction lineage into receiving, AP and financial reporting | Approve metric definitions/formulas, source-of-truth, filters, refresh/freshness, reconciliation tolerance and access rules |

### Promotion rule

For each row, record the approved BRD filename/version and exact rule locator, explicit approval/change reference, and measurable positive plus negative/boundary oracle. Then establish the exact approved HLD locator, LLD locator and explicit HLD→LLD pair; attach the applicable DATA/API/EVENT contract and version or separately approved N/A. Until these fields are approved and verified, retain the row as **PROPOSED / HOLD / NOT EXECUTABLE**. Do not use this crosswalk to change the 228-requirement, 38-chapter baseline or authorize Business UAT.


## Procurement catalogue leads recovered from Library — draft only

Source recovered: `EPER_Master_Repository_v35.0.xlsx`, sheets `103_PROC_API_Catalog` and `100_PROC_Domain_Events`. The catalogue entries surfaced in the Library are marked **Draft**. These are lookup leads for controlled validation, not approved contract references and not requirement-level mappings.

| Catalogue lead | Source catalogue entry | Potential review relevance | Required before binding |
|---|---|---|---|
| API | `API-PROC-003` — supplier qualification decision | Could be relevant only if an approved REQ row covers supplier qualification | Exact data-entity row, requirement applicability, approved HLD/LLD pair, operation schema, authorization and approval status |
| API | `API-PROC-005` — publish sourcing event | Could be relevant only if the approved requirement covers sourcing-event publication | Exact rule-to-requirement crosswalk, request/response/error schema, approved status and design pair |
| API | `API-PROC-008` — approve sourcing award | Potential lead for an award/evaluation rule, not presumed to satisfy it | Approved award authority, measurable oracle, schema and exact requirement/design binding |
| API | `API-PROC-009` — create requisition | Potential lead for a requisition rule, not presumed to satisfy it | Required fields/policy rules, exact requirement locator, schema and approved design pair |
| API | `API-PROC-012` — create purchase order | Potential lead for a purchase-order rule, not presumed to satisfy it | Approved lifecycle/approval constraints, schema, exact requirement locator and design pair |
| EVENT | `EVT-PROC-004` — `SourcingEventPublished` | Candidate domain event for sourcing publication | Approved producer/payload schema/version, trigger and requirement applicability |
| EVENT | `EVT-PROC-006` — `SourcingAwardApproved` | Candidate domain event for award approval | Approved producer/payload schema/version, authorization/approval semantics and requirement applicability |
| EVENT | `EVT-PROC-007` — `PurchaseRequisitionSubmitted` | Candidate domain event for requisition submission | Approved payload/schema/version, event ownership, delivery semantics and requirement applicability |
| EVENT | `EVT-PROC-008` — `PurchaseRequisitionApproved` | Candidate domain event for requisition approval | Approved payload/schema/version, producer authority and requirement applicability |

**Data catalogue limitation:** this search result did not expose a verified exact procurement entity row from `11_Data_Entities`. No DATA entity/schema ID is assigned here. Retrieve and verify the exact row before binding any requirement.

### Disposition

These catalogue leads improve the search path but do not close any of the six SRC-003 rows. Keep each row `PENDING / NOT_VERIFIED` until the exact data entity, API operation and event applicability (or separately approved N/A), HLD/LLD locators and approvals are evidenced. All entries remain **Draft candidate references**; do not promote them to an approved contract baseline.


## Procurement data-entity catalogue leads recovered — draft only

Source: `EPER_Master_Repository_v35.0.xlsx`, sheet `11_Data_Entities`. The rows below were surfaced by Library search and each has status **Draft**. These are catalogue candidates only; no schema/field definitions or approved REQ-to-entity joins were established by the search result.

| Entity ID | Catalogue name | Candidate relevance for controlled review | Binding status |
|---|---|---|---|
| `ENT-PROC-001` | Supplier | Supplier lifecycle/qualification only if supported by the approved requirement text | Draft; not bound |
| `ENT-PROC-002` | Supplier Site | Supplier site scope only if explicitly required | Draft; not bound |
| `ENT-PROC-003` | Supplier Qualification | Qualification decisions only if explicitly required | Draft; not bound |
| `ENT-PROC-004` | Sourcing Event | Sourcing-event lifecycle only if explicitly required | Draft; not bound |
| `ENT-PROC-005` | Sourcing Lot | Lot-level sourcing only if explicitly required | Draft; not bound |
| `ENT-PROC-006` | Supplier Bid | Bid handling only if explicitly required | Draft; not bound |
| `ENT-PROC-007` | Bid Evaluation | Evaluation evidence only if explicitly required | Draft; not bound |
| `ENT-PROC-008` | Sourcing Award | Award lifecycle only if explicitly required | Draft; not bound |
| `ENT-PROC-009` | Purchase Requisition | Requisition lifecycle only if explicitly required | Draft; not bound |
| `ENT-PROC-010` | Purchase Requisition Line | Requisition-line data only if explicitly required | Draft; not bound |
| `ENT-PROC-011` | Purchase Order | PO lifecycle only if explicitly required | Draft; not bound |
| `ENT-PROC-012` | Purchase Order Line | PO-line data only if explicitly required | Draft; not bound |
| `ENT-PROC-013` | Purchase Order Schedule | Schedule data only if explicitly required | Draft; not bound |

### Required reconciliation rule

Do not assign any of these entity IDs to REQ-46301…REQ-46306 merely because the names appear relevant. The next verification must inspect the full controlled workbook row definitions and the approved requirement text, then record the exact approved HLD locator, LLD locator, HLD→LLD pairing, schema/version, owner and approval/change reference. Until then the SRC-003 tracker remains `PENDING / NOT_VERIFIED`; no DATA contract or approved N/A is claimed.


## Source-recovery reconciliation — 2026-10-13

This section records facts recoverable directly from the submitted canonical-source candidate, `EM-BRD-001, Volume XIII, Chapter 463, v1.0` (cover status: **In Development**). It separates those source facts from parameters that the source does not define. It is a recovery aid, not a new approval, baseline reissue, or promotion of candidate design references.

| Requirement | Source-supported business rule / exact BRD locator | What is recoverable without another owner decision | What remains genuinely unresolved |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | §463.7: requisitions capture requester, business purpose, category, quantity, estimated value and required date; validate budget and sourcing requirements; track approval/fulfillment status. §463.21: POs from approved requisitions/contracts; capture supplier, lines, prices, quantities, delivery and terms; assign unique PO number. §463.22: retain original/revised versions and audit every change. §463.36: preserve state during outages and prevent duplicate awards/orders after recovery. | These are source-backed candidate object/lifecycle fields and test themes. Duplicate-effect prevention and version history are explicit source themes; they need not be invented as new business requirements. | Which object(s) this generic requirement formally covers; authoritative system of record; allowed states/transitions; exact mandatory-field set; history/retention period; specific idempotency key and implementation contract. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | §463.3: approvals follow delegated authority and segregation-of-duties rules. §463.8: route by amount, entity, category and cost center; support sequential/parallel approvals and delegation/substitution; prevent ordering before required approval. §463.35: restrict commercially sensitive bids and negotiations; enforce evaluator confidentiality and conflict-of-interest controls. | The control dimensions and minimum negative-test themes are source-backed: unauthorized action, conflicting duties, approval routing and premature downstream ordering. | Approved role-to-action matrix, numeric/monetary thresholds, entity/tenant scope, conflict combinations, delegation expiry/substitution details and exact denial response. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | §463.7: validate budget and sourcing requirements. §463.8: route approvals by amount/entity/category/cost center and block ordering before approval. §463.24: enforce approved supplier/contract/catalog/threshold rules and competitive sourcing where policy requires. §463.25: check requisitions/POs against available budget; prevent or flag overspend according to policy. | The rule families are explicit: budget, sourcing, approved supplier/contract/catalog, thresholds and pre-approval constraints. Candidate tests can be derived against an approved configuration once found. | Exact policy/rule IDs and version; thresholds and boundary values; currency/tax treatment; budget integration semantics; whether overspend is blocked or flagged in each scenario; error/result contract and override authority. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | §463.12: record award rationale. §463.14: maintain immutable bid history. §463.15: preserve evaluation history and capture evaluator comments/evidence. §463.16: capture award rationale and rejected alternatives. §463.22: audit every PO change. §463.35: audit requisitions, awards, contracts, POs and changes; retain evidence according to policy. | The source explicitly identifies material procurement records/events and requires rationale, evidence/history and audit. Candidate test themes should target those events instead of an invented generic audit-only object. | Exact requirement-to-event mapping; mandatory audit field schema; integrity mechanism; retention period; audit retrieval SLA; access matrix; failure semantics and correction procedure. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | §463.3: emergency and sole-source exceptions require documented justification. §463.20: guided buying captures exceptions. §463.24: support sole-source/emergency exceptions and maintain compliance evidence. §463.36: preserve state during outages, prevent duplicate awards/orders after recovery, and reconcile interrupted supplier communications. | Documented rationale for emergency/sole-source procurement and recovery/no-duplicate-effect are source-backed obligations. Negative tests should verify missing justification/authority and repeated operations once exact policies are available. | Complete exception taxonomy; who may approve each exception; required justification/evidence by type; retry, replay, compensation and dead-letter/recovery behavior; terminal statuses and measurable alerting. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | §§463.32 and 463.41: spend by category/supplier/entity/channel; contract utilization, maverick spend, savings, cycle time, sourcing outcomes and procurement KPIs. §463.27: source lineage and procurement-side exception resolution for AP handoff. §463.46 criterion 5: reliable transaction flow into receiving, AP and financial reporting. | Candidate report domains and named KPI concepts can be sourced from the BRD; the KPI catalogue is not blank. Transaction lineage and reconciliation are source-backed. | Which reports/metrics are in scope for this requirement; authoritative formulas/denominators; filters; as-of and freshness semantics; data source/owner; reconciliation tolerance; access/tenant rules. |

### Cross-cutting source facts recovered

- §463.8 explicitly identifies approval-routing dimensions: amount, entity, category and cost center.
- §463.14 requires deadline enforcement, controls against unauthorized bid visibility, controlled bid revisions and immutable bid history.
- §463.15 identifies weighted technical/commercial/quality/risk/sustainability criteria, evaluator assignment, conflict declarations, consistent scoring and evaluation history.
- §463.16 identifies single/multi-supplier awards, appropriate approval, award rationale, rejected alternatives and controlled supplier communication.
- §463.24 identifies approved supplier/contract/catalog/threshold rules, maverick-spend detection, competitive sourcing where policy requires, and emergency/sole-source exceptions.
- §463.25 identifies budget checks, commitment recording before invoice, policy-governed prevention/flagging of overspend, commitment release and reporting.
- §463.27 identifies authoritative PO/receipt/contract data for AP, 2-way/3-way matching, procurement-side exception resolution and source lineage.
- §463.32 and §463.41 name report/KPI areas. Their names are recoverable; formulas, thresholds, tolerances and refresh SLAs are not established merely by naming them.
- §463.33 states AI recommendations must show evidence, assumptions and confidence; human approval is mandatory for supplier selection, award, contract commitment and material commercial decisions; AI cannot independently award business or commit enterprise funds.
- §463.44 preserves the boundary between foundation services and procurement authority: foundation services may provide shared identity, authorization, workflow, audit and integration primitives, while procurement retains authority over sourcing, evaluation, awards, commercial commitments, exceptions and purchasing controls.

### Work disposition

1. Reuse the facts above in the six candidate-oracle rows and in QA test design; do not send these source-established rules back to the user as questions.
2. Have the evidence-recovery workstream search the Library for the controlled policy catalogue, delegated-authority/SoD matrix, audit specification, exception policy, KPI definitions and exact approved HLD/LLD crosswalk. Record the exact file/version/locator if found.
3. Only unresolved business parameters absent from the authoritative source set should be presented for owner disposition. A missing value must remain unresolved rather than be filled by inference.
4. This reconciliation does **not** claim that the BRD v1.0 is a formally approved final baseline; does not create numeric thresholds, schemas, API/event IDs or N/A decisions; does not promote exact HLD/LLD bindings; and does not change the 228-requirement / 38-chapter baseline or authorize Business UAT.
