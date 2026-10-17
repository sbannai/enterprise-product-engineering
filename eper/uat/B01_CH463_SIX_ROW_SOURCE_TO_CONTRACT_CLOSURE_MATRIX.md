# Chapter 463 six-row source-to-contract closure matrix

**Status:** Evidence reconciliation aid — not an approval record.  
**Scope:** REQ-46301–REQ-46306 / SRS-FR-2323–SRS-FR-2328 / Chapters 463.  
**Controlled baseline:** `EM-BRD-001_Detailed_Chapters-461-470_v1.0.docx`, Chapter 463 §463.21 “Initial Requirement Register”, rows BRD-001-REQ-46301–46306; baseline decision `B01-BASELINE-APPROVAL-001` (2026-10-11). This confirms requirement identity/locator only, not domain acceptance criteria.  
**Domain source:** `EM-BRD-001_Volume-XIII_Chapter-463_Enterprise-Procurement-and-Source-to-Pay-Strategic-Sourcing-RFQ-RFP-RFI-Supplier-Selection-Purchase-Requisitions-Purchase-Orders-Contracts-Catalogs-Approvals-and-Procurement-Compliance-Traceability-Matrix_v1.0.docx`. Its §§463.7–463.25 describe procurement operations, approvals, sourcing, supplier evaluation, contracts, purchase orders, compliance and commitments. **Source identity/precedence is resolved** by `B01-CH463-SOURCE-CORRECTION-DECISION-001` (Option A, approved 2026-10-12): Volume XIII Chapter 463 — Enterprise Procurement & Source-to-Pay is canonical; the conflicting legacy “Enterprise Event & Message Management” heading is document-control correction debt. The domain source is still marked In Development, so these sections do not, by themselves, establish which generic requirement intends which procurement operation or approve requirement-specific acceptance criteria.

## Requirement-level disposition

| Requirement / SRS | Candidate capability | Procurement-domain evidence to reconcile | Existing code evidence | Exact approved HLD/LLD binding | DATA/API/EVENT specification | Acceptance oracle | Disposition |
|---|---|---|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 | authoritative-records / XX01 | §§463.7–463.8, 463.16, 463.18, 463.21–463.23 | `AuthoritativeRecordService`; create/get/update/delete and expected-version conflict; registry IDs only | OPEN — candidate HLD-463-CAP-01; LLD-02/03 are not approved locators | OPEN — `DATA:authoritative-domain`, `API:capability-resource`, `EVENT:material-lifecycle` are descriptors, not full contracts | OPEN — record types, lifecycle, required fields, uniqueness, history and measurable outcomes need approved source | SOURCE PRECEDENCE RESOLVED; REQUIREMENT-TO-DOMAIN JOIN AND ACCEPTANCE OPEN |
| REQ-46302 / SRS-FR-2324 | authorization / XX02 | §§463.3, 463.8, 463.14, 463.16, 463.24–463.25 | Deny precedence/default deny; policy implementation is not the approved role matrix | OPEN — candidate HLD-463-CAP-02; LLD-05 not approved locator | OPEN — `DATA:identity-policy`, `API:secured-capability`, `EVENT:authorization-audit` are descriptors | OPEN — actor × role × tenant × resource × action matrix; denied side effects and audit behavior | SOURCE PRECEDENCE RESOLVED; REQUIREMENT-TO-DOMAIN JOIN, POLICY AND ACCEPTANCE OPEN |
| REQ-46303 / SRS-FR-2325 | business-validation / XX03 | §§463.7–463.8, 463.15–463.16, 463.21–463.25, 463.27 | Registered rules execute; ERROR issues invalidate result | OPEN — candidate HLD-463-CAP-03; LLD-02/06 not approved locators | OPEN — `DATA:domain-rules`, `API:validated-command`, `EVENT:validation-outcome` are descriptors | OPEN — approved rule catalogue, boundary values, error semantics and state invariants | SOURCE PRECEDENCE RESOLVED; REQUIREMENT-TO-DOMAIN JOIN, RULES AND ACCEPTANCE OPEN |
| REQ-46304 / SRS-FR-2326 | audit-evidence / XX04 | §§463.3, 463.14–463.16, 463.18, 463.22, 463.24 | Append/retrieve/list audit evidence and SHA-256 integrity check | OPEN — candidate HLD-463-CAP-04; LLD-09 not approved locator | OPEN — `DATA:audit-record`, `API:audit-retrieval`, `EVENT:audit-material-event` are descriptors | OPEN — material event coverage, required fields, access, retention, integrity and retrieval oracle | SOURCE PRECEDENCE RESOLVED; REQUIREMENT-TO-DOMAIN JOIN, AUDIT POLICY AND ACCEPTANCE OPEN |
| REQ-46305 / SRS-FR-2327 | exception-handling / XX05 | §§463.3, 463.8, 463.14–463.16, 463.22–463.25, 463.27 | Idempotency and controlled exception state transitions; no evidence here of scheduler/backoff/escalation delivery | OPEN — candidate HLD-463-CAP-05; LLD-06/07 not approved locators | OPEN — `DATA:workflow-exception`, `API:recovery-command`, `EVENT:exception-lifecycle` are descriptors | OPEN — exception taxonomy, retry limits/backoff, compensation, escalation, terminal states and no-duplicate effects | SOURCE PRECEDENCE RESOLVED; REQUIREMENT-TO-DOMAIN JOIN, RECOVERY POLICY AND ACCEPTANCE OPEN |
| REQ-46306 / SRS-FR-2328 | governed-reporting / XX06 | §§463.12, 463.15–463.16, 463.24–463.25 | Tenant/report-scoped query, filters and limit | OPEN — candidate HLD-463-CAP-06; LLD-08/09 not approved locators | OPEN — `DATA:derived-reporting`, `API:report-query`, `EVENT:report-refresh` are descriptors | OPEN — approved report catalogue, formulas, source lineage, filters, freshness and expected totals | SOURCE PRECEDENCE RESOLVED; REQUIREMENT-TO-DOMAIN JOIN, REPORT DEFINITIONS AND ACCEPTANCE OPEN |

## How to use this matrix

1. Treat the requirement-register locator and baseline approval as confirmed identity evidence only.
2. Review the detailed procurement BRD against each generic requirement row. Record an exact domain-source section only when it truly defines that requirement’s intended behavior; otherwise mark `CLARIFICATION_REQUIRED`. Do not infer that every capability pattern maps to a procurement process just because it is plausible.
3. Replace candidate HLD/LLD references only with exact locators from the designated, approved design register and record the approval/version/reference. Current candidate labels are not approvals.
4. Expand each DATA/API/EVENT registry descriptor into a versioned contract, or record an explicitly approved N/A. Registry IDs and passing code tests are not full contract definitions.
5. Define measurable positive, negative and boundary oracles from approved sources before authorizing business UAT.

**Gate decision:** SRC-003/G3 remains OPEN / NO-GO. Business UAT remains NOT AUTHORIZED. No baseline requirements or chapter identities were changed; no AWS resources or deployment are involved.


## Closure execution queue — reconciled 2026-10-17

This queue translates the existing six-row evidence matrix and D1–D10 decision register into the next actionable evidence requests. It does **not** mark any approval complete.

| Row | Evidence that can be carried forward now | Exact missing closure item | Existing decision dependency | Next verification action |
|---|---|---|---|---|
| REQ-46301 / SRS-FR-2323 | Requirement identity; Option A source precedence; observed generic authoritative-record service and version-conflict tests | Approved procurement object/field catalogue, lifecycle/state model, exact approved HLD/LLD pair and DATA/API/EVENT contract or approved N/A | D1, D2, D7, D8, D9 | Reconcile candidate requisition/PO entities to approved source; record exact versioned section/schema/operation/event locators only after approval |
| REQ-46302 / SRS-FR-2324 | Requirement identity; observed deny precedence/default-deny technical behavior | Approved actor × role × tenant × resource × action matrix, delegation and SoD rules; exact design/contract locators | D1, D3, D4, D7, D8, D9 | Compare implementation behavior against an approved authority matrix; do not treat default-deny tests as proof that the business matrix is approved |
| REQ-46303 / SRS-FR-2325 | Requirement identity; observed registered-rule execution and ERROR invalidation | Approved validation rule catalogue, requiredness/conditionality, boundary values, stable error semantics and transaction invariants | D1, D2, D5, D7, D8, D9 | Convert source-listed candidate fields into an approved field-level catalogue; leave requiredness/threshold values open until approved |
| REQ-46304 / SRS-FR-2326 | Requirement identity; observed append/retrieve/list and SHA-256 integrity checks | Approved material-event coverage, mandatory audit fields, access/retention/failure policy and exact contracts | D4, D7, D8, D9 | Map each approved material event to the audit envelope, retention/access rules and a reproducible retrieval oracle |
| REQ-46305 / SRS-FR-2327 | Requirement identity; observed idempotency and controlled exception state transitions | Approved exception taxonomy, retry/backoff/compensation/escalation policy, terminal-state semantics and exact contracts | D2, D3, D5, D7, D8, D9 | Trace each exception class to approved owner, allowed transitions, retry/recovery behavior and duplicate-effect test |
| REQ-46306 / SRS-FR-2328 | Requirement identity; observed tenant/report-scoped query, filters and limit | Approved report catalogue, KPI formulas, source lineage, as-of/freshness semantics, reconciliation tolerances and exact contracts | D6, D7, D8, D9 | Bind each report to approved source fields/formula, access scope, freshness target and expected-total oracle |

### Cross-row release conditions

1. **D1–D6:** capture source-backed business decisions in the existing decision register with approval reference, approver/role, effective version/date and controlled evidence locator. A blank field or inferred role is not approval.
2. **D7:** record exact approved HLD and LLD section/module locators for each row; generic pattern references and candidate labels do not count.
3. **D8–D9:** record exact approved DATA/API/EVENT contract IDs, versions and source locators, or an explicitly authorized N/A with rationale.
4. **Acceptance:** create measurable positive, negative and boundary oracles from approved decisions, then tie test results to exact commit/build and archived evidence.
5. **D10:** only after the preceding evidence is complete, issue the controlled BRD/SRS/HLD/LLD/test baseline and update traceability.
6. **Gate separation:** green CI and technical simulation are engineering evidence; they do not authorize Business UAT, freeze G9, or issue G10.

**Current disposition unchanged:** D1–D10 OPEN; exact approved HLD/LLD bindings 0/6; six acceptance oracles BLOCKED; Business UAT NOT AUTHORIZED / NOT EXECUTED; G9 NOT FROZEN; G10 NOT ISSUED. No requirements, IDs, baseline counts, UI journeys, or architecture boundaries are changed.
