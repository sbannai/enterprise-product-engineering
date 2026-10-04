# DATA/API/EVENT Contract Specification Gap Matrix

**Assessment date:** 2026-10-04  
**Scope:** Six shared capability contract sets used by 228 requirement bindings; Chapter 463 evidence detailed.  
**Disposition:** IMPLEMENTATION-DERIVED GAP MATRIX — NOT AN APPROVED CONTRACT SPECIFICATION.

## Audit finding

The repository defines six capability contract sets in `eper/contracts/index.ts`. Each set has a DATA, API and EVENT identifier labelled `v1`; `validateRequirementContracts` checks ID equality against the requirement registry. The repository contains no dedicated contract JSON Schema, OpenAPI document, or event payload specification under `eper/contracts/`—only `README.md` and `index.ts` were found in the repository tree.

The capability implementation files and existing contract tests provide useful implementation-derived shapes and behavior, but do not prove an approved external interface contract. In particular, an EVENT descriptor does not demonstrate a publisher or event payload; the exception capability writes internal lifecycle evidence, which is not equivalent to a governed event bus contract.

## 18 contract-by-contract disposition rows

```csv
capability,requirement_pattern,data_contract_id,api_contract_id,event_contract_id,contract_version,implementation_source,data_spec_status,api_spec_status,event_spec_status,data_missing_definition,api_missing_definition,event_missing_definition,owner_decision_required,approval_status,uat_authorized
"authoritative-records","XX01","DATA:authoritative-domain","API:capability-resource","EVENT:material-lifecycle","v1","eper/packages/capabilities/authoritative-records.ts","DESCRIPTOR_ONLY_SCHEMA_NOT_FOUND","DESCRIPTOR_ONLY_OPENAPI_NOT_FOUND","DESCRIPTOR_ONLY_EVENT_SCHEMA_NOT_FOUND","JSON Schema fields, constraints, lifecycle enum, persistence/ownership/version policy","operation schemas for create/get/update/delete; auth, errors, concurrency and compatibility","No lifecycle publisher/payload/delivery/replay schema demonstrated","Provide approved spec/version/locator OR explicit approved N/A with rationale; identify owner and approval reference","PENDING_OWNER_AND_DESIGN_AUTHORITY","NO"
"authorization","XX02","DATA:identity-policy","API:secured-capability","EVENT:authorization-audit","v1","eper/packages/capabilities/authorization.ts","DESCRIPTOR_ONLY_SCHEMA_NOT_FOUND","DESCRIPTOR_ONLY_OPENAPI_NOT_FOUND","DESCRIPTOR_ONLY_EVENT_SCHEMA_NOT_FOUND","approved principal/role/tenant/policy schema and policy lifecycle","operation schema, role/action/resource policy admin and typed deny response","No authorization event publisher or event schema demonstrated","Provide approved spec/version/locator OR explicit approved N/A with rationale; identify owner and approval reference","PENDING_OWNER_AND_DESIGN_AUTHORITY","NO"
"business-validation","XX03","DATA:domain-rules","API:validated-command","EVENT:validation-outcome","v1","eper/packages/capabilities/business-validation.ts","DESCRIPTOR_ONLY_SCHEMA_NOT_FOUND","DESCRIPTOR_ONLY_OPENAPI_NOT_FOUND","DESCRIPTOR_ONLY_EVENT_SCHEMA_NOT_FOUND","versioned business-rule definition and input domain schema","validate command/request/result/error schema and rule version behavior","No validation outcome publisher or event schema demonstrated","Provide approved spec/version/locator OR explicit approved N/A with rationale; identify owner and approval reference","PENDING_OWNER_AND_DESIGN_AUTHORITY","NO"
"audit-evidence","XX04","DATA:audit-record","API:audit-retrieval","EVENT:audit-material-event","v1","eper/packages/capabilities/audit-evidence.ts","DESCRIPTOR_ONLY_SCHEMA_NOT_FOUND","DESCRIPTOR_ONLY_OPENAPI_NOT_FOUND","DESCRIPTOR_ONLY_EVENT_SCHEMA_NOT_FOUND","formal audit JSON Schema, retention, immutable storage and timestamp trust model","append/get/list/verify request-response/error contract and access rules","No general audit material-event publisher/schema; hash is not a delivery contract","Provide approved spec/version/locator OR explicit approved N/A with rationale; identify owner and approval reference","PENDING_OWNER_AND_DESIGN_AUTHORITY","NO"
"exception-handling","XX05","DATA:workflow-exception","API:recovery-command","EVENT:exception-lifecycle","v1","eper/packages/capabilities/exception-handling.ts","DESCRIPTOR_ONLY_SCHEMA_NOT_FOUND","DESCRIPTOR_ONLY_OPENAPI_NOT_FOUND","DESCRIPTOR_ONLY_EVENT_SCHEMA_NOT_FOUND","formal exception schema, retry policy, durable state and ownership semantics","create/transition/query contract, retry idempotency and typed error semantics","Lifecycle evidence is internal/in-memory; no external event envelope/delivery guarantee","Provide approved spec/version/locator OR explicit approved N/A with rationale; identify owner and approval reference","PENDING_OWNER_AND_DESIGN_AUTHORITY","NO"
"governed-reporting","XX06","DATA:derived-reporting","API:report-query","EVENT:report-refresh","v1","eper/packages/capabilities/governed-reporting.ts","DESCRIPTOR_ONLY_SCHEMA_NOT_FOUND","DESCRIPTOR_ONLY_OPENAPI_NOT_FOUND","DESCRIPTOR_ONLY_EVENT_SCHEMA_NOT_FOUND","report/read-model schema, metric definitions, lineage and freshness contract","publish/query schemas, filter operators, pagination and authorization/errors","No report-refresh publisher/payload/freshness event schema demonstrated","Provide approved spec/version/locator OR explicit approved N/A with rationale; identify owner and approval reference","PENDING_OWNER_AND_DESIGN_AUTHORITY","NO"
```

## Required closure for each of the 18 descriptors

For each DATA/API/EVENT descriptor:
1. Provide the authoritative EM-DATA-001 / EM-API-001 / EM-EVT-001 artifact, exact version and section/row locator.
2. Bind it explicitly to capability, REQ/SRS/TRC, implementation module, and HLD→LLD design pair.
3. For DATA: approved schema, required/optional fields, types, constraints, tenant scope, lifecycle/retention, ownership and migration/version compatibility.
4. For API: operation, method/path or invocation name, auth requirements, request/response schemas, success/error semantics, idempotency/concurrency and compatibility.
5. For EVENT: event name, producer/trigger, payload schema, tenant/correlation identifiers, ordering, delivery/retry/replay, version compatibility and retention—or a separate approved N/A decision.
6. Record owner, approval authority, change reference and effective date. A repository descriptor or passing ID-integrity test is not an approval.

## Decision boundary

- Registry ID consistency: **IMPLEMENTED / TESTED**.
- Dedicated approved contract specifications: **NOT FOUND IN REPOSITORY TREE REVIEW**.
- Approved N/A decisions: **NOT EVIDENCED**.
- SRC-003/G3: **OPEN / NO-GO**.
- Business UAT / final acceptance: **NOT AUTHORIZED / NOT RECORDED**.

This is a scoped repository-tree audit, not proof that no specification exists in an external controlled document repository. If EM-DATA-001, EM-API-001 or EM-EVT-001 are controlled externally, the design authority must provide the exact versions/locators and approval evidence.


## Library-source reconciliation update (2026-10-04)

A follow-up search of the controlled project Library located source baselines that were not present in the repository directory reviewed above:

- `EM-DATA-001_Database_Dictionary_ER_Model_v1.docx` — **INITIAL DATA DESIGN BASELINE**; logical entities, ownership, tenancy, keys, relationships, integrity and indexes are defined at a platform baseline level.
- `EM-API-001_OpenAPI_Specification_v1.docx` — **INITIAL BUILD-READY CONTRACT BASELINE**; defines `/api/v1`, security/tenant conventions, standard headers/envelopes/errors, resource catalogue and representative endpoint catalogue.
- `EM-EVT-001_Event_Schema_Catalogue_v1.docx` — **INITIAL BUILD-READY EVENT BASELINE**; defines the standard event envelope and catalogue, producers/consumers, delivery, ordering, retry/DLQ, replay and schema evolution.
- `EM-OPS_463-500_DATA_API_EVENT_Requirement_Reconciliation_v1.xlsx` — 228-row reconciliation source. Its Executive Summary explicitly says requirement-level DATA/API/EVENT exact joins are **NOT FULLY PROMOTED**, contract-test execution evidence is **NOT ESTABLISHED**, and confirmed closure is **0/228**.
- `EM-OPS-Ch463_EPER_Shared_Contract_Specification_v1.docx` — Chapter 463 shared contract baseline. It explicitly leaves exact Chapter-463 entities/fields/schema IDs, endpoints/schemas, and event IDs/schemas open where not explicitly evidenced.

### Corrected conclusion

The earlier statement “dedicated approved specifications not found in the repository tree” remains accurate as a repository-tree finding, but it must not be read as “the project has no contract baselines.” The Library contains initial design baselines for all three contract types. However, these are explicitly initial/build-ready baselines, not evidence of final approval or completed requirement-level joins.

For Chapter 463 specifically:
- Shared contract source documents: **FOUND**.
- General data/API/event rules and catalogues: **FOUND**.
- Pattern-based event candidates exist in the reconciliation workbook (for example, document events for XX01, tenant/security events for XX02, rule event for XX03, audit event for XX04, workflow/integration events for XX05, and notification events for XX06).
- Exact requirement-specific DATA entity/schema + ownership join: **NOT PROMOTED**.
- Exact API operation/request-response join: **NOT PROMOTED**.
- Exact event applicability, schema/version and requirement binding: **NOT PROMOTED**.
- Approved N/A decisions: **NOT EVIDENCED**.
- Contract-test execution evidence: **NOT ESTABLISHED**.

Candidate event IDs are retained as candidates only. For example, an EVT-DOC-* event is not automatically applicable to REQ-46301 just because the requirement uses pattern XX01. The requirement’s authoritative domain behavior must justify the join.

### Next validation action

Perform a controlled six-row join for REQ-46301–REQ-46306 against the exact entity catalogue rows in EM-DATA-001, representative endpoint catalogue rows in EM-API-001, and event catalogue rows in EM-EVT-001. For every candidate, record exact source section/catalogue ID, applicability rationale and baseline status. Leave the binding OPEN where the shared contract spec explicitly says exact Chapter 463 detail is unresolved; do not infer a business domain object, endpoint or event.
