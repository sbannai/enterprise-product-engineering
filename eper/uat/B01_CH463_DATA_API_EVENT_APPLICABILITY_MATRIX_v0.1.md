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

## 3. Required evidence to promote a cell

For every DATA, API, and EVENT cell, record:
1. exact source document ID, version/status and section/table/row/endpoint/event locator;
2. explicit requirement identity and rationale for applicability;
3. accountable owner and approval reference/effective date;
4. schema/field/ownership and tenant-scope evidence for DATA;
5. method/path, request/response, authorization, error/idempotency/version semantics for API;
6. event type/version, producer, consumers, payload/schema reference, delivery/retry/DLQ/replay semantics for EVENT;
7. contract-test case/build/environment/result and downstream verification evidence.

If a contract type is genuinely not applicable, record **APPROVED N/A** only with the named owner's rationale and approval reference. A blank, absent catalogue row, or generic platform convention is not an N/A approval.

## 4. Controlled next action

- Retrieve and inspect the exact Chapter 463 rows in the Library reconciliation workbook and the relevant source sections of EM-DATA-001, EM-API-001, EM-EVT-001.
- Promote only those locators whose source/version/status and applicability are explicitly evidenced.
- Keep unresolved cells CLARIFICATION REQUIRED; do not promote pattern candidates such as EVT-DOC-001, EVT-TEN-001, EVT-RUL-001, EVT-AUD-001, EVT-WFL-*, or generic Integration endpoints as approved Chapter 463 bindings.
- Then reconcile validated bindings to exact HLD and LLD locators and owner-approved measurable acceptance oracles.
- Re-run G9 only after the source evidence has changed and been reviewed; a green CI run alone does not close the source gate.

## 5. Current gate status

- Existing platform DATA/API/EVENT baseline documents: FOUND.
- Exact Chapter 463 applicability/locator/approval for all 18 cells: NOT ESTABLISHED.
- Approved N/A decisions: NOT ESTABLISHED.
- Contract-test execution evidence: NOT ESTABLISHED.
- Exact HLD/LLD bindings: remain open.
- Business UAT authorization: NO; SRC-003 and G9 remain HOLD / NO-GO.

This matrix is a controlled working paper, not an approval record or a substitute for the underlying source documents.
