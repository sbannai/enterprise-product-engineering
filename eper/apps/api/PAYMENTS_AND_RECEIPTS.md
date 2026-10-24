# Razorpay payment and receipt integration — deployment notes

Status: payment implementation candidate is under review in the stacked PR chain #193 → #194 → #198 → #200. All four PRs remain open and unmerged. The code is not deployed, and business UAT has not been executed or signed off.

## Implemented API behavior

- `POST /api/payments/orders` reserves and persists an idempotent tenant-scoped payment order before contacting Razorpay. The payable amount must come from an approved server-side invoice/fee authority; client-supplied amounts are not permitted in production.
- `POST /api/payments/verify` validates the checkout signature and independently retrieves the payment from Razorpay. It requires matching order, payment ID, amount, currency, and captured status before recording payment completion.
- `POST /api/payments/webhooks/razorpay` validates the raw-body Razorpay signature, requires the provider event ID, validates captured payment details against the persisted order, and deduplicates repeated events.
- `GET /api/payments/receipts/:receiptId.pdf` retrieves a tenant-scoped receipt by its public receipt UUID. It only serves receipts for captured payments. Persisted PDF bytes are SHA-256 verified before serving; missing, malformed, or mismatched digests fail closed.
- Payment transaction and receipt public IDs are distinct from internal database keys. Receipt identity, receipt numbering, issue timestamp, and persisted PDF content are protected by PostgreSQL migrations 005–006. Migration 007 persists and protects the validated order-time transaction snapshot, so delayed/duplicate capture callbacks do not depend on the invoice's current mutable payability status.

All payment routes return HTTP 503 with `payment_persistence_not_production_ready` when `NODE_ENV=production`. The newer persistence guard also rejects unset or `json-file` persistence outside the explicit test-only fixture path. These guards must remain until the real-world approval and production-readiness conditions below have been satisfied.

## PostgreSQL schema deployment

The ordered SQL migrations live in `eper/packages/payments/migrations/`. The supported runner is:

```sh
npm run migrate:payments
```

Configure `EPER_PAYMENT_DATABASE_URL` (or `DATABASE_URL`) through the approved deployment secret mechanism. The runner serializes migration attempts, records migration names and SHA-256 checksums, applies each migration and its ledger record atomically, and fails if an applied migration's checksum changes. The controlled UAT Docker image includes both the migration files and runner. Migrations are not applied automatically at API startup.

The PostgreSQL integration workflow applies schema using this same runner before testing real database constraints, idempotency, immutable order-time snapshots, and receipt immutability.

## Pre-rollout legacy-order gate

Migration 007 adds the immutable order-time snapshot for newly created orders, but existing rows can retain a null snapshot. **Before enabling any capture/verification flow that requires this snapshot, inspect and drain or cancel every still-payable legacy order with no snapshot.** Do not attempt a blind backfill from the current invoice state: it may have changed after checkout or capture.

Run this read-only check after migration 007 and before any non-production or production payment enablement:

```sql
SELECT id, tenant_id, invoice_reference, provider_order_id, status, created_at
FROM eper_payment_orders
WHERE status IN ('created', 'authorized')
  AND transaction_snapshot IS NULL
ORDER BY created_at, id;
```

The result must be empty before the flow is enabled. For any returned order, reconcile it with the authoritative invoice/fee source and gateway state; cancel/drain only after reconciliation, and do not delete payment history. If a gateway charge may already have occurred, use a controlled reconciliation path rather than cancelling blindly. The application intentionally fails closed when the trusted snapshot is missing; this is safer than issuing a receipt from unverified mutable data, but it requires this rollout gate to avoid stranding a charged customer.

## Configuration and approvals still outstanding

- Configure `EPER_PAYMENT_RECEIPT_NUMBER_PREFIX` only after the owner/business authority approves the receipt-numbering policy. No default policy is invented; capture fails closed if numbering policy is unconfigured.
- Approve and wire the authoritative transaction authority and invoice/fee source, including source identity/version and approval evidence. Until these are available, production readiness and business UAT are blocked.
- Rotate the Razorpay test secret if it was exposed; store replacement credentials only in the approved secret mechanism.
- Provide approved Razorpay test-mode credentials and an authorized isolated non-production endpoint; run end-to-end evidence for order creation, capture/webhook or verification, idempotent retry, and receipt download.
- Confirm receipt legal fields, branding, retention, refund/chargeback handling, reconciliation, webhook replay controls, alerting, and operational ownership.
- Complete all 12 defined business UAT cases, attach sanitized evidence, and obtain explicit business sign-off. Automated CI and the 228-requirement pilot are technical evidence only; they do not constitute business approval or close any G1–G13 gate.

Never commit or expose Razorpay secrets or the payment API token. Do not use live credentials or enable production routes without explicit owner authorization.

## Current safety boundary

- The current payment implementation review chain is #193 → #194 → #198 → #200; PR #168 is a historical reference, not the current candidate chain.
- The PR chain remains unmerged; this documentation does not authorize a merge, deployment, migration, or production payment enablement.
- Production payment routes remain fail-closed.
- No chargeable AWS resources are to be provisioned without separate authorization.
- Preserve the 228 requirement IDs, all 38 chapters, and Option A unchanged.
