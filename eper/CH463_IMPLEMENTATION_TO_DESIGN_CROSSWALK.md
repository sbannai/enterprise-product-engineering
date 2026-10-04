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
