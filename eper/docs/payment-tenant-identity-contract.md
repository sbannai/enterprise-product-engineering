# Payment API tenant identity contract

## PostgreSQL payment routes

PostgreSQL-backed tenant-scoped routes require a distinct bearer credential per tenant. The caller's tenant is derived from the credential mapping; `x-tenant-id` is only an optional consistency check and never grants access by itself.

Configure `EPER_PAYMENT_TENANT_TOKENS` as a JSON object mapping each canonical tenant ID to a unique, high-entropy token of at least 32 characters. Example shape only—replace all illustrative values and never commit real credentials:

```json
{
  "tenant-a": "<unique-random-token-at-least-32-characters>",
  "tenant-b": "<different-unique-random-token-at-least-32-characters>"
}
```

Provide the value through the approved secret manager or deployment environment, not source control, issue comments, CI logs, or chat. Every tenant token must be unique; duplicate or malformed mappings fail closed. The existing `EPER_PAYMENT_API_TOKEN` remains a general configuration prerequisite but does **not** authenticate tenant-scoped PostgreSQL requests and cannot be used as a fallback.

For each request:
- `POST /api/payments/orders`: authenticated tenant must equal the request body's `tenantId`; rejection occurs before invoice/transaction authorities or the payment store are called.
- `POST /api/payments/verify`: tenant scope comes from the authenticated bearer credential; a conflicting `x-tenant-id` is rejected before gateway/store lookups.
- Receipt downloads: tenant scope comes from the authenticated bearer credential; a conflicting `x-tenant-id` is rejected before receipt/store lookup.
- Razorpay webhooks continue to authenticate with the provider's HMAC signature and do not use browser tenant headers.

If the mapping is missing or malformed, tenant-scoped PostgreSQL routes return `503 tenant_identity_unconfigured`. An unknown credential returns `401 unauthorized`. A request that tries to select a different tenant returns `403 tenant_scope_mismatch`. Do not add a shared-token or caller-header fallback.

## Provisioning and rollout

Issue independent random tokens for each tenant, deliver them through the approved secret-distribution channel, and rotate/revoke credentials using the deployment's secret manager. The repository does not assume an identity-provider issuer or accept caller-supplied JWT claims. If production identity needs central issuance, replace this static mapping only with an issuer-verified, audience-checked, expiring tenant principal and equivalent isolation tests.

This code change does not enable production payment routes, run live UAT, migrate a database, or provision infrastructure. Production payment routes remain fail-closed. Before UAT, test at minimum cross-tenant order creation, verification, and receipt access with tenant-A and tenant-B credentials, and confirm all three reject before downstream lookups.

## Trusted transaction authority response boundary

The transaction authority adapter is a separate trust boundary from tenant authentication. Before a response can be used to reserve a payment order, validate the complete snapshot at runtime: requested tenant and reference must match exactly; kind, status, INR currency, positive safe-integer amounts, line items, adjustments, arithmetic totals, and source provenance must satisfy the transaction/receipt contract. Approval timestamps must be real calendar timestamps with an explicit timezone. Malformed or mismatched authority responses must fail closed and must not reach the gateway or persistence layer.

The automated workflow run on a commit is evidence only for that exact commit and workflow. A passing pilot matrix or PostgreSQL integration run does not substitute for the controlled QA/UAT technical re-execution, independent security review, or the 12 business PAY-UAT cases. Keep business acceptance and formal sign-off marked `NOT EXECUTED` until their own evidence is attached.
