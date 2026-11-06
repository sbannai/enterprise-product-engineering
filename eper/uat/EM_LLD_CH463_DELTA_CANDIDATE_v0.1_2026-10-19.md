# Chapter 463 LLD Delta — Candidate for Controlled Review

**Document ID:** EM-LLD-CH463-DELTA-CAND-001  
**Version:** 0.1  
**Status:** CANDIDATE / NOT APPROVED / NOT PART OF THE AUTHORITATIVE LLD BASELINE  
**Prepared:** 2026-10-19  
**Companion candidate:** EM-HLD-CH463-DELTA-CAND-001 v0.1  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Baseline guard:** Preserve Option A, all requirement IDs, 228 requirements / 38 chapters, six capability families plus one routing layer.

## 1. Purpose and boundary

This LLD delta makes implementation responsibilities reviewable against the six candidate HLD sections. It does not make either candidate authoritative, does not create a production contract, and does not authorize Business UAT. It is a proposed detailed design for review under the existing design/change-control process.

Source patterns from the existing consolidated LLD remain supporting references:
- LLD-02 Domain & Component
- LLD-03 Data Model / Audit Metadata
- LLD-05 Security & Authorization
- LLD-06 Workflow & Rules
- LLD-07 Integration
- LLD-09 Observability / Analytics

The existing consolidated LLD explicitly marks Chapter 463 design rows “SUPPORTING DESIGN — EXACT BINDING PENDING.” This candidate must not be used to rewrite that disposition until it is approved and published.

## 2. Cross-cutting detailed-design conventions

### 2.1 Command processing
A material command should pass through: transport/schema validation → authenticated identity and tenant resolution → authorization → approved rule/version resolution → domain invariant checks → transaction boundary → required audit/outbox persistence → response mapping. The final ordering and atomicity requirements require architecture approval; this sequence is a proposal.

### 2.2 Tenant isolation
Tenant context must originate from a trusted authentication/session boundary, not from an untrusted payload field alone. Every resource lookup, mutation, audit retrieval and report query must be tenant-scoped. Cross-tenant attempts must be denied without leaking whether another tenant's record exists, subject to approved error-disclosure policy.

### 2.3 Persistence and concurrency
Use durable persistence with transaction boundaries appropriate to the approved data model. Material updates should carry an expected version or equivalent concurrency token where the approved API contract supports it. Duplicate submissions and retries must not create duplicate commercial effects. Exact keys, constraints, isolation level and conflict responses remain decisions for the approved data/API contract.

### 2.4 Contracts
The current registry descriptors in `eper/contracts/index.ts` are not full contracts. Each actual DATA contract needs field definitions, types, constraints, requiredness, tenancy, lifecycle/versioning and compatibility rules. Each API contract needs method/path, authentication, authorization, request/response schemas, status/error model, idempotency and pagination where relevant. Each event contract needs stable name/ID, version, producer, trigger, payload schema, tenant/correlation/causation fields, delivery semantics and compatibility rules. Until approved, all entries remain candidate-only.

### 2.5 Observability and errors
Use structured logs, metrics and traces with correlation identifiers and tenant-safe redaction. Do not place secrets, credentials or unrestricted sensitive payloads in logs. Error envelopes must be consistent with the approved API specification. Metric names, SLOs and retention periods must be taken from approved standards, not invented here.

## 3. Candidate row-level detailed designs

### LLD-CH463-CAND-01 — Authoritative procurement records and lifecycle

**Trace:** REQ-46301 / SRS-FR-2323 / TRC-46301  
**Candidate HLD pair:** EM-HLD-CH463-DELTA-CAND-001 §3, HLD-CH463-CAND-01  
**Existing supporting pattern:** LLD-02; LLD-03

**Components**
- Procurement command handler: validates request shape and expected version; invokes policy/domain services.
- Procurement aggregate/repository boundary: owns approved authoritative state and lifecycle history.
- Lifecycle transition evaluator: evaluates the approved state/transition catalogue; must not embed unapproved state names.
- Transaction/outbox adapter: persists the business change and event intent atomically if the approved architecture selects the outbox pattern.
- Read/query adapter: reads authoritative state or explicitly identified projections.

**Candidate processing**
1. Validate schema and request identity.
2. Resolve trusted tenant and actor context.
3. Authorize the specific action on the scoped resource.
4. Load the authoritative record and expected version.
5. Evaluate approved field/rule/state-transition constraints.
6. Persist the state change and required history atomically.
7. Persist approved event intent if required.
8. Return the committed version and stable outcome.

**Required tests after contract approval:** allowed/denied transition from approved transition table; stale-version conflict; duplicate/idempotency behavior; transaction rollback; tenant isolation; no event on failed commit; event emitted according to approved post-commit semantics.

**Open controlled decisions:** entity/aggregate boundaries, exact fields and relationships, state catalogue, uniqueness scope, event name and schema, history/retention, transaction/outbox implementation.

### LLD-CH463-CAND-02 — Authorization and SoD

**Trace:** REQ-46302 / SRS-FR-2324 / TRC-46302  
**Candidate HLD pair:** EM-HLD-CH463-DELTA-CAND-001 §3, HLD-CH463-CAND-02  
**Existing supporting pattern:** LLD-05

**Components**
- Identity-context adapter: verifies issuer/session and extracts trusted actor and tenant.
- Policy decision interface: evaluates actor, action, resource, tenant and relevant context against the approved policy source.
- Delegation resolver: validates delegation and expiry only if approved by the authority model.
- Enforcement point: prevents mutation unless a valid allow decision is returned.
- Security audit adapter: records policy outcome where required by the approved event catalogue.

**Candidate processing**
1. Authenticate and establish trusted tenant/actor context.
2. Resolve resource and requested action.
3. Evaluate policy using approved role, delegation and SoD definitions.
4. On deny or missing/indeterminate policy, fail closed and do not call the mutation path.
5. Record approved audit evidence without disclosing sensitive policy internals to the caller.

**Required tests after policy approval:** allow case; explicit deny; missing context; cross-tenant access; expired delegation; self-approval/SoD conflicts from the approved matrix; zero mutation on deny; audit coverage.

**Open controlled decisions:** role/action/resource matrix, delegation rules, thresholds/routing context, policy failure behavior, denial disclosure and applicable audit/event contracts.

### LLD-CH463-CAND-03 — Business validation

**Trace:** REQ-46303 / SRS-FR-2325 / TRC-46303  
**Candidate HLD pair:** EM-HLD-CH463-DELTA-CAND-001 §3, HLD-CH463-CAND-03  
**Existing supporting pattern:** LLD-02; LLD-06

**Components**
- Versioned rule-provider interface: returns the approved rule-set version for the operation/context.
- Validation service: evaluates field-level and cross-field constraints and returns structured issues.
- Domain invariant guard: prevents invalid state transition even if a caller bypasses front-end validation.
- Error mapper: maps domain issues to approved stable API error codes.
- Decision telemetry: records rule-set/version and outcome without logging restricted payloads.

**Candidate processing**
1. Resolve approved rule-set ID/version.
2. Validate required fields and cross-field constraints from the approved catalogue.
3. Return structured issues for rejected commands.
4. Block mutation when a blocking condition fails.
5. Commit only after all required validations pass; record the applied policy version.

**Required tests after rules approval:** positive cases; missing/invalid fields; boundary cases from approved thresholds; obsolete/missing rule version; no partial mutation on validation failure; stable error mapping.

**Open controlled decisions:** mandatory/conditional field catalogue, rule precedence/version selection, blocking versus warning behavior, supplier eligibility and threshold rules, error codes and event applicability.

### LLD-CH463-CAND-04 — Audit evidence

**Trace:** REQ-46304 / SRS-FR-2326 / TRC-46304  
**Candidate HLD pair:** EM-HLD-CH463-DELTA-CAND-001 §3, HLD-CH463-CAND-04  
**Existing supporting pattern:** LLD-03; LLD-09

**Components**
- Material-event classifier: maps a committed action to the approved material-event catalogue.
- Audit writer: writes immutable/append-only evidence according to the selected approved storage control.
- Integrity verifier: validates hashes/signatures only where the approved integrity mechanism defines how keys and trust are managed.
- Audit query service: enforces tenant/resource authorization and bounded query/pagination.
- Redaction policy: controls which payload attributes may be stored or returned.

**Candidate audit envelope (field list is proposed, not an approved schema):** event ID, event type/version, tenant ID, actor ID/type, action, resource type/ID, event timestamp, outcome, correlation ID, causation ID, source transaction/reference, schema version, integrity metadata, and approved before/after/rationale fields where required.

**Required tests after contract approval:** every required material event produces an audit record; attribution/correlation completeness; tenant-scoped retrieval; denied retrieval; integrity verification/tamper detection under the approved mechanism; retention/export behavior.

**Open controlled decisions:** event coverage, exact payload fields, storage/integrity implementation, key management, retention/legal hold, access/export policy, audit-write failure behavior.

### LLD-CH463-CAND-05 — Exception lifecycle and recovery

**Trace:** REQ-46305 / SRS-FR-2327 / TRC-46305  
**Candidate HLD pair:** EM-HLD-CH463-DELTA-CAND-001 §3, HLD-CH463-CAND-05  
**Existing supporting pattern:** LLD-06; LLD-07

**Components**
- Exception classifier: maps errors/outcomes to approved exception types and retryability.
- Exception state store: persists exception status, attempt metadata, transaction reference and resolution evidence.
- Retry scheduler/worker: applies only the approved retry and backoff policy.
- Idempotency/replay guard: prevents duplicate effects when delivery is repeated.
- Recovery/DLQ adapter: handles exhausted or unrecoverable work under the approved ownership/escalation policy.
- Compensation coordinator: executes only approved compensating actions.

**Candidate processing**
1. Classify the failure using the approved taxonomy.
2. Persist an exception record and correlation to the affected transaction.
3. Apply approved retryability and attempt policy.
4. Before replay, verify authorization, idempotency key and current business state.
5. Escalate exhausted/unrecoverable cases to the approved destination.
6. Record resolution and audit evidence.

**Required tests after policy approval:** transient retry; non-retryable failure; exhaustion; duplicate delivery; unauthorized replay; invalid terminal transition; compensation failure; DLQ/escalation evidence.

**Open controlled decisions:** exception taxonomy/state machine, retry/backoff/exhaustion, replay roles, DLQ owner, compensation semantics, event delivery/order guarantees and API error mapping.

### LLD-CH463-CAND-06 — Governed reporting

**Trace:** REQ-46306 / SRS-FR-2328 / TRC-46306  
**Candidate HLD pair:** EM-HLD-CH463-DELTA-CAND-001 §3, HLD-CH463-CAND-06  
**Existing supporting pattern:** LLD-09

**Components**
- Report catalogue: exposes approved report ID/version, owner and access classification.
- Metric-definition layer: resolves versioned formulas and dimensional rules from approved definitions.
- Projection/aggregation pipeline: builds derived data from approved source lineage and tracks refresh status.
- Query API: applies tenant, actor, authorization, filter and pagination rules.
- Freshness/lineage envelope: reports as-of/refresh metadata only as defined by approved policy.

**Candidate processing**
1. Resolve requested report ID and approved version.
2. Authorize report access and requested dimensions for the tenant.
3. Execute query against an explicitly identified read model.
4. Return values with approved as-of/lineage/freshness metadata.
5. Record query telemetry and refresh/reconciliation outcomes under the observability policy.

**Required tests after report approval:** metric formula examples; tenant isolation; forbidden dimensions/filters; source lineage; stale/missing projection behavior; reconciliation examples using approved tolerance; pagination and report-version compatibility.

**Open controlled decisions:** report catalogue, formulas, lineage, refresh mechanism/freshness, reconciliation tolerances, currency/time-window rules, access classification and whether a refresh event is required.

## 4. Candidate HLD-to-LLD mapping table

The pairs below are **proposed review links only**. They must not be copied into SRC-003 as exact approved pairs until the candidate HLD and LLD are approved and published with controlled versions and stable locators.

| Requirement | Candidate HLD locator | Candidate LLD locator | Current promotion status |
|---|---|---|---|
| REQ-46301 | EM-HLD-CH463-DELTA-CAND-001 v0.1 §3, HLD-CH463-CAND-01 | EM-LLD-CH463-DELTA-CAND-001 v0.1 §3, LLD-CH463-CAND-01 | CANDIDATE ONLY |
| REQ-46302 | EM-HLD-CH463-DELTA-CAND-001 v0.1 §3, HLD-CH463-CAND-02 | EM-LLD-CH463-DELTA-CAND-001 v0.1 §3, LLD-CH463-CAND-02 | CANDIDATE ONLY |
| REQ-46303 | EM-HLD-CH463-DELTA-CAND-001 v0.1 §3, HLD-CH463-CAND-03 | EM-LLD-CH463-DELTA-CAND-001 v0.1 §3, LLD-CH463-CAND-03 | CANDIDATE ONLY |
| REQ-46304 | EM-HLD-CH463-DELTA-CAND-001 v0.1 §3, HLD-CH463-CAND-04 | EM-LLD-CH463-DELTA-CAND-001 v0.1 §3, LLD-CH463-CAND-04 | CANDIDATE ONLY |
| REQ-46305 | EM-HLD-CH463-DELTA-CAND-001 v0.1 §3, HLD-CH463-CAND-05 | EM-LLD-CH463-DELTA-CAND-001 v0.1 §3, LLD-CH463-CAND-05 | CANDIDATE ONLY |
| REQ-46306 | EM-HLD-CH463-DELTA-CAND-001 v0.1 §3, HLD-CH463-CAND-06 | EM-LLD-CH463-DELTA-CAND-001 v0.1 §3, LLD-CH463-CAND-06 | CANDIDATE ONLY |

These are internally consistent proposed pairings, not verified approved design traceability.

## 5. Review and promotion checklist

For each row, the design authority must approve or amend:
- [ ] Component boundaries and responsibility split.
- [ ] Data model and transaction/concurrency behavior.
- [ ] Authorization and tenant-isolation enforcement.
- [ ] Rule-source/version resolution and error mapping.
- [ ] Audit consistency, retention and integrity behavior.
- [ ] Event/outbox and delivery semantics, if applicable.
- [ ] Exception/retry/replay/DLQ behavior, if applicable.
- [ ] Reporting lineage/freshness/access behavior, if applicable.
- [ ] Exact HLD locator and exact LLD locator in controlled approved versions.
- [ ] Contract IDs/versions and explicit DATA/API/EVENT approval or approved N/A.
- [ ] Approval/change ID, approver role, date and archive locator.

## 6. Gate disposition

- Exact approved HLD→LLD pairs: **0/6**.
- Verified DATA/API/EVENT bindings: **0/18**.
- Approved executable acceptance oracles: **0/6**.
- Business UAT: **HOLD / NOT AUTHORIZED / NOT EXECUTED**.
- G9: **NOT FROZEN**. G10: **NOT ISSUED**.

**Review requested:** review this LLD candidate alongside EM-HLD-CH463-DELTA-CAND-001 v0.1. After formal approval and controlled publication, record the actual approved version/section/page locators in the existing SRC-003 register and re-evaluate each row individually.
