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
