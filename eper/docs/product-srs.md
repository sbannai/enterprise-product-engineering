# EPER Product-Level Software Requirements Specification (SRS)

**Baseline:** 2026-10-27 · **Status:** Proposed testable requirements; acceptance owners to confirm.

## 1. Purpose
Define testable software requirements for the EPER multi-tenant product, including commercial administration, localization, application settings, workflows, integrations, AI-assisted CRM/Sales/Marketing and payment/receipt handling.

## 2. Functional requirements
- **SRS-F-001:** The system shall authenticate each user and derive actor and tenant from trusted server-side identity.
- **SRS-F-002:** The system shall reject access to an application that is not assigned to the authenticated tenant.
- **SRS-F-003:** Platform Admin shall create and maintain product catalogue records and lifecycle status.
- **SRS-F-004:** Product Admin shall maintain market-specific price entries with ISO currency, integer minor-unit amount, version, approval state and effective interval.
- **SRS-F-005:** The price resolver shall select only one approved effective entry for the requested product and market; zero or ambiguous matches shall fail closed.
- **SRS-F-006:** Changing locale or display formatting shall not change the authoritative market price or accepted contract amount.
- **SRS-F-007:** A market change shall select an explicit market price and shall not silently convert the prior amount using FX.
- **SRS-F-008:** Existing accepted price snapshots shall remain unchanged by later catalogue edits absent an approved contract amendment.
- **SRS-F-009:** Platform Admin shall register customers, applications and assignments and manage access state with a mandatory reason and audit record.
- **SRS-F-010:** Customer Admin shall only modify settings for authorized applications and entitled modules.
- **SRS-F-011:** Integration configuration shall be scoped to tenant, application, integration and environment.
- **SRS-F-012:** The system shall support configured locale, time zone, number/date formatting and supported translation messages independently of contracted currency.
- **SRS-F-013:** Long-running operations shall return promptly with a job/correlation ID and expose asynchronous status.
- **SRS-F-014:** AI agents shall save generated CRM/Sales/Marketing outputs as drafts requiring distinct reviewer approval before external action.
- **SRS-F-015:** Payment initiation shall use a server-generated quote and idempotency key; production providers shall remain unavailable until explicitly configured and approved.
- **SRS-F-016:** Successful payments shall produce a downloadable receipt referencing the authoritative payment/price snapshot.
- **SRS-F-017:** The system shall record durable audit events for commercial, access, configuration, approval and payment lifecycle changes.
- **SRS-F-018:** API responses shall conform to the shared response schema and use stable error codes.
- **SRS-F-019:** The UI shall be responsive at mobile, tablet and desktop widths.
- **SRS-F-020:** Missing entitlement, identity, audit or persistence dependencies shall not result in a permissive fallback.

## 3. Non-functional requirements
- **SRS-NF-001 Security:** tenant isolation and least privilege enforced on server and background jobs.
- **SRS-NF-002 Integrity:** quote, payment, invoice and receipt must agree on amount, currency and accepted price version.
- **SRS-NF-003 Durability:** production business writes must use durable persistence; process-memory state is preview-only.
- **SRS-NF-004 Audit:** mutation events are correlated and queryable; secrets never enter audit payloads.
- **SRS-NF-005 Resilience:** defined RPO/RTO must be demonstrated by controlled failover and restore drills before production approval.
- **SRS-NF-006 Performance:** asynchronous operations should return an accepted/job response within an agreed latency budget; numerical SLOs require owner approval and load-test evidence.
- **SRS-NF-007 Accessibility:** keyboard access, focus visibility, semantic labels and live status feedback.
- **SRS-NF-008 Maintainability:** modular packages and explicit interfaces; no cross-domain UI/API coupling.
- **SRS-NF-009 Observability:** health/readiness, structured logs, correlation IDs, metrics and actionable errors.
- **SRS-NF-010 Portability:** provider-neutral integration contracts and environment-based configuration with secrets externalized.

## 4. Acceptance strategy
Trace each requirement to implementation path, automated test, CI run, deployment/environment evidence and business owner decision. A passing unit/CI test is not Business UAT acceptance. Product Admin workflows remain blocked from production claims until persistent APIs, authorization, audit, approval and payment consistency are verified.

- **SRS-F-021:** Product Admin shall have a discoverable entry point to the authorized ticketing and feedback queue.
- **SRS-F-022:** Ticket management shall distinguish defects, feedback, feature requests and questions; only confirmed evidence-backed issues may count toward P1 tracking.
- **SRS-F-023:** Admin ticket access shall be role-authorized, audited and scoped to the permitted tenant/support boundary; the Product Admin console shall not forward its bearer token into the support workspace.
- **SRS-F-024:** The product shall provide a user manual describing Product Admin commercial workflows, customer application settings, ticket triage, AI approval, payment/receipt checks and POC limitations.
