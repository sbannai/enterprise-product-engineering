# EPER Product-Level High-Level Design (HLD)

**Baseline:** 2026-10-27 · **Status:** Target architecture; implementation maturity varies by component.

## 1. Architecture principles
1. Tenant and application scope are derived from trusted server-side identity and membership.
2. One API/router layer mediates capability execution; capability families remain modular.
3. PostgreSQL is the authoritative transactional store for business state, entitlements, payments and durable audit where implemented.
4. Product commercial controls are separate from customer operational configuration.
5. Async actions are queued/durable, idempotent and observable; clients should not wait for long-running jobs.
6. AI outputs are drafts until a distinct authorized reviewer approves an action.
7. Fail closed for sensitive operations if identity, entitlement, audit or persistence dependencies are unavailable.
8. No chargeable infrastructure or production payment activation without explicit approval.

## 2. Logical components
- **Experience layer:** Platform Admin console; Customer Portal; per-application Settings; responsive wireframes.
- **Identity & access:** authenticated principal, tenant membership, role permissions, application assignment, module/add-on entitlements.
- **Product control plane:** product catalogue, market price books, plan/tariff versions, customer/application registry, subscription snapshots, access state.
- **Application configuration:** integration settings and credential references scoped to tenant + application + integration + environment.
- **Workflow/capability layer:** six capability families behind the shared router; workflow definitions/steps/actors/assignments; audit evidence.
- **Agent layer:** CRM/Sales/Marketing draft creation, review, approval/rejection and controlled execution adapters.
- **Payments:** authoritative market quote → sandbox/live adapter boundary → payment state → invoice/receipt; production adapter separately approved.
- **Async execution:** scheduler, workers, retry/dead-letter handling, stale-worker recovery and idempotency.
- **Persistence:** PostgreSQL transactional stores and migrations; external secret store for secret material; independently verified backup/HA process.
- **Observability:** standardized response envelope, correlation IDs, health/readiness, metrics, durable audit and evidence manifests.

## 3. Scope boundaries
**Platform Admin owns:** customers, registered applications/assignment, products, localized prices, plans/tariffs, entitlements and client/application access state.

**Customer Admin owns:** configuration for its assigned applications only—integrations, notifications, conferencing, workflows, assets and enabled add-ons—subject to role and entitlement policy.

Display locale controls language/date/number formatting. The selected market's approved price and the accepted contract snapshot control charges. Display currency preference is not permission to reprice a contract.

## 4. Primary flows
### Commercial setup
Product Admin creates product and market price version → approval → effective date → customer/application plan assignment → accepted price snapshot → entitlement/access decision → audit.

### Customer app setup
Customer signs in → My Applications → select application → Settings → update allowed integration → validate schema/version → persist configuration and audit atomically where supported → return sanitized status.

### Payment
Client requests quote for product + market + customer/application → server validates active approved price and entitlement → quote snapshot created → sandbox/provider adapter processes payment → idempotent outcome reconciliation → invoice/receipt generated from same snapshot.

### AI-assisted sales/marketing
Authorized user creates draft → persisted pending review → independent reviewer approves/rejects → approved execution request rechecks authorization and idempotency → action adapter executes only if explicitly enabled → audit outcome recorded.

## 5. Security and resilience
- Deny by default; least privilege and non-disclosing cross-tenant failures.
- Enforce entitlement and access state on API and background-job boundaries, not just UI visibility.
- Never store raw provider secrets in client-side storage or audit logs.
- Versioned writes use optimistic concurrency.
- Sensitive writes require durable storage/audit; unknown payment outcomes are reconciled, not blindly retried.
- Database fallback is controlled HA/failover to a fenced PostgreSQL primary, not silent fallback to another engine or in-memory writes.
- Define and test retention, data residency, encryption, backup, restore and incident response before production.

## 6. Deployment and maturity note
The repository contains implemented components and design/preview-only surfaces. Customer/application/plans/tariffs/access UI sections remain placeholders; localized pricing configuration may use process memory unless a durable adapter is active; production payment provider and actual HA drills are not proven by design documents. Verify each component against CI and environment evidence before release.


## Product Admin ticketing and feedback

Product Admin has an administrative entry point into the existing ticketing/feedback workspace. Ticket storage and support API remain a separate domain service; the pricing console must not duplicate ticket records or bypass ticket-specific authorization. The admin opens the support workspace and authenticates there independently. Support queries must be authorized and auditable, and cross-tenant views are allowed only for explicitly privileged platform roles. Ticketing unavailability must be surfaced rather than replaced by misleading sample data.
