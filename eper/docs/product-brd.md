# EPER Product-Level Business Requirements Document (BRD)

**Baseline:** 2026-10-27 · **Status:** Product design baseline — pending stakeholder review  
**Product:** EPER multi-tenant enterprise workflow and application platform

## 1. Business objective
Provide organizations with a modular, tenant-isolated platform to configure applications, manage workflows, automate governed sales/marketing/CRM work, handle payments and receipts, and monitor outcomes. The platform must support product-level commercial administration without mixing platform controls into customer application settings.

## 2. Stakeholders and ownership
- **Platform/Product Admin:** product catalogue; localized market price books; plans/tariffs; customer and application registry/assignment; entitlements; client/application access enablement, suspension and disablement; pricing approvals and audit.
- **Customer Admin:** settings for applications assigned to that customer; application integrations (payments, messaging/WhatsApp, storage, video conferencing, alerts), users/roles within granted permissions, workflows, and enabled add-ons.
- **Customer operators:** perform permitted application workflows and review AI-generated drafts.
- **Finance/payment operations:** reconcile quotes, payment outcomes, invoices and receipts.
- **Auditor/support:** inspect authorized activity and evidence without bypassing tenant boundaries.

## 3. Business requirements
- **BR-01 Modular product:** modules/add-ons are separately catalogued, entitled and permissioned; enabling one does not implicitly enable another.
- **BR-02 Multi-tenancy:** all customer data, settings, files, workflow execution, agents, pricing assignments and audit evidence are tenant-scoped.
- **BR-03 Application scope:** customer operational settings belong to a specific customer application, not a global singleton.
- **BR-04 Product commercial control:** Product Admin owns products, localized market pricing, plans, tariffs, versioned prices and approval rules.
- **BR-05 Localization:** support locale/language, time zone and formatting preferences separately from authoritative market and contracted currency.
- **BR-06 Pricing integrity:** market selects an explicitly approved price; locale changes never silently convert or reprice. Accepted customer/application price snapshots remain stable unless an approved contract change is recorded.
- **BR-07 Customer/app lifecycle:** Platform Admin can register customers and applications, assign applications, and enable/suspend/disable access with reason and audit trail.
- **BR-08 Workflow and automation:** configurable workflows and asynchronous background actions must support retries, idempotency and observable status.
- **BR-09 AI assistance:** CRM, Sales and Marketing agents produce drafts; external publishing, outbound messaging and CRM writes require explicit human approval and authorization.
- **BR-10 Integrations:** application-specific configuration for payment provider, messaging/WhatsApp, storage/file sharing, video conferencing and alerts/notifications.
- **BR-11 Payments:** quote is server-authoritative; payment, invoice and receipt use the same accepted amount, currency and price version; receipt download is mandatory after successful payment.
- **BR-12 Auditability:** durable, correlated audit events for access, commercial, workflow, integration, agent approval and payment actions.
- **BR-13 Responsive experience:** mobile-compatible customer and admin surfaces with accessible navigation, forms, tables and status feedback.
- **BR-14 Resilience:** PostgreSQL is the transactional system of record; fail closed for sensitive writes during unsafe outages; verified HA/backup recovery must be operationally tested before production claims.
- **BR-15 Evidence gates:** CI, technical UAT and business acceptance are separate; no Business UAT acceptance without approved criteria and evidence.

## 4. Scope
**In scope:** platform admin commercial controls, customer/application separation, product localization and market pricing, entitlement/RBAC model, app settings, workflow automation, governed AI agent drafts, payment/receipt consistency, audit, responsive UI, documentation and controlled UAT.

**Out of scope unless separately approved:** automatic external actions without human approval; unapproved live payment charging; provisioning chargeable cloud infrastructure; unsupported provider integrations; silent FX conversion; cross-tenant resource sharing.

## 5. Business success measures
- Zero cross-tenant data/configuration access in negative tests.
- Zero unauthorized price or entitlement mutations.
- 100% traceability for commercial and access mutations to actor, reason, version and audit event.
- Quote/payment/invoice/receipt consistency across amount and currency.
- All external AI actions remain approval-gated.
- No critical/high regression failures before Business UAT entry.
- Mobile layouts usable at narrow viewport widths.

## 6. Assumptions and open decisions
Canonical identity provider, customer/application registry source, tax treatment by market, supported locales/markets, entitlement grace-period rules, cancellation/refund policy, and production SLO/RPO/RTO require product/business owner confirmation. This BRD is a proposed product baseline, not evidence of complete implementation or approval.


## Product Admin ticketing and feedback

Product Admin requires authorized access to the consolidated ticket and feedback queue to review product-wide trends, triage duplicates, confirm severity, monitor P1 candidates, assign accountable owners, and verify closure evidence. Customer-facing submissions remain tenant-scoped; cross-tenant visibility is available only to explicitly authorized platform support/admin roles and must be audited. Feedback, feature requests, questions and confirmed defects remain distinct record types. Security/privacy reports require restricted visibility and immediate escalation.

Product Admin's pricing console now includes a Feedback & Ticketing entry point to the separate authenticated support workspace. This is navigation, not a new ticketing data store; runtime access remains governed by the support API's identity, role, tenant scope and environment configuration.


## Ticketing and feedback scope requirements
- Product Admin/support roles may review the consolidated client ticket/feedback queue across tenants only when explicitly authorized; access and mutations must be audited.
- Customer users may submit and follow up on tickets only for their own tenant and selected application. The application list must come from trusted membership and the server must revalidate scope on every operation.
- Product Admin queue filters must include customer, application, type, severity, status and owner. Customer-facing queue views must not reveal other applications or tenants outside the actor's permitted scope.
- Ticketing/feedback is available to both client and Product Admin roles but presents different scope: client = own application; Product Admin = authorized client-wide oversight.
