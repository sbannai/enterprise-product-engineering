# EPER Business Requirements Document — v2
**Baseline date:** 2026-10-31 | **Status:** Controlled draft for owner review; not a UAT authorization.

## 1. Business outcome
EPER is a multi-tenant, modular enterprise application platform that manages customer applications, configurable workflows, product commercial controls, payments/receipts, support, integrations, KPI visibility and governed AI-assisted sales/marketing/CRM operations.

## 2. Actors and ownership
- Platform/Product Admin: product catalogue, market price books, plans/tariffs, customers, application assignment, entitlements, access state, platform-wide support oversight and audit.
- Customer Admin: only assigned customer applications; users and actor/application assignments within granted authority; workflows, integrations, assets, conferencing, notifications and enabled add-ons.
- Operator/Reviewer: perform assigned workflows; review AI drafts; approval authority is separate from execution authority.
- Finance: quote/payment reconciliation, invoices and receipts.
- Support/QA/Auditor: scoped ticket triage, verification and evidence review.

## 3. Business requirements
BR-01 Modular capability bundles and explicit entitlements. BR-02 Tenant isolation for every record, query, job, file, integration and audit item. BR-03 Application-scoped operational configuration. BR-04 Product Admin owns commercial catalogue and approved versioned price books. BR-05 Locale affects display formatting only; market and contract snapshot govern charges. BR-06 Customer/application lifecycle and actor/application assignment are durable, revocable, versioned and audited. BR-07 Workflow execution is asynchronous, durable, observable, idempotent and recoverable. BR-08 PostgreSQL is the target transactional system of record; no silent in-memory or alternate-engine fallback for protected writes. BR-09 Payment is server-authoritative, idempotent and reconciled; captured payment alone can issue a uniquely numbered authenticated downloadable receipt. BR-10 CRM/Sales/Marketing/WhatsApp actions are draft-first; all external sends, publishing and CRM writes require explicit human approval and re-authorization at execution. BR-11 Integrations are tenant/application/environment scoped; secrets stay server-side. BR-12 Ticketing separates customer own-application access from explicitly privileged Product Admin cross-tenant oversight. BR-13 KPI, assets/file sharing and conferencing are application-scoped and auditable. BR-14 Standard API envelope, correlation IDs, stable errors, accessibility and responsive UX. BR-15 CI, technical simulation, UAT and business acceptance are distinct evidence states. BR-16 No chargeable cloud resources or production integrations without explicit approval.

## 4. Scope / controls
Preserve the approved 228 requirements, 38 chapters, six capability families and single execution router. New deltas are supplemental until change-authority approval and canonical crosswalk. Do not renumber or close baseline requirements by implication. No production payment activation, external messaging, cloud provisioning or Business UAT is authorized by this document.

## 5. Success measures
Zero cross-tenant/unauthorized access; no duplicate financial or external effects; quote/payment/invoice/receipt exact consistency; 100% attributable high-risk mutations; durable restart-safe state; all external AI actions approved; critical/high test failures resolved before UAT entry.

## 6. Decisions/open items
Confirm provider/currency policy, tax/refund/chargeback policy, receipt numbering and legal fields, identity-provider mapping, approval thresholds and separation of duties, supported markets/locales, retention/data residency, SLO/RPO/RTO and integration provider approvals.
