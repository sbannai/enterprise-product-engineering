# Chapter 463 HLD Delta — Candidate for Controlled Review

**Document ID:** EM-HLD-CH463-DELTA-CAND-001  
**Version:** 0.1  
**Status:** CANDIDATE / NOT APPROVED / NOT PART OF THE AUTHORITATIVE HLD BASELINE  
**Prepared:** 2026-10-19  
**Change-control link:** B01-CH463-CC-001; source precedence B01-CH463-SOURCE-CORRECTION-DECISION-001 (2026-10-12)  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Guardrails:** Option A retained; 228 requirements / 38 chapters unchanged; no policy thresholds invented; no UAT execution or AWS provisioning.

## 1. Purpose and control status

This is a candidate HLD delta prepared to make the missing requirement-level design content reviewable. It is not a substitute for the final consolidated HLD, architecture approval, procurement policy approval, or the controlled HLD→LLD traceability matrix.

The approved source-precedence decision establishes Chapter 463 as **Enterprise Procurement & Source-to-Pay**. It does not approve the behavior described below. The procurement BRD source remains In Development, and all detailed policy parameters must be sourced from an approved catalogue or recorded as unresolved.

## 2. Design principles applying to all six rows

1. All material commands must be tenant-scoped and authorized before state mutation.
2. Authoritative state is held separately from derived/search/reporting projections.
3. State transitions and business invariants are validated against a versioned, approved policy source; this candidate does not define the policy values.
4. Material committed changes carry correlation/causation context and produce audit evidence as defined by the approved event catalogue.
5. Events, if approved for a given transition, are emitted only after the authoritative transaction commits, using the approved delivery/outbox pattern.
6. Retries and replay must be idempotent or otherwise protected against duplicate business effects; exact retry policy remains a controlled dependency.
7. Errors are structured and stable; exact error codes and status mapping must align with approved API contracts.
8. Every contract, source schema, policy and report definition has an explicit owner, version, approval state and reproducible source locator.
9. No role, approval threshold, required-field rule, retention period, retry count, KPI formula, freshness SLA or reconciliation tolerance is created by this candidate.

## 3. Candidate requirement-specific design sections

### HLD-CH463-CAND-01 — Authoritative records and lifecycle history

**Trace:** REQ-46301 / SRS-FR-2323 / TRC-46301  
**Existing LLD target:** LLD-02 Domain & Component; LLD-03 Data Model (supporting only)

**Responsibility.** Provide the authoritative write boundary for procurement records and their lifecycle history. Candidate domain areas include requisitions, sourcing/award, contracts, purchase orders and related records, but the exact aggregate/entity join must be confirmed against the approved procurement object catalogue.

**Interaction.** A command enters through an authenticated API, resolves tenant and actor context, validates the requested operation and expected version, applies only a permitted state transition, commits the authoritative record and its history atomically, then emits approved material events after commit.

**Required design decisions before approval.**
- Authoritative object/aggregate and relationship map.
- Stable identifier and uniqueness scope.
- Required/conditional fields, lifecycle states and allowed transitions.
- Version/concurrency semantics, duplicate handling and history/retention.
- Exact API operations, DATA schema and lifecycle-event applicability/name.

**Failure behavior.** Invalid transition or stale version must not silently overwrite state. Transaction failure must not publish a success event. Exact error semantics and allowed transitions require approved sources.

### HLD-CH463-CAND-02 — Role-based authorization and segregation of duties

**Trace:** REQ-46302 / SRS-FR-2324 / TRC-46302  
**Existing LLD target:** LLD-05 Security & Authorization (supporting only)

**Responsibility.** Enforce authorization before material procurement actions using trusted actor identity, tenant context, resource scope, action and approved authority/delegation policy.

**Interaction.** The API boundary authenticates the caller; the authorization layer evaluates the action against the approved role/authority matrix and current delegation state; only an allow decision proceeds to validation and mutation. Denials must not mutate business state. Audit behavior follows the approved security/material-event policy.

**Required design decisions before approval.**
- Role × action × resource × tenant matrix.
- Delegation/substitution validity and expiry.
- Self-approval, evaluator conflict and other segregation-of-duties combinations.
- Amount/entity/category/cost-center routing dimensions and approved thresholds.
- Denial reason disclosure, audit fields and applicable API/event contracts.

**Failure behavior.** Missing or invalid authorization context fails closed. This candidate does not define which roles or limits are permitted.

### HLD-CH463-CAND-03 — Mandatory business-condition validation

**Trace:** REQ-46303 / SRS-FR-2325 / TRC-46303  
**Existing LLD target:** LLD-02 Domain & Component; LLD-06 Workflow & Rules (supporting only)

**Responsibility.** Evaluate approved procurement field rules, supplier eligibility, sourcing/award controls, budget and commitment policies before a material state change.

**Interaction.** A command is validated against the approved rule-set version applicable to the transaction. The result includes stable issue identifiers and field/context details permitted by the API contract. A command that fails a blocking rule cannot partially commit. The selected policy version and outcome must be traceable.

**Required design decisions before approval.**
- Mandatory/conditional field catalogue and formats.
- Rule ownership, version selection and precedence.
- Supplier qualification/restriction behavior and sourcing controls.
- Thresholds, budget tolerance and blocking/warning semantics.
- Stable error model and whether validation outcomes are emitted as events.

**Failure behavior.** Unknown policy version or incomplete required configuration fails according to an approved fail-safe policy; this candidate does not choose business thresholds or override rules.

### HLD-CH463-CAND-04 — Audit evidence for material events

**Trace:** REQ-46304 / SRS-FR-2326 / TRC-46304  
**Existing LLD target:** LLD-03 Audit Metadata; LLD-09 Observability (supporting only)

**Responsibility.** Capture protected, attributable, retrievable evidence for each event classified as material by the approved event catalogue.

**Interaction.** A committed material action supplies actor, tenant, action, resource/transaction reference, timestamp, correlation/causation, outcome and before/after/rationale fields where the approved contract requires them. Retrieval is authorized and tenant-scoped. Integrity verification must not be represented as tamper-proof storage unless storage controls, key management and trust boundaries establish that property.

**Required design decisions before approval.**
- Material-event catalogue and required fields per event.
- Integrity protection, trusted time, storage/write permissions and key management.
- Retention, legal hold/deletion, access and export policy.
- Retrieval filters/pagination and failure behavior.
- Exact DATA/API/EVENT schemas and approved N/A dispositions where applicable.

**Failure behavior.** Audit-write failure handling for a material business action must follow an approved criticality policy; this candidate does not assume either fail-open or fail-closed behavior.

### HLD-CH463-CAND-05 — Controlled exception handling and recovery

**Trace:** REQ-46305 / SRS-FR-2327 / TRC-46305  
**Existing LLD target:** LLD-06 Workflow & Rules; LLD-07 Integration (supporting only)

**Responsibility.** Represent and manage approved procurement exceptions, failed operations and recovery actions with explicit ownership and traceable state.

**Interaction.** An exception is classified using the approved taxonomy, associated with the affected transaction and correlation/idempotency identity, and moved only through approved transitions. Retry, replay, compensation, dead-letter handling and escalation use governed integration controls. Duplicate or out-of-order delivery must not create duplicate commercial effects.

**Required design decisions before approval.**
- Exception types, eligibility, evidence and approver.
- State machine and terminal states.
- Retryable versus non-retryable classification, retry/backoff/exhaustion.
- Replay authorization, DLQ ownership, compensation and escalation.
- Producer/consumer, event ordering/delivery guarantees and API error semantics.

**Failure behavior.** Retry/replay cannot bypass authorization or re-run a non-idempotent commercial action without duplicate-effect protection. Exact retry limits and compensation rules remain unresolved until approved.

### HLD-CH463-CAND-06 — Governed reporting for status, exceptions and performance

**Trace:** REQ-46306 / SRS-FR-2328 / TRC-46306  
**Existing LLD target:** LLD-09 Observability/Analytics and governed reporting read model (supporting only)

**Responsibility.** Provide authorized, tenant-scoped reports for procurement status, exceptions and performance using controlled metric definitions and attributable source data.

**Interaction.** A report query resolves an approved report definition and version, checks authorization and tenant scope, applies allowed filters and pagination, and returns the defined as-of/freshness and lineage metadata. Derived read models do not become the authoritative transaction record. Refresh/reconciliation behavior follows the approved report and data-lineage contract.

**Required design decisions before approval.**
- Report catalogue, owners and versioned metric formulas.
- Source-of-truth/lineage and inclusion/exclusion rules.
- Currency, time-window, as-of and reconciliation semantics.
- Freshness target, tolerances, tenant filters and access restrictions.
- Query API schema and whether refresh-status events are required.

**Failure behavior.** The system must not imply current/fresh data when its approved freshness policy says otherwise. No formula, freshness SLA or tolerance is defined by this candidate.

## 4. Candidate interaction outline

1. Request enters the API boundary with authentication and correlation context.
2. Tenant/resource scope and authorization are resolved.
3. Approved policy and data contracts are loaded by explicit version.
4. The operation validates required conditions and state-transition invariants.
5. The authoritative transaction commits, including required history.
6. Required audit evidence is written under the approved audit consistency policy.
7. Approved domain events are emitted only with the defined commit/outbox semantics.
8. Derived reporting projections update from approved lineage; authoritative state remains the source of truth.
9. Exceptions, retries and replay use approved idempotency and recovery controls.
10. All steps produce the logs/metrics/traces required by the approved observability standard.

This outline is a candidate interaction model; the exact ordering of audit persistence relative to commit and the transaction/outbox boundary must be resolved in the approved detailed design.

## 5. Required review checklist

For each of six rows, reviewers must record one explicit decision for each item:

- [ ] Requirement-to-procurement-domain mapping confirmed or returned for clarification.
- [ ] HLD section text accepted and given a controlled document version/locator.
- [ ] Exact LLD section/component and explicit HLD→LLD pair confirmed.
- [ ] DATA schema approved or authorized N/A recorded with rationale.
- [ ] API operation approved or authorized N/A recorded with rationale.
- [ ] EVENT name/schema approved or authorized N/A recorded with rationale.
- [ ] Existing BRD/SRS acceptance source and locator identified; unresolved criteria marked `CLARIFICATION_REQUIRED`.
- [ ] Approval role, reviewer, decision date, change ID and evidence archive locator recorded.

## 6. Gate disposition

This candidate does not change any status:

- Exact approved HLD→LLD pairs: 0/6.
- Verified DATA/API/EVENT bindings: 0/18.
- Approved executable acceptance oracles: 0/6.
- Business UAT: HOLD / NOT AUTHORIZED / NOT EXECUTED.
- G9: NOT FROZEN. G10: NOT ISSUED.

**Review requested:** approve, amend or reject the proposed design text through the established design-authority/change-control process. Only after approval and controlled publication may exact locators be recorded and the traceability gate re-evaluated.
