# Razorpay Test-Mode and Transaction Authority Configuration

This runbook is for controlled EPER test-mode checkout and downloadable-receipt validation. It contains variable names and acceptance steps only; **never put credentials in this file, source code, CI logs, or chat**.

## 1. Store secrets securely

Configure these as deployment environment variables or GitHub Actions repository/environment secrets. Use a newly rotated Razorpay test secret because the previously supplied secret was shared in chat.

| Variable | Source / purpose | Required for the current payment handler |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard, test mode | Yes |
| `RAZORPAY_KEY_SECRET` | Razorpay Dashboard, test mode; rotate the previously exposed value | Yes |
| `RAZORPAY_WEBHOOK_SECRET` | Secret configured for the Razorpay webhook endpoint | Yes |
| `EPER_PAYMENT_API_TOKEN` | EPER-generated high-entropy API bearer token (at least 32 characters) | Yes |
| `EPER_TRANSACTION_AUTHORITY_URL` | Owner-approved HTTPS endpoint that returns the authoritative transaction snapshot | Required before PostgreSQL payment readiness can be enabled |
| `EPER_TRANSACTION_AUTHORITY_TOKEN` | Bearer token for the transaction-authority API (at least 24 characters) | Required with the endpoint |
| `EPER_PAYMENT_PERSISTENCE` | Set to `postgres` only when PostgreSQL persistence and migrations are ready | Deployment-specific |
| `DATABASE_URL` | Approved PostgreSQL connection string, if used by deployment configuration | Deployment-specific |

Do not reuse Razorpay credentials as the transaction-authority token or the EPER API token. These secrets have different trust boundaries and purposes.

## 2. Transaction-authority API contract

The configured endpoint must accept a GET request with `tenantId` and `reference` query parameters and return a JSON `TrustedTransactionSnapshot` object. The adapter sends `Authorization: Bearer <token>`, requires HTTPS, rejects redirects, and limits the response body to 64 KiB.

Required snapshot fields:
- `tenantId`, `reference`, `kind` (`ECOMMERCE` or `GENERAL`), `description`
- `amountDueMinor` (positive integer in paise), `currency` (`INR`), `status` (`DUE` or `PARTIALLY_PAID` for payable transactions)
- `lineItems`, `adjustments`, `sourceId`, `sourceVersion`, `approvedAt`

For e-commerce, provide at least one source-owned line item; each line total must equal quantity multiplied by unit price, and line totals plus signed adjustments must reconcile exactly to `amountDueMinor`. For a general invoice/fee transaction, the authoritative source may return a summary-only amount with empty line items and adjustments. Never accept browser-supplied amounts as authority.

## 3. Test-mode acceptance sequence

1. Rotate the exposed Razorpay test secret; configure the new key ID/secret in the approved secret store.
2. Configure the webhook secret and EPER API bearer token without printing their values.
3. Obtain the transaction-authority owner’s approval for the endpoint, response schema, tenant scoping, and token issuance; configure URL/token as secrets.
4. Apply the payment migrations through the deployment migration runner in the isolated test database.
5. Verify readiness remains blocked when authority configuration is absent or invalid.
6. Run a GENERAL invoice/fee payment and an ECOMMERCE checkout with multiple items and an adjustment; verify gateway amount, source snapshot total, and persisted receipt all match.
7. Verify each transaction and receipt has a stable unique public identifier; repeated webhook delivery must not create a second receipt.
8. Download the PDF twice and verify the persisted bytes/digest remain identical, with itemized lines and adjustments rendered for e-commerce.
9. Exercise invalid signatures, amount mismatch, wrong tenant, non-payable transaction, unavailable authority, and duplicate/conflicting webhook events; confirm they fail closed.
10. Capture CI evidence and request human UAT approval only after the real endpoint and test-mode flow have passed.

## 4. Safety and release gates

- Use test-mode Razorpay credentials only in this runbook's validation stage; production credentials require separate approval and handling.
- Do not expose secret values in logs, screenshots, commit messages, test fixtures, or receipts.
- Do not enable production payment processing or mark UAT gates closed based on CI alone.
- Do not provision chargeable infrastructure without explicit approval.
- Existing legacy receipts without a persisted transaction snapshot must not be retroactively populated with fabricated line items.
