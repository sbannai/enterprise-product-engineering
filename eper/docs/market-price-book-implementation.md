# Market-specific price-book implementation

## Behaviour

EPER resolves prices from an approved local-market price book. Selecting a market changes the resolved amount and currency; it does not apply an FX conversion to a base price. The selected market is authoritative. If no single effective, approved price exists, quote and payment initiation fail closed.

The current implementation is a backend/sandbox bridge. It does not add a front-end market selector, durable database storage, or a live payment-provider integration. The sandbox gateway must not be represented as a production charge.

## Price-book configuration

Provide `EPER_MARKET_PRICE_BOOK_JSON` as a JSON array through the deployment's controlled secret/configuration mechanism. Do not commit real commercial prices, payment credentials, or live pricing data to source control.

Each entry has this shape:

```json
{
  "productId": "approved-product-code",
  "marketId": "IN",
  "currency": "INR",
  "amountMinor": 12550,
  "priceBookId": "approved-price-book-id",
  "priceBookVersion": "approved-version",
  "status": "APPROVED",
  "effectiveFrom": "2026-10-01T00:00:00.000Z",
  "effectiveTo": null
}
```

- `amountMinor` is the integer in the currency's minor unit (for example, paise for INR).
- Use one active approved entry for each product/market combination.
- `status` must be `APPROVED`; draft and retired entries are not quotable.
- Effective timestamps must be ISO-8601. A future entry is not active before `effectiveFrom`; an entry with `effectiveTo` is no longer active at that instant.
- Keep approvals, versioning and change history in the controlled source of truth. This in-memory configuration is not a substitute for durable price governance.

## Opt-in API

Enable the quote API only in a controlled environment:

- `EPER_PRICING_API_ENABLED=true`
- `EPER_PRICING_API_TOKEN` must be a secret token of at least 32 characters.
- `EPER_MARKET_PRICE_BOOK_JSON` contains the approved price-book entries.

The sandbox payment API additionally requires its existing opt-in settings:

- `EPER_PAYMENT_SANDBOX_ENABLED=true`
- `EPER_PAYMENT_SANDBOX_TOKEN` (at least 32 characters)
- `EPER_PAYMENT_SANDBOX_TENANT_ID`
- `EPER_PAYMENT_SANDBOX_PRINCIPAL_ID`

All endpoints use bearer authentication where required. Keep these routes off on public deployments until a production identity model, durable persistence, provider integration, and security review are complete.

### List available markets

`GET /pricing/options?productId=<product-id>`

Returns only effective approved market/currency pairs for that product.

### Resolve a quote

`POST /pricing/quote`

Request:

```json
{ "productId": "approved-product-code", "marketId": "IN" }
```

Response includes `amountMinor`, `currency`, `marketId`, `priceBookId`, `priceBookVersion`, and `quotedAt`. A supplied currency is validated against the selected market and cannot override the price book.

### Initiate a sandbox payment from the quote

`POST /sandbox/payments/from-quote`

Include `productId`, `marketId`, `description`, and an `Idempotency-Key` header. The server resolves the price itself; it does not trust a client-supplied amount. The resulting payment and downloadable PDF receipt preserve market, currency, amount, price-book ID, and price-book version. Reusing an idempotency key with a different market or price-book selection is rejected.

A receipt is available only after a successful sandbox result is recorded. The callback route is a test mechanism, not a verified production payment-provider webhook.

## Required production completion

Before charging real money, complete and verify:

1. Approved price-book data, market definitions, approval ownership and effective-date policy.
2. Durable quote/payment storage and immutable quote snapshots.
3. A production payment-provider adapter with signed webhook verification, reconciliation, refunds/voids and idempotency at provider level.
4. A front-end market selector that automatically recalculates the quote **and visibly presents the final amount and currency before the payer authorizes payment**.
5. Tax, fee, discount, rounding, cancellation and receipt/legal-content rules for each market.
6. Business UAT evidence for market switching, price changes, stale/expired quotes, missing/ambiguous price entries, retries, successful/failed payments and receipt download.

## Test data notice

The unit and API tests use clearly labelled test-only prices to prove that market switching changes the resolved amount. They are not approved business prices and must never be used as a production price book.
