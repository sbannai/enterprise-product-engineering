# Chapter 463 DATA / API / EVENT Contract Specification Draft

**Document ID:** EPER-CONTRACT-CH463-DRAFT-001  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Status:** DRAFT FOR DESIGN-AUTHORITY REVIEW — NOT APPROVED / NOT EXECUTABLE  
**Decision basis:** Owner direction recorded 2026-10-09: use the existing authoritative procurement domain model; specify DATA/API/EVENT contracts; do not infer or invent procurement domain objects.  
**Source baseline candidates:** EM-DATA-001 Database Dictionary & Logical ER Model v1 (INITIAL DATA DESIGN BASELINE); EM-API-001 OpenAPI Specification v1 (INITIAL BUILD-READY CONTRACT BASELINE); EM-EVT-001 Event & Schema Catalogue v1 (INITIAL BUILD-READY EVENT BASELINE); EM-OPS_463-500_DATA_API_EVENT_Requirement_Reconciliation_v1.xlsx.  
**Control rule:** This draft is a work plan and requirement-level gap analysis. Candidate IDs, endpoints and events below are not approved Chapter 463 bindings. Do not mark SRC-003/G3 closed based on this draft.

## 1. Source baseline inspection

The existing platform baselines define useful common rules:

- DATA baseline: tenant-aware ownership, stable identifiers, version/concurrency metadata, lifecycle metadata, authoritative ownership, and no cross-domain direct writes. Its current entity catalogue does not establish the Chapter 463 procurement aggregate/schema.
- API baseline: `/api/v1`, HTTPS/TLS, approved bearer authentication, server-side authorization, server-authoritative tenant context, correlation, idempotency for retryable mutations, `If-Match` where concurrency applies, common success/error envelopes and defined HTTP status semantics. Its current resource catalogue does not expose an evidenced procurement resource/operation set.
- EVENT baseline: event ID/type/version, timestamps, producer, tenant context where applicable, aggregate references where applicable, correlation/causation, schema reference, payload, at-least-once delivery, idempotent consumers, controlled replay, retry/DLQ and schema evolution. Existing event candidates in the reconciliation workbook are pattern-level candidates, not approved requirement-level mappings.
- The reconciliation workbook explicitly states that exact requirement-level DATA/API/EVENT joins are not fully promoted and contract-test execution evidence is not established.

## 2. Requirement-level contract decisions and gaps

| Requirement / SRS / TRC | Capability family | Existing DATA evidence | API contract work | EVENT contract work | Status |
|---|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | Authoritative records and lifecycle | EM-DATA-001 is a generic platform data baseline; exact procurement aggregate, lifecycle model, owner and schema locator are not evidenced. Existing authoritative procurement model must be identified first. | Define create/read/update/lifecycle operations only after confirming the existing model and allowed transitions; define request/response, validation errors, authorization, idempotency and concurrency. | Reconciliation candidates EVT-DOC-001/002/003 are pattern-level only and may not represent procurement facts. Select the correct material-state event(s) only from approved domain model and event catalogue, or record approved N/A. | BLOCKED ON DOMAIN MODEL SOURCE |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Authorization and tenant context | Reuse platform IAM/authorization baselines only where the exact procurement resource/action binding is confirmed. Do not infer procurement role names. | Specify actor/principal, action, resource, tenant scope, policy decision and deny/error semantics against the approved authorization matrix. | EVT-SEC-001 is a catalogue candidate for authorization-policy changes, not an automatic mapping to every authorization decision. Bind only if approved design requires it. | SPECIFICATION REQUIRED |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | Business validation and rules | Reuse RuleSet/RuleSetVersion only if approved business rules identify them as the governing rule store; rule catalogue/ownership/version not yet joined to this requirement. | Define command inputs, validation order, transaction boundary, stable validation codes, field errors and state-integrity behavior from approved business rules. | EVT-RUL-001 is a candidate for published rule-set changes, not a substitute for a business-validation result contract. Bind only if approved. | SPECIFICATION REQUIRED |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | Audit evidence | AUD-001 AuditRecord is a generic platform candidate. Exact audit fields, retention policy, integrity mechanism and procurement material-action mapping require approved source binding. | Define authorized audit query/retrieval contract, filters, pagination, disclosure rules and retention/retrieval behavior from approved audit requirements. | EVT-AUD-001 is a catalogue candidate for security-action evidence. Determine which procurement material events require audit evidence and payload fields from approved source. | SPECIFICATION REQUIRED |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | Exception handling and recovery | INT-001/002/003 and WFL-001/002 are platform candidates, not proof of procurement exception taxonomy or terminal states. | Specify retryable/non-retryable failures, idempotency, operation state, recovery/replay, compensation and conflict semantics from approved workflow/exception design. | EVT-WFL-* and EVT-INT-* entries are candidates only. Bind the exact lifecycle/failure/reconciliation events after the approved exception model identifies producers and transitions. | SPECIFICATION REQUIRED |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | Governed reporting | Derived reporting data must not become authoritative. Exact read model, source lineage, freshness target and metric definitions are not evidenced. | Specify approved report/query resources, allowed filters, tenant/role scoping, pagination, freshness/lineage metadata and errors after the report catalogue is identified. | EVT-NOT-* events in the reconciliation workbook are pattern-level candidates and do not by themselves support governed reporting. Identify approved source events or batch lineage. | BLOCKED ON REPORT CATALOGUE / LINEAGE |

## 3. Contract deliverables required

For each requirement where applicable, the specification package must include:

### DATA
- Authoritative domain/entity/aggregate name copied from the controlled procurement model (not invented here).
- Stable ID, tenant ownership, lifecycle/state enum and transition constraints.
- Typed attributes with required/optional status, constraints, uniqueness and relationships.
- Version/concurrency semantics, audit metadata, retention and deletion policy.
- Authoritative owner, schema version and exact document/section/page/row locator.
- Explicit approved N/A with rationale where a requirement has no data contract.

### API
- OpenAPI operation ID, method/path, purpose and exact requirement binding.
- Request and response schemas/examples; success and error codes.
- Authentication, action/resource/tenant authorization and disclosure behavior.
- Validation, idempotency, concurrency, pagination, correlation and versioning.
- Exact EM-API-001 extension/specification version and approval/change reference.
- Explicit approved N/A with rationale where a requirement has no API operation.

### EVENT
- Event name/ID, producer, trigger, consumer purpose and exact requirement binding.
- Versioned payload schema, required/optional fields, data classification and tenant context.
- Transaction/outbox relationship, delivery guarantees, ordering, duplicate handling, retry/DLQ and replay controls.
- Compatibility/evolution policy and exact EM-EVT-001 extension/specification version.
- Explicit approved N/A with rationale where a requirement has no event.

## 4. Controlled source and approval gates

Before any contract is promoted to approved:
1. Record the existing authoritative procurement model's document ID, version, exact locator, approval/change reference and effective date.
2. Record exact approved HLD locator and HLD-to-LLD pairing for each of the six requirements. EM-LLD-001 v1.0 has been approved by the requester in the conversation, but the repository still needs formal approval metadata/attestation and exact row-level binding.
3. Draft DATA/API/EVENT schemas against the source model and EM-DATA-001 / EM-API-001 / EM-EVT-001 baseline conventions.
4. Review each schema/operation/event with the design authority and relevant domain owner; record approved version, reviewer, decision, date and change reference.
5. Update the existing SRC-003 response tracker and G9 reconciliation workbook with exact locators. Do not create a parallel closure register.
6. Add contract validation and provider/consumer tests only after the contract schemas are approved; capture run/build/environment/results as separate execution evidence.

## 5. Open owner inputs

- **Existing procurement model source:** document ID/title, version, exact section/page/row locator, approval reference and effective date — REQUIRED.
- **Formal EM-LLD-001 approval record:** approval/change ID, effective date and electronic attestation/signature reference if separately maintained — REQUIRED to claim controlled formal approval.
- **Chapter 463 HLD bindings:** exact approved HLD locators and HLD-to-LLD pairing for REQ-46301–REQ-46306 — REQUIRED.
- **B01 acceptance:** use existing approved BRD/SRS criteria only. Per-row approved source/version/locator and approval status still need verification; ambiguous or draft-only criteria remain unresolved.
- **UAT:** environment is not hosted. No live target preflight or business UAT can be performed yet.

## 6. Disposition

**Contract specification work authorized as draft work; no contract is approved by this document.** Existing baseline conventions can be reused, but procurement-specific domain facts and requirement-level bindings must come from the authoritative source. SRC-003/G3 remains OPEN / NO-GO; B01 remains HOLD / NOT EXECUTED; business acceptance remains pending; G9 is not frozen.


## 7. Recovery from already-submitted sources — domain identity conflict

The Library source recovery found existing domain material; no additional upload is requested.

### Source hierarchy and evidence found
- `EM-BRD-001_Consolidated_BRD_Chapters_463-500_v1.0` and `HLD_463_470_Controlled_Traceability_Recovery_Matrix_46301_46306_v1.9` identify Chapter 463 as **Enterprise Event & Message Management**. Its six BRD requirements are the recurring control patterns: authoritative records/lifecycle, authorization, business validation, audit evidence, exception handling and governed reporting.
- `EM-LLD-001_Consolidated_LLD_Chapters_463-500_v1.0` provides detailed-design targets for those six requirement patterns, while explicitly marking exact binding pending and formal approval pending.
- `HLD_463_470_Detailed_Candidate_v0.2` labels HLD-463 **Enterprise Procurement & Source-to-Pay** and lists a procurement digital thread and candidate objects. The same document says the exact Chapter-463 object names require confirmation against the final chapter source before approval.
- Existing procurement business context is available in `EM-BRD-001_Volume-I_Chapter-50_Procurement-Supplier-Vendor-and-Source-to-Pay-Management-Requirements-Framework_v1.0` and the Chapter 274 procurement traceability framework. These are useful domain references, but they do not override the Chapter 463 requirement-source identity or independently prove that Chapter 463 is procurement.

### Reconciliation decision
**Do not promote procurement entities, APIs or events to REQ-46301–REQ-46306 yet.** The current evidence contains a domain-identity conflict between the requirement-source chain and the HLD candidate. The controlling source for Chapter 463 requirement identity is the detailed Chapter 463 BRD, cross-checked with the consolidated BRD/recovery matrix; the HLD candidate remains supporting/candidate evidence until reconciled.

Required action: reconcile the Chapter 463 title/domain against the detailed BRD and approved HLD baseline, then select the applicable existing domain model and record exact source locators. If the intended Chapter 463 domain is Event & Message Management, use the existing event/message domain model and do not force the procurement model into these six requirements. If a controlled approved source establishes that Chapter 463 is Procurement & Source-to-Pay, record the correction and its authority before promoting procurement contracts.

This recovery changes the next action from “request another document” to **reconcile existing submitted sources and their authority**. No owner upload is currently required. SRC-003/G3 remains OPEN / NO-GO until this discrepancy and the requirement-level bindings are resolved.


## 7. Exact candidate catalogue row reconciliation — P0 data gate (2026-10-19)

This section records an additional row-level inspection of `EPER_Master_Repository_v57.5.xlsx`. It improves locator precision only. The workbook rows below are all **Draft**; none is promoted or treated as an approved schema, policy, API, event, or acceptance oracle.

| Requirement | Exact candidate DATA/schema locators | Related candidate controls / operations | Reconciliation disposition |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 | `11_Data_Entities`: `ENT-PROC-009` Purchase Requisition and `ENT-PROC-010` Purchase Requisition Line; `101_PROC_Attribute_Catalog`: `ATTR-PROC-014` `requisition_number` (`VARCHAR(50)`, unique per org) and `ATTR-PROC-015` `total_amount` (`DECIMAL(20,4)`, calculated from lines); `102_PROC_DB_Structures`: `TBL-PROC-010` `purchase_requisition`, `TBL-PROC-011` `purchase_requisition_line`; `89_PROC_Object_Catalog`: `PROC-OBJ-006`. | `97_PROC_Lifecycle_States`: `LC-PROC-007–009`; `103_PROC_API_Catalog`: `API-PROC-009–011`; `104_PROC_API_Contracts`: `CON-PROC-009–011`; `100_PROC_Domain_Events`: `EVT-PROC-007–008`. | Candidate aggregate is identifiable, but only two requisition attributes are explicitly catalogued in the inspected attribute sheet; full field-level schema/relationships, source approval, HLD→LLD binding and event-name reconciliation remain open. |
| REQ-46302 / SRS-FR-2324 | No approved procurement-specific principal/tenant/policy schema evidenced by these rows. `98_PROC_Roles_Permissions`: `PERM-PROC-008` Requester and `PERM-PROC-009` Requisition Approver are candidate role/permission entries. | `112_PROC_Approval_Authority`: `AUTH-PROC-007`; `113_PROC_SoD_Matrix`: `SOD-PROC-006`; all Draft. | Candidate roles and self-approval restriction exist, but do not establish the full role × action × resource × tenant × delegation matrix, authority limits, test identities or approved denial contract. |
| REQ-46303 / SRS-FR-2325 | Requisition entity/table candidates above; complete approved field/conditional-field schema is not evidenced. | `107_PROC_Validation_Catalog`: `VAL-PROC-008` accounting allocation totals 100%, `VAL-PROC-009` budget/fund check; `109_PROC_Error_Catalog`: `PROC-REQ-001` accounting distribution invalid (422), `PROC-REQ-002` budget validation failed (409); all Draft. | These provide concrete candidate rules/error codes for review, not accepted business rules. Amount-positive synthetic test remains unrelated to approval of these procurement rules. |
| REQ-46304 / SRS-FR-2326 | `AUD-001` is a generic shared audit-record candidate; no exact procurement material-event payload/schema is promoted by the procurement tabs inspected. | `100_PROC_Domain_Events` has candidate procurement events, but audit coverage, integrity, retention and retrieval obligations are not defined by the event names alone. | Need approved material-action coverage, event fields, authoritative audit storage, access/retrieval, retention and integrity rules. |
| REQ-46305 / SRS-FR-2327 | `11_Data_Entities`: `ENT-PROC-018` Procurement Exception; `101_PROC_Attribute_Catalog`: `ATTR-PROC-025` severity and `ATTR-PROC-026` due_at; `102_PROC_DB_Structures`: `TBL-PROC-019` `procurement_exception`. | `103_PROC_API_Catalog`: `API-PROC-025` search exceptions and `API-PROC-026` dispose exception; `100_PROC_Domain_Events`: `EVT-PROC-015` ProcurementExceptionChanged. Separately, `API-PROC-020/021` and `LC-PROC-014/015` concern procurement match/invoice-match evaluation and resolution. | **Candidate mapping discrepancy identified:** prior mapping of REQ-46305 to match APIs/lifecycle may cover match exceptions, not the general procurement exception capability. Keep both as candidates; domain owner/design authority must decide intended scope before promotion. |
| REQ-46306 / SRS-FR-2328 | `11_Data_Entities`: `ENT-PROC-017` Supplier Scorecard; `102_PROC_DB_Structures`: `TBL-PROC-018` `supplier_scorecard`; `101_PROC_Attribute_Catalog`: `ATTR-PROC-024` `overall_score` (`DECIMAL(9,4)`, configured scale), all Draft. | `93_PROC_KPI_Catalog`: `KPI-PROC-001–012` are candidate metrics; `103_PROC_API_Catalog`: `API-PROC-024` KPI query; `104_PROC_API_Contracts`: `CON-PROC-024`; all Draft. | Candidate catalogue contains KPI definitions/formulas, but approved report scope, formulas, lineage, access, freshness, reconciliation tolerances and requirement-level mapping remain unconfirmed. A supplier scorecard is not automatically the reporting model for every KPI. |

### Data-gate result after row-level inspection

- **Improved:** exact candidate row locators are now recorded for requisition entities/tables, available requisition attributes, lifecycle, validation/error codes, roles/SoD, exception structures, KPI catalogue, API operations and event names.
- **Not closed:** the workbook status for these candidate rows is Draft; exact approved HLD→LLD pairs, controlled baseline approval, complete schemas and ownership attestations remain unverified.
- **Important reconciliation item:** REQ-46305 has a scope ambiguity between invoice-match exception handling (`API-PROC-020/021`, `LC-PROC-014/015`) and the general procurement exception catalogue (`ENT-PROC-018`, `API-PROC-025/026`, `EVT-PROC-015`). This is flagged for owner/design-authority disposition rather than silently choosing one.
- **Gate disposition:** D8 / P0 Data Model & Schema Ownership remains **HOLD**; exact approved DATA bindings remain **0/6**. No N/A is inferred, no requirement IDs change, and no Business UAT authorization is created by this update.
