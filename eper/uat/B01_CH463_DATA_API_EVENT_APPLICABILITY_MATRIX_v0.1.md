# B01 Chapter 463 DATA/API/EVENT Applicability Decision Matrix v0.1

- Date: 2026-10-14
- Status: EVIDENCE RECONCILIATION WORKING PAPER — NOT APPROVED
- Scope: REQ-46301 through REQ-46306 only
- Baseline invariant: preserve 228 requirements, 38 chapters, and all existing REQ/SRS/TRC identifiers.
- Related sources: EM-DATA-001, EM-API-001, EM-EVT-001, and `EM-OPS_463-500_DATA_API_EVENT_Requirement_Reconciliation_v1.xlsx` in the project Library.
- Related blocker: SRC-003 / issue #73.

## 1. Evidence rule

The Library contains the three platform contract baselines. Their presence is confirmed. The reconciliation workbook says the exact requirement-level join is open and execution/contract-test evidence is not established. Therefore this matrix records applicability and evidence gaps; it does not invent procurement-specific endpoints, entities, event types, versions, or approvals.

Use one of these dispositions per contract type:
- **SOURCE LOCATOR FOUND — APPLICABILITY UNVERIFIED**: source package exists but exact row-level record/locator and applicability are not yet validated.
- **CLARIFICATION REQUIRED**: an applicable requirement-specific record is not evidenced.
- **APPROVED N/A REQUIRED**: only if the accountable owner explicitly approves non-applicability, with rationale and approval reference.
- **VERIFIED**: only after exact locator, source version, owner/approval, requirement identity, and applicable contract semantics are evidenced.

## 2. Six-row controlled applicability matrix

| REQ / SRS / TRC | DATA — existing source and unresolved join | API — existing source and unresolved join | EVENT — existing source and unresolved join | Disposition |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | EM-DATA-001 §§2–4 gives platform entity/ownership/tenant rules. Exact procurement aggregate, lifecycle, attributes and owner are not established by that generic model. | EM-API-001 §§2–8 gives common API conventions and representative platform endpoints. No approved procurement lifecycle endpoint/operation locator is established. | EM-EVT-001 §§3–4 lists platform event envelope/catalogue; existing reconciliation lists document events as pattern candidates only. No approved procurement lifecycle event/version/producer/consumer binding. | DATA/API/EVENT: CLARIFICATION REQUIRED |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | EM-DATA-001 §4 includes Principal, Role, Permission, PrincipalRole, RolePermission and AuthorizationPolicy as platform entities. Exact procurement actor/resource/tenant join is unverified. | EM-API-001 §§2, 7, 13 defines RBAC/ABAC and tenant checks; no approved procurement action/resource authorization endpoint or operation binding is established. | EM-EVT-001 §4 includes tenant/security events as candidates; no approved Chapter 463 security event applicability/version is established. | DATA/API/EVENT: CLARIFICATION REQUIRED |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | EM-DATA-001 §4 includes RuleSet/RuleSetVersion; this does not identify the approved procurement policy/validation data model or thresholds. | EM-API-001 §§5–6 defines generic error envelope/status conventions; exact procurement command, validation rules and response oracle are not established. | EM-EVT-001 §4 includes EVT-RUL-001 RuleSetPublished; candidate only, not proof a Chapter 463 validation event is required. | DATA/API/EVENT: CLARIFICATION REQUIRED |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | EM-DATA-001 §4 includes AuditRecord; required procurement audit fields, retention, evidence classification and owner are not established. | EM-API-001 §7–8 lists a generic Audit resource/query; exact procurement audit operation, filters and authorization binding are unverified. | EM-EVT-001 §4 lists EVT-AUD-001 SecurityActionRecorded; event scope/required payload and Chapter 463 applicability are unverified. | DATA/API/EVENT: CLARIFICATION REQUIRED |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | EM-DATA-001 §3 includes IntegrationJob, IntegrationAttempt, ReconciliationCase, IdempotencyRecord and OutboxMessage; exact procurement exception/recovery ownership and durable state model are unverified. | EM-API-001 §§5–6, 11–12 gives generic error, idempotency and concurrency conventions; no exact procurement retry/recovery/compensation operations are evidenced. | EM-EVT-001 §§6–12 defines generic delivery/retry/DLQ/replay principles; applicable procurement event types, terminal states and compensation semantics are not established. | DATA/API/EVENT: CLARIFICATION REQUIRED |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | EM-DATA-001 §4 describes analytics as derived/non-authoritative; no approved procurement reporting data model, lineage or freshness record is established. | EM-API-001 §§9–10 provides generic pagination/filtering/search conventions; no approved procurement reporting endpoint or metric query contract is established. | EM-EVT-001 §§2, 5–13 gives generic event-to-analytics patterns; no approved reporting projection/event subscription or freshness contract is established. | DATA/API/EVENT: CLARIFICATION REQUIRED |

## 3.1 Procurement catalogue candidates located (not promoted)

The existing Library workbook `EPER_Master_Repository_v57.5.xlsx` was reconciled against the six requirements. The sampled entries in the procurement catalogue tabs below are marked **Draft**. These locators narrow the next evidence retrieval, but do not establish approval, ownership, or requirement-level applicability.

| Requirement | Candidate catalogue locator(s) | Candidate evidence | Why the cells remain unresolved |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | `89_PROC_Object_Catalog`; `97_PROC_Lifecycle_States`; related `101_PROC_Attribute_Catalog` | Candidate supplier/sourcing/requisition/PO object families; examples include `PROC-OBJ-001` Supplier and `PROC-OBJ-006` Purchase Requisition. | No approved authoritative aggregate/lifecycle, exact DATA schema/owner, HLD→LLD pair, API operation, or event binding is established. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | `103_PROC_API_Catalog`; `97_PROC_Lifecycle_States` | Candidate permission vocabulary such as `supplier:create`, plus actor/authority fields. | No approved role/action/resource/tenant policy binding or exact design pair is established. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | `103_PROC_API_Catalog`; `97_PROC_Lifecycle_States` | Candidate operations include `API-PROC-009` create requisition and `API-PROC-011` requisition decision. | No approved policy/rule catalogue, thresholds, error/transaction semantics, API version, or measurable acceptance oracle is established. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | `100_PROC_Domain_Events`; `101_PROC_Attribute_Catalog` | Candidate procurement event/attribute patterns, including `EVT-PROC-001` SupplierSubmitted. | A business-domain event candidate does not establish an approved audit catalogue, required evidence fields, retention/integrity/retrieval controls, or approved DATA/EVENT contracts. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | `97_PROC_Lifecycle_States`; `103_PROC_API_Catalog` | Candidate lifecycle transitions and API mutation conventions. | No approved retry/idempotency/recovery/compensation policy, durable terminal states, or requirement-level contract binding is established. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | `106_PROC_Reports`; `101_PROC_Attribute_Catalog` | Candidate procurement reports, measures, and fields. | No approved KPI formulas, lineage, freshness, access policy, read-model/API endpoint, or requirement binding is established. |

**Disposition:** candidate catalogue locators found for all six rows; exact approved HLD/LLD pairs **0/6**; approved DATA/API/EVENT bindings or approved N/A decisions **0/6**; owner-approved acceptance oracles **0/6**. Do not promote the candidate IDs until a controlled source version, approval reference/effective date, accountable owner, exact locator and explicit REQ/SRS/TRC binding are evidenced.


## 3.2 Existing HLD/LLD recovery evidence located — supporting only

The Library was searched for requirement-specific reconciliation records and the consolidated LLD. These sources help identify the next precise locator checks, but the records themselves explicitly say exact requirement-level HLD/LLD bindings are not evidenced. The consolidated LLD also labels its six-row design register `SUPPORTING DESIGN — EXACT BINDING PENDING`. Therefore this section records retrieval results without promoting component names or architecture anchors.

| Requirement | Existing source-grounded HLD supporting anchors | Existing source-grounded LLD supporting anchors | Exact approved binding / disposition |
|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | HLD §§3–5 (authoritative data ownership/tenant scope); §12 Messaging Security; §13 Event Governance; §18 Audit Architecture | LLD-CMP-008 Domain Components; LLD-CMP-007 Application Services; pattern XX01 / LLD-PAT-01 | Exact HLD **OPEN**; exact LLD **OPEN**; HLD→LLD pair **OPEN**. All listed anchors explicitly supporting-only in `EM_HLD_LLD_EXACT_REFERENCE_RECONCILIATION_Ch463_REQ46301_SRS-FR-2323_v1.0.docx`. |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | Security/authorization architecture anchors require validation against the requirement-specific reconciliation record; do not infer from generic RBAC/ABAC chapters | Consolidated LLD target: LLD-05 Security & Authorization; identity/tenant context and RBAC/ABAC policy evaluator | Exact HLD **OPEN**; exact LLD **OPEN**; HLD→LLD pair **OPEN**. Consolidated LLD marks exact binding pending. |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | HLD Chapter 146 Business Validation; Chapter 145 Domain Error Model; Chapter 147 Idempotent Domain Commands; HLD Batch 003 §§3, 5 | LLD-CMP-007 Application Services; LLD-CMP-008 Domain Components; LLD-CMP-010 Rules; XX03 / LLD-PAT-03 | Exact HLD **OPEN**; exact LLD **OPEN**; HLD→LLD pair **OPEN**. All listed anchors explicitly supporting-only in `EM_HLD_LLD_EXACT_REFERENCE_RECONCILIATION_Ch463_REQ46303_SRS-FR-2325_v1.0.docx`. |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | HLD §18 Audit Architecture; HLD §§3–5; HLD Batch 003 §5 | LLD-CMP-017 Protected Audit Evidence; XX04 / LLD-PAT-04 | Exact HLD **OPEN**; exact LLD **OPEN**; HLD→LLD pair **OPEN**. Supporting-only in `EM_HLD_LLD_EXACT_REFERENCE_RECONCILIATION_Ch463_REQ46304_SRS-FR-2326_v1.0.docx`. |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | No authoritative Chapter 463 HLD locator explicitly bound to the requirement was evidenced in the retrieved reconciliation record; candidate HLD-CAND/HLD-CAP IDs remain unpromoted | LLD-CMP-009 Workflow Orchestration; LLD-CMP-010 Decision Rules; XX05 / LLD-PAT-05 | Exact HLD **OPEN**; exact LLD **OPEN**; HLD→LLD pair **OPEN**. Supporting-only in `EM_HLD_LLD_EXACT_REFERENCE_RECONCILIATION_Ch463_REQ46305_SRS-FR-2327_v1.0.docx`. |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | HLD §15 Reporting Architecture; Chapter 044; Chapters 189–194 reporting/analytics anchors; §14 Analytics Architecture | LLD-CMP-016 and LLD-CMP-014; secondary context LLD-CMP-018 / LLD-CMP-017; XX06 / LLD-PAT-06 | Exact HLD **OPEN**; exact LLD **OPEN**; HLD→LLD pair **OPEN**. Supporting-only in `EM_HLD_LLD_EXACT_REFERENCE_RECONCILIATION_Ch463_REQ46306_SRS-FR-2328_v1.1.docx`. |

**Key distinction:** the consolidated LLD's target sections (including LLD-02/03, LLD-05, LLD-06/07 and audit/observability components) describe where design responsibility is expected to live. They are not requirement-level locator proof. The dedicated recovery master and individual reconciliation records independently preserve exact HLD **0/6**, exact LLD **0/6**, and exact HLD→LLD pairs **0/6**. Do not relabel these rows VERIFIED based on this appendix.

### Concrete next promotion test

For each row, promotion requires the source file/version plus a stable exact section/decision/component locator that explicitly names REQ-463xx or SRS-FR-232x, the linked HLD→LLD pair, and the design-baseline approval reference. If the authoritative source package does not contain that explicit binding, leave it OPEN and raise the missing binding through the existing SRC-003 / P0 closure path; do not manufacture a locator from the supporting anchors listed above.


## 3.3 Source-receipt gate cross-check (2026-10-14)

Cross-checked the requirement-level findings against the existing Library gate artifacts:
- `HLD_463_470_P0_HLD_Requirement_Binding_Verification_Gate_v4.5.docx` — authoritative design source not received; exact HLD 0/48; REQ-46301–46306 each HOLD.
- `HLD_463_470_P0_LLD_Requirement_Binding_Verification_Gate_v4.6.docx` — authoritative LLD source not received; exact LLD 0/48; explicit binding not evidenced; HLD trace not validated; REQ-46301–46306 each HOLD.
- `HLD_463_470_Authoritative_Source_Receipt_Validation_Gate_v3.3.docx` — no qualifying approved Chapter 463 HLD/LLD package or authoritative requirement-level crosswalk exposed in the searched Library source set.
- `HLD_463_470_P0_Requirement_Level_HLD_LLD_Binding_Validation_Gate_v5.3.docx` — validation can consume only authoritative, versioned evidence admitted through its source-receipt gate; generic component inventories and candidate patterns cannot close the binding.

| Evidence gate | Current source-recorded outcome | Consequence |
|---|---|---|
| BRD→SRS identity | 6/6 established for Chapter 463 | Preserve identities; no baseline edits |
| Authoritative HLD receipt | Not received/exposed in source gate | Exact HLD remains 0/6 |
| Authoritative LLD receipt | Not received/exposed in source gate | Exact LLD remains 0/6 |
| Explicit HLD→LLD relationship | Not validated | Pair remains 0/6 |
| DATA/API/EVENT contracts or approved N/A | Pending | No contract promotion |

**This resolves the retrieval question:** the existing Library contains gate reports and supporting architecture, but the gate reports themselves say the qualifying authoritative design package/crosswalk has not been received or exposed. Repeating the same search or rerunning CI will not create the missing approved source. The remaining action is source receipt/controlled release of the authoritative HLD/LLD crosswalk (or an approved source correction that explicitly establishes the bindings), followed by the documented validation procedure. Until then, the matrix stays OPEN and Business UAT stays unauthorized.

## 4. Required evidence to promote a cell

For every DATA, API, and EVENT cell, record:
1. exact source document ID, version/status and section/table/row/endpoint/event locator;
2. explicit requirement identity and rationale for applicability;
3. accountable owner and approval reference/effective date;
4. schema/field/ownership and tenant-scope evidence for DATA;
5. method/path, request/response, authorization, error/idempotency/version semantics for API;
6. event type/version, producer, consumers, payload/schema reference, delivery/retry/DLQ/replay semantics for EVENT;
7. contract-test case/build/environment/result and downstream verification evidence.

If a contract type is genuinely not applicable, record **APPROVED N/A** only with the named owner's rationale and approval reference. A blank, absent catalogue row, or generic platform convention is not an N/A approval.

## 5. Controlled next action

- Retrieve and inspect the exact Chapter 463 rows in the Library reconciliation workbook and the relevant source sections of EM-DATA-001, EM-API-001, EM-EVT-001.
- Promote only those locators whose source/version/status and applicability are explicitly evidenced.
- Keep unresolved cells CLARIFICATION REQUIRED; do not promote pattern candidates such as EVT-DOC-001, EVT-TEN-001, EVT-RUL-001, EVT-AUD-001, EVT-WFL-*, or generic Integration endpoints as approved Chapter 463 bindings.
- Then reconcile validated bindings to exact HLD and LLD locators and owner-approved measurable acceptance oracles.
- Re-run G9 only after the source evidence has changed and been reviewed; a green CI run alone does not close the source gate.

## 6. Current gate status

- Existing platform DATA/API/EVENT baseline documents: FOUND.
- Exact Chapter 463 applicability/locator/approval for all 18 cells: NOT ESTABLISHED.
- Approved N/A decisions: NOT ESTABLISHED.
- Contract-test execution evidence: NOT ESTABLISHED.
- Exact HLD/LLD bindings: remain open.
- Business UAT authorization: NO; SRC-003 and G9 remain HOLD / NO-GO.

This matrix is a controlled working paper, not an approval record or a substitute for the underlying source documents.
