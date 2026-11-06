# EPER Requirement Change Addendum — Payment Gateway and Receipt Download

- Version: 0.1
- Date: 2026-10-18
- Status: **Proposed controlled change — formal approval pending**
- Priority: **P0 / release-blocking**
- Scope: EPER payment gateway integration and downloadable payment receipts

## Baseline preservation

Preserve Option A, the existing 228 requirements, 38 chapters, all existing REQ/SRS/TRC IDs, six capability families and the single execution router. This addendum proposes two cross-cutting change IDs; it does not silently rewrite or renumber the baseline.

## BR-EPER-PAY-001 — Payment gateway integration (mandatory)

The application shall integrate with an approved gateway (initial implementation target: Razorpay, INR) to create payment orders, verify checkout signatures, independently verify payment status server-side, accept signed gateway webhooks, prevent duplicate processing and persist tenant-scoped transaction records. The application shall fail closed when required configuration or secrets are absent. Secrets must never be exposed to browser code.

**Acceptance criteria**
1. Correct test-mode order, amount, currency, business reference and tenant are linked.
2. Invalid signature or mismatched order/amount/currency is rejected without marking the transaction paid.
3. Only gateway-confirmed captured status can trigger the paid state.
4. Duplicate client requests/webhooks produce no duplicate financial effect.
5. Gateway errors remain pending/failed/reconciliation-required and do not issue a receipt.
6. Transaction changes are attributable and auditable.

## BR-EPER-RCP-001 — Downloadable payment receipt (mandatory)

After independent verification of captured payment, the application shall issue a uniquely numbered receipt and provide an authenticated, tenant-scoped PDF download. Receipt details must match the canonical transaction. Unpaid, failed, mismatched or unknown transactions must not return a receipt.

**Acceptance criteria**
1. Captured payment produces a retrievable PDF receipt.
2. Receipt number is unique under the approved numbering policy.
3. Amount, currency, reference, gateway payment ID and paid timestamp match the transaction.
4. Unpaid/failed payments cannot produce or download receipts.
5. Unauthorized and cross-tenant requests are denied.
6. Receipt identity/content version remains consistent on repeat download; corrections/reissues are controlled and audited.

## SRS minimum interface candidates

- `POST /api/payments/orders` — create order.
- `POST /api/payments/verify` — server-side verification.
- `POST /api/payments/webhooks/razorpay` — verify signed webhook and process idempotently.
- `GET /api/payments/{paymentId}/receipt.pdf` — authorized PDF download.

Payload schemas, stable error contracts, rate limits, webhook retention and reconciliation cadence require final API specification approval.

## Architecture and non-functional requirements

- Provider adapter isolates gateway-specific behavior.
- Transactional payment repository stores orders, status, idempotency, webhook identities and audit correlation with unique constraints.
- Receipt service issues immutable/versioned receipt metadata after captured status.
- Enforce tenant/resource authorization at the data access layer.
- Use server-side secret management, TLS, request limits, rate limits and redacted logs.
- Reconciliation detects gateway/local state divergence and stuck pending payments.
- **A JSON-file ledger is prototype-only; transactional durable storage is required before production or horizontal scaling.**

## Mandatory release gate

Both requirements are release-blocking. Require passing automated tests, Razorpay test-mode end-to-end evidence, webhook replay/idempotency evidence, transactional storage, security review, approved receipt fields/numbering and authorized Business UAT. CI success alone is insufficient.

## Decisions requiring formal approval

Gateway/provider and currencies; receipt fields, branding, tax/legal wording, numbering, retention and correction policy; refunds/chargebacks/partial payments; roles and tenant identity mapping; production readiness.

Until approved by the designated change authority, IDs `BR-EPER-PAY-001` and `BR-EPER-RCP-001` are proposed controlled change IDs. No business approval, live transaction, deployment or production readiness is asserted.
