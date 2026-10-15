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
