# B01 Chapter 463 — Business UAT Case Packet Review

**Document ID:** EPER-B01-CH463-UAT-CASE-REVIEW-001  
**Date:** 2026-10-19  
**Status:** CASE-PACKET DRAFT — NOT APPROVED / NOT AUTHORIZED / NOT EXECUTED  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / TRC-46301–TRC-46306  
**Baseline:** Option A; 228 requirements / 38 chapters unchanged.

## 1. Purpose

This packet converts the existing source reconciliation into six reviewable case skeletons. It does not invent business acceptance criteria. Cases remain NOT_RUN and are not executable until the approved source locators, contracts, test environment, test data and separate D10 authorization are present.

Status vocabulary:
- **BLOCKED_SOURCE:** required approved business rule or exact source locator is missing.
- **BLOCKED_DESIGN:** approved HLD/LLD pair or DATA/API/EVENT contract is missing.
- **BLOCKED_ENV:** no hosted UAT target/preflight evidence.
- **NOT_AUTHORIZED:** D10 execution authorization not issued.
- **NOT_RUN:** no Business UAT execution has occurred.

## 2. Shared execution controls — prerequisites, not approval

Before any execution, attach all of the following to the controlled case packet:
1. Approved BRD/SRS version and exact criterion locator for the requirement.
2. Exact approved HLD→LLD locator pair and version/change references.
3. Applicable approved DATA/API/EVENT contract IDs and versions, or explicit authorized N/A with rationale.
4. Approved role/action/tenant policy and deterministic fixture data; never use guessed thresholds or invented roles.
5. Hosted target URL, pinned build ID/commit, environment/configuration evidence and successful technical preflight.
6. Named tester, access/session evidence, rollback/cleanup approach and evidence archive location.
7. Approved expected results, required evidence list and separate signed D10 authorization.

No case may be marked PASS based solely on CI, simulated data, candidate design documents or implementation-derived contract shapes.

## 3. Six case skeletons

### UAT-B01-463-01 — Authoritative record and lifecycle
- **Trace:** REQ-46301 / SRS-FR-2323 / TRC-46301.
- **Objective:** Verify the approved procurement record and lifecycle behavior using the existing approved model.
- **Preconditions:** Approved entity/field/state catalogue; authorized actor and tenant; valid and invalid fixtures based on that catalogue; approved API and DATA contracts; approved lifecycle event or N/A.
- **Steps:** (1) Submit a valid command allowed by the approved transition table. (2) Retrieve the record using an authorized tenant-scoped query. (3) Attempt a transition expressly disallowed by the approved table. (4) Inspect authoritative state, history, response and required audit/event evidence.
- **Expected result:** State and history match the approved transition specification; invalid operation has the specified rejection outcome and does not produce an unauthorized state change; event behavior matches the approved contract.
- **Evidence:** Request/response, fixture IDs, before/after state, history/audit record, event evidence if applicable, logs, commit/build and timestamps.
- **Blocking gaps:** Exact field requiredness, lifecycle state/transition table, concurrency/idempotency and canonical event name/schema are not yet approved in the reviewed evidence.
- **Disposition:** BLOCKED_SOURCE + BLOCKED_DESIGN; NOT_AUTHORIZED; NOT_RUN.

### UAT-B01-463-02 — Authorization, SoD and human approval
- **Trace:** REQ-46302 / SRS-FR-2324 / TRC-46302.
- **Objective:** Verify protected actions enforce approved authority and segregation-of-duties rules; verify AI assistance cannot independently make a material commercial decision.
- **Preconditions:** Approved role/action/resource/tenant matrix, delegation/SoD rules, approved AI review-record schema, seeded authorized and unauthorized actors, approved API contract.
- **Steps:** (1) Attempt an action allowed by the matrix. (2) Attempt an action denied by the matrix. (3) Where the approved AI control applies, submit an AI recommendation without the required human approval. (4) Inspect business state and required security/audit evidence.
- **Expected result:** Each action follows the approved matrix; denied or unapproved AI-triggered commercial action does not mutate business state; required human-review attribution is present according to the approved schema.
- **Evidence:** Actor/tenant fixture IDs, policy version, request/response, before/after state, reviewer record, audit evidence and logs.
- **Blocking gaps:** Full authority/SoD matrix and AI review contract/enforcement binding are not approved. Chapter 463 §463.33 supplies a source-listed human-approval boundary but not the complete implementation schema.
- **Disposition:** BLOCKED_SOURCE + BLOCKED_DESIGN; NOT_AUTHORIZED; NOT_RUN.

### UAT-B01-463-03 — Mandatory business validation
- **Trace:** REQ-46303 / SRS-FR-2325 / TRC-46303.
- **Objective:** Verify commands follow approved field and business-rule validation.
- **Preconditions:** Approved field/rule catalogue, policy version/precedence, blocking-versus-warning behavior, thresholds if applicable, error contract and valid/boundary/invalid fixtures.
- **Steps:** (1) Submit a valid fixture. (2) Submit a fixture violating one approved rule. (3) Submit boundary fixtures only where the approved source defines a boundary. (4) Inspect response, persisted state and validation evidence.
- **Expected result:** Results match the exact approved rule and error contract; blocking validation failure does not partially commit. No boundary or threshold is inferred by this case skeleton.
- **Evidence:** Rule-set version, fixture IDs, request/response, issue codes, before/after state, logs and audit/event evidence where approved.
- **Blocking gaps:** Approved field-level catalogue, validation messages, policy precedence and threshold configuration are not present in reviewed sources.
- **Disposition:** BLOCKED_SOURCE + BLOCKED_DESIGN; NOT_AUTHORIZED; NOT_RUN.

### UAT-B01-463-04 — Material-event audit evidence
- **Trace:** REQ-46304 / SRS-FR-2326 / TRC-46304.
- **Objective:** Verify required material actions create retrievable, attributable audit evidence under approved controls.
- **Preconditions:** Approved material-event catalogue, audit schema, integrity/retention/access policy, test actors and approved audit retrieval operation.
- **Steps:** (1) Perform a permitted material action from the approved event list. (2) Retrieve the corresponding evidence as an authorized actor. (3) Attempt retrieval using a disallowed actor/tenant. (4) Apply integrity verification only as defined by the approved mechanism.
- **Expected result:** Evidence fields, access decisions and integrity outcomes match approved policy; unauthorized retrieval is denied without prohibited disclosure.
- **Evidence:** Action ID, audit record, retrieval request/response, actor/tenant context, integrity result and relevant logs.
- **Blocking gaps:** Exact event coverage, schema, retention, integrity mechanism and audit-write failure behavior are not approved.
- **Disposition:** BLOCKED_SOURCE + BLOCKED_DESIGN; NOT_AUTHORIZED; NOT_RUN.

### UAT-B01-463-05 — Exception, recovery and receiving/AP handoff
- **Trace:** REQ-46305 / SRS-FR-2327 / TRC-46305.
- **Objective:** Verify approved exception handling and recovery behavior, including related receiving/reversal/AP interfaces where this requirement's approved mapping includes them.
- **Preconditions:** Approved exception taxonomy/state machine, exception justification rules, approver matrix, retry/replay/compensation policy, idempotency behavior and any receiving/matching/AP contracts in scope.
- **Steps:** (1) Submit an exception case meeting the approved eligibility and evidence rules. (2) Submit a negative case only if the approved policy defines the violated rule. (3) Exercise an approved retry/replay/reversal path using controlled fixtures. (4) Verify no duplicate commercial effect and capture resolution evidence. (5) Test receiving/AP handoff only after the exact requirement binding and interface contract are approved.
- **Expected result:** Exception state, approvals, recovery and side effects match the approved policy; duplicate delivery does not duplicate effects where idempotency is required; AP handoff matches approved interface semantics.
- **Evidence:** Exception record, justification/approval, attempt history, idempotency reference, before/after transaction state, handoff evidence and audit/logs.
- **Blocking gaps:** Detailed exception policy and receiving/returns/reversal/matching/AP contracts are absent from reviewed evidence. No retry count or matching tolerance may be invented.
- **Disposition:** BLOCKED_SOURCE + BLOCKED_DESIGN; NOT_AUTHORIZED; NOT_RUN.

### UAT-B01-463-06 — Governed reporting and KPI lineage
- **Trace:** REQ-46306 / SRS-FR-2328 / TRC-46306.
- **Objective:** Verify approved procurement reports use governed formulas, tenant scoping and source lineage.
- **Preconditions:** Approved report catalogue/formula book, source lineage, currency/time-window rules, freshness/as-of policy, reconciliation tolerance, report API and controlled fixture data.
- **Steps:** (1) Run an approved report for a known fixture set. (2) Independently calculate expected output using the approved formula. (3) Query with an unauthorized tenant/actor or disallowed filter. (4) Inspect as-of/freshness and lineage metadata.
- **Expected result:** Output matches the approved formula and inclusion/exclusion rules; authorization is enforced; freshness and lineage are represented according to approved policy. This case defines no formula or tolerance.
- **Evidence:** Report ID/version, fixture IDs, independent calculation, query/response, lineage references, as-of/refresh metadata and access logs.
- **Blocking gaps:** Approved formulas, source-of-truth, reconciliation tolerance, freshness policy and governed report contract are not evidenced.
- **Disposition:** BLOCKED_SOURCE + BLOCKED_DESIGN; NOT_AUTHORIZED; NOT_RUN.

## 4. Gate summary

| Gate | State | Closure evidence |
|---|---|---|
| Approved executable oracles | 0/6 | Existing approved criterion, exact locator/version, deterministic expected result and approval per case |
| Exact HLD→LLD pairs | 0/6 | Approved baseline versions and exact locators, explicitly linked to each requirement |
| DATA/API/EVENT bindings | 0/18 verified | Versioned approved contracts or authorized N/A, exact locators and approval metadata |
| Hosted technical preflight | Not executed | Target, pinned build, access/configuration and recorded preflight results |
| D10 execution authorization | Not issued | Separate controlled authorization after prerequisites close |
| Business UAT | HOLD / NOT AUTHORIZED / NOT EXECUTED | All above plus executed evidence and authorized sign-off |
| G9 / G10 | Not frozen / not issued | Controlled reconciliation and release sign-offs |

## 5. Closure route

Use these six case skeletons as the case-packet review baseline. Close only the exact policy/design dependencies shown in each row, using existing controlled sources first. Where the source is genuinely silent, create a narrow, named clarification request; do not ask the user to re-supply artifacts already in the Library and do not make up an approval. Once the approved criteria/contracts and hosted environment are in place, regenerate the packets with exact locators, request D10 authorization, then execute and archive evidence.
