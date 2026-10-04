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


## REQ-46302–REQ-46306 executable evidence audit (2026-10-04)

This is an implementation/test audit, not a business-rule or design approval.

| Requirement | Positive/negative behavior directly supported by source/test | What the executable evidence does not establish | Disposition |
|---|---|---|---|
| REQ-46302 / SRS-FR-2324 | Required tenant/principal/action/resource context; tenant-scoped policy matching; explicit DENY takes precedence over ALLOW; no matching ALLOW defaults to DENY. Wave-01 test exercises conflicting ALLOW+DENY and default-deny. | Approved business role/action/resource matrix, policy persistence/administration, authenticated identity provenance, authorization decision event contract, API middleware enforcement across all entry points. | **CODE PATH TESTED; GOVERNANCE / END-TO-END ENFORCEMENT OPEN** |
| REQ-46303 / SRS-FR-2325 | Rule ID and evaluator required; duplicate rule IDs rejected; each registered evaluator runs; ERROR severity makes result invalid; Wave-01 tests amount > 0 and amount = 0. | Procurement-specific approved rule set, version/effective-date handling, boundary/precision/currency rules, authorization of rule changes, domain-specific oracle approval. The amount rule is a test fixture, not a source-approved procurement rule. | **GENERIC VALIDATION TESTED; BUSINESS RULE BASELINE OPEN** |
| REQ-46304 / SRS-FR-2326 | Required audit context and parseable timestamp; duplicate tenant-scoped ID rejected; JSON payload cloned; SHA-256 integrity hash computed/verified; tenant-scoped retrieval/list; Wave-01 tests hash shape and tenant isolation. | Durable/immutable storage, key management or trusted timestamp, retention/legal hold, append-only enforcement outside the process, export/retrieval authorization, approved material-event coverage and retention policy. SHA-256 over stored content alone does not prove tamper-proof storage. | **IN-PROCESS INTEGRITY TESTED; AUDIT CONTROL BASELINE OPEN** |
| REQ-46305 / SRS-FR-2327 | Exception context required; idempotency key is tenant-scoped and request-fingerprinted; conflicting reuse rejected; transitions validated; retryCount increments when entering RETRYING; Wave-01 tests create→retry→resolve and rejects retry after RESOLVED. | Actual retry scheduler/backoff, durable transactional state, lease/locking under concurrent requests, downstream compensation, DLQ, escalation notification, retry exhaustion policy and approved terminal-state policy. A state labelled RETRYING is not proof a retry was executed. | **STATE-MACHINE TESTED; OPERATIONAL RECOVERY OPEN** |
| REQ-46306 / SRS-FR-2328 | Reporting context and provenance required; tenant/report scoped query; exact-value filters; positive integer limit; Wave-01 tests publish/query and cross-tenant isolation. | Approved report catalogue/metric formulas, aggregation and pagination semantics, freshness/SLA, lineage validation against source records, report access policy, persisted read model and refresh scheduling/events. | **BASIC QUERY TESTED; GOVERNED REPORTING BASELINE OPEN** |

### Evidence interpretation

The existing `eper/tests/requirement-acceptance-wave-01.test.mjs` exercises these six requirement IDs and meaningful positive/negative cases. The Chapter 463 wave report still classifies CI, defect/retest, UAT, release, production, final acceptance and traceability freeze as pending. The wave's generic acceptance criteria are not a substitute for approved procurement-specific expected outcomes.

### Exit blockers after this code audit

1. **REQ-46302:** approved security matrix and evidence that authorization is enforced at all material-action boundaries.
2. **REQ-46303:** approved domain rule catalogue with versioned rules and measurable procurement-specific boundary examples.
3. **REQ-46304:** approved audit event catalogue, retention/integrity control design and evidence for the actual storage/operational control.
4. **REQ-46305:** approved recovery policy plus executable scheduler/retry/DLQ/escalation integration evidence, or explicitly scoped approved N/A.
5. **REQ-46306:** approved report/metric catalogue, lineage/freshness/access contract and execution evidence.
6. **All five:** exact approved HLD/LLD locators and DATA/API/EVENT joins or owner-approved N/A decisions; then authorized business UAT and recorded disposition.

No source code or test fixture has been promoted into an approved business rule or signed-off design. REQ-46302–REQ-46306 remain technically exercised in the pilot, but business UAT/final acceptance is not evidenced. SRC-003/G3 remains OPEN/NO-GO.
