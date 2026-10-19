# Chapter 463 — Source Verification and Contract Promotion Disposition

**Document ID:** EPER-B01-CH463-SOURCE-VERIFY-002  
**As of:** 2026-10-19  
**Disposition:** SOURCE ROWS VERIFIED AS CANDIDATES ONLY — NOT APPROVED  
**Baseline:** Option A; 228 requirements / 38 chapters; existing IDs unchanged  
**Evidence input:** Library artifact `B01_CH463_UAT_Evidence_Readiness_v1.0_source_verification.xlsx`, tab “Source Verification 2026-10-18” and tab “2026-10-18 Candidate Map”; existing Chapter 463 source-intake and traceability recovery records.

## 1. What source verification establishes

The source-verification record identifies concrete procurement catalogue rows, but records them as Draft or initial baselines. The evidence does **not** authorize promotion to approved requirement-level contracts.

| Requirement | Candidate DATA source | Candidate API source | Candidate lifecycle / authority | Candidate event source | Promotion blocker |
|---|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | `ENT-PROC-009` Purchase Requisition; `ENT-PROC-010` Purchase Requisition Line; `PROC-OBJ-006–009` | `API-PROC-009` create requisition; `API-PROC-010` submit requisition; candidate contract rows `CON-PROC-009–011` | `LC-PROC-007–009`; `AUTH-PROC-007` | `EVT-PROC-007` PurchaseRequisitionSubmitted; lifecycle uses candidate name RequisitionSubmitted | All source rows Draft; no approved field-level schema, exact HLD→LLD pair, approved lifecycle/oracle, approved API/event payload or approved N/A |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Tenant/principal/role model and procurement resource join not established as approved | Protected operations likely include requisition APIs; exact authorization/error contract not established | `AUTH-PROC-007`; `AUTH-PROC-008`; `SOD-PROC-006` | Authorization audit-event applicability and schema unresolved | Approved role×action×resource×tenant/delegation/SoD matrix and exact design/API binding missing; do not assume draft policy is approved |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | `ENT-PROC-009/010` requisition model; field schema pending | `API-PROC-009–011` create/submit/decision; `CON-PROC-009–011` | `LC-PROC-007–013`; `AUTH-PROC-007` | `EVT-PROC-007/008` candidates; lifecycle names differ | Approved required-field catalogue, thresholds, state guards, negative examples and deterministic acceptance oracle missing |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | `PROC-OBJ-006–010` and shared audit model candidates | Platform audit retrieval example exists, but exact procurement audit operation not established | Material-event and retention rules unresolved | `EVT-PROC-007–012` candidates where applicable | Approved material-event list, actor/tenant/action/resource/time/correlation/outcome fields, integrity, retention and retrieval policy missing |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | `ENT-PROC-018` Procurement Exception and `PROC-OBJ-009` Procurement Match are candidates; broader exception relation unresolved | `API-PROC-020/021` match evaluate/decision and `API-PROC-012–017` PO operations are candidates | `LC-PROC-014/015` describe procurement-match exception examples; general exception policy unresolved | Decision/dispatched event candidates; replay/deduplication/compensation unresolved | Approved exception scope/taxonomy, retry/backoff/exhaustion, idempotency, replay, compensation, dead-letter/escalation and terminal-state policy missing |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | `ENT-PROC-017` Supplier Scorecard; `PROC-OBJ-010` Supplier Scorecard candidates | `API-PROC-024` Query KPIs; candidate `GET /api/v1/procurement/analytics/kpis` | Lifecycle/reporting freshness and reconciliation rules unresolved | `EVT-PROC-012` ProcurementFulfilmentChanged candidate; applicability unresolved | Approved KPI catalogue/formulas, lineage, freshness, reconciliation, filters, access/tenant scope and refresh/event decision missing |

## 2. Controlled source status

| Source | Observed source status | Permitted use now |
|---|---|---|
| `EPER_Master_Repository_v57.5.xlsx`, tab `11_Data_Entities`, rows `ENT-PROC-009–013` and `ENT-PROC-017–018` | Procurement domain row `DOM-PRC` and inspected procurement entities marked Draft | Candidate entity locator only; not an approved schema or requirement binding |
| Same workbook, tab `89_PROC_Object_Catalog`, `PROC-OBJ-001–010` | Draft | Candidate object locator only |
| Same workbook, tab `97_PROC_Lifecycle_States`, `LC-PROC-007–015` | Draft | Candidate lifecycle rows only; no approved state machine |
| Same workbook, tab `103_PROC_API_Catalog`, `API-PROC-009–024` and tab `104_PROC_API_Contracts`, `CON-PROC-009–017` | Draft; contract rows summarize behavior but lack concrete JSON schemas | Candidate API operation leads only; not approved OpenAPI contracts |
| Same workbook, tab `112_PROC_Approval_Authority`, `AUTH-PROC-007/008`; tab `113_PROC_SoD_Matrix`, `SOD-PROC-006` | Draft | Candidate authority/SoD leads only; do not infer thresholds, actors or self-approval rules |
| Same workbook, tab `100_PROC_Domain_Events`, `EVT-PROC-007–012` | Draft; payload/publisher bindings not evidenced | Candidate event names only; naming reconciliation required |
| `EM-DATA-001_Database_Dictionary_ER_Model_v1.docx` | INITIAL DATA DESIGN BASELINE | Generic platform context only until exact approved procurement schema locator is evidenced |
| `EM-API-001_OpenAPI_Specification_v1.docx` | INITIAL BUILD-READY CONTRACT BASELINE | Common `/api/v1`, auth, tenant, correlation and idempotency conventions are context, not proof of approved procurement operations |
| `EM-EVT-001_Event_Schema_Catalogue_v1.docx` | INITIAL BUILD-READY EVENT BASELINE | Common event-envelope/governance context, not proof of procurement event payloads |
| `EM-HLD-001_Consolidated_HLD_Chapters_463-500_v1.0.docx` and `EM-LLD-001_Consolidated_LLD_Chapters_463-500_v1.0` | Supporting architecture sections/components identified; exact approved requirement-level pair not evidenced | Supporting locators only; no exact pair promotion |

## 3. Event-name reconciliation queue

Do not treat similarly named events as aliases without a controlled mapping decision.

| Topic | Catalogue candidate | Lifecycle candidate | Required disposition |
|---|---|---|---|
| Requisition submission | `PurchaseRequisitionSubmitted` (`EVT-PROC-007`) | `RequisitionSubmitted` | Approve canonical name, producer, schema version, payload, transaction/outbox behavior and consumers; or approved N/A |
| Requisition decision | `PurchaseRequisitionApproved` (`EVT-PROC-008`) | `RequisitionDecisionRecorded` | Determine whether approval-only and decision-recorded are distinct semantics; approve mapping/schema |
| Purchase-order decision | `PurchaseOrderApproved` (`EVT-PROC-009`) | `PurchaseOrderDecisionRecorded` | Approve semantics, producer and payload mapping |
| Purchase-order fulfilment | `ProcurementFulfilmentChanged` (`EVT-PROC-012`) | `PurchaseOrderFulfilmentChanged` | Approve canonical name and source-of-truth/consumer mapping |
| Dispatch/change | `PurchaseOrderDispatched` / `PurchaseOrderChanged` (`EVT-PROC-010/011`) | Lifecycle candidates include `PurchaseOrderDispatched` | Confirm whether shared event definitions are identical and version-compatible |

## 4. HLD→LLD and approval rule

The Library's `B01_CH463_AUTHORITATIVE_HLD_LLD_SOURCE_INTAKE_v0.1.docx` explicitly says it is an intake template and no source receipt is claimed. It records all six HLD and LLD exact locators as NOT CAPTURED. The controlled recovery matrix records HLD and LLD component references as SUPPORTING only and states that exact requirement-level relationships and approval/baseline evidence remain open.

Therefore:
- Exact approved HLD→LLD pairs remain **0/6**.
- Full approved DATA/API/EVENT contracts or explicitly approved N/A decisions remain **0/18** verified.
- Approved measurable acceptance oracles remain **0/6**.
- The source catalogue discovery is useful progress, but it does not itself close a governance gate.

## 5. Next actions — no business owner re-choosing Option A

1. Identify the actual approved/superseding procurement source baseline and its design-authority approval reference, effective date and controlled version.
2. Capture the exact requirement-to-HLD and HLD-to-LLD locators for each of the six existing IDs; keep the architecture anchors as SUPPORTING until an approved crosswalk proves the pair.
3. For every DATA/API/EVENT slot, cite the exact approved schema/operation/event definition or record a separately approved N/A with rationale.
4. Reconcile event names and producers before writing payload schemas.
5. Approve six measurable acceptance oracles and their test fixtures, actor/tenant, positive/negative paths and evidence capture.
6. Re-run CI on the exact changed commit after any subsequent source or test edits.
7. Keep the six cases NOT_RUN and Business UAT NOT AUTHORIZED until technical preflight and separate D10 authorization are evidenced.

**Disposition:** This file is a source-verification and non-promotion record, not a contract approval. Option A remains fixed as Volume XIII, Chapter 463 — Enterprise Procurement & Source-to-Pay. No requirement IDs change. No merge, deployment, paid AWS provisioning, G9 freeze, G10 issuance or Business UAT authorization is implied.
