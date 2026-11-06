# EPER Software Requirements Specification — v2
**Baseline:** 2026-10-31 | **Status:** Controlled draft; detailed requirement-level acceptance oracles remain subject to owner review.

## 1. Functional requirements
SRS-001 The system shall preserve 228 approved requirement IDs and 38 chapters; deltas require controlled crosswalk.
SRS-002 Every tenant/application read, write, list, export, download and asynchronous action shall enforce trusted server-side tenant and actor/application assignments.
SRS-003 Assignment create/revoke/regrant shall be versioned, durable and audited; stale versions shall conflict.
SRS-004 Platform Admin and Customer Admin responsibilities shall remain separated.
SRS-005 Product and market price books shall be approved, versioned and effective-dated; locale shall not reprice.
SRS-006 Quote snapshots shall bind tenant, application, product, market, amount, currency, price version and expiry.
SRS-007 Payment orders/webhooks shall verify signatures and server-side captured status; duplicate requests/events shall be idempotent.
SRS-008 A uniquely numbered receipt PDF shall be downloadable only for a captured, verified payment by an authorized tenant actor.
SRS-009 Workflow/scheduler work shall persist schedule, execution, attempt, lease/fence, correlation and outcome.
SRS-010 Workers shall trigger due work independently of user/browser polling, recover stale leases, retry boundedly and expose diagnostics.
SRS-011 Workers shall re-check assignment, role, entitlement, access, approval and consent before side effects.
SRS-012 AI agents shall persist drafts; creator/reviewer separation shall apply where configured; approval alone shall not execute.
SRS-013 External messaging, publishing and CRM writes shall remain disabled absent explicit approval, authorization and enabled provider configuration.
SRS-014 Integration credentials shall remain server-side; configuration is tenant/application/environment scoped and versioned.
SRS-015 Assets and signed downloads shall enforce actor/application scope and trusted HTTPS storage hosts.
SRS-016 Ticketing shall separate client own-application access from privileged Product Admin oversight.
SRS-017 Audit shall record attributable success, denial and failure events; protected mutations shall fail closed on audit/persistence failure.
SRS-018 KPI, conferencing, notification and support surfaces shall clearly indicate live versus preview state.
SRS-019 All APIs shall use standardized envelopes, stable errors, correlation IDs and safe diagnostics.
SRS-020 UI shall support responsive layouts, accessible feedback and role-appropriate navigation.

## 2. Non-functional requirements
Security: least privilege, non-disclosing denials, secret redaction, secure webhook verification. Reliability: durable PostgreSQL, idempotency, bounded retry and recovery. Performance: define measured targets before production. Operability: health/readiness, metrics, logs, diagnostics and runbook. Compatibility: schema/API versioning and migration rollback plan. Accessibility: keyboard navigation, labels, contrast and status announcements. Privacy: retention, data residency and consent policies require owner decision.

## 3. Acceptance evidence
Each requirement needs unique ID, source, design locator, API/data/event contract, test case, expected result, execution run/build, artifact and reviewer decision. A proposal, source file, merged PR or queued workflow is not a passing test. No Business UAT until controlled baseline, acceptance oracles, required E1–E13 gates, deployment identity and explicit authorization are satisfied.
