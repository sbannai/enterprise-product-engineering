# EPER Pricing & Payment Admin Console

## Entry point

When explicitly enabled in a controlled test environment, open:

`/admin/pricing-ui`

The console is served by the same API origin and calls these APIs:

- `GET /admin/config/price-book` — read configured entries
- `PUT /admin/config/price-book` — add/update a product/market/price-book-version entry
- `GET /pricing/options?productId=...` — list effective approved markets
- `POST /pricing/quote` — resolve an authoritative market price
- `GET /admin/config/payment-vendor` — read provider/mode/readiness metadata
- `PUT /admin/config/payment-vendor` — select a provider and sandbox setting
- `POST /sandbox/payments/from-quote` — create a sandbox payment using a server-resolved quote

The UI includes Price Book, Market Resolver, and Payment Vendor tabs. The bearer token is held only in page memory and is not written to localStorage/sessionStorage. APIs reject unauthenticated admin requests.

## Required opt-in settings

Set the following in the controlled test environment before starting the API:

- `EPER_ADMIN_CONFIG_API_ENABLED=true`
- `EPER_ADMIN_CONFIG_API_TOKEN` — secret bearer token, at least 32 characters
- `EPER_PRICING_API_ENABLED=true`
- `EPER_PRICING_API_TOKEN` — secret bearer token, at least 32 characters
- `EPER_MARKET_PRICE_BOOK_JSON` — initial price-book JSON array (can be empty)

For sandbox payments, also configure the existing payment sandbox settings:

- `EPER_PAYMENT_SANDBOX_ENABLED=true`
- `EPER_PAYMENT_SANDBOX_TOKEN` — secret bearer token, at least 32 characters
- `EPER_PAYMENT_SANDBOX_TENANT_ID`
- `EPER_PAYMENT_SANDBOX_PRINCIPAL_ID`

The UI can use the same token for admin and quote APIs in a test setup, but separate tokens are recommended. The server uses separate authorization checks for each API family.

## Payment vendor readiness

Provider choices exposed by the UI are EPER Sandbox, Razorpay, Stripe, and Adyen. Only the sandbox adapter is currently implemented. Selecting a non-sandbox provider records a planning/configuration choice in process memory and disables the sandbox payment route; it does not enable live charges.

Credential readiness is read from server environment variables. Provider secret values are never returned to the UI and are not entered into the browser:

- Razorpay: `EPER_RAZORPAY_KEY_ID`, `EPER_RAZORPAY_KEY_SECRET`, `EPER_RAZORPAY_WEBHOOK_SECRET`
- Stripe: `EPER_STRIPE_SECRET_KEY`, `EPER_STRIPE_WEBHOOK_SECRET`
- Adyen: `EPER_ADYEN_API_KEY`, `EPER_ADYEN_MERCHANT_ACCOUNT`, `EPER_ADYEN_HMAC_KEY`

These names currently drive readiness indicators only. They do not imply a working provider integration.

## Persistence and production boundary

Price-book entries and vendor selections changed through the admin UI are currently held in the API process memory. They are lost on process restart and are not a durable system of record. The UI/API is an admin/UAT foundation, not a production configuration control plane.

Before production use, add durable transactional storage, role-based authorization and audit logging, maker-checker approval for price publication, CSRF/CSP hardening appropriate to the deployment, a managed secrets integration, provider-specific adapters and signed webhooks, payment reconciliation/refund handling, and Business UAT evidence. Production mode is intentionally locked and productionEnabled remains false.


## Platform-admin ownership: customers, applications, plans, tariffs and access

The platform Admin workspace is the control plane for commercial setup and client lifecycle. Customer-facing application settings (for example video conferencing, alerts, messaging, storage and application workflows) remain in the customer portal under the selected application.

### Admin responsibilities

1. **Customer registry:** create/update customer (tenant) identity, lifecycle state, authorized contacts and tenant-wide policy.
2. **Customer applications:** register applications under a customer, manage assignment/ownership and application lifecycle. Every application must map to exactly one owning tenant unless a deliberate, audited shared-ownership model is introduced.
3. **Plans and tariffs:** maintain versioned plans, modules/add-ons, currency, decimal amount, billing interval, per-customer/per-application/usage basis, effective dates, quotas, dependencies, approval state and price snapshots.
4. **Entitlements:** assign an approved plan and explicit module/add-on entitlements to a customer and, where required, an individual application. A plan or payment status must not silently enable unrelated modules.
5. **Client access enable/disable:** enable, suspend or disable the customer and/or one application. The API and background workers must enforce the effective state; hiding a navigation item is insufficient.
6. **Audit and approvals:** record actor, target tenant/application, old/new state digests, reason, timestamp, correlation ID and outcome. Apply maker-checker approval to price publication and high-impact access changes where policy requires it.

### Access enforcement

- Effective access requires: active tenant, active assigned application, active module/plan entitlement for the effective period, active module, role permission, and any required billing/grace policy.
- Suspension/disable must block new API operations and scheduled/background execution for the affected scope. Session/token revocation and treatment of in-flight operations must follow a documented policy.
- Never delete customer/application records to disable access; preserve foreign-key relationships, payment/receipt history and audit evidence.
- Do not let customer administrators alter their own plan price, commercial entitlements or platform-level access state.
- All writes must be tenant-scoped, role-authorized, version-checked where appropriate, and durably audited.

### Implementation status boundary

The admin UI now contains clearly labelled **Customers & Applications**, **Plans & Tariffs**, and **Client Access** preview sections. They are currently disabled placeholders because their live APIs and durable workflows are not connected. They do not create or change real records. The existing price-book/vendor console also documents that some configuration is held in process memory; it is not yet a durable production control plane. Do not represent these screens as completed functionality or as Business UAT evidence.

### Acceptance tests

- Platform admin can create/assign a customer application only through the authorized registry API.
- A customer cannot see or alter another tenant's application, plan or access status.
- Application-level disable blocks its APIs and asynchronous jobs without disabling sibling applications unless the tenant itself is disabled.
- Tenant-level suspension blocks all tenant applications according to the documented suspension policy.
- Price/tariff changes are versioned and do not rewrite accepted price snapshots.
- Expired, suspended, disabled, or unentitled modules fail closed.
- Access and commercial changes create durable, correlated audit events with a mandatory reason where required.
- Failed writes, stale versions, and unauthorized attempts return standardized errors and do not partially mutate state.
- Test both access enforcement and UI behavior; a disabled control in the preview is not an authorization test.


## Product Admin ownership: localized pricing

Localized product pricing is a **Product Admin responsibility** in the platform Admin control plane, not a customer-admin setting. Product Admin maintains the canonical product catalogue and market-specific commercial price books. Customer admins may select or request only the plans and prices made available to their tenant; they cannot edit product prices or create their own tariff overrides.

Product Admin responsibilities:
- Maintain product identifiers and localized market availability.
- Define a separate approved price entry for each product + market + price-book version, with explicit ISO currency, amount in minor units, effective interval, status, and approval/audit reference.
- Manage localized plan/tariff pricing and versioning, including billing interval and pricing model; keep accepted customer/application price snapshots immutable unless an explicitly approved contract change is recorded.
- Keep **market price** separate from **display locale**. Locale controls language/formatting; the market-specific approved price determines the amount and currency to charge. Never treat a locale switch as an FX conversion or silently reprice an existing contract.
- Define and review tax, rounding, and regional compliance rules as explicit pricing policy; do not infer tax treatment from a browser locale.
- Ensure quote, checkout, payment, invoice and receipt use the same authoritative server-side quote/accepted price snapshot and currency.
- Audit price creation, approval, effective-date changes, retirement, overrides and contract repricing with actor, reason, version and correlation ID.

### Localized pricing acceptance criteria
1. Product Admin can maintain distinct approved prices for the same product in different markets and currencies.
2. Only approved and effective entries are returned by the market resolver.
3. Changing UI language or display locale does not change the market, accepted price, or charged currency.
4. Changing market selects an explicit approved market price; it does not perform an implicit currency conversion.
5. Existing customer/application agreements retain their accepted price snapshot when the catalogue changes.
6. Quote, payment, invoice and receipt agree on amount, currency, price version and application/tenant scope.
7. Unauthorized customer admins cannot create or mutate product prices, tariffs, discounts or other tenants' price books.

## Implementation boundary — localized pricing

The current Price Book UI and pricing resolver provide the initial product/market price-entry workflow, but current configuration may be held in API process memory unless a durable adapter is configured. The Customers & Applications, Plans & Tariffs and Client Access tabs remain preview placeholders. Do not treat localized pricing administration as production-ready until durable persistence, authorization, audit evidence, tax/rounding policy, and quote-to-payment-to-invoice/receipt consistency tests have passed.


## Product-level POC documentation bundle (2026-10-27)

The product-level design and commercial ownership baseline is indexed in [Product POC Update Log](product-poc-update-log.md). Related artifacts:
- [BRD](product-brd.md)
- [HLD](product-hld.md)
- [LLD](product-lld.md)
- [SRS](product-srs.md)
- [Product Admin localized-pricing wireframe](../wireframes/product-admin-localization-wireframe.html)
- [Marketing deck](../marketing/eper-product-marketing-deck.html)
- [Sales flyers](../marketing/eper-sales-flyers.html)

These are product planning and POC artifacts. The static HTML files are not connected to the runtime API and must not be presented as completed production functionality.
