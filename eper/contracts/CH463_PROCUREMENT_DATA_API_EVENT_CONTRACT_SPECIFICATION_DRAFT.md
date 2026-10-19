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


## 7. Reconciliation against the controlled Chapter 463 source-correction decision

The earlier source recovery documented conflicting legacy labels. That conflict has since been resolved by **`B01-CH463-SOURCE-CORRECTION-DECISION-001` (Option A, approved 2026-10-12)**: the canonical domain identity is **Volume XIII, Chapter 463 — Enterprise Procurement & Source-to-Pay**. The legacy “Enterprise Event & Message Management” heading is document-control correction debt and must not be treated as the current domain decision.

This decision resolves **domain identity only**. It does not approve any procurement object, API operation, event name, schema, requirement-level HLD/LLD binding, acceptance oracle, or UAT execution.

### Existing source evidence and its limits

- `EM-BRD-001_Detailed_Chapters-461-470_v1.0`, Chapter 463 §463.21, page 11, establishes the six requirement identities and generic control-pattern wording. It is requirement-identity evidence, not complete procurement policy.
- `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx` supplies relevant procurement domain sections. Its In Development status means it cannot by itself serve as final approval of policy parameters or every requirement-to-domain join.
- `HLD_463_470_Controlled_Traceability_Recovery_Matrix_46301_46306_CH463_OptionA_Correction_Candidate.docx` records the source-precedence decision but explicitly leaves exact requirement-level HLD/LLD bindings open.
- `EM-LLD-001_Consolidated_LLD_Chapters_463-500_v1.0` supplies detailed-design pattern targets. Named components remain supporting locators until an approved source explicitly binds each one to its requirement.
- `eper/CH463_IMPLEMENTATION_TO_DESIGN_CROSSWALK.csv` and `eper/contracts/index.ts` show implementation and registry descriptors only. They are not complete DATA schemas, OpenAPI operations, event payload schemas, or approval records.

### Controlled requirement-to-source reconciliation queue

| Requirement | Candidate procurement sections to inspect | Required domain decision/evidence before promotion |
|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | §§463.7–463.8, 463.16, 463.18, 463.21–463.23, 463.39, 463.42 | Approved mapping of record types, lifecycle/history, fields, identity/idempotency and allowed transitions |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | §§463.3, 463.8, 463.14–463.16, 463.24–463.25, 463.35 | Approved actor/role/action/resource/tenant authority matrix, delegation and segregation-of-duties rules |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | §§463.7–463.8, 463.15–463.16, 463.19–463.25, 463.27, 463.46–463.47 | Approved mandatory/conditional field catalogue, policy precedence, thresholds, rule versions and validation errors |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | §§463.3, 463.14–463.16, 463.18, 463.22, 463.24 | Approved material-event catalogue, audit payload/attribution, integrity, access and retention controls |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | §§463.3, 463.8, 463.14–463.16, 463.22–463.25, 463.27 | Approved exception taxonomy, retry/recovery, compensation, escalation and terminal-state policy |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | §§463.12, 463.15–463.16, 463.24–463.25, 463.28–463.29, 463.32, 463.37, 463.46–463.47 | Approved report catalogue, formulas, source lineage, freshness, reconciliation tolerances and access scope |

The section references above are **candidate source locators for review**, not approved requirement-level joins. For each row, record the exact controlled document version, section/page/row, approval/change reference, effective date, accountable owner, and decision. If the source does not define a requirement's intended procurement behavior, record `CLARIFICATION_REQUIRED`; do not infer the join from plausibility.

### Contract and event-name guardrails

- All 18 DATA/API/EVENT entries remain `CANDIDATE_NOT_APPROVED` until each has a versioned contract, exact source locator, explicit requirement binding, and authorized approval—or an explicitly approved N/A with rationale.
- Do not treat registry IDs as schemas or contracts.
- Reconcile `RequisitionSubmitted` versus `PurchaseRequisitionSubmitted` and `RequisitionDecisionRecorded` versus `PurchaseRequisitionApproved` against the controlled event catalogue and approved lifecycle. This draft does not select canonical names.
- Use the existing SRC-003/G9 reconciliation registers; do not create a parallel closure register.

### Current gate disposition

- Domain identity: **RESOLVED** by `B01-CH463-SOURCE-CORRECTION-DECISION-001`.
- Exact approved HLD→LLD pairs: **0/6**.
- Verified DATA/API/EVENT bindings: **0/18**.
- Approved executable acceptance oracles: **0/6**.
- SRC-003/G3: **OPEN / NO-GO**.
- Business UAT: **HOLD / NOT AUTHORIZED / NOT EXECUTED**.
- G9: **NOT FROZEN**. G10: **NOT ISSUED**.

No owner upload is requested where source material already exists. This contract specification remains draft work only; it does not approve contracts, authorize UAT, or authorize deployment/AWS provisioning.
