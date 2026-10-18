# Razorpay payment and receipt integration — deployment notes

Status: implementation candidate on a feature branch; not merged, deployed, or UAT-approved.

## Routes
- `POST /api/payments/orders` — creates a Razorpay INR order. Requires `Authorization: Bearer <EPER_PAYMENT_API_TOKEN>` and `x-tenant-id` matching the JSON `tenantId`.
- `POST /api/payments/verify` — validates the checkout HMAC and independently fetches the payment from Razorpay; it only marks the record paid if the gateway reports the matching order, amount, currency, and `captured` status. Requires the same bearer and tenant header.
- `POST /api/payments/webhooks/razorpay` — validates `X-Razorpay-Signature` against the raw request body and handles `payment.captured`.
- `GET /api/payments/:id/receipt.pdf` — returns a PDF attachment only for a captured/paid payment and matching tenant. Requires the same bearer and tenant header.

## Required environment
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET` (configure the `payment.captured` webhook in Razorpay)
- `EPER_PAYMENT_API_TOKEN` (minimum 32 characters; keep server-side only)
- Optional `EPER_PAYMENT_LEDGER_FILE` (defaults to `./data/payments.json`; ensure persistent, private storage)

If any required secret is absent, the payment routes fail closed with HTTP 503. Never expose the key secret, webhook secret, or API token to browser code. The key ID may be returned for checkout initialization.

## Important limitations before production
- This first implementation uses a JSON-file ledger and is single-process only. Replace it with transactional database storage and uniqueness constraints before horizontal scaling or production payment volume.
- Order creation needs a durable idempotency/locking strategy to prevent concurrent duplicate orders.
- Validate refund/chargeback, reconciliation, webhook replay, data retention and operational alerting before production.
- Use Razorpay test mode and approved synthetic data first. Do not configure live credentials or deploy without explicit owner authorization.
- Receipts are currently generic EPER receipts, not tax invoices. Business/legal owners must approve required fields, numbering policy and branding.
- A successful CI build is not proof of a live gateway transaction. End-to-end verification requires authorized Razorpay test credentials and webhook delivery evidence.
