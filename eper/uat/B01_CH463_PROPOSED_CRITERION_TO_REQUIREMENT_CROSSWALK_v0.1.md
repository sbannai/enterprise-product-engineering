# B01 Chapter 463 Proposed Criterion-to-Requirement Crosswalk v0.1

- Date: 2026-10-14
- Scope: REQ-46301–REQ-46306; preserve existing REQ/SRS/TRC IDs and the 228-requirement/38-chapter baseline.
- Status: **WORKING PROPOSAL — NOT APPROVED; NOT AN EXECUTION ORACLE**
- Source: `EM-BRD-001_Volume-XIII_Chapter-463_..._v1.0.docx`, §463.46–§463.47. The source intake identifies this BRD as **In Development**, so these proposed associations must not be treated as approved mappings.

## Proposed mapping for owner review

| Requirement | Existing implementation/design pattern (supporting only) | Candidate source criterion/check | Suggested owner domain | Missing measurable oracle / evidence needed | Disposition |
|---|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 / TRC-46301 | AuthoritativeRecordService; current implementation is generic in-memory record handling, not an approved procurement model | §463.46(4) contract/catalog terms linked to approved commercial terms; §463.47(7) contract terms/version/expiry and (9) PO supplier/line/approval/change | Procurement domain owner + Legal/Contracts + architecture | Approved object/aggregate and field schema; required fields; lifecycle/state transitions; version conflict behavior; valid/invalid examples; authoritative source and approval/version | **PROPOSED — OWNER CONFIRMATION REQUIRED** |
| REQ-46302 / SRS-FR-2324 / TRC-46302 | AuthorizationService; generic default-deny behavior is not an approved business role matrix | §463.47(12) confidentiality/SoD/audit; §463.46(2) approval and procurement-policy controls | Procurement governance + Security/IAM | Approved actor-role-action-resource/tenant matrix; segregation-of-duties conflicts; allow/deny examples; exact denial and audit outcomes | **PROPOSED — OWNER CONFIRMATION REQUIRED** |
| REQ-46303 / SRS-FR-2325 / TRC-46303 | BusinessValidationService; generic rule evaluation is not an approved procurement rule catalogue | §463.46(2) approval, budget and policy controls; §463.47(1), (8), (10) category, requisition and compliance checks | Procurement policy + Buyer/Finance | Rule IDs and versions; approval thresholds; budget tolerance; mandatory fields; positive/negative/boundary test vectors; transaction rollback/error outcomes | **PROPOSED — OWNER CONFIRMATION REQUIRED** |
| REQ-46304 / SRS-FR-2326 / TRC-46304 | AuditEvidenceService; implementation hash/retrieval behavior does not approve audit policy | §463.46(1), (3) auditable evaluation and award rationale; §463.47(6), (12) award evidence and audit | Procurement audit/control owner + Security + Records/Data | Required audit event catalogue; actor/time/source/evidence fields; immutability and integrity rules; retention period; retrieval/access policy; tamper and unauthorized-access expected results | **PROPOSED — OWNER CONFIRMATION REQUIRED** |
| REQ-46305 / SRS-FR-2327 / TRC-46305 | ExceptionHandlingService; generic retry/lifecycle handling is not an approved procurement recovery policy | §463.47(14) recovery/no-duplicate-award/order; §463.46(5) reliable transaction handoff | Procurement operations + Integration/API/Event + BCM/IT | Failure taxonomy; retry/backoff limits; idempotency key and duplicate-prevention rule; recovery/compensation states; AP/receiving handoff failure outcomes; terminal-state criteria | **PROPOSED — OWNER CONFIRMATION REQUIRED** |
| REQ-46306 / SRS-FR-2328 / TRC-46306 | GovernedReportingService; generic query/filter behavior is not an approved report catalogue | §463.46(5) financial reporting handoff; §463.47(11) PO/receipt/invoice lineage; §463.46(3) award rationale/evidence | Procurement reporting + AP/Finance + Data governance | Approved report/KPI catalogue; formulas, source lineage, freshness/SLA, filters/tenant access, reconciliation tolerances and known-answer test dataset | **PROPOSED — OWNER CONFIRMATION REQUIRED** |

## Cross-cutting checks for all six rows

1. Verify the requirement's actual wording in the controlled BRD/SRS/TRC source before accepting the proposed criterion association.
2. Record the approved source filename, version, status, approval reference/date and exact locator. A source marked In Development cannot alone establish final approval.
3. Record an owner-approved, measurable positive, negative and boundary oracle where applicable. Replace illustrative language with actual controlled policy values; do not invent thresholds.
4. Bind each row to an exact approved HLD locator and exact approved LLD locator, with an explicit HLD-to-LLD relationship.
5. For DATA, API and EVENT independently, provide an approved versioned schema/contract and locator, or an explicit approved N/A with rationale and authority. Descriptor IDs alone do not satisfy this.
6. Capture owner, decision, date, evidence reference and any controlled change ID. If evidence is absent, retain **CLARIFICATION REQUIRED / HOLD**.

## Gate result

This is a review aid only. It does not change the source baseline, authorize execution, close SRC-003, approve any requirement oracle, freeze G9, or change release status. Maintain `EPER_UAT_API_ENABLED=false`; do not provision chargeable AWS resources.
