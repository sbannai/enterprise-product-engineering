# EPER Product-Level Low-Level Design (LLD)

**Baseline:** 2026-10-27 · **Status:** Engineering design; pending implementation and test reconciliation.

## 1. Domain entities
- `Product(product_id, product_key, name, lifecycle_status)`
- `MarketPrice(price_id, product_id, market_id, currency_iso, amount_minor, price_book_id, version, status, effective_from, effective_to, approval_ref)`
- `Plan(plan_id, version, billing_model, currency_policy, effective_from, status)`
- `PlanTariff(tariff_id, plan_id, product_id/module_key, amount_minor, currency_iso, interval, pricing_model, usage_limit)`
- `Customer(tenant_id, status, locale_default, timezone_default)`
- `Application(application_id, tenant_id, status, display_name)`
- `CustomerApplicationAssignment(tenant_id, application_id, assignment_status, assigned_at)`
- `SubscriptionEntitlement(tenant_id, application_id?, module_key, plan_version, accepted_price_snapshot, status, starts_at, ends_at, limits)`
- `ApplicationSetting(tenant_id, application_id, integration_key, environment, schema_version, config_json, version)`
- `Quote(quote_id, tenant_id, application_id, product_id, market_id, currency_iso, amount_minor, price_version, expires_at, idempotency_key)`
- `Payment/Invoice/Receipt`: all reference the accepted quote/price snapshot and idempotency key.
- `AuditEvent(event_id, tenant_id, application_id?, actor_id, action, outcome, reason, correlation_id, occurred_at, before_digest, after_digest)`

All identifiers and constraints above are logical target model names; reconcile with existing migrations before implementation to avoid duplicate canonical entities.

## 2. Pricing invariants
- Store monetary values as integer minor units or exact NUMERIC; never binary floating-point.
- ISO currency is mandatory and independent from locale.
- Unique approved price selection must be deterministic for product + market + effective instant + price-book policy; ambiguous/missing entries fail closed.
- Use versioned price books and immutable accepted snapshots.
- Market changes require a new explicit quote; display-locale changes do not.
- A tax amount/rate, tax jurisdiction and rounding rule must be explicit if tax is in scope; never infer from browser locale.
- Prevent overlapping active price intervals unless policy explicitly defines priority.
- Quote, payment, invoice and receipt must agree on currency and amount.

## 3. Authorization model
Effective operation allowed only when authenticated principal is active AND tenant membership is valid AND application belongs to tenant AND assignment is active (if app-scoped) AND role grants permission AND module/add-on entitlement is active AND customer/application access is enabled. Each check is server-side and repeated for async work at execution time.

Product Admin permissions include product.catalog.read/write, pricing.market.read/write/approve, plans.tariffs.write/approve, customer.registry.write, application.assignment.write, entitlement.write, client.access.change. Customer Admin cannot receive platform commercial permissions by default.

High-impact price/access changes require policy-defined maker-checker approval. Every mutation carries reason, expected version, request/correlation ID, and actor from trusted authentication context.

## 4. API target contracts
These are target contracts unless confirmed in server routes:
- `GET /admin/products`, `POST /admin/products`, `PATCH /admin/products/:productId`
- `GET /admin/pricing/market-prices?productId=&marketId=`, `POST /admin/pricing/market-prices`, `POST /admin/pricing/market-prices/:id/approve`
- `GET /admin/plans`, `POST /admin/plans`, `POST /admin/plans/:id/versions`, `POST /admin/tariffs`
- `GET /admin/customers`, `POST /admin/customers`, `GET /admin/customers/:tenantId/applications`, `POST /admin/customers/:tenantId/applications`
- `POST /admin/access/changes` with scope, requested state, reason and expected version
- `GET/PUT /customer/applications/:applicationId/settings/:integrationKey` with version precondition
- `POST /pricing/quote` must bind authenticated tenant/application to quote context and return authoritative price snapshot.
- Existing routes and response standard in `docs/api/api-response-standard.md` take precedence; do not implement duplicate routes without route inventory review.

## 5. Error and concurrency behavior
Use the standardized response envelope and stable machine-readable error codes. Validation errors identify fields without leaking secrets; authorization failures do not reveal another tenant's record existence; stale versions return conflict; unavailable persistence/policy returns service-unavailable and does not bypass checks. All long-running work returns a job/correlation ID and status endpoint instead of blocking a request.

## 6. Async jobs and idempotency
- Every externally visible job has tenant/application scope, actor/initiator, operation key, retry policy, attempt count, timestamps, and terminal status.
- Unique idempotency key at the correct business scope prevents duplicate campaign sends, payments, receipts, CRM writes and provisioning.
- Worker must re-check access, entitlement and approval immediately before action.
- Transient failures retry with bounded exponential backoff; permanent failures go to dead-letter with reason and operator recovery path.
- For unknown payment commit outcomes, query/reconcile provider and database state before retrying.

## 7. Audit and secrets
Configuration and audit should be committed atomically when supported. Audit records before/after digests and non-secret metadata only. Credentials are stored in a secret manager; database stores reference/version metadata. Sanitize provider errors and logs. Never include tokens, secrets, full auth headers, or sensitive payloads.

## 8. Required test suites
Unit tests: currency/locale independence, price selection/effective windows, overlapping prices, rounding, version conflict, permission matrix, entitlement denial, idempotency and response schema.
Integration: cross-tenant/customer app isolation, price approval, quote→payment→invoice→receipt invariants, durable audit, restart persistence, concurrent updates.
Resilience: DB outage fails closed, recovery reconciles uncertain transactions, worker restart/stale lease recovery, backup restore and controlled failover drill.
UI: mobile viewports, keyboard/focus, empty/loading/error states, accessible status messages and disabled/unavailable controls.
