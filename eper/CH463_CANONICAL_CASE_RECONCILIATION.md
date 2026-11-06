# Chapter 463 — Canonical B01 Case Reconciliation

**Document ID:** EPER-B01-CH463-CASE-RECONCILIATION-001  
**As of:** 2026-10-19  
**Status:** RECONCILIATION ONLY — NO CASE APPROVAL OR EXECUTION  
**Baseline:** Option A; 228 requirements / 38 chapters unchanged.

## 1. Canonical records take precedence

The repository already contains the canonical B01 requirement-level case and execution registers:
- `eper/uat/B01_DRAFT_REQUIREMENT_LEVEL_TEST_CASES.csv`
- `eper/uat/B01_REQUIREMENT_CASE_GAP_REGISTER.csv`
- `eper/uat/EPER_228_BUSINESS_UAT_EXECUTION_CAPTURE.csv`
- `eper/uat/B01_OWNER_DECISION_LOG.csv`

The canonical Chapter 463 case IDs are `B01-463-01` through `B01-463-06`, one per existing requirement. The separate candidate acceptance-oracle matrix added on this branch is a supplementary scenario catalogue only. Its proposed `CH463-xx-Txx` labels are **not canonical IDs and must not be entered as duplicate execution cases**. Adopt or merge scenario detail only by updating the canonical case rows under controlled review.

## 2. Six-requirement crosswalk

| Canonical case | Requirement / SRS / TRC | Existing draft scope | Candidate detail to reconcile | Canonical gap and execution disposition |
|---|---|---|---|---|
| B01-463-01 | REQ-46301 / SRS-FR-2323 / TRC-46301 | Authoritative records and lifecycle history | Tenant boundary, create/read, version conflict, approved transition, durability and lifecycle evidence checks | Exact LLD locator and approved oracle still pending; case remains draft / NOT_RUN |
| B01-463-02 | REQ-46302 / SRS-FR-2324 / TRC-46302 | Authorization and authority controls | Positive/negative authorization, tenant isolation, deny precedence, delegation and SoD checks | Approved role×action×resource×tenant/delegation/SoD matrix and oracle pending; NOT_RUN |
| B01-463-03 | REQ-46303 / SRS-FR-2325 / TRC-46303 | Mandatory business conditions and lifecycle rules | Required-field negative path, approved boundaries, invalid transition, deterministic validation errors | Approved mandatory-field/rule catalogue and measurable oracle pending; NOT_RUN |
| B01-463-04 | REQ-46304 / SRS-FR-2326 / TRC-46304 | Audit evidence and traceability | Required material-action evidence, retrieval scope, integrity checks, retention and attribution | Approved event taxonomy, schema, retention/access policy and oracle pending; NOT_RUN |
| B01-463-05 | REQ-46305 / SRS-FR-2327 / TRC-46305 | Controlled exception handling | Idempotency, invalid transition, eligible retry, retry exhaustion, downstream failure and escalation | Approved exception taxonomy, retry/backoff/replay/compensation and terminal-state policy pending; NOT_RUN |
| B01-463-06 | REQ-46306 / SRS-FR-2328 / TRC-46306 | Governed reporting | Tenant scope, filters/pagination, KPI reconciliation, freshness, empty result and lineage | Approved KPI catalogue/formula, freshness, lineage and authorization oracle pending; NOT_RUN |

## 3. Current source-of-truth status

Verified from the current `main` branch:
- The draft case CSV contains 48 cases for **Chapters 463–470 overall** (six cases per chapter), not 48 approved/executable cases for Chapter 463.
- All 48 cases are marked `DRAFT_TEMPLATE_NOT_APPROVED`, `REVIEW_REQUIRED`, and `NOT_RUN`.
- The requirement-case gap register has 48 corresponding open/blocked rows.
- The 228-row business UAT execution capture has all six Chapter 463 rows `NOT_RUN`, with blank execution/evidence fields and business decision `PENDING`.
- The owner decision log has pending decisions; there is no evidence here that these have been approved.
- The repository's whole-batch acceptance test enforces 228 governed requirement rows and zero `ACCEPTED` / `PRODUCTION_CLOSED` rows while acceptance evidence is pending.

The 48-scenario supplementary matrix is therefore not a new acceptance register. It is a checklist of candidate assertions to reconcile into the six canonical Chapter 463 rows, retaining the original case IDs and registers.

## 4. Gate conditions before execution

For each canonical case, require:
1. Exact approved BRD/SRS source and requirement-level HLD→LLD locator, version, and approval/change reference.
2. Approved DATA/API/EVENT schema/operation/event reference, or explicit approved N/A with rationale.
3. Approved measurable oracle, controlled fixture, actor/role/tenant and expected positive/negative path.
4. Reconciled canonical case row and gap-register disposition.
5. Approved target/environment and technical preflight evidence.
6. Separate D10/session authorization recorded before any business execution.
7. Actual result, timestamp, tester, build SHA, evidence archive reference, defects/exceptions, and authorized business decision captured after execution.

## 5. Disposition

- Canonical Chapter 463 cases: 6, unchanged.
- Supplementary candidate scenarios: 48 in the separate matrix; labels are not canonical test IDs.
- Approved acceptance oracles: 0/6.
- Executed business cases: 0/6 for Chapter 463.
- Exact approved HLD→LLD pairs: 0/6.
- Verified full DATA/API/EVENT slots or approved N/A decisions: 0/18.
- Business UAT: HOLD / NOT AUTHORIZED / NOT EXECUTED.

No requirements, case IDs, or controlled execution rows were changed by this reconciliation. No business policy is inferred; no merge, deployment, G9 freeze, G10 issuance, or paid AWS provisioning is implied.
