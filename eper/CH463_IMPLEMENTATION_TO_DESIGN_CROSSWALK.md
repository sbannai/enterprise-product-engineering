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
