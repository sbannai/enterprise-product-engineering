# Razorpay payment and receipt integration — deployment notes

Status: implementation candidate on PR #168; not merged, deployed, or business-UAT approved.

## Implemented API behavior

- `POST /api/payments/orders` reserves and persists an idempotent tenant-scoped payment order before contacting Razorpay. The payable amount must come from an approved server-side invoice/fee authority; client-supplied amounts are not permitted in production.
- `POST /api/payments/verify` validates the checkout signature and independently retrieves the payment from Razorpay. It requires matching order, payment ID, amount, currency, and captured status before recording payment completion.
- `POST /api/payments/webhooks/razorpay` validates the raw-body Razorpay signature, requires the provider event ID, validates captured payment details against the persisted order, and deduplicates repeated events.
- `GET /api/payments/receipts/:receiptId.pdf` retrieves a tenant-scoped receipt by its public receipt UUID. It only serves receipts for captured payments. Persisted PDF bytes are SHA-256 verified before serving; missing, malformed, or mismatched digests fail closed.
- Payment transaction and receipt public IDs are distinct from internal database keys. Receipt identity, receipt numbering, issue timestamp, and persisted PDF content are protected by PostgreSQL migrations 005–006. Migration 007 persists and protects the validated order-time transaction snapshot, so delayed/duplicate capture callbacks do not depend on the invoice's current mutable payability status.

All payment routes return HTTP 503 with `payment_persistence_not_production_ready` when `NODE_ENV=production`. This guard must remain until the real-world approval and production-readiness conditions below have been satisfied.

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

## Concession presentation and amount controls

- The trusted transaction snapshot supports a distinct `CONCESSION` adjustment. The authoritative fee/invoice source must supply the approved concession description and signed amount; the browser cannot set or change it.
- Concessions are represented as negative integer minor units, included in the reconciled payable total, and preserved in the immutable order-time snapshot.
- Receipt PDFs render this adjustment as `Concession: <description> -<amount>`, distinct from generic promotional discounts. The displayed concession is informational evidence of the source-approved adjustment; this layer does not itself grant or approve concessions.
- The source must enforce concession eligibility, authorization, approver identity, effective period, and audit history. Until that authority is wired, do not treat a receipt label as proof of business approval.

## Configuration and approvals still outstanding

- Configure `EPER_PAYMENT_RECEIPT_NUMBER_PREFIX` only after the owner/business authority approves the receipt-numbering policy. No default policy is invented; capture fails closed if numbering policy is unconfigured.
- Approve and wire the authoritative invoice/fee source, including source identity/version and approval evidence. Until this is available, production readiness is blocked.
- Provide approved Razorpay test-mode credentials and run end-to-end evidence for order creation, capture/webhook or verification, idempotent retry, and receipt download in the approved non-production environment.
- Confirm receipt legal fields, branding, retention, refund/chargeback handling, reconciliation, webhook replay controls, alerting, and operational ownership.

Never commit or expose Razorpay secrets or the payment API token. Do not use live credentials or enable production routes without explicit owner authorization. Automated CI is technical evidence only; it does not constitute business approval or close any G1–G13 gate.

## Current safety boundary

- PR #168 remains a draft and must not be merged by this workflow.
- Production payment routes remain fail-closed.
- No chargeable AWS resources are to be provisioned.
- Preserve the 228 requirement IDs, all 38 chapters, and Option A unchanged.
