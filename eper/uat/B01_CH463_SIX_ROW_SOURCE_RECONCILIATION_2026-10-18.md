# B01 Chapter 463 — Six-Row Source Reconciliation and Promotion Queue

**Document ID:** EPER-B01-CH463-SOURCE-RECON-002  
**As of:** 2026-10-18  
**Status:** SUPPORTING SOURCE MAP — NOT AN APPROVAL / NOT EXECUTABLE  
**Baseline:** Option A retained; 228 requirements / 38 chapters unchanged.  
**Scope:** REQ-46301–REQ-46306; SRS-FR-2323–SRS-FR-2328; TRC-46301–TRC-46306.

## 1. What the existing sources establish

- The approved source-precedence decision `B01-CH463-SOURCE-CORRECTION-DECISION-001` (2026-10-12) establishes the canonical identity: **Volume XIII, Chapter 463 — Enterprise Procurement & Source-to-Pay**.
- `EM-BRD-001_Detailed_Chapters-461-470_v1.0`, Chapter 463 §463.21, page 11, establishes the six requirement identities and generic control-pattern wording. It does not by itself define all procurement-specific behaviors or approval parameters.
- `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx` contains relevant domain sections. The domain source is marked **In Development**; these section references are source evidence, not proof of approved requirement-to-domain joins.
- `EM-LLD-001_Consolidated_LLD_Chapters_463-500_v1.0` contains pattern-level detailed-design components. The current crosswalk names those component locators but explicitly records that exact approved requirement-level locator and HLD→LLD pair are not established.
- `eper/CH463_IMPLEMENTATION_TO_DESIGN_CROSSWALK.csv` and `eper/contracts/index.ts` provide implementation/registry evidence only. Contract IDs such as `DATA:authoritative-domain`, `API:capability-resource`, and `EVENT:material-lifecycle` are descriptors, not versioned schemas, OpenAPI operations, or event payload contracts.

## 2. Six-row source map

| Requirement / SRS / TRC | Domain sections to inspect (candidate relevance, not approved mapping) | Existing LLD pattern locator (supporting only) | Candidate data/API/event direction | Promotion blocker |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | Chapter 463 §§463.7–463.8 (requisitions/approval routing), §§463.16, 463.18, 463.21–463.23, 463.39, 463.42 | LLD-02 Domain & Component; LLD-03 Data Model | Candidate procurement entities ENT-PROC-009–012 and PROC-OBJ-006–009; API candidate requisition/PO operations; event naming unresolved | No approved requirement-to-object join, field/state catalogue, exact approved HLD locator, or HLD→LLD pair |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | §§463.3, 463.8, 463.14–463.16, 463.24–463.25, 463.35 | LLD-05 Security & Authorization | Shared IAM/authorization candidates; approval routing and delegated authority; security audit event only if approved | Approved role × action × resource × tenant × delegation/SoD matrix absent; exact HLD pair and applicable contracts absent |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | §§463.7–463.8, 463.15–463.16, 463.19–463.25, 463.27, 463.46–463.47 | LLD-02 Domain & Component; LLD-06 Workflow & Rules | Draft rule catalogue and validated-command API; validation-outcome event applicability undecided | Approved mandatory/conditional fields, policy precedence, threshold configuration and error contract absent |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | §§463.3, 463.14–463.16, 463.18, 463.22, 463.24 | LLD-03 Audit Metadata; LLD-09 Observability | Audit record/retrieval and material-event candidates | Approved material-event taxonomy, payload/attribution, retention, integrity and access rules absent |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | §§463.3, 463.8, 463.14–463.16, 463.22–463.25, 463.27 | LLD-06 Workflow & Rules; LLD-07 Integration | Exception state/recovery command and lifecycle event candidates | Approved exception taxonomy, retry/backoff, compensation, escalation, terminal-state and delivery policy absent |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | §§463.12, 463.15–463.16, 463.24–463.25, 463.28–463.29, 463.32, 463.37, 463.46–463.47 | LLD-09 Observability/Analytics | Governed report query; API-PROC-024 is Draft; refresh event applicability undecided | Approved report catalogue, formulas, lineage, freshness, reconciliation tolerance and exact report/API/event contracts absent |

**Important:** These LLD references are locators into named components, not verified approved row-level bindings. They remain **SUPPORTING**. No row is promoted to EXACT by this map.

## 3. Acceptance-oracle guardrails

The existing `B01_CH463_Business_Rule_and_Acceptance_Register_v0.5.xlsx` already contains proposed test scenarios and parameterized measurable assertions. Retain them as **proposed test design**, not approved policy or acceptance criteria.

- REQ-46301: transition tests can use an approved state table once supplied; do not invent allowed states, required fields, uniqueness scope or retention.
- REQ-46302: seeded allow/deny and no-side-effect assertions are test mechanics; role, limits, delegation, self-approval and SoD outcomes must come from the approved authority matrix.
- REQ-46303: positive/negative/boundary tests require approved rules and configured thresholds. Do not choose threshold values.
- REQ-46304: integrity and retrieval tests require approved material-event coverage, retention and access policy.
- REQ-46305: retry/replay tests require approved retry limits, backoff, compensation, escalation and terminal states.
- REQ-46306: totals/lineage/freshness tests require approved report formulas, source lineage, freshness target and reconciliation tolerance.

“100% of seeded cases” and “0 unauthorized side effects” can be test assertions once the seed set and policy are approved; they are not substitutes for domain approval. No acceptance oracle is counted approved until the source/version/locator and approval are recorded.

## 4. Explicit event-name reconciliation queue

Do not select event names by similarity. Reconcile these candidate pairs against the controlled event catalogue and the intended domain transition:

- `RequisitionSubmitted` vs `PurchaseRequisitionSubmitted`
- `RequisitionDecisionRecorded` vs `PurchaseRequisitionApproved`

For each, record source event ID/name, version, producer, trigger, transaction/outbox semantics, payload schema locator, consumer purpose, compatibility policy, approver and change reference. If no event is required for a requirement, capture an authorized N/A with rationale; absence is not N/A.

## 5. Evidence ledger — no status inflation

| Evidence gate | Verified count/status | Next closure evidence |
|---|---:|---|
| Exact approved HLD→LLD pairs | 0/6 | Controlled HLD and LLD versions, exact locators, explicit pair, approval/change reference per requirement |
| DATA/API/EVENT slots | 0/18 verified | Versioned schema/operation/event contract and source locator plus approval, or separately approved N/A |
| Approved executable acceptance oracles | 0/6 | Existing approved BRD/SRS criteria traced to exact source/version/locator and approved oracle |
| Technical preflight against hosted UAT | Not executed | Hosted target, pinned build, authorized tester/access, configuration and recorded results |
| Business UAT | HOLD / NOT AUTHORIZED / NOT EXECUTED | Separate D10 authorization after prerequisites close |
| G9 / G10 | Not frozen / not issued | Controlled closure package and separate sign-offs |

## 6. Execution sequence

1. Treat the source map as a retrieval index; use existing Library and repository artifacts, not another upload request.
2. Verify controlled approval metadata and exact locators for each candidate source. The domain BRD's In Development status prevents treating it as final policy approval.
3. Draft schemas and operations in a clearly marked candidate contract pack; retain the existing model and do not invent procurement entities, rules, thresholds, roles or KPIs.
4. Route only unresolved policy choices to the designated owner; use approved source decisions when already present.
5. Update the existing SRC-003/G9 registers with exact evidence references. Do not create parallel status systems.
6. Keep all six business cases NOT_RUN until D7–D9 and approved acceptance oracles are complete, target preflight passes, and D10 is separately authorized.

**Disposition:** Domain identity resolved; row-level domain joins and controlled contract bindings remain open. Business UAT remains HOLD. This artifact is documentation-only and does not authorize merge, deployment, AWS provisioning, G9 freeze or G10 release.
