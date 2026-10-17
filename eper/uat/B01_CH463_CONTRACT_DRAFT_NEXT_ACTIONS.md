# B01 Chapter 463 — Contract Closure Actions

**Status:** Engineering working draft; not an approved contract baseline.
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328. Preserve the 228-requirement / 38-chapter baseline.
**Decision rule:** Existing source artifacts are reused. No role matrix, numeric threshold, schema field, retention period, retry limit, report formula, API/event identifier or approved N/A is inferred from implementation alone.

## Existing source set to reuse

- Procurement domain: `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx` — source remains marked In Development.
- Architecture patterns: `EM-LLD-001_Consolidated_LLD_Chapters_463-500_v1.0(1).docx` — controlled detailed-design draft pending formal approval.
- Requirement crosswalk: `EM-OPS-031_Requirement_by_Requirement_Traceability_Population_Validation_463_500_v1.docx`.
- Existing row reconciliation: `B01_CH463_LLD_DATA_API_EVENT_RECONCILIATION_CANDIDATE_v0.1.csv`.
- Existing candidate oracles: `CH463_Acceptance_Oracle_and_Approval_Matrix_v0.1.docx`.
- Existing decision packet: `B01_CH463_Controlled_Change_Approval_and_Evidence_Request_v0.1.docx` and `B01_CH463_Approval_Decision_Register_v0.1.csv`.

## Contract work package

| Requirement | Contract boundary to specify | Minimum contract deliverables | Approval dependency |
|---|---|---|---|
| REQ-46301 | Authoritative record and lifecycle | Versioned record schema; create/read/update semantics; optimistic concurrency; lifecycle transitions; material-change event; idempotency; error responses | Object/field catalogue, state model, keys and history/retention approved |
| REQ-46302 | Authorization decision | Actor/tenant/resource/action input; allow/deny result; policy version; denial reason class; auditable decision event; no-side-effect-on-denial tests | Role/permission matrix, delegated authority and SoD conflicts approved |
| REQ-46303 | Business validation | Versioned rule catalogue; validation request/result; stable error codes; boundary tests; transactional state invariants | Required fields, rule order, policy thresholds and exception rules approved |
| REQ-46304 | Audit evidence | Material event catalogue; event envelope; actor/tenant/correlation identifiers; integrity metadata; retrieval filters; retention/access controls | Audit scope, required fields, retention, access and integrity policy approved |
| REQ-46305 | Exception and recovery | Exception states; retry/idempotency contract; compensation and escalation outcomes; terminal-state semantics; duplicate-effect tests | Exception taxonomy, retry/backoff limits, escalation owner and DLQ/recovery policy approved |
| REQ-46306 | Governed reporting | Report catalogue; metric definitions/formulas; source lineage; filters and as-of semantics; freshness and reconciliation checks | KPI owners/formulas, freshness SLA, tolerance and tenant access approved |

## Required shared contract envelope (proposal only)

The following are *candidate envelope fields*, not finalized business schema: `contractName`, `contractVersion`, `requestId`, `correlationId`, `tenantId` where applicable, `occurredAt`, `actorId` where applicable, `policyVersion` where applicable, and `traceId`. Approvers must confirm mandatory/optional status, formats, privacy classification and retention before promotion.

## Definition of done for each row

1. Requirement and SRS identifiers point to the controlled requirement baseline.
2. Exact HLD and LLD section locators cite the approved document version and approval record.
3. DATA/API/EVENT contracts are versioned, schema-validated, and mapped to the requirement; alternatively an authorized owner records an explicit N/A with rationale.
4. Positive, negative and boundary acceptance oracles are measurable and derived from approved rules.
5. Contract tests pass and evidence is archived against the exact commit/build.
6. Status remains candidate/blocked until source, design and owner approvals are evidenced.

## Unresolved owner decisions

The existing D1–D10 register is the authoritative decision queue. It records decisions as OPEN; this document does not mark them complete. The minimum decisions needed to promote the six contracts are: approved domain mapping, procurement policies/thresholds, role/SoD matrix, audit policy, exception/recovery policy, KPI/report definitions, exact HLD/LLD binding, data ownership/schema, API/event semantics, and formal controlled publication.

## Gate posture

- Technical CI: report actual run status separately from contract approval.
- SRC-003/G3: OPEN / NO-GO until exact approved design bindings are captured.
- Business UAT: NOT AUTHORIZED / NOT EXECUTED.
- G9: NOT FROZEN. G10: NOT ISSUED.
- No AWS provisioning, deployment, merge or business acceptance is authorized by this draft.


## Row-by-row evidence request for closure

The approved Option A source-precedence decision is already resolved. The requests below are the remaining source-backed decisions; they must be answered from controlled artifacts, not inferred from implementation.

| Requirement | Existing technical evidence (not business approval) | Controlled evidence needed to close the row |
|---|---|---|
| REQ-46301 / SRS-FR-2323 | Record create/read/update, lifecycle result, expected-version conflict and tenant isolation tests | Approved procurement object/field catalogue; lifecycle/state transitions and uniqueness/history rules; exact approved HLD and LLD locators; DATA schema; API concurrency/error/idempotency semantics; material-change event schema or approved N/A; measurable create/update/conflict oracles |
| REQ-46302 / SRS-FR-2324 | Allow/deny, deny precedence and default-deny implementation tests | Approved actor-role-tenant-resource-action matrix including delegation and segregation of duties; exact approved HLD/LLD locators; policy reference DATA; allow/deny API and denial error model; audit event schema or approved N/A; negative/no-side-effect oracle |
| REQ-46303 / SRS-FR-2325 | Registered validation-rule execution and invalid-result handling | Approved rule catalogue, mandatory fields and threshold/boundary values; exact approved HLD/LLD locators; versioned rule DATA schema; command validation/error and atomicity semantics; validation outcome event policy/schema or approved N/A; positive, negative and boundary oracles |
| REQ-46304 / SRS-FR-2326 | Audit append/retrieval/list and SHA-256 integrity check | Approved material-event taxonomy, mandatory attribution fields, retention and access policy; exact approved HLD/LLD locators; audit record schema; retrieval filters/paging/error semantics; event envelope/schema; integrity, tenant isolation and retrieval measurable oracles |
| REQ-46305 / SRS-FR-2327 | Idempotency and controlled exception state transitions; no scheduler/backoff/escalation-delivery proof | Approved exception taxonomy/state model, retry/backoff/compensation/escalation and terminal-state rules; exact approved HLD/LLD locators; exception DATA schema; recovery API and duplicate-effect semantics; lifecycle event schema or approved N/A; retry/terminal-state/no-duplicate oracles |
| REQ-46306 / SRS-FR-2328 | Tenant/report-scoped query, filters and limit | Approved report catalogue, formulas, source lineage, access filters, freshness and expected totals; exact approved HLD/LLD locators; derived-report DATA definition; query API/paging/error semantics; refresh event schema or approved N/A; known-input/expected-total and cross-tenant oracles |

### Promotion rule

A row remains `CANDIDATE_NOT_APPROVED` until each required artifact has an exact locator, version/baseline, accountable approver and explicit disposition. A contract component may be marked approved N/A only with a recorded owner decision and rationale. Do not treat a code test passing as a business rule approval. Do not change the 228-requirement / 38-chapter baseline, requirement IDs, service boundaries, router or UI journeys.


## Existing owner-record reconciliation (2026-10-17)

The existing `B01_D1_D4_OWNER_DECISION_RECORD.md` already names the Business Owner and Requirements Owner as `Sudheendra` and the UAT Lead as `Karuna`, with a decision date entered as 30 September 2026, 09:00 AM. The change/approval record ID and controlled evidence location are blank. D1 source selections and D2 summary are blank; D3 has only a readiness checkpoint, explicitly not approval; D4 authorization fields (named testers, target URL/environment, expected build, approved test data, session window, E1–E13 package and authorization reference) are blank. Accordingly, these entries identify the existing accountable roles but do not evidence D1/D2 approval, D3 case approval or D4 authorization. Reuse this record; do not ask the user to recreate it or fill fields already available elsewhere. Search existing controlled artifacts for the missing approval references and exact design bindings; if no authoritative record exists, retain the relevant hold and record the missing evidence as a blocker. Do not infer policy or change any requirement status from the names/date alone.
