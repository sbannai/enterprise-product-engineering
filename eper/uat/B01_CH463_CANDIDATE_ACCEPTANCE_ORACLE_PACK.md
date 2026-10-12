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
