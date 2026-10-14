# Chapter 463 Procurement Contracts — Controlled Draft

**Status:** DRAFT — NOT APPROVED  
**Prepared:** 2026-10-14  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Baseline constraint:** Preserve the 228 requirements / 38 chapters. This document does not change requirement text, design baselines, approvals, UAT status, or gate status.

## 1. Purpose and evidence boundary

This draft turns the existing procurement catalogue into a reviewable contract-intake package. It deliberately separates catalogue evidence from approved interface definitions.

Source located in the project Library: `EPER_Master_Repository_v57.5.xlsx`:
- `11_Data_Entities`: `ENT-PROC-001`–`ENT-PROC-018`; procurement entities are marked Draft.
- `89_PROC_Object_Catalog`: `PROC-OBJ-001`–`PROC-OBJ-010`; object entries are marked Draft.
- `97_PROC_Lifecycle_States`: procurement lifecycle transitions; entries are marked Draft.
- `103_PROC_API_Catalog`: procurement operations; entries are marked Draft.

The repository implementation registry at `eper/contracts/index.ts` currently supplies DATA/API/EVENT descriptor IDs and a `v1` label. It does not define field-level data schemas, OpenAPI request/response/error schemas, event payloads, compatibility guarantees, or approval metadata. These IDs remain implementation registry identifiers, not approved contracts.

## 2. Requirement-to-contract intake matrix

| Requirement | SRS / TRC | Existing catalogue candidates (Draft only) | Contract specification required | Current disposition |
|---|---|---|---|---|
| REQ-46301 | SRS-FR-2323 / TRC-46301 | `ENT-PROC-009` Purchase Requisition; `ENT-PROC-010` Purchase Requisition Line; `ENT-PROC-011` Purchase Order; `ENT-PROC-012` Purchase Order Line; object candidates `PROC-OBJ-006`–`PROC-OBJ-009` | Confirm authoritative aggregates, attributes, relationships, lifecycle/history, ownership, persistence, concurrency and migration; identify exact API operations and lifecycle events | DRAFT CANDIDATES — DOMAIN OWNER REVIEW REQUIRED |
| REQ-46302 | SRS-FR-2324 / TRC-46302 | Shared identity/permission catalogue may support policy design; no approved procurement-specific role/action/resource matrix established by this intake | Versioned actor × action × resource × tenant policy, separation-of-duties rules, denial/error semantics, and audit side effects | OPEN — SECURITY/DOMAIN APPROVAL REQUIRED |
| REQ-46303 | SRS-FR-2325 / TRC-46303 | Draft procurement object and lifecycle catalogues | Versioned rule catalogue with rule ID, applicability, effective version, input constraints, boundary examples, deterministic outcomes, error codes and transaction behavior | OPEN — BUSINESS RULES APPROVAL REQUIRED |
| REQ-46304 | SRS-FR-2326 / TRC-46304 | Shared audit catalogue candidates exist; no approved Chapter-463 material-event binding established | Audit schema, event coverage, actor/resource/outcome/time/provenance fields, integrity model, access, retention and retrieval API | OPEN — AUDIT CONTROL APPROVAL REQUIRED |
| REQ-46305 | SRS-FR-2327 / TRC-46305 | Draft exception/workflow/integration catalogue candidates | Exception taxonomy, idempotency key scope, retry/backoff/exhaustion, replay, compensation, escalation, terminal states, and operational ownership | OPEN — OPERATIONS/DOMAIN APPROVAL REQUIRED |
| REQ-46306 | SRS-FR-2328 / TRC-46306 | Draft procurement analytics/KPI API candidates include `API-PROC-024` Query KPIs; KPI entries are not approved by this intake | Report catalogue, formula/aggregation, source lineage, tenant/access scope, freshness/SLA, pagination, refresh trigger/event and reconciliation | OPEN — REPORTING OWNER APPROVAL REQUIRED |

Candidate entity/API IDs above are search leads, not final joins. Do not bind them to requirements solely because their names appear relevant.

## 3. Minimum specification required for each contract

### DATA contract
For each approved entity/schema: stable ID and semantic name; schema version; field name/type/requiredness/nullability/constraints; primary and business keys; relationships/cardinality; tenant scope; owner/steward; source of truth; persistence and retention; audit fields; migration and backward-compatibility rules; examples; validation tests.

### API contract
For each approved operation: stable operation ID; method/path; schema version; authenticated principal and authorization policy; path/query/header/body schemas; response schemas; HTTP status and domain-error catalogue; idempotency and optimistic-concurrency behavior; transaction/side-effect boundaries; pagination; rate/size limits; examples; contract tests.

### EVENT contract
For each applicable event: stable event ID and version; envelope and payload schema; producer, consumer and trigger; correlation/causation and tenant identifiers; ordering and delivery guarantee; retry/dead-letter/replay behavior; deduplication/idempotency; compatibility and retention rules; example payload; contract tests.

An interface type may be marked N/A only through a separately approved, reasoned decision. Missing information is not N/A.

## 4. Required governance fields

Each promoted contract and each requirement binding must record:
- exact artifact path/name and version or immutable commit;
- stable section/heading/row/schema/operation/event locator;
- REQ/SRS/TRC binding and explicit HLD-to-LLD pairing;
- source owner and approval authority;
- approval/change reference and effective date;
- reviewer decision and evidence link;
- compatibility/deprecation policy.

Until those fields are verified, the status must remain DRAFT or OPEN.

## 5. Validation and promotion rules

1. Validate schema syntax and reject duplicate or unresolved identifiers.
2. Test valid, invalid, boundary, tenant-isolation, authorization-denial, idempotency and compatibility cases where applicable.
3. Keep automated contract-test results separate from owner-approved business acceptance oracles.
4. Promote only individually evidenced requirement rows; do not infer approval from a green CI run or a catalogue label.
5. Reconcile the six rows to the existing controlled crosswalk and G9 workbook; do not create a parallel source of truth.

## 6. Gate status — unchanged

- Existing procurement catalogue source candidates located: YES.
- Catalogue entries confirmed approved in the retrieved evidence: NO — entries are marked Draft.
- Approved requirement-level HLD/LLD bindings: NOT EVIDENCED.
- Complete approved DATA/API/EVENT contracts or approved N/A decisions: NOT EVIDENCED.
- Business UAT: NOT EXECUTED.
- SRC-003 / G3: OPEN / NO-GO.
- G9 traceability freeze: NOT FROZEN.

**This is a controlled draft for review, not a baseline, approval, or UAT authorization.**
