# B01 Chapter 470 — Maintenance Acceptance Oracle Recovery (Candidate)

**Status:** Candidate recovery only — owner approval required  
**Scope:** REQ-47001–REQ-47006 / SRS-FR-2365–SRS-FR-2370  
**Source:** EM-BRD-001 Volume XIII, Chapter 470, *Enterprise Maintenance, Asset Reliability, Work Orders & Preventive Maintenance Traceability Matrix*, v1.0; source status **In Development**. Relevant sections: §§470.1–470.4, 470.13–470.16, 470.28–470.34, 470.38–470.43.  
**Control:** This candidate document does not approve acceptance criteria, authorize UAT, or establish exact HLD/LLD or DATA/API/EVENT bindings.

## Requirement-level candidate mapping

| Requirement | Capability | Candidate source-derived acceptance focus | Evidence to capture | Owner decision still required |
|---|---|---|---|---|
| REQ-47001 | Authoritative records / lifecycle | Every managed asset has unique identity, hierarchy and lifecycle status; maintenance work traces to an asset and work order; retirement preserves history. | Asset ID/class/location/serial/owner, parent-child links, lifecycle transition, work-order references, retirement history. | Define in-scope asset classes, required fields, identity/uniqueness, hierarchy rules, lifecycle states/transitions, retention and retirement conditions. |
| REQ-47002 | Authorization | Role-based access and segregation of duties apply to asset, maintenance, safety and cost information; safety-critical work, retirement and material spending require accountable human approval. | Principal/role/tenant, attempted action, allow/deny result, approval identity, audit entry. | Approve role/action matrix, delegated authority, safety-critical classification, separation-of-duties rules and denial response. |
| REQ-47003 | Business validation | Preventive schedules follow approved strategies; safety/compliance work cannot be bypassed without authorized exception; work-order completion requires sufficient evidence. | Strategy/version, schedule/trigger, criticality/risk, required labor/parts/tools/safety/completion fields, validation outcome. | Approve PM trigger rules, criticality bands, due/overdue logic, mandatory completion evidence, safety gates and permitted exceptions. |
| REQ-47004 | Audit evidence | Work-order changes, approvals, completion and asset modifications are audited; evidence is retained according to policy. | Before/after state, actor, timestamp, correlation ID, approval record, completion evidence, audit integrity and retention metadata. | Approve mandatory audit fields, retention, integrity, access and failure behavior when audit persistence fails. |
| REQ-47005 | Controlled exceptions | Controlled manual emergency work may be supported; duplicate maintenance confirmations are prevented; post-outage records are reconciled. | Emergency rationale, approver, work-order state, idempotency/correlation key, reconciliation record and recovery evidence. | Approve exception taxonomy, emergency approval authority, retry/compensation/recovery rules and conflict-resolution ownership. |
| REQ-47006 | Governed reporting | Reports cover PM compliance, backlog, downtime, MTBF, MTTR, availability, maintenance cost, spare consumption and contractor performance; KPIs drill through to asset/work-order evidence and reconcile to source transactions. | KPI definition/version, source transactions, as-of time, drill-through lineage, reconciliation output, access decision. | Approve report catalogue, KPI formulas/owners, freshness SLA, filters, reconciliation tolerance and tenant access. |

## Minimum negative-path candidates for owner review

1. Reject duplicate asset identity or invalid hierarchy/lifecycle transition according to the approved master-data rule.
2. Deny safety-critical maintenance release, asset retirement or material spending without required human approval.
3. Prevent work-order completion when approved mandatory labor, parts, safety or completion evidence is missing.
4. Reject duplicate maintenance confirmations without duplicate state changes or duplicate material consumption.
5. Require approved exception handling for emergency work and reconcile any controlled manual record after recovery.
6. Reconcile KPI totals to source work orders and assets; deny report access outside the approved tenant/role scope.

These are **candidate scenarios**, not executable pass/fail oracles until the business owner approves exact rules, fixtures, responses and state expectations.

## Decision and traceability status

- Chapter 470 domain source recovered: **YES — in-development source**.
- Requirement-specific acceptance oracle approved: **0/6 evidenced**.
- Exact approved HLD → LLD binding evidenced by this source: **0/6**.
- DATA/API/EVENT contract or approved N/A evidenced by this source: **0/6**.
- Business UAT authorization: **NO**.
- Required next decision: maintenance/asset business owner approves or corrects each candidate rule and identifies the controlled approval/change reference; architecture/data owners separately confirm exact design and contract locators.

Preserve the 228-requirement / 38-chapter baseline. Do not convert candidate criteria into approval or UAT pass status.
