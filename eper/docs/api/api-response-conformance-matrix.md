# API Response Conformance Matrix

**Scope:** EPER HTTP API response codes, content type, error envelope, and request correlation.
**Baseline:** `main` at the start of this change. This matrix is deliberately conservative: a route is only marked migrated when its implementation uses the shared response helpers and contract tests cover it.

## Standard contract

- JSON responses use `application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `X-Request-ID`.
- `X-Correlation-ID` is accepted only for 1–128 ASCII letters, digits, dot, underscore, colon, or hyphen; otherwise the server generates a UUID.
- JSON success: `{ "success": true, "data": {}, "meta": { "requestId": "..." } }`.
- JSON error: `{ "success": false, "error": { "code": "UPPER_SNAKE_CASE", "message": "..." }, "meta": { "requestId": "..." } }`. Include `error.details` only for safe, field-level validation issues.
- Use real HTTP error status codes. A `204` response must have an empty body.
- Do not expose stack traces, SQL, credentials, internal exception messages, or tenant secrets.
- Existing successful legacy payloads are not silently wrapped; migrate each family with its clients and tests in the same change.
- Routes using shared `sendJson()` can opt into standardized success and error envelopes by sending `Accept: application/vnd.eper.v1+json`; without it, legacy payloads remain unchanged.

## Endpoint-family status

| Family | Current baseline | Priority | Closure evidence required |
|---|---|---:|---|
| Customer session / workspace modules / Help Center / Growth Hub | Shared success/error envelope adopted | P0 | Contract tests for status, content type, envelope and correlation ID |
| API response helper itself | Shared helper exists; this change hardens status/code validation and 204 semantics | P0 | `api-response-contract.test.mjs` passes in CI |
| Shared `sendJson()` v1 negotiation | Opt-in standardized success and error envelopes for routes using the helper; legacy default payloads preserved | P0 | Runtime tests verify legacy success, negotiated success, negotiated errors, headers, and request IDs |
| Admin workflow / role / access APIs | v1 success/error envelope available via shared negotiation; legacy default retained | P0 | Add route-specific auth, validation, conflict, tenant isolation, audit, and persistence contract tests |
| Admin pricing / market-price APIs | v1 success/error envelope available via shared negotiation; legacy default retained | P0 | Add route-specific status, authorization, tenant isolation, currency and market-price contract tests |
| Localization APIs | v1 success/error envelope available via shared negotiation where `sendJson()` is used | P1 | Verify locale/currency behavior and identify any direct response writers |
| Ticketing / feedback APIs | v1 success/error envelope available via shared negotiation where `sendJson()` is used | P0 | Validate success/error shapes, auth, tenant isolation, pagination and durable audit events |
| Payment / receipt APIs | Dedicated handlers; not covered by shared `sendJson()` bridge unless route delegates to it | P0 | Explicit per-route status/envelope/header contract, idempotency, amount authority, receipt integrity, tenant isolation and sandbox-only regression suite |
| Health / readiness / build metadata | Specialized operational payloads; documented exceptions pending route-by-route verification | P1 | Preserve probes; assert status, content type, correlation/header policy, and explicit exception rationale |
| Unmatched routes / uncaught exceptions | Must be normalized centrally without leaking exception detail | P0 | 404/500 status and safe-body integration tests |

## Safe migration sequence

1. Keep shared helper tests as the executable contract; include 204 no-body and invalid status/error-code checks.
2. Migrate one route family at a time. Preserve successful payloads until the caller is migrated in the same commit.
3. Let clients opt into the standardized success/error envelopes with `Accept: application/vnd.eper.v1+json`; migrate clients family-by-family before changing defaults.
4. Replace raw error strings with stable uppercase codes and safe messages; include request ID on all JSON responses.
5. Add negative tests for 400/401/403/404/409/413/415/422/429/500/503 where applicable.
6. Run the complete EPER test suite and integrated six-capability HTTP smoke on the same commit.
7. Update this matrix only from observed test evidence. API standardization does not imply Business UAT acceptance.

## Explicit non-claim

The shared bridge makes the v1 contract available on `sendJson()` routes, but availability is not the same as complete endpoint verification. Route families remain open until route-specific success, validation, auth, operational failure, tenant-isolation, and audit behavior are tested. Direct response writers and payment/receipt handlers must be assessed separately. Business UAT remains separate and must not be marked accepted by these technical changes.
