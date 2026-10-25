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
