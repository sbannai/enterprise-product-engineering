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

## 7. Domain source precedence — controlled update (2026-10-15)

The earlier source-recovery discussion in this draft is superseded on the domain-label question by the approved decision `B01-CH463-SOURCE-CORRECTION-DECISION-001` (Option A, approved 2026-10-12): **Volume XIII, Chapter 463 — Enterprise Procurement & Source-to-Pay is the canonical domain source.** Do not reopen the domain choice as an unresolved two-way conflict.

This decision does not itself reissue the legacy `EM-BRD-001` Chapter 463 heading, approve the procurement catalogue entries, or complete requirement-level design/contract mappings. The procurement catalogue sections identified above remain Draft unless a separate controlled source proves otherwise. The correction candidate is not the approved final baseline.

For REQ-46301–REQ-46306, continue to require exact approved source locators and HLD→LLD bindings, DATA/API/EVENT specifications or separately approved N/A decisions, measurable requirement-level acceptance oracles, and applicable owner approval references. Do not infer these from implementation behavior or the source-precedence decision.

**Disposition:** domain identity = RESOLVED BY APPROVED OPTION A; requirement-level contract promotion = OPEN; SRC-003/G3 = OPEN / NO-GO; Business UAT = NOT AUTHORIZED / NOT EXECUTED; G9 = NOT FROZEN.

## 8. Catalogue locator precision — 2026-10-15

The controlled Library search returned these exact catalogue positions in `EPER_Master_Repository_v57.5.xlsx`:

| Source sheet | Row index (as surfaced by source extraction) | IDs | Catalogue meaning | Authority status |
|---|---:|---|---|---|
| `11_Data_Entities` | 39–42 | `ENT-PROC-009`–`ENT-PROC-012` | Purchase Requisition, Purchase Requisition Line, Purchase Order, Purchase Order Line | Draft |
| `89_PROC_Object_Catalog` | 5–8 | `PROC-OBJ-006`–`PROC-OBJ-009` | Purchase Requisition, Purchase Order, Procurement Agreement, Procurement Match | Draft |

These are catalogue lookup locators, not page numbers and not approved contract bindings. The two catalogues are not one-to-one equivalent: in particular, `PROC-OBJ-008` is Procurement Agreement while the entity list's `ENT-PROC-011` is Purchase Order. Do not imply identical entity/object IDs or relationships.

For REQ-46301, these entries may be cited as candidate sources for review only. The controlled requirement-level join still needs the approved procurement domain model, exact field/relationship/lifecycle locators, HLD→LLD pairing, and API/event contract mapping or separately approved N/A. All entries shown here remain Draft.

## 9. Existing event-candidate reconciliation — 2026-10-15

The controlled workbook `EM-OPS_463-500_DATA_API_EVENT_Requirement_Reconciliation_v1.xlsx` contains one requirement row per Chapter 463 requirement (worksheet extraction surfaced zero-based indices 0–5). It identifies the following **pattern-level event candidates**, with every row explicitly marked “NOT REQUIREMENT-LEVEL PROMOTED”:

| Requirement | SRS | Candidate event IDs from reconciliation workbook | Promotion state |
|---|---|---|---|
| REQ-46301 | SRS-FR-2323 | EVT-DOC-001, EVT-DOC-002, EVT-DOC-003 | Candidate only |
| REQ-46302 | SRS-FR-2324 | EVT-TEN-001, EVT-TEN-002, EVT-TEN-003, EVT-SEC-001 | Candidate only |
| REQ-46303 | SRS-FR-2325 | EVT-RUL-001 | Candidate only |
| REQ-46304 | SRS-FR-2326 | EVT-AUD-001 | Candidate only |
| REQ-46305 | SRS-FR-2327 | EVT-WFL-001–EVT-WFL-007, EVT-INT-001–EVT-INT-004, EVT-CFG-001 | Candidate only |
| REQ-46306 | SRS-FR-2328 | EVT-NOT-001, EVT-NOT-002, EVT-NOT-003 | Candidate only |

**Source:** `EM-OPS_463-500_DATA_API_EVENT_Requirement_Reconciliation_v1.xlsx`, requirement reconciliation rows for REQ-46301–REQ-46306; DATA/API/EVENT source columns identify EM-DATA-001, EM-API-001 and EM-EVT-001. The workbook states that event version/producer/consumer/delivery semantics are source-defined at baseline level, but execution/contract-test evidence is not established and requirement-level promotion remains open.

This table records existing source evidence only. It does not establish that any candidate is applicable to the procurement requirement, does not approve an event binding, and does not invent a producer, payload, trigger or delivery rule. Promotion requires exact EM-EVT-001 locator plus approved requirement mapping, producer/consumer and payload/version semantics, or a separately approved N/A decision.

## 10. API baseline versus requirement-level operations — 2026-10-15

The controlled reconciliation workbook `EM-OPS_463-500_DATA_API_EVENT_Requirement_Reconciliation_v1.xlsx` confirms that the shared API baseline exists in `EM-API-001` and identifies global conventions including `/api/v1`, security, resources/endpoints, error semantics, idempotency, concurrency and versioning. This establishes **baseline availability**, not the six Chapter 463 operation bindings.

The existing `EM-API-001_OpenAPI_Specification_v1.docx` describes shared API conventions and representative platform resources. Its presence does not prove that procurement-specific operations for REQ-46301–REQ-46306 are approved or present in the OpenAPI catalogue. The procurement API catalogue in `EPER_Master_Repository_v57.5.xlsx` is marked Draft; `API-PROC-024` (Query KPIs) is only a candidate for REQ-46306 and is not approved by this intake.

| Requirement | Current API evidence | Required controlled join |
|---|---|---|
| REQ-46301 | EM-API-001 shared baseline; draft procurement API catalogue | Approved operation ID/method/path, request/response/error schemas, authorization, lifecycle/concurrency and exact locator |
| REQ-46302 | Shared API security conventions | Approved actor × action × resource × tenant policy and exact operation or approved N/A |
| REQ-46303 | Shared validation/error conventions | Approved procurement command/operation, rule version, measurable outcomes and typed errors |
| REQ-46304 | Shared audit resource/conventions | Approved audit retrieval/append operation, field disclosure, filters and retention/integrity binding |
| REQ-46305 | Shared workflow/integration patterns | Approved recovery/exception operations, idempotency/retry/transition semantics |
| REQ-46306 | Draft candidate `API-PROC-024` Query KPIs | Approved report catalogue, KPI formulas, lineage/freshness, access/filter/pagination contract |

**Disposition:** API baseline = FOUND; Chapter 463 requirement-level API bindings = NOT PROMOTED; draft catalogue entries remain unapproved. Do not invent paths or operation IDs to fill the gap. For each row, record the exact approved EM-API-001 extension/catalogue locator and change/approval reference, or a separately approved N/A decision.

## 11. DATA baseline versus procurement entity bindings — 2026-10-15

The controlled reconciliation workbook confirms that `EM-DATA-001` exists as the shared database dictionary/logical ER baseline and that the baseline covers entity ownership, tenancy, keys, relationships, integrity and indexes. The same workbook explicitly requires exact entity/schema/owner validation per requirement; baseline existence alone does not prove an applicable binding or implementation.

For procurement, the catalogue candidates captured in §8 are draft entries only:
- `ENT-PROC-009` Purchase Requisition
- `ENT-PROC-010` Purchase Requisition Line
- `ENT-PROC-011` Purchase Order
- `ENT-PROC-012` Purchase Order Line

These entity labels do not establish physical/logical schema names, field definitions, keys, cardinality, lifecycle constraints, tenancy, ownership, or requirement applicability. The similarly numbered `PROC-OBJ-006`–`PROC-OBJ-009` entries are business-object catalogue items and must not be substituted for entity IDs.

| Requirement | DATA evidence currently established | Missing before promotion |
|---|---|---|
| REQ-46301 | EM-DATA-001 baseline exists; draft procurement entity candidates identified | Approved domain-model locator; exact entity/field/key/relationship/owner binding or approved N/A |
| REQ-46302 | Shared tenancy/ownership baseline exists | Exact actor/tenant data scope and policy attributes tied to approved schema |
| REQ-46303 | Shared integrity/validation baseline exists | Approved procurement rule fields, constraints, and measurable rule oracles |
| REQ-46304 | Shared audit-data baseline exists | Exact audit entity/schema, protected fields, retention/integrity controls and locator |
| REQ-46305 | Shared workflow/data-integrity baseline exists | Exact exception/workflow state model, transitions, idempotency/replay state and ownership |
| REQ-46306 | Shared reporting/index baseline exists | Approved KPI/read model, source lineage, refresh/freshness and access/filter definitions |

**Disposition:** DATA baseline = FOUND; Chapter 463 requirement-level DATA bindings = NOT PROMOTED. Do not invent table names or schema fields. Promote only from the approved procurement model with exact locators, version/effective date and owner/approval reference, or an explicitly approved N/A decision.

## 12. Audit contract baseline and requirement-level gaps — 2026-10-15

The controlled source `EM-OPS-Ch463_EPER_Shared_Contract_Specification_v1.docx`, §9 (Audit Contract), establishes shared baseline principles: material actions/events preserve applicable actor, tenant, action, resource, timestamp, correlation and outcome context; audit evidence is protected and append-oriented; retrieval/export is governed by authorization and classification. It explicitly leaves exact audit entity/schema and retention values open until approved requirement-level DATA/API contracts exist.

For `REQ-46304` / `SRS-FR-2326`, this is supporting design evidence, not a complete acceptance contract. The following remain unbound and must not be inferred:
- exact audit entity and schema/field names, including immutable/append-only guarantees;
- retention duration, legal hold, deletion/expiry and integrity verification requirements;
- authorized roles, classification, query filters and export/redaction rules;
- exact API operation and request/response/error schema;
- exact event name, payload/version, producer/consumer and trigger, or an approved N/A;
- measurable acceptance oracle and execution/contract-test evidence.

**Disposition:** shared audit contract baseline = FOUND; requirement-level audit binding = OPEN / NOT PROMOTED. No retention period, role, endpoint, event ID or test result is asserted by this section. Promotion requires exact approved source locators and the applicable owner/change-control reference.

## 13. Workflow and exception contract evidence — 2026-10-15

The controlled source `EM-OPS-Ch463_EPER_Shared_Contract_Specification_v1.docx`, §7 (Workflow / Exception Contract), establishes shared design principles: workflow owns process orchestration; exceptions follow approved error, disposition, escalation and recovery behaviour; retry/replay/reconciliation apply only where the approved requirement/design requires them; material exception outcomes are auditable. The same source maps `REQ-46305 / SRS-FR-2327` to Workflow + Rules + Exception/Recovery + applicable Event/Integration.

The reconciliation workbook lists pattern-level candidates for REQ-46305 (`EVT-WFL-001`–`EVT-WFL-007`, `EVT-INT-001`–`EVT-INT-004`, `EVT-CFG-001`) but marks event mapping as not requirement-level promoted. These IDs are not accepted here as approved procurement events.

Still required for REQ-46305:
- approved procurement workflow/state model and transition preconditions;
- approved exception taxonomy, disposition/escalation owners and recovery rules;
- explicit applicability and parameters for retry, replay, reconciliation and idempotency;
- exact DATA/API/EVENT locators and payload/version/producer/consumer details, or approved N/A for each non-applicable layer;
- measurable acceptance oracles and executed contract/implementation evidence.

**Disposition:** shared workflow/exception baseline = FOUND; requirement-level procurement workflow contract = OPEN / NOT PROMOTED. No retry count, delay, state transition, event binding or owner is inferred from the shared pattern.

## 14. KPI/read-model API candidate qualification — 2026-10-15

The controlled master repository's `103_PROC_API_Catalog` lists `API-PROC-024` as:
- method/path: `GET /api/v1/procurement/analytics/kpis`
- description: Query KPIs
- permission label: `procurement:analytics`
- catalogue status: `Draft`

This exact catalogue entry is useful for locating a candidate interface, but it is **not an approved API contract**. The catalogue status must not be overwritten by this intake or treated as permission approval.

For REQ-46306 / SRS-FR-2328, before promotion the controlled contract must confirm the applicable KPI definitions/formulas, dimensions and filters, tenant/organization scope, response schema, pagination/limits, freshness/refresh semantics, source lineage, authorization policy, error behaviour and an exact approved OpenAPI locator/version. Any unused operation or contract layer requires an explicit approved N/A decision.

**Disposition:** `API-PROC-024` identified at its source catalogue row as a Draft candidate; REQ-46306 API binding remains OPEN / NOT PROMOTED. No KPI formula, freshness target or report acceptance threshold is inferred here.

## 15. Reporting/read-model evidence — REQ-46306 — 2026-10-15

The controlled shared contract specification, §11 (Reporting / Search Contract), establishes the general design boundary: reporting consumes governed derived/read representations; applicable tenant/organization filtering and authorization apply; search uses derived searchable representations rather than uncontrolled direct access to authoritative stores. It also explicitly leaves report definitions, metrics, freshness, lineage and export rules to approved requirement-specific contracts.

For REQ-46306 / SRS-FR-2328, this baseline is supporting design, not an acceptance oracle. Before promotion, the controlled requirement-level contract must identify:
1. The approved KPI/report catalogue and version, with each metric's definition and formula.
2. The authoritative source and derivation/lineage for each metric, including treatment of late, missing or corrected source records.
3. Refresh/freshness expectations and the rule for communicating stale or incomplete results.
4. Approved dimensions, filters, pagination/limits, tenant/organization isolation and authorization.
5. Response schema, error semantics and export behaviour, or an explicit approved N/A where export is not applicable.
6. A measurable expected-result oracle and executed contract/implementation evidence.

`API-PROC-024` remains a Draft catalogue candidate only (see §14). No metric formula, freshness threshold, filter list, export permission or acceptance result is created by this entry.

**Disposition:** shared reporting/read-model principles = FOUND; approved procurement KPI definitions and requirement-level report/API binding = OPEN / NOT PROMOTED.

## 16. Identity, tenant and authorization contract evidence — REQ-46302 — 2026-10-15

The controlled `EM-OPS-Ch463_EPER_Shared_Contract_Specification_v1.docx`, §§3–5, establishes shared identity and authorization principles: authenticated principal context is authoritative; tenant context is established server-side; tenant/organizational scope propagates to applicable operations; cross-tenant access is prevented at the authorization/data-access boundary; decisions evaluate principal, scope, action and target resource. It explicitly says exact roles, permissions, policy identifiers and resource names are requirement-specific inputs and must not be invented.

For REQ-46302 / SRS-FR-2324, these shared principles are supporting design only. Before requirement-level promotion, the controlled source must establish the approved procurement actor/role set, action/resource matrix, tenant and organizational scoping attributes, separation-of-duties constraints where applicable, policy IDs/version, denial/error outcomes, and exact DATA/API locators or approved N/A decisions. Measurable negative tests must demonstrate that unauthorized and cross-tenant access is rejected; no such execution evidence is claimed here.

**Disposition:** shared identity/tenant/authorization baseline = FOUND; procurement-specific policy and exact contract binding = OPEN / NOT PROMOTED. This entry does not approve a role, permission, policy identifier or acceptance result.

## 17. Domain rule and validation contract evidence — REQ-46303 — 2026-10-15

The controlled `EM-OPS-Ch463_EPER_Shared_Contract_Specification_v1.docx`, §6 (Application / Domain / Rules Contract), establishes that application services orchestrate approved use cases, domain components enforce authoritative business invariants and lifecycle/state transitions, reusable rules/decision components hold validations, and material state changes occur only after applicable validation and authorization conditions pass. The source maps REQ-46303 / XX03 to Application Service + Domain + Rules/Validation.

The reconciliation workbook identifies `EVT-RUL-001` as a pattern-level event candidate for REQ-46303, but marks it NOT REQUIREMENT-LEVEL PROMOTED. It does not establish a procurement validation event or a business rule.

Before promoting REQ-46303 / SRS-FR-2325, the approved procurement source must provide the exact rule catalogue/version, rule identifier and owner, triggering operation/state, input fields and preconditions, deterministic outcome/error mapping, side effects and event applicability, plus measurable positive/negative acceptance examples. Where DATA/API/EVENT is not applicable, record a controlled approved N/A rather than leaving implicit assumptions.

**Disposition:** shared domain/rules principles = FOUND; procurement-specific rule IDs, predicates and acceptance oracles = OPEN / NOT PROMOTED. No purchase-order, requisition, supplier, approval-limit or matching rule is invented here.

## 18. Six-requirement promotion gate summary — 2026-10-15

This summary consolidates the evidence gaps documented in §§8–17. It is a status index, not an approval or closure certificate.

| Requirement | DATA binding | API binding | EVENT binding | Business oracle | Current promotion disposition |
|---|---|---|---|---|---|
| REQ-46301 | Draft entity candidates; exact approved schema/relationships absent | Shared baseline; exact operation unpromoted | EVT-DOC candidates only | Not established | BLOCKED |
| REQ-46302 | Exact policy/data-scope attributes unbound | Shared security baseline; exact operation/policy unpromoted | EVT-TEN/SEC candidates only | Negative cross-tenant/authorization oracle not approved/executed | BLOCKED |
| REQ-46303 | Rule fields/constraints unbound | Exact validation operation unpromoted | EVT-RUL-001 candidate only | Rule predicates and measurable outcomes not approved | BLOCKED |
| REQ-46304 | Audit schema/retention unbound | Exact audit operation unpromoted | EVT-AUD-001 candidate only | Retention/integrity/retrieval oracle not approved | BLOCKED |
| REQ-46305 | Workflow/exception state schema unbound | Recovery/disposition operations unpromoted | WFL/INT/CFG candidates only | State transitions and recovery parameters not approved | BLOCKED |
| REQ-46306 | Approved KPI/read-model lineage absent | API-PROC-024 is Draft only | EVT-NOT candidates only | KPI formulas/freshness/filter oracles not approved | BLOCKED |

**Promotion rule:** a row may move beyond BLOCKED only when its applicable DATA, API and EVENT layers each have an exact approved source locator and approval reference, or a controlled approved N/A decision; exact HLD→LLD binding; a measurable approved business oracle; and required contract/implementation execution evidence. Source-baseline existence, candidate IDs, code-level tests or simulated UAT alone do not satisfy this rule.

**Current aggregate:** 0/6 requirements promoted to approved requirement-level contract closure by this intake; 0/6 business acceptance closures claimed. This is not a statement that no source baselines or technical checks exist. Business UAT remains NOT AUTHORIZED / NOT EXECUTED; SRC-003 remains OPEN / P0 / NO-GO; PR #148 remains draft.
