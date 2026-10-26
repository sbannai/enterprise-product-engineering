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

## Endpoint-family status

| Family | Current baseline | Priority | Closure evidence required |
|---|---|---:|---|
| Customer session / workspace modules / Help Center / Growth Hub | Shared success/error envelope adopted | P0 | Contract tests for status, content type, envelope and correlation ID |
| API response helper itself | Shared helper exists; this change hardens status/code validation and 204 semantics | P0 | `api-response-contract.test.mjs` passes in CI |
| Admin workflow / role / access APIs | Legacy `sendJson` payloads | P0 | Migrate error bodies first; retain legacy success shape until coordinated client migration |
| Admin pricing / market-price APIs | Legacy `sendJson` payloads | P0 | Status + error-code matrix, authorization and tenant-isolation regression tests |
| Localization APIs | Legacy `sendJson` payloads | P1 | Client-compatible envelope migration and locale/currency regression tests |
| Ticketing / feedback APIs | Legacy `sendJson` payloads | P0 | Validation, auth, tenant isolation, pagination and durable-audit tests |
| Payment / receipt APIs | Dedicated payment handlers; do not bulk-rewrite | P0 | Idempotency, amount authority, receipt contract and sandbox-only regression suite |
| Health / readiness / build metadata | Operational payloads intentionally specialized | P1 | Preserve probes and deployment tooling; document any non-envelope exception |
| Unmatched routes / uncaught exceptions | Must be normalized centrally without leaking exception detail | P0 | 404/500 status and safe-body integration tests |

## Safe migration sequence

1. Keep shared helper tests as the executable contract; include 204 no-body and invalid status/error-code checks.
2. Migrate one route family at a time. Preserve successful payloads until the caller is migrated in the same commit.
3. Replace raw error strings with stable uppercase codes and safe messages; include request ID on all JSON responses.
4. Add negative tests for 400/401/403/404/409/413/415/422/429/500/503 where applicable.
5. Run the complete EPER test suite and integrated six-capability HTTP smoke on the same commit.
6. Update this matrix only from observed test evidence. API standardization does not imply Business UAT acceptance.

## Explicit non-claim

This matrix is not evidence that every existing route is already migrated. The legacy route families above remain open until code and regression tests demonstrate conformance. Business UAT remains separate and must not be marked accepted by these technical changes.
