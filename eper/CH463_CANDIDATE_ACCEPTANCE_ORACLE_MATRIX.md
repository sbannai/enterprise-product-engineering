# Chapter 463 — Candidate Acceptance Oracle and Test Packet Matrix

**Document ID:** EPER-B01-CH463-ACCEPTANCE-CANDIDATES-001  
**Prepared:** 2026-10-19  
**Status:** DRAFT / PROPOSED TEST DESIGN — NOT APPROVED, NOT EXECUTED  
**Scope:** REQ-46301–REQ-46306; SRS-FR-2323–SRS-FR-2328; TRC-46301–TRC-46306  
**Baseline:** Option A; 228 requirements / 38 chapters; all IDs unchanged.

## 1. Use and guardrails

This matrix turns observed capability behavior and known source gaps into testable candidate scenarios. It is not a substitute for approved procurement policy. Every case remains `NOT_RUN`; expected outcomes that depend on draft policy, schema, lifecycle, authority, retention, event delivery, or KPI definitions are explicitly blocked.

**Never infer PASS from this document or from unit/CI success.** Before business execution, bind each case to the approved BRD/SRS and exact HLD→LLD pair; approve DATA/API/EVENT contract or explicit N/A; set controlled actor/tenant/data; record oracle approval; run technical preflight; and obtain separate D10 execution authorization.

## 2. Case packet fields

Every case packet must record: case ID; requirement/SRS/TRC; source version and exact locator; approved oracle reference; actor and role; tenant; preconditions; controlled fixture/data; steps; expected measurable result; positive/negative classification; evidence capture location; actual result; tester; run timestamp; build SHA; status; defect link; reviewer and approval reference.

## 3. Candidate 48-case matrix (8 per requirement)

All case IDs are proposed identifiers for this test-design artifact only; they do not replace requirement or test IDs already controlled elsewhere. They must be reconciled with the canonical test register before execution.

### REQ-46301 — Authoritative records and lifecycle history

| Candidate case | Scenario | Candidate observable assertion | Oracle dependency / blocker | Status |
|---|---|---|---|---|
| CH463-01-T01 | Create record with valid controlled fixture | Create returns a record identifier and a retrievable record within the same runtime | Approved procurement schema, required fields, creation API, persistence tier | NOT_RUN |
| CH463-01-T02 | Retrieve record under its owning tenant | Returned record matches the approved fixture for all contract-defined fields | Approved read contract and field-level schema | NOT_RUN |
| CH463-01-T03 | Attempt retrieval across tenants | No cross-tenant record is disclosed; result follows approved authorization/error contract | Approved tenant boundary and error oracle | NOT_RUN |
| CH463-01-T04 | Update using current expected version | Update follows approved optimistic-concurrency contract and version behavior | Approved version semantics and response contract | NOT_RUN |
| CH463-01-T05 | Update using stale expected version | Stale write is rejected without silently overwriting the newer record | Approved conflict code and transaction semantics | NOT_RUN |
| CH463-01-T06 | Submit a lifecycle transition disallowed by approved state machine | Transition is rejected and authoritative state remains unchanged | Approved lifecycle states, guards, and transition table | NOT_RUN |
| CH463-01-T07 | Restart service and retrieve previously written record | Data survives restart if the approved deployment tier requires durable persistence | Approved persistence/durability requirement; current inventory says in-memory | NOT_RUN |
| CH463-01-T08 | Verify material lifecycle history | Required lifecycle history is retrievable and attributable for the approved material actions | Approved material-event taxonomy, retention and audit linkage | NOT_RUN |

### REQ-46302 — Role-based authorization

| Candidate case | Scenario | Candidate observable assertion | Oracle dependency / blocker | Status |
|---|---|---|---|---|
| CH463-02-T01 | Authorized principal performs an approved action | Action is allowed only when the approved policy grants it | Approved role/action/resource/tenant matrix | NOT_RUN |
| CH463-02-T02 | Principal lacks an explicit allow | Request is denied according to the approved default-deny policy | Approval of default-deny semantics and error response | NOT_RUN |
| CH463-02-T03 | Explicit deny conflicts with a matching allow | The approved precedence rule is applied deterministically | Confirmed deny precedence in code; authority approval still required | NOT_RUN |
| CH463-02-T04 | Principal accesses a different tenant's resource | Cross-tenant access is denied without data disclosure | Approved tenant isolation and response oracle | NOT_RUN |
| CH463-02-T05 | Principal attempts a protected material action without permission | No protected state mutation occurs | Approved protected-action catalogue and transaction boundary | NOT_RUN |
| CH463-02-T06 | Delegated user attempts an action outside delegation scope | Action follows the approved delegation rules | Approved delegation model and expiry/scope rules | NOT_RUN |
| CH463-02-T07 | Same person attempts conflicting duties in one transaction | Conflict is prevented or handled exactly as the approved SoD policy requires | Approved SoD matrix; draft SOD-PROC-006 is not authoritative | NOT_RUN |
| CH463-02-T08 | Authorization decision is audited where required | Audit evidence captures approved attribution and outcome fields | Approved audit/event applicability and payload schema | NOT_RUN |

### REQ-46303 — Mandatory business-condition validation

| Candidate case | Scenario | Candidate observable assertion | Oracle dependency / blocker | Status |
|---|---|---|---|---|
| CH463-03-T01 | Submit requisition with all approved mandatory fields | Submission succeeds only if all approved validation rules pass | Approved mandatory-field catalogue and submit operation | NOT_RUN |
| CH463-03-T02 | Omit one approved mandatory field | Request is rejected with the approved stable field/rule error | Approved required-field list and error schema | NOT_RUN |
| CH463-03-T03 | Submit a value outside an approved boundary | Validation rejects or accepts exactly according to the approved rule | Approved threshold/boundary values and policy version | NOT_RUN |
| CH463-03-T04 | Attempt a transition from an invalid source state | Transition is rejected and state remains unchanged | Approved state machine and guard rules | NOT_RUN |
| CH463-03-T05 | Trigger multiple independent validation failures | All failures or the approved deterministic subset is returned in stable form | Approved aggregation/ordering behavior and issue schema | NOT_RUN |
| CH463-03-T06 | Run the same input against the same rule-set version | Result is deterministic for the same fixture and policy version | Approved rule versioning and determinism requirement | NOT_RUN |
| CH463-03-T07 | Submit a request with an unknown/unsupported field | Behavior follows the approved strictness/compatibility contract | Approved unknown-field policy and schema | NOT_RUN |
| CH463-03-T08 | Verify validation failure side effects | Failed validation creates no prohibited material state change or success event | Approved transaction and event/outbox semantics | NOT_RUN |

### REQ-46304 — Audit evidence

| Candidate case | Scenario | Candidate observable assertion | Oracle dependency / blocker | Status |
|---|---|---|---|---|
| CH463-04-T01 | Perform an approved material action | Required audit evidence is written with approved attribution fields | Approved material-event list and audit schema | NOT_RUN |
| CH463-04-T02 | Retrieve evidence by requirement | Retrieval returns only records within the authorized scope and approved filter semantics | Approved retrieval contract and access rules | NOT_RUN |
| CH463-04-T03 | Verify an unmodified evidence record | Integrity verification reports valid for the original record | Approved integrity response contract | NOT_RUN |
| CH463-04-T04 | Alter a test copy of the evidence payload/hash | Integrity verification detects a mismatch | Approved canonicalization and hash verification rules | NOT_RUN |
| CH463-04-T05 | Attempt ordinary update/delete of protected audit evidence | Mutation is rejected or unavailable under the approved immutability model | Approved tamper-resistance/storage contract; current hash alone is insufficient | NOT_RUN |
| CH463-04-T06 | Query evidence as an unauthorized principal | Evidence is not disclosed; response follows approved authorization contract | Approved audit access matrix | NOT_RUN |
| CH463-04-T07 | Verify retention boundary using controlled synthetic timestamps | Expiry/retention behavior matches the approved retention policy | Approved retention period, legal holds and deletion rules | NOT_RUN |
| CH463-04-T08 | Correlate a material action with its audit evidence | Action, actor, tenant, timestamp and correlation link meet the approved traceability rules | Approved attribution schema and trusted-time requirement | NOT_RUN |

### REQ-46305 — Controlled exception handling

| Candidate case | Scenario | Candidate observable assertion | Oracle dependency / blocker | Status |
|---|---|---|---|---|
| CH463-05-T01 | Create an exception using an approved fixture | Exception is created with approved identity, tenant, initial state and ownership fields | Approved exception taxonomy/schema and initial-state rule | NOT_RUN |
| CH463-05-T02 | Repeat creation with the same idempotency key | No duplicate material exception is created within the approved idempotency scope | Approved key scope, retention and conflict semantics | NOT_RUN |
| CH463-05-T03 | Attempt an invalid exception-state transition | Transition is rejected and prior state remains intact | Approved exception transition table | NOT_RUN |
| CH463-05-T04 | Request a retry for an eligible exception | Retry is accepted only when eligibility and attempt policy permit it | Approved retry eligibility, limit and backoff policy | NOT_RUN |
| CH463-05-T05 | Exhaust approved retry policy | Exception reaches the approved terminal/escalation path without unbounded retries | Approved retry limit, exhaustion and terminal-state policy | NOT_RUN |
| CH463-05-T06 | Simulate downstream integration failure | Failure is recorded and recovery follows approved retry/DLQ/replay policy | Approved delivery, dead-letter, compensation and replay policy | NOT_RUN |
| CH463-05-T07 | Retry a previously processed command | Idempotent behavior prevents duplicate side effects as specified | Approved idempotency and concurrency contract | NOT_RUN |
| CH463-05-T08 | Resolve or escalate an exception | Final state, owner/decision and audit evidence meet the approved resolution rules | Approved ownership, escalation, resolution and audit policy | NOT_RUN |

### REQ-46306 — Governed reporting

| Candidate case | Scenario | Candidate observable assertion | Oracle dependency / blocker | Status |
|---|---|---|---|---|
| CH463-06-T01 | Query an approved report for a tenant | Only authorized rows for the requested tenant/report are returned | Approved report catalogue and tenant/access rules | NOT_RUN |
| CH463-06-T02 | Apply an approved exact-value filter | Result set matches the approved filter semantics | Approved field/filter schema | NOT_RUN |
| CH463-06-T03 | Request pagination/limit boundaries | Page size and continuation behavior follow the approved API contract | Approved pagination, maximum limit and sorting rules | NOT_RUN |
| CH463-06-T04 | Reconcile a KPI against its authoritative source fixture | Reported metric equals the approved calculation for the fixture | Approved formula, lineage, aggregation and tolerance | NOT_RUN |
| CH463-06-T05 | Query data beyond the approved freshness target | Staleness is detected/reported or refresh behavior follows the approved SLA | Approved freshness target and stale-data behavior | NOT_RUN |
| CH463-06-T06 | Query a report with no source rows | Empty result follows the approved response contract and does not fabricate data | Approved empty-result semantics | NOT_RUN |
| CH463-06-T07 | Query a report as an unauthorized principal | Restricted metrics/rows are not disclosed | Approved reporting access matrix | NOT_RUN |
| CH463-06-T08 | Verify report lineage and generation timestamp | Result identifies approved source lineage and generation/freshness metadata | Approved lineage, timestamp and refresh-event contract | NOT_RUN |

## 4. Release-gate checklist

| Gate | Evidence required before changing status |
|---|---|
| Source binding | Approved versioned BRD/SRS and exact HLD→LLD pair for each requirement |
| Contract binding | Exact approved DATA schema, API operation contract and EVENT schema, or approved N/A per slot |
| Oracle approval | Measurable expected outcomes approved by the authorized design/business authority; approval reference/date recorded |
| Test fixture | Controlled actor, role, tenant, setup, positive/negative data, cleanup and evidence capture defined |
| Technical preflight | Pinned commit, target environment, access controls and preflight result captured |
| D10 authorization | Separate explicit authorization recorded before any Business UAT execution |
| Result closure | Actual result, evidence link, tester/time/build SHA, defects, reviewer and disposition captured |

## 5. Current disposition

- Candidate cases defined: **48/48** (test-design rows only).
- Approved acceptance oracles: **0/6**.
- Executed business cases: **0/48**.
- Exact approved HLD→LLD pairs: **0/6**.
- Verified full DATA/API/EVENT contract slots or approved N/A: **0/18**.
- Business UAT: **HOLD / NOT AUTHORIZED / NOT EXECUTED**.
- G9: not frozen. G10: not issued.

**Next step:** reconcile these candidate cases with the existing canonical test register and approved source baselines; do not create duplicate execution records or mark any case PASS until the controlled approval and D10 authorization gates are satisfied.
