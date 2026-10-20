# EPER SOLID, Memory and Security Hardening

## Changes in this patch

- **Single Responsibility:** workflow configuration validation, role policy evaluation, collection bounds, and state copying are isolated in `packages/workflows/workflow-configuration.ts`; the HTTP server delegates those operations instead of owning the workflow rules.
- **Open/Closed:** payment initiation depends on the `PaymentGateway` interface, allowing a provider adapter to be added without rewriting payment lifecycle logic. Provider implementation and signed webhook verification are still not present for live gateways.
- **Liskov Substitution:** implementations of `PaymentGateway` must preserve the same validated input/output contract. Add contract tests before adding a real provider.
- **Interface Segregation:** the payment gateway contract is intentionally narrow; workflow configuration service exposes focused read/replace/access operations rather than a general-purpose mutable state object.
- **Dependency Inversion:** `PaymentReceiptService` accepts a `PaymentGateway` abstraction rather than constructing a concrete live provider. The API layer depends on the workflow configuration service abstraction boundary.
- **Readability:** workflow types, permission vocabulary, and limits are named in one service; HTTP handlers are shorter and validation is centralized.
- **Memory bounds:** sandbox payment records are capped at 10,000; localization preferences at 10,000; workflows at 500; activities per workflow at 200; fields per activity at 100; roles at 500; members per role at 10,000; market price-book entries at 10,000. Overflow fails closed rather than growing memory without limit. These caps are safety bounds, not a replacement for persistent storage/retention.
- **Input bounds:** request JSON remains capped at 1 MiB; workflow identifiers/labels/field metadata, payment descriptions, actor IDs, idempotency keys, and provider references are validated or length-limited.
- **HTTP hardening:** all responses receive no-store, MIME sniffing protection, clickjacking protection, no-referrer, permissions policy, same-origin opener/resource policies, and a restrictive CSP. HTTP request/header/keep-alive timeouts are bounded. TLS must be terminated at a trusted HTTPS edge.
- **Toast cleanup:** dismissal and queue eviction clear their timeout handles, preventing timers for removed notifications from lingering until their scheduled expiry.
- **Dependency hygiene:** CI now runs `npm audit --audit-level=high`; Dependabot is configured for weekly npm and GitHub Actions updates.

## Important limitations / findings

1. **No production identity integration yet.** The admin bearer token is a shared pilot control. Role member IDs are configuration, not proof of identity. The access-check endpoint is an admin policy tester; it must not be used as the sole authorization check for business operations.
2. **Workflow execution is still preview-only.** Every future execute/approve endpoint must derive principal and tenant from trusted authenticated context and enforce role/permission server-side at the operation boundary.
3. **State is still in memory.** Caps make growth bounded, but data resets on restart and multi-process consistency is not guaranteed. Production needs durable transactional persistence, retention policies, audit trails, backup/recovery, and concurrency control.
4. **The CSP permits inline scripts/styles** because the current UI is served as embedded HTML. Dynamic user content is escaped/text-only, but a follow-up should move scripts/styles to versioned same-origin assets or use per-response nonces/hashes to remove `unsafe-inline`.
5. **Operational security is not complete.** Rate limiting, centralized audit logging, secret rotation, TLS deployment verification, security scanning of the built artifact, and a formal threat model still need to be completed before production.
6. **Dependency audit result is pending.** The new CI step must pass on the latest commit; do not infer that the dependency tree is vulnerability-free before the run completes.

## Verification required

- Run typecheck/build, the full Node suite, UAT preflight tests, and the read-only readiness audit.
- Confirm the new capacity, input-validation, response-header, and workflow-policy tests pass.
- Inspect the `npm audit` result and remediate high/critical findings rather than suppressing them without an approved exception.
- Re-run the six-family smoke, container runtime smoke, release-candidate build, G9 reconciliation, and 228-requirement pilot matrix.
- Automated success does not constitute Business UAT acceptance. Preserve the 228 requirement IDs, 38 chapters, and Option A.
