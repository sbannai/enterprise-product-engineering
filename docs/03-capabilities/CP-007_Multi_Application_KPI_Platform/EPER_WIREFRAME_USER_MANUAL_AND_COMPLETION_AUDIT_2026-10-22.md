# EPER Wireframe User Manual & Functionality Completion Audit

**Assessment date:** 22 October 2026  
**Scope:** Multi-Application KPI Platform wireframe  
**Status:** Engineering assessment; not production certification or UAT approval.

## Executive summary

- **8/8 screens represented** in the interactive wireframe (100% screen representation).
- **9 demo personas** are selectable.
- **0/8 screens verified fully operational end-to-end** against authenticated APIs, persistent data, and real business workflows.
- All eight screens have some navigation/display interaction. That is prototype coverage, not production completion.
- Six capability-service classes and tenant-scoped permission-policy components exist in the backend, but the UI is not connected end-to-end.
- B01 remains **HOLD / NOT EXECUTED**. The current closure audit reports **0/13 E1–E13 gates closed** and **48/48 cases not authorized**.

The 0/8 figure is a conservative end-to-end assessment, not a claim that no backend code exists.

## 1. Getting started

1. Open the [interactive wireframe](./wireframes/multi-application-platform-wireframes.html) in a modern browser.
2. Use **Switch user** in the header to preview the nine personas.
3. Use the left navigation to open Overview, Applications, Flow studio, Run history, Users & access, Permissions, App KPIs, and Audit & evidence.
4. Treat role-based hiding/disablement as a demo behavior, not proof of server-side access control.
5. Treat all displayed counts, KPIs, activities, payment/receipt examples, and audit items as illustrative unless independently verified against connected systems.

## 2. Screen-by-screen user manual

### 2.1 Overview

**Purpose:** Landing page with role-specific summary cards and quick actions.

- Switch persona to change the greeting, metric labels, illustrative values, and primary action.
- Use **View audit trail** to navigate to Audit & evidence.
- Use the primary action to preview the persona's intended workflow.
- **Current limitation:** values are synthetic; primary actions may show alerts or navigate rather than save data.

### 2.2 Applications

**Purpose:** Application registry and role-scoped discovery.

- Open Applications when it is available for the selected persona.
- Review the sample application entries and their displayed context.
- Use **Register application** only as a preview; the current action does not persist a new application.
- **Production requirements:** validated create/read/update APIs, persistent records, tenant isolation, duplicate handling, and server-side authorization.

### 2.3 Flow studio

**Purpose:** Preview workflow design and simulation paths.

- Trigger simulation to generate synthetic run, event, and correlation identifiers.
- Try validation, authorization, and duplicate-event fault controls to preview blocked outcomes.
- **Current limitation:** the prototype states that no external system is called. Simulated outcomes are not real execution evidence.

### 2.4 Run history & trace viewer

**Purpose:** Inspect displayed run outcomes and trace identifiers.

- Open Run history or trigger a permitted prototype simulation.
- Review the outcome, step states, event ID, and correlation ID.
- **Current limitation:** values are generated in browser memory and do not establish persisted run history.
- **Production requirements:** persisted runs, unique stable IDs, searchable filters, tenant-scoped retrieval, and evidence-backed state transitions.

### 2.5 Users & access

**Purpose:** Demonstrate users, roles, and capability bundles.

- Review the hard-coded demo user list and active-preview indicator.
- The invite action is a prototype only; it does not send an invitation.
- **Production requirements:** identity-provider integration, invitation lifecycle, membership persistence, tenant-scoped administration, and audit records.

### 2.6 Permission management

**Purpose:** Preview action grants scoped by principal, application, and environment.

- Choose the target principal, application, and environment.
- Select **ALLOW** or **DENY** for each action. The prototype defaults to DENY.
- **Save draft** updates browser-side state only. **Reset** clears the prototype draft to DENY.
- Backend policy components and an opt-in local permission API exist separately; this screen is not integrated with them.
- **Production requirements:** verified identity, server-side scope checks, persisted grants, explicit-deny precedence, atomic/audited changes, and enforcement on every protected API route.

### 2.7 Application KPI dashboard

**Purpose:** Preview application KPI cards and export affordance.

- Review sample KPI cards and persona context.
- The export control is a placeholder; no live KPI query or file generation is connected.
- **Production requirements:** governed KPI definitions, live aggregation, filters/time ranges, access checks, and verified export files.

### 2.8 Audit & evidence

**Purpose:** Preview audit/evidence activity and traceability.

- Review sample activity and trace identifiers.
- The export action is not connected to live records. Do not use this screen as audit evidence or certification proof.
- **Production requirements:** tamper-evident event capture, actor/time/scope metadata, authorized retrieval, export integrity, and retention controls.

## 3. Persona guide

| Persona | Intended demo experience |
|---|---|
| Maya Chen — Platform Admin | Platform overview, applications, users, permissions, KPIs, audit, registration and simulation controls |
| Arjun Rao — Customer Admin | Tenant-oriented application administration, users/access, permissions, simulation |
| Priya Nair — Workflow Designer | Workflow design and simulation-oriented experience |
| Neha Shah — Reviewer | Review/evidence-oriented view with restricted operational controls |
| Ravi Kumar — Approver | Approval/review-oriented view with restricted operational controls |
| Imran Ali — Application Operator | Assigned apps, run history, KPI monitoring and eligible simulation |
| Kavya Das — Finance Operator | Payment/receipt-themed views; displayed finance data is illustrative |
| Dev Patel — Auditor | Read-only run, KPI and audit/evidence-oriented navigation |
| Sam Lee — End User | Assigned applications and self-service-themed view; submissions/receipts are illustrative |

## 4. Functionality completion matrix

| Screen | Current state | Key gap | Assessment |
|---|---|---|---|
| Overview | Prototype interaction | Synthetic metrics; no live dashboard source | Not end-to-end complete |
| Applications | Prototype interaction | Registration does not save a record | Not end-to-end complete |
| Flow studio | Interactive simulation | Synthetic IDs/outcomes; no external system call | Not end-to-end complete |
| Run history | Prototype display | Browser-generated values; no verified persistence | Not end-to-end complete |
| Users & access | Prototype interaction | Hard-coded personas; invite does not send | Not end-to-end complete |
| Permissions | Browser draft plus backend policy foundation | Screen does not call API or persist grants | Partial foundation; screen not integrated |
| App KPIs | Prototype display | Illustrative data; no live query/export | Not end-to-end complete |
| Audit & evidence | Prototype display | Export not connected to live records | Not end-to-end complete |

## 5. Cross-cutting gaps

- **Identity/session:** no identity-provider integration verified; persona switching is a demo selector.
- **Server-side permissions:** policy helpers and an opt-in local API exist, but enforcement across every UI/API route is not established.
- **Persistence:** capability services use in-memory stores or optional local JSON-file persistence; this is not production-grade transactional storage.
- **Tenant/application isolation:** policy primitives exist; end-to-end route and persisted-data isolation tests remain necessary.
- **Payment gateway:** end-to-end payment integration was not verified in the reviewed screen/API paths.
- **Unique transaction and receipt IDs:** required, but not verified end-to-end.
- **E-commerce receipts:** checkout line items and totals must reconcile with the authoritative, verified gateway amount/status; not verified.
- **Receipt download:** receipt actions are described in the wireframe, but no live receipt record/download integration was verified.
- **KPIs and exports:** displayed/exported data is not connected to live governed reporting.
- **Audit evidence:** wireframe audit/export is not connected to live records.
- **Workflow execution:** simulation is synthetic and does not call external systems.
- **Automated UI/API tests:** add persona, authorization, tenant-isolation, payment, receipt, and export coverage.

## 6. Recommended implementation sequence

1. Connect verified authentication and tenant/application/environment context; keep persona switching only in explicitly labeled demo mode.
2. Complete durable data models and migrations for applications, memberships, grants, runs, KPI records, audit events, payments, and receipts.
3. Connect Permissions UI to secured APIs; test deny-by-default, explicit DENY precedence, cross-tenant rejection, and audit logging.
4. Implement Applications and Users & access flows with validation and persistence.
5. Connect Flow studio to real workflow validation/execution; persist run/event/correlation identifiers and searchable run history.
6. Implement payment gateway order/payment verification and webhook handling; do not trust browser-submitted amounts.
7. Implement receipt generation/download with unique receipt and transaction IDs. For e-commerce, reconcile checkout line items and totals against the verified gateway amount/status.
8. Connect KPI queries/authorized exports and audit/evidence retrieval with integrity controls.
9. Add end-to-end tests for all personas and screens, including forbidden actions, tenant isolation, payment failures, duplicate callbacks, receipt totals, and export authorization.
10. Start business UAT only after entry gates, case-level measurable acceptance, tester identity, target configuration, and explicit authorization are closed.

## 7. Definition of complete

Count a screen as complete only when documented actions call authenticated APIs, enforce tenant/application/environment permissions server-side, persist and retrieve real data, handle validation and failure states, and pass automated tests. Payment/receipts additionally require gateway verification, idempotency, unique identifiers, and amount reconciliation. Audit/export requires authorization, traceability, integrity, and verified file contents.

This assessment is not business sign-off. The current B01 closure audit reports 0/13 E1–E13 gates closed and 48/48 cases not authorized; B01 remains HOLD / NOT EXECUTED. A green CI run does not mean UAT is closed.

## 8. Source references

- [Interactive wireframe](./wireframes/multi-application-platform-wireframes.html)
- [Repository branch](https://github.com/sbannai/enterprise-product-engineering/tree/proposal/multi-tenant-app-kpi-contracts)
- Permission policy: `eper/packages/tenant/application-access.ts`
- Permission admin service: `eper/packages/tenant/application-grants.ts`
- Capability services: `eper/packages/capabilities/services.ts`
- API server: `eper/apps/api/server.ts`
- [Current B01 closure audit](https://github.com/sbannai/enterprise-product-engineering/blob/proposal/multi-tenant-app-kpi-contracts/eper/uat/B01_CURRENT_CLOSURE_AUDIT_2026-10-22.md)
