# Chapter 463 DATA / API / EVENT Contract Pack — Candidate v0.1

**Document ID:** EPER-CH463-CONTRACT-PACK-CAND-001  
**Prepared:** 2026-10-19  
**Status:** CANDIDATE ONLY — NOT APPROVED; DO NOT PROMOTE TO CONTRACT REGISTRY  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Companions:** EM-HLD-CH463-DELTA-CAND-001 v0.1; EM-LLD-CH463-DELTA-CAND-001 v0.1  
**Baseline guard:** Preserve Option A, all IDs, 228 requirements / 38 chapters and six capability families plus one routing layer.

## 1. Purpose and guardrails

This pack expands the 18 DATA/API/EVENT slots into reviewable contract outlines. It is not a production schema, OpenAPI definition, event schema, policy approval or UAT authorization. All names, fields and operations below are candidates for review.

The existing eper/contracts/index.ts descriptors (for example DATA:authoritative-domain, API:capability-resource and EVENT:material-lifecycle) are registry descriptors, not complete versioned contracts. Do not promote them as proof of schemas or operations.

Do not invent procurement-required fields, roles, approval thresholds, retention periods, retry counts, report formulas or freshness SLAs. If an approved source does not settle a business rule, record CLARIFICATION_REQUIRED. If a contract does not apply, obtain an explicit authorized APPROVED_NA decision with rationale.

## 2. Common conventions proposed for review

- Each contract needs a stable ID/version, owner, status, controlled source locator, compatibility policy, approver and change reference.
- Candidate version 0.1 is review-only.
- Tenant-owned records, mutations, audit retrieval and report queries must be scoped using trusted identity context; a client-supplied tenant ID alone is not authority.
- Commands/events carry correlation and causation identifiers where applicable, subject to approved mandatory-field rules.
- Material commands define duplicate/idempotency semantics before execution is authorized.
- API error codes/statuses must be reconciled with the controlled EM-API-001 source, not guessed.
- Events must not announce success before authoritative commit. Whether an outbox is mandatory requires design approval.
- Do not place secrets or unrestricted sensitive payloads in logs/events.
- Blank or absent is not an approved N/A.

## 3. Requirement-to-contract slot matrix

| Requirement | DATA slot (candidate) | API slot (candidate) | EVENT slot (candidate) | Status |
|---|---|---|---|---|
| REQ-46301 | DATA-CH463-01 authoritative procurement record/lifecycle | API-CH463-01 procurement record command/query | EVT-CH463-01 material lifecycle transition | All candidate only |
| REQ-46302 | DATA-CH463-02 authorization decision context/reference | API-CH463-02 protected material action | EVT-CH463-02 authorization outcome/audit, applicability TBD | All candidate only |
| REQ-46303 | DATA-CH463-03 rule-set reference/validation outcome | API-CH463-03 validate/execute procurement command | EVT-CH463-03 validation decision, applicability TBD | All candidate only |
| REQ-46304 | DATA-CH463-04 audit evidence envelope | API-CH463-04 authorized audit retrieval | EVT-CH463-04 material audit evidence event | All candidate only |
| REQ-46305 | DATA-CH463-05 exception/recovery record | API-CH463-05 recover/replay exception command | EVT-CH463-05 exception lifecycle transition | All candidate only |
| REQ-46306 | DATA-CH463-06 governed reporting definition/projection metadata | API-CH463-06 governed report query | EVT-CH463-06 reporting refresh outcome, applicability TBD | All candidate only |

## 4. DATA contract outlines

### DATA-CH463-01 — Authoritative procurement record and lifecycle
**Purpose:** Represent the authoritative procurement aggregate without prematurely choosing entity boundaries.

Candidate fields to evaluate against the approved procurement model: recordId; tenantId; recordType; lifecycleState; version/concurrency token; createdAt/createdBy; updatedAt/updatedBy; optional historyReference; and domain-specific fields/relationships from approved entities only.

Approve primary/foreign keys, tenant scope, requiredness, uniqueness, lifecycle transitions, concurrency, retention/history, archival and sensitive-field classification.

**Source candidates:** EPER_Master_Repository_v57.5.xlsx tabs 11_Data_Entities, 89_PROC_Object_Catalog and 97_PROC_Lifecycle_States; EM-DATA-001. Candidate sources are not approval.

### DATA-CH463-02 — Authorization decision context
Candidate fields: decisionId; tenantId; actorReference; action; resourceType/resourceReference; decisionOutcome; policyReference/policyVersion; conditional delegationReference; correlationId; evaluatedAt. Exact shape and persistence are open.

Approve trusted identity source, role/action/resource matrix, tenant boundaries, delegation expiry, SoD rules, decision retention and denial-detail disclosure.

**Source candidates:** EM-DATA-001 IAM/SEC sections and EM-API-001 authorization interfaces; exact Chapter 463 join and applicability remain unverified.

### DATA-CH463-03 — Rule-set reference and validation result
Candidate fields: ruleSetId/version; validationId; subjectReference; tenantId; outcome; issueCode; fieldReference; severity; correlationId; evaluatedAt. Whether results are persisted remains open.

Approve rule ownership/version selection, issue vocabulary, blocking/warning semantics, redaction, retention and policy-reference behavior. Thresholds and field rules must come from approved sources.

### DATA-CH463-04 — Audit evidence envelope
Candidate fields: auditId; eventId/type/version; tenantId; actorReference; action; resourceType/resourceReference; occurredAt; outcome; correlationId; causationId; sourceTransactionReference; integrityMetadata; redactionClassification. Before/after values and rationale are conditional on approved policy.

Approve append-only/integrity mechanism, trusted time, key management, retention/legal hold, access/export, redaction and audit-write failure behavior.

**Source candidates:** EM-DATA-001 audit entity and EM-EVT-001 security/material event catalogue; no exact approved Chapter 463 binding is established.

### DATA-CH463-05 — Exception and recovery record
Candidate fields: exceptionId; tenantId; sourceTransactionReference; exceptionType/state; retryability; attemptCount; conditional nextAttemptAt; idempotencyReference; correlationId; ownerReference; resolutionReference; createdAt/updatedAt.

Approve taxonomy, state transitions, retry/backoff/exhaustion, replay authorization, DLQ ownership, compensation, retention and duplicate-delivery behavior.

### DATA-CH463-06 — Governed report definition and projection metadata
Candidate fields: reportId/version; ownerReference; sourceLineageReference; tenantScope; metricDefinitionReference; asOfTime; refreshedAt; freshnessStatus; schemaVersion. Formulas, dimensions, tolerances and freshness targets must come from approved definitions.

Approve report catalogue, formulas, lineage, currency/time-window semantics, row-level access, freshness, reconciliation rules and projection retention.

**Source candidate:** API-PROC-024 is marked Draft in the procurement API catalogue; no approved governed reporting model/lineage locator is currently evidenced.

## 5. API contract outlines

All routes and operation names below are illustrative labels, not approved public paths. Final verbs, paths, schemas, status codes and auth scopes must be reconciled with the controlled API catalogue/OpenAPI source.

### API-CH463-01 — Procurement record command/query
Candidate operations: create/update an approved procurement object; retrieve a tenant-scoped object; request a permitted lifecycle transition. Candidate request includes approved fields and expected-version/idempotency references where required. Candidate response includes resource reference, committed version/state and correlation reference.
**Review:** object operations, request/response/error schema, concurrency/idempotency and event trigger.

### API-CH463-02 — Protected material action
Candidate operation: execute a material action only after policy evaluation, or expose a separate decision endpoint only if approved architecture requires it. Caller-facing denial detail follows approved disclosure policy.
**Review:** trusted actor claims, deny-before-mutation, missing-policy behavior, delegation, SoD and audit applicability.

### API-CH463-03 — Validation and command execution
Candidate operations: validate a command and/or execute it using the approved rule-set. Response is an accepted outcome or structured validation issues with stable codes.
**Review:** blocking/warning semantics, rule version, transaction boundary, error envelope and whether validation is separate or embedded.

### API-CH463-04 — Audit retrieval
Candidate operation: query audit evidence by authorized resource/time/event filters with bounded pagination.
**Review:** query schema, tenant scoping, redaction, export permissions, pagination limits and error semantics.

### API-CH463-05 — Exception recovery
Candidate operations: inspect an exception; request retry/replay/resolution when authorized; record resolution outcome.
**Review:** permitted actors, terminal states, retryability, duplicate protection, compensation and escalation. No direct state override outside approved transitions.

### API-CH463-06 — Governed reporting query
Candidate operation: query an approved report by report ID/version and allowed filters. Candidate response includes results, report version and approved as-of/refresh/lineage metadata.
**Review:** catalogue, formulas, tenant/row-level access, freshness, reconciliation, pagination and performance limits.

## 6. EVENT contract outlines

Canonical event names are intentionally not selected. The controlled event catalogue must determine names, IDs, versions and producer/consumer behavior.

### EVT-CH463-01 — Material lifecycle transition
Candidate trigger: an approved procurement lifecycle transition commits successfully. Candidate envelope: event ID/type/version, tenant, resource reference/type, transition outcome, approved actor reference, occurred time, correlation/causation IDs, source transaction reference and schema version.
**Name conflict to reconcile:** RequisitionSubmitted vs PurchaseRequisitionSubmitted; RequisitionDecisionRecorded vs PurchaseRequisitionApproved.
**Review:** canonical catalogue entry, producer, trigger, payload schema, commit/outbox semantics, ordering and compatibility.

### EVT-CH463-02 — Authorization outcome/audit
Candidate trigger: a material authorization decision only if the approved security catalogue requires publication rather than audit-only persistence. Review event-vs-audit applicability, privacy, volume, retention and producer. Explicit approved N/A is valid if no event is required.

### EVT-CH463-03 — Validation decision
Candidate trigger: validation result only if the approved event catalogue requires it for downstream consumers. Review whether validation is persisted/published, payload sensitivity, idempotency, producer and consumer. Explicit approved N/A is possible.

### EVT-CH463-04 — Material audit evidence event
Candidate trigger: approved material action or audit-record commit, depending on approved architecture. Review payload minimization, access, retention and delivery semantics; avoid duplicating sensitive audit payloads onto a broad event bus.

### EVT-CH463-05 — Exception lifecycle transition
Candidate trigger: approved exception state transition or recovery outcome. Review ordering, retry deduplication, replay semantics, terminal-state rules, DLQ/compensation integration and canonical names.

### EVT-CH463-06 — Reporting refresh outcome
Candidate trigger: successful/failed refresh or reconciliation only if approved report operations require event-driven consumers. Review event necessity versus queryable refresh status, metric disclosure, tenant scope, freshness policy and canonical event.

**Do not publish a new event merely because a candidate slot exists.** Obtain explicit approved N/A where appropriate.

## 7. Slot-by-slot approval register

| Slot | Required evidence before promotion | Disposition |
|---|---|---|
| REQ-46301 DATA | Approved entity/schema, exact locator/version, field constraints, tenant/lifecycle policy, approver/change ID | CANDIDATE_NOT_APPROVED |
| REQ-46301 API | Approved OpenAPI operation, request/response/error schemas, auth/concurrency/idempotency, exact locator | CANDIDATE_NOT_APPROVED |
| REQ-46301 EVENT | Canonical catalogue entry or approved N/A, payload, producer/trigger/delivery policy | CANDIDATE_NOT_APPROVED |
| REQ-46302 DATA | Approved policy/context model and role/action/resource/tenant matrix or approved N/A | CANDIDATE_NOT_APPROVED |
| REQ-46302 API | Approved protected operation, denial behavior and exact locator | CANDIDATE_NOT_APPROVED |
| REQ-46302 EVENT | Approved event/name/payload or explicit approved N/A | CANDIDATE_NOT_APPROVED |
| REQ-46303 DATA | Approved rule-set/version and validation-result schema or approved N/A | CANDIDATE_NOT_APPROVED |
| REQ-46303 API | Approved operation/error schema with rule version and transaction semantics | CANDIDATE_NOT_APPROVED |
| REQ-46303 EVENT | Approved validation-event contract or explicit approved N/A | CANDIDATE_NOT_APPROVED |
| REQ-46304 DATA | Approved audit schema, integrity/retention/access policy and exact locator | CANDIDATE_NOT_APPROVED |
| REQ-46304 API | Approved audit retrieval operation, authorization, redaction and pagination schema | CANDIDATE_NOT_APPROVED |
| REQ-46304 EVENT | Approved material/audit event entry or approved N/A | CANDIDATE_NOT_APPROVED |
| REQ-46305 DATA | Approved exception entity/state schema, retry/retention and owner policy | CANDIDATE_NOT_APPROVED |
| REQ-46305 API | Approved recovery operations, replay authorization, idempotency and error semantics | CANDIDATE_NOT_APPROVED |
| REQ-46305 EVENT | Approved exception lifecycle event/payload and delivery policy or approved N/A | CANDIDATE_NOT_APPROVED |
| REQ-46306 DATA | Approved report catalogue, metric definition, lineage and freshness schema | CANDIDATE_NOT_APPROVED |
| REQ-46306 API | Approved report query, filters, access, pagination and result schema | CANDIDATE_NOT_APPROVED |
| REQ-46306 EVENT | Approved refresh/reconciliation event or explicit approved N/A | CANDIDATE_NOT_APPROVED |

## 8. Promotion rules and gate state

A slot can be promoted only when it exists in a controlled approved source with exact document/version/section or schema/operation locator, an explicit requirement join, and approval/change metadata. A proposed schema in this file is not a substitute.

- Verified DATA/API/EVENT bindings: **0/18**.
- Exact approved HLD→LLD pairs: **0/6**.
- Approved executable acceptance oracles: **0/6**.
- Business UAT: **HOLD / NOT AUTHORIZED / NOT EXECUTED**.
- G9: **NOT FROZEN**. G10: **NOT ISSUED**.

For every slot record decision (APPROVE / AMEND / REJECT / APPROVED_NA / CLARIFICATION_REQUIRED), contract ID/version, exact source locator, approver role, decision date, change ID, rationale, archive locator and compatibility impact. Event naming decisions must cite the controlled event-catalogue source; do not infer a winner from naming style.

This pack is a review artifact, not a release contract.
