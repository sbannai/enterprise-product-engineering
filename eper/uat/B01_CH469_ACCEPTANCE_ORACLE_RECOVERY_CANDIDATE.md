# B01 Chapter 469 — Quality Acceptance Oracle Recovery (Candidate)

**Status:** Candidate recovery only — owner approval required  
**Scope:** REQ-46901–REQ-46906 / SRS-FR-2359–SRS-FR-2364  
**Source:** EM-BRD-001 Volume XIII, Chapter 469, *Enterprise Quality Management, Inspection, Nonconformance, CAPA, Audit & Traceability Matrix*, v1.0, marked **In Development**. Relevant sections: §§469.1–469.3, 469.30–469.34, 469.36–469.38.  
**Control:** This document does not approve acceptance criteria, authorize UAT, or establish exact HLD/LLD bindings.

## Requirement-level candidate mapping

| Requirement | Capability | Candidate source-derived acceptance focus | Evidence to capture | Owner decision still required |
|---|---|---|---|---|
| REQ-46901 | Authoritative records / lifecycle | Inspection plans/results and quality records are versioned and traceable to applicable product, process, material, lot/serial, order and operator context where required. | Plan revision, result/sample, linked product/lot/order, lifecycle history. | Define in-scope record types, mandatory fields, lifecycle states, uniqueness, retention and required traceability links. |
| REQ-46902 | Authorization | Quality-sensitive actions must enforce roles and segregation of duties; Quality Management retains authority for inspection acceptance, disposition, release and CAPA verification. | Actor/role/tenant, authorization decision, approval identity, denied-action audit event. | Approve role-to-action matrix, delegated authority, segregation-of-duties rules and denial response. |
| REQ-46903 | Business validation | Failed inspection results trigger configured containment/hold; inspection criteria and quality rules must be defined before applicable execution. | Inspection criteria revision, measured values, threshold evaluation, hold/containment transition. | Approve measurement limits, sampling rules, severity thresholds, validation order and exception conditions. |
| REQ-46904 | Audit evidence | Inspection, disposition, release, CAPA and certificate changes are auditable; quality records are protected and retained according to policy. | Before/after state, actor, timestamp, correlation ID, audit record and integrity evidence. | Approve mandatory audit fields, retention, access, integrity, and behavior when audit persistence fails. |
| REQ-46905 | Controlled exceptions | Nonconformance is contained and dispositioned by authorized personnel; CAPA closure requires effectiveness verification. | Nonconformance record, containment, disposition approval, root cause, action owner/due date, effectiveness evidence. | Approve exception taxonomy, permitted dispositions, approval authority, reopening/retry and recovery rules. |
| REQ-46906 | Governed reporting | Quality analytics should derive reliable defect, supplier, CAPA, audit, quarantine and recall-traceability measures from governed source data. | Report definition/version, source lineage, as-of time, KPI inputs/formula and access decision. | Approve report catalogue, KPI formulas/owners, freshness SLA, filters, reconciliation tolerance and tenant access. |

## Minimum negative-path candidates for owner review

1. Reject a disposition or quality release attempted by a role without approved authority; no business-state mutation is permitted.
2. A failed inspection must not silently proceed to release; the approved hold/containment rule must be applied.
3. CAPA cannot be marked effectively closed without the approved effectiveness evidence.
4. A certificate must not be generated from missing, stale or unapproved source data.
5. A duplicate disposition/inspection submission must not create duplicate material effects.
6. A report must not expose quality records outside the caller's authorized tenant/scope.

These are **candidate scenarios**, not executable pass/fail oracles until the business owner approves exact rules, fixtures, responses and state expectations.

## Decision and traceability status

- Chapter 469 source recovered: **YES — in-development source**.
- Requirement-specific acceptance oracle approved: **0/6 evidenced**.
- Exact approved HLD → LLD binding evidenced by this source: **0/6**.
- DATA/API/EVENT contract or approved N/A evidenced by this source: **0/6**.
- Business UAT authorization: **NO**.
- Required next decision: quality business owner approves or corrects each candidate rule and identifies the controlled approval/change reference; architecture/data owners separately confirm exact design and contract locators.

Preserve the 228-requirement / 38-chapter baseline. Do not convert candidate criteria into approval or UAT pass status.
