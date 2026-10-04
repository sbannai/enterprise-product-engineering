# Chapter 463 Implementation-to-Design Crosswalk

**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328  
**Assessment:** 2026-10-04  
**Disposition:** Implementation references identified; approved HLD/LLD traceability remains OPEN.

## What has been recovered

The repository provides direct implementation-level trace points:
- Requirement identity and service/contract IDs in `eper/packages/requirements/registry.ts`.
- Contract descriptors and version `v1` in `eper/contracts/index.ts`.
- Capability router in `eper/packages/capability-router.ts`.
- Executable Chapter 463 scenarios in `eper/tests/requirement-acceptance-wave-01.test.mjs`.
- Requirement-specific wave summary in `eper/REQUIREMENT_ACCEPTANCE_WAVE_01_CH463.md`.

These establish code-level implementation mapping and contract registry IDs. They do **not** prove that the same identifiers are approved HLD/LLD design locators or that they define authoritative business/domain schemas.

## Six-row result

| Requirement | Service | Implementation test coverage visible in source | Design traceability |
|---|---|---|---|
| REQ-46301 | AuthoritativeRecordService | Create/update, lifecycle state, version conflict | OPEN — exact approved HLD/LLD and schema locator missing |
| REQ-46302 | AuthorizationService | Deny precedence and default deny | OPEN — approved role/tenant policy baseline locator missing |
| REQ-46303 | BusinessValidationService | Valid/invalid rule evaluation | OPEN — approved business rule catalogue and measurable oracle missing |
| REQ-46304 | AuditEvidenceService | Append, integrity hash, retrieval, tenant isolation | OPEN — approved audit schema/retention specification locator missing |
| REQ-46305 | ExceptionHandlingService | Retry/resolution lifecycle, invalid transition | OPEN — approved retry/escalation/recovery specification locator missing |
| REQ-46306 | GovernedReportingService | Publish/query, filtering, tenant isolation | OPEN — approved report definition, metrics and data lineage locator missing |

The row-level implementation references and required design closure evidence are in [CH463_IMPLEMENTATION_TO_DESIGN_CROSSWALK.csv](./CH463_IMPLEMENTATION_TO_DESIGN_CROSSWALK.csv).

## Control decision

Do not relabel `DATA:*`, `API:*`, or `EVENT:*` IDs as approved design references merely because they are registered and used by tests. The current code proves implementation-level contract identity; the controlled design crosswalk and source approval are separate controls.

**Next closure criterion:** for each of the six rows, link an approved HLD section, approved LLD module/section, concrete DATA schema and API/EVENT contract specification (or an approved N/A decision), including source version and approval reference. If the design source is not available, record it as a specific evidence request rather than infer the locator.

**Gate state:** SRC-003 / G3 remains OPEN / NO-GO. This crosswalk improves traceability precision but does not close the design gate or authorize UAT.


## Implementation contract inspection (2026-10-04)

The follow-up code inspection is recorded in [CH463_CONTRACT_IMPLEMENTATION_INVENTORY.md](./CH463_CONTRACT_IMPLEMENTATION_INVENTORY.md). It distinguishes what the executable service layer actually demonstrates from what still requires an approved design contract.

| Requirement | Implemented behavior observed | Important boundary not demonstrated |
|---|---|---|
| REQ-46301 | Tenant-scoped in-memory records; create/get/update/delete; expected-version conflict handling | Durable persistence/migration, governed lifecycle-state catalogue, approved authoritative schema |
| REQ-46302 | Explicit deny precedence; matching allow; default deny | Approved role/action matrix, policy administration, authorization-event publisher |
| REQ-46303 | Registered rules execute; ERROR issues make result invalid | Approved versioned business-rule catalogue and domain-specific expected outcomes |
| REQ-46304 | Append/retrieve/list audit evidence; SHA-256 integrity check | Tamper-proof storage, trusted timestamp/key management, retention enforcement |
| REQ-46305 | Tenant-scoped idempotency; controlled exception states and transition checks | Actual retry scheduler/backoff, delivery integration and escalation notification |
| REQ-46306 | Tenant/report-scoped query, filters and limit | Governed report catalogue, metric formulas, freshness/aggregation and refresh-event publication |

### Contract ID versus contract definition

The IDs `DATA:*`, `API:*`, and `EVENT:*` at `eper/contracts/index.ts` are registry descriptors labelled `v1`. Code validates identity consistency; it does not establish a field-level JSON schema, OpenAPI operation/request/response/error contract, event payload schema, compatibility policy or approval metadata. The in-memory service implementations are executable technical evidence, not proof of approved procurement domain design.

### Revised disposition

- Implementation traceability: **OBSERVED IN CODE** for the behaviors above.
- Contract registry consistency: **OBSERVED IN CODE**.
- Approved design traceability: **OPEN** — exact HLD/LLD locators remain unproven.
- Approved DATA/API/EVENT specification or approved N/A: **OPEN**.
- Business UAT / final acceptance: **NOT EXECUTED / NOT RECORDED**.
- SRC-003 / G3: **OPEN / NO-GO**.

No requirement-level design locator is promoted by this update. The next genuine closure event is owner-supplied, versioned design/interface evidence or a documented source-unavailable/clarification decision, reviewed by the design authority.


## Controlled Library catalogue join — Chapter 463 (2026-10-04)

This pass compares the shared contract baselines found in the project Library:
- `EM-DATA-001_Database_Dictionary_ER_Model_v1.docx`, §§4–8 (entity catalogue, key attributes, integrity, index baseline).
- `EM-API-001_OpenAPI_Specification_v1.docx`, §§2–8 (global contract, headers/envelopes/errors, resource and representative endpoint catalogues).
- `EM-EVT-001_Event_Schema_Catalogue_v1.docx`, §§3–8 (standard event envelope, event catalogue, payload and delivery semantics).
- `EM-OPS-Ch463_EPER_Shared_Contract_Specification_v1.docx`, §§8–15 (explicitly states exact Chapter-463 DATA entities/fields, API endpoints/schemas and event IDs/schemas remain OPEN where not evidenced).

### Six-row candidate join

| Requirement / pattern | DATA catalogue candidates | API catalogue candidates | EVENT catalogue candidates | Disposition |
|---|---|---|---|---|
| REQ-46301 / XX01 records & lifecycle | DOC-001/002 (document lifecycle only), WFL-001/002 (workflow lifecycle only); neither establishes procurement object identity | Document create/get/update/archive endpoints; workflow resource is only a generic resource | EVT-DOC-002/003 or EVT-WFL-002/006 are only candidates for those respective domains | **NO EXACT PROCUREMENT DOMAIN JOIN**; authoritative procurement object/model and approved applicability are not in the shared baseline |
| REQ-46302 / XX02 authorization | IAM-001…005 and SEC-001 (principal, role, permission, assignments, policy) | Tenant principals/roles and authorization-policies resources; global server-side RBAC/ABAC contract | EVT-SEC-001 AuthorizationPolicyChanged is a catalogue entry; it is not proof every authorization decision must publish it | **SUPPORTING PLATFORM JOIN**; exact Chapter-463 roles/actions/resources remain open |
| REQ-46303 / XX03 validation | RUL-001/002 RuleSet/RuleSetVersion; candidate domain entity still unconfirmed | Standard 400/422 error semantics; exact procurement command/validation operation not evidenced | EVT-RUL-001 RuleSetPublished records rule publication, not each validation result | **SUPPORTING RULES JOIN**; approved procurement rules and expected outcomes remain open |
| REQ-46304 / XX04 audit | AUD-001 AuditRecord (append-only; actor/action/resource/outcome/time attributes) | Audit resource `/api/v1/tenants/{tenantId}/audit`; representative operations/payload schema require exact locator confirmation | EVT-AUD-001 SecurityActionRecorded is the catalogue-level candidate | **STRONG SHARED-CONTROL CANDIDATE**; exact material-event coverage, payload, retention and approval still open |
| REQ-46305 / XX05 exception & recovery | WFL-001/002, INT-001/002/003, OPS-001/002 (workflow, integration, idempotency, outbox) | Workflow and integration jobs/reconciliation resources; exact recovery commands not evidenced | EVT-WFL-005 WorkflowFailed; EVT-INT-003 IntegrationFailed; EVT-INT-004 IntegrationReconciliationRequired | **SUPPORTING RECOVERY JOIN**; requirement applicability, retry policy, producer/payload and delivery binding remain open |
| REQ-46306 / XX06 reporting | Candidate read-model not specifically defined; DQ-001 is a data-quality issue, not a reporting model | No dedicated governed reporting/analytics endpoint identified in the reviewed representative resource catalogue | EVT-* events may feed consumers but do not define a report-refresh contract | **NO EXACT REPORTING JOIN**; metric catalogue, lineage, freshness, access and endpoint/event remain open |

### What has actually been promoted

- **Catalogue locator promotion:** only the shared catalogue section/entry is recorded as a candidate source reference.
- **Exact requirement-level binding:** 0/6 confirmed as approved. The Chapter 463 shared-contract baseline explicitly keeps exact DATA/API/EVENT bindings open.
- **Approved N/A decisions:** 0/6 evidenced.
- **Contract execution evidence:** not established by the Library catalogue documents.
- **UAT authorization:** NO.

The distinction is deliberate: a catalogue entry existing is not the same as the domain requirement being bound to it. For example, DOC-001 and EVT-DOC-* are valid document-domain catalogue entries, but they do not establish the authoritative procurement requisition/order/receipt/invoice model for REQ-46301.

### Decision-ready blocker list

1. **Design authority + procurement domain owner:** define/identify the authoritative Chapter-463 business objects and lifecycle. Then bind them to exact EM-DATA-001 rows and exact HLD/LLD locators.
2. **API owner:** identify operation IDs/method/path and request/response/error schemas for each applicable requirement; if none applies, record an approved N/A with rationale.
3. **Event owner:** select only events emitted by the authoritative capability; bind event ID/version/payload schema/producer/trigger and delivery semantics, or record approved N/A.
4. **Security owner:** approve exact role/action/resource/tenant matrix for REQ-46302.
5. **Business rules owner:** approve validation rules, boundary examples and observable outcomes for REQ-46303.
6. **Audit/reporting owners:** approve event coverage/retention and report definitions/lineage/freshness respectively.

**Gate disposition remains SRC-003 / G3 OPEN / NO-GO.** This join identifies credible shared-platform candidates and prevents false mappings; it does not manufacture the missing procurement domain contract or approval.


## REQ-46301 domain-model determination (2026-10-04)

### Executable evidence inspected
Source: `eper/chapter-463-pilot-v0.1.0/src/domain.js` (main, blob `fa27a0b699a5ffeb5df3baf51a9b03260ecf9169`).

The pilot `RecordRepository` stores generic records in an in-memory `Map`. Its demonstrated record shape is `id`, `tenantId`, `name`, `version`, and optional `status` defaulting to `ACTIVE`. It enforces tenant access, duplicate-ID rejection and expected-version concurrency on update. It does **not** define procurement-specific object types, relationships, or state transitions; persistence and migrations are not demonstrated.

### Decision: NOT ESTABLISHED
Do not rename the generic `Record` into a procurement object or infer Requisition, PurchaseOrder, GoodsReceipt, SupplierInvoice, Contract, or SourcingEvent as authoritative without a controlled source/owner decision.

The owner decision must establish: (1) in-scope/out-of-scope aggregates; (2) aggregate root, ID/business key, tenant boundary, required attributes, relationships and source of truth; (3) approved lifecycle states/transitions; (4) invariants and duplicate/concurrency/idempotency behavior; (5) exact EM-DATA-001 row, EM-HLD-001 section, EM-LLD-001 module/section and approved version/change reference; (6) applicable API operation and event payload/version/producer/trigger, or separately approved N/A.

Owner response options: **EVIDENCE PROVIDED** (approved source + exact locator/version/approval reference); **SOURCE NOT AVAILABLE** (accountable owner + due date); **CLARIFICATION REQUIRED** (specific unresolved question + decision authority); or **APPROVED MODEL CHANGE** (formal change record).

This is a gap determination, not an approved procurement model. REQ-46301 and SRC-003/G3 remain OPEN/NO-GO; UAT remains unauthorized.
