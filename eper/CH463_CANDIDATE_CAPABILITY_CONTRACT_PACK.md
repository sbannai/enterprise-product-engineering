# Chapter 463 — Candidate Capability Contract Pack

**Document ID:** EPER-B01-CH463-CANDIDATE-CONTRACTS-001  
**As of:** 2026-10-19  
**Status:** DRAFT / IMPLEMENTATION-ALIGNED CANDIDATE — NOT APPROVED, NOT EXECUTABLE  
**Baseline:** Option A; 228 requirements / 38 chapters unchanged  
**Scope:** REQ-46301–REQ-46306; SRS-FR-2323–SRS-FR-2328; TRC-46301–TRC-46306  
**Purpose:** Convert observed service behavior into a reviewable contract backlog without promoting implementation details into approved business policy.

## 1. Contract rules

1. The identifiers in `eper/contracts/index.ts` are registry descriptors, not complete DATA, API, or EVENT contracts.
2. The shapes and operations below are observations from the reviewed implementation inventory. They are not proof of approved domain behavior.
3. No HTTP path, database technology, business threshold, role mapping, lifecycle policy, event name, retention period, retry limit, or reporting formula is approved by this document.
4. Until approved versioned contracts exist, do not count the corresponding DATA/API/EVENT slot as verified, and do not mark a business acceptance oracle approved.
5. Preserve all existing requirement, SRS, TRC, capability, and contract IDs. Record approved N/A decisions explicitly; missing evidence is not N/A.

## 2. Existing registry identifiers and status

| Requirement | Capability | DATA descriptor | API descriptor | EVENT descriptor | Contract status |
|---|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 | authoritative-records | DATA:authoritative-domain v1 | API:capability-resource v1 | EVENT:material-lifecycle v1 | IDs match registry; schemas/operation/event definitions absent |
| REQ-46302 / SRS-FR-2324 | authorization | DATA:identity-policy v1 | API:secured-capability v1 | EVENT:authorization-audit v1 | IDs match registry; schemas/operation/event definitions absent |
| REQ-46303 / SRS-FR-2325 | business-validation | DATA:domain-rules v1 | API:validated-command v1 | EVENT:validation-outcome v1 | IDs match registry; schemas/operation/event definitions absent |
| REQ-46304 / SRS-FR-2326 | audit-evidence | DATA:audit-record v1 | API:audit-retrieval v1 | EVENT:audit-material-event v1 | IDs match registry; schemas/operation/event definitions absent |
| REQ-46305 / SRS-FR-2327 | exception-handling | DATA:workflow-exception v1 | API:recovery-command v1 | EVENT:exception-lifecycle v1 | IDs match registry; schemas/operation/event definitions absent |
| REQ-46306 / SRS-FR-2328 | governed-reporting | DATA:derived-reporting v1 | API:report-query v1 | EVENT:report-refresh v1 | IDs match registry; schemas/operation/event definitions absent |

## 3. Candidate DATA contracts (observed code shapes)

These are implementation-derived field inventories, not final JSON Schemas or persistence models. Field constraints, nullability, enums, ownership, retention, indexes, and migration rules require controlled design approval.

### REQ-46301 — Authoritative record
Observed shape: `AuthoritativeRecord { id, tenantId, version, state, data }`; request context: `{ tenantId, principalId, correlationId }`.
- Observed operations: create, get, update with expectedVersion, delete with expectedVersion.
- Open design items: authoritative procurement entities and joins; field-level schema; permitted lifecycle states/transitions; version-conflict response; uniqueness scope; durable persistence and migration.

### REQ-46302 — Authorization
Observed request: `AuthorizationRequest { tenantId, principalId, action, resource }`; policy supports optional principal, actions, resources, and effect.
- Observed behavior: explicit deny takes precedence; otherwise a matching allow is required; default is deny.
- Open design items: approved role/action/resource/tenant matrix; delegation and segregation-of-duties rules; policy administration; policy versioning; denial response; audit/event applicability.

### REQ-46303 — Business validation
Observed rule: `ValidationRule { id, evaluate }`; issue: `{ code, message, severity }`; result: `{ valid, issues }`.
- Observed behavior: registered rules execute; result is invalid when any issue has ERROR severity.
- Open design items: authoritative rule catalogue and versions; rule precedence; field-level error structure; business-specific boundaries and thresholds; stable error codes; event applicability.

### REQ-46304 — Audit evidence
Observed shape: `AuditEvidence { id, tenantId, requirementId, action, principalId, correlationId, occurredAt, payload, integrityHash }`.
- Observed operations: append, get, listByRequirement, SHA-256 integrity verification.
- Open design items: approved material-event taxonomy; payload and attribution schema; retention and access policy; trusted time; tamper-resistant storage; key management; export and legal/audit retrieval behavior.

### REQ-46305 — Workflow exception
Observed shape: `WorkflowException { id, tenantId, requirementId, code, message, state, retryCount, idempotencyKey, owner?, createdAt, updatedAt }`.
- Observed states: OPEN, RETRYING, RESOLVED, ESCALATED; transition validation and lifecycle audit evidence are present.
- Open design items: approved exception taxonomy; retry eligibility/limits/backoff; idempotency scope; scheduler and delivery integration; dead-letter/replay behavior; compensation; escalation ownership and terminal-state policy.

### REQ-46306 — Governed reporting
Observed shape: `ReportRow { tenantId, reportId, values, sourceRequirementIds, generatedAt }`; query includes tenant, report, filters, and limit.
- Observed behavior: publish and tenant/report-scoped query; exact-value filters; default limit of 100.
- Open design items: approved report catalogue and metric definitions; aggregation and formula rules; source lineage; freshness targets; reconciliation tolerances; access scope; refresh behavior.

## 4. Candidate API operation inventory

The following are logical operations inferred from service behavior, not approved HTTP routes or a published OpenAPI specification.

| Requirement | Candidate operation set | Minimum contract details still required |
|---|---|---|
| REQ-46301 | create, get, update(expectedVersion), delete(expectedVersion) | Request/response schemas; tenant context; validation; conflict/not-found errors; idempotency; authorization; persistence semantics |
| REQ-46302 | authorize | Policy input/output schema; deny reason disclosure; policy version; tenant boundary; failure semantics; audit behavior |
| REQ-46303 | validate | Rule-set/version input; typed issues; stable codes; severity enum; evaluation failure semantics |
| REQ-46304 | append audit evidence, retrieve evidence, list by requirement, verify integrity | Write-once guarantees; pagination; access controls; retention; integrity verification response; export semantics |
| REQ-46305 | create exception, transition/retry/recover, retrieve exception | Allowed transitions; idempotency; concurrency; retry policy; escalation; terminal errors |
| REQ-46306 | publish report row, query report | Approved report IDs; filter schema; sorting/pagination; metric semantics; freshness metadata; lineage and authorization |

For each operation, the future approved contract must define versioning, authentication/authorization, tenant isolation, request validation, response envelope, error codes, idempotency/concurrency behavior, observability/correlation fields, and compatibility policy. Exact route names and transport are intentionally unresolved.

## 5. EVENT contracts — unresolved by design

The registry has one event descriptor per capability, but the reviewed service inventory does not demonstrate a general event publisher or versioned payload schemas for these six descriptors. Do not infer event names from descriptor names.

For each descriptor, the design authority must either approve an event contract containing:
- stable event ID and name, schema version, producer and consumer purpose;
- business trigger and transaction/outbox semantics;
- payload schema, tenant and correlation attribution;
- delivery guarantees, ordering scope, retries, replay and duplicate handling;
- compatibility/deprecation policy, security classification and retention;

or approve **N/A** with rationale and traceable approval reference.

For REQ-46301 specifically, reconcile candidate names `RequisitionSubmitted` and `PurchaseRequisitionSubmitted`, and `RequisitionDecisionRecorded` and `PurchaseRequisitionApproved`, against the controlled event catalogue. Do not select either by similarity. For REQ-46305, exception lifecycle audit evidence observed in-process does not establish a published domain event.

## 6. Cross-cutting envelope and runtime controls

Observed context requires `tenantId`, `principalId`, and `correlationId` when supplied; tenant-scoped operations require tenant context. The generic capability result status `EXECUTED` is not a complete typed business outcome.

Candidate contract work must specify:
- typed success and failure result envelopes, with stable error codes;
- tenant boundary enforcement and explicit authorization behavior;
- correlation and audit attribution;
- optimistic concurrency and idempotency where applicable;
- input limits, pagination, timeouts and retry-safe semantics;
- persistence durability, backup/restore, migrations and recovery;
- schema and API compatibility tests.

These items must be reconciled with approved shared platform contracts before finalization; this document does not establish a new parallel contract authority.

## 7. Approval and evidence ledger

| Gate | Current evidence | Closure condition |
|---|---|---|
| Exact approved HLD→LLD pairs | 0/6 verified in the current reconciliation | Controlled versions, exact requirement-level locators, explicit pair and approval/change reference |
| DATA/API/EVENT slots | 0/18 verified as full contracts | Versioned schema/operation/event definition and exact locator with approval, or separately approved N/A |
| Acceptance oracles | 0/6 approved | Existing BRD/SRS criteria tied to exact controlled source/version/locator and approval |
| Service behavior | Implementation-derived only | Automated tests against the approved contracts; persistence and failure-mode tests where applicable |
| Hosted technical preflight | Not executed | Approved target, pinned build, authorized tester/access, configuration and recorded results |
| Business UAT / D10 | HOLD / NOT AUTHORIZED / NOT EXECUTED | Prerequisite evidence complete and separate D10 authorization |
| G9 / G10 | Not frozen / not issued | Controlled closure package and distinct required sign-offs |

## 8. Required next sequence

1. Review this candidate inventory against the controlled HLD, LLD, BRD/SRS, and shared EM-DATA/EM-API/EM-EVT catalogues.
2. Promote only exact, approved source locators; keep candidates explicitly marked as candidates.
3. Define versioned schemas and operation specifications from the approved design, not by guessing business policy.
4. Decide event applicability per capability and capture an approved event contract or N/A.
5. Implement contract validation and tests; run the existing CI suite and retain its run URL, commit SHA, and actual result.
6. Reconcile evidence into the existing SRC-003/G9 registers; do not create parallel status systems.
7. Keep all six business cases NOT_RUN until D7–D9 evidence, approved acceptance oracles, and technical preflight are complete and D10 is separately authorized.

**Disposition:** This candidate pack makes the code-to-contract gap actionable. It is documentation-only: it does not close SRC-003/G3, promote any contract to approved, authorize merge/deployment/AWS provisioning, freeze G9, issue G10, or authorize Business UAT.
