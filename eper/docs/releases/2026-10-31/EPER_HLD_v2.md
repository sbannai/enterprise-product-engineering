# EPER High-Level Design — v2
**Baseline:** 2026-10-31 | **Status:** Target architecture; implementation evidence varies.

## 1. Architecture
Experience layer (Platform Admin, Customer Portal, per-application workspaces, responsive wireframes) → identity/context resolver → single API/execution router → six capability families/services → domain adapters and PostgreSQL. Cross-cutting services: policy/entitlement, audit/outbox, async scheduler/workers, secrets, observability and evidence.

## 2. Control planes
**Platform control plane:** products, market price books, plans/tariffs, customers, application registry/assignment, entitlements, access and privileged support oversight.
**Customer plane:** only assigned applications; actor membership and app allowlists; settings, workflows, integration configuration, assets, conferencing, notifications, KPI and support.
Do not mix global platform administration with tenant operational configuration.

## 3. Capability/service boundaries
Six capability families remain behind the existing shared router. Each service owns its domain contract and validation; no direct cross-family database mutation. Shared concerns use explicit interfaces: authenticated principal, tenant/application context, authorization decision, correlation ID, durable job, audit event and standardized response envelope.

## 4. Persistence and async
PostgreSQL is the target durable transactional system of record. Durable tenant/application and actor/application assignment stores are authoritative for customer scope. Scheduler uses durable schedules, execution records, dispatch fences/leases, bounded retries, stale-worker recovery, dead-letter handling and execution diagnostics. Workers re-check tenant/application assignment, role, entitlement, access state, approval and idempotency immediately before side effects. No silent memory fallback for protected state. HA/failover must fence the old primary; backup/restore and recovery require drills before production claims.

## 5. Security
Deny by default. Scope is derived from trusted identity and durable membership, never caller-provided tenant labels. Enforce on API, data access, download and background-job boundaries. Cross-tenant denial must not disclose resource existence. Secrets are server-side managed references; logs/audit redact credentials. High-risk changes use maker-checker and reason/version preconditions.

## 6. Commercial and payment flow
Explicit product + market + approved price version → authoritative quote snapshot → provider adapter (test mode by default) → independently verified captured payment/webhook → transactional payment record → immutable invoice/receipt metadata → authenticated tenant-scoped PDF download. Locale is presentation only. Unknown outcomes are reconciled, never blindly retried. Production gateway activation requires separate authorization.

## 7. Governed AI and integrations
CRM/Sales/Marketing agents create durable drafts. Creator cannot approve own draft where maker-checker applies. Approval is not execution. External action adapter rechecks consent/opt-out, scope, approval, integration readiness, rate limit and idempotency. WhatsApp/email/social/CRM writes disabled by default. Assets use allowlisted HTTPS storage hosts and scoped download authorization. Conferencing, notifications and KPI integrations are per application.

## 8. Support and audit
Ticket service is a separate domain. Customer ticket access is own tenant + assigned application; Product Admin cross-tenant queue access requires explicit platform-support permission and is audited. Audit events include actor/effective roles, tenant/application/environment, action/outcome/reason, resource, correlation/request IDs, build/schema and integrity linkage. High-risk mutations fail closed if durable audit cannot be committed.

## 9. Deployment constraints
Local development/integration testing first. Do not provision chargeable AWS resources. Feature flags off by default for external providers. Distinguish mainline source, PR head, CI evidence, deployed build and UAT evidence.
